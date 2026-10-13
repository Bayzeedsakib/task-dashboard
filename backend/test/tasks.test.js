const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { setup, registerUser } = require("./helpers");

describe("tasks", () => {
  let app;
  let auth;

  before(async () => {
    ({ app } = setup());
    ({ auth } = await registerUser(app));
  });

  function createTask(body, authHeader = auth) {
    return request(app).post("/api/tasks").set("Authorization", authHeader).send(body);
  }

  test("creates a task with defaults", async () => {
    const res = await createTask({ title: "  Write report  " });

    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/api/tasks/${res.body.id}`);
    assert.equal(res.body.title, "Write report");
    assert.equal(res.body.description, null);
    assert.equal(res.body.status, "Pending");
    assert.equal(res.body.priority, "Medium");
    assert.equal(res.body.dueDate, null);
    assert.ok(res.body.createdAt);
    assert.equal(res.body.userId, undefined);
  });

  test("creates a task with every field and stores empty strings as null", async () => {
    const res = await createTask({
      title: "Plan sprint",
      description: "",
      status: "In Progress",
      priority: "High",
      dueDate: "",
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.description, null);
    assert.equal(res.body.dueDate, null);
    assert.equal(res.body.status, "In Progress");
    assert.equal(res.body.priority, "High");
  });

  test("rejects invalid task input with field errors", async () => {
    const cases = [
      [{}, "title"],
      [{ title: "   " }, "title"],
      [{ title: "x".repeat(201) }, "title"],
      [{ title: 42 }, "title"],
      [{ title: "ok", status: "banana" }, "status"],
      [{ title: "ok", priority: "Urgent" }, "priority"],
      [{ title: "ok", dueDate: "2025-02-30" }, "dueDate"],
      [{ title: "ok", dueDate: "tomorrow" }, "dueDate"],
      [{ title: "ok", description: "x".repeat(2001) }, "description"],
      [{ title: "ok", userId: 99 }, ""],
    ];

    for (const [body, field] of cases) {
      const res = await createTask(body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.equal(res.body.message, "Validation failed");
      assert.ok(
        res.body.errors.some((error) => error.field === field),
        `expected an error on "${field}" for ${JSON.stringify(body)}: ${JSON.stringify(res.body.errors)}`,
      );
    }
  });

  test("lists only the current user's tasks, newest first", async () => {
    const { app: isolatedApp } = setup();
    const alice = await registerUser(isolatedApp);
    const bob = await registerUser(isolatedApp);

    for (const title of ["First", "Second"]) {
      await request(isolatedApp)
        .post("/api/tasks")
        .set("Authorization", alice.auth)
        .send({ title });
    }
    await request(isolatedApp)
      .post("/api/tasks")
      .set("Authorization", bob.auth)
      .send({ title: "Bob's task" });

    const res = await request(isolatedApp).get("/api/tasks").set("Authorization", alice.auth);

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((task) => task.title),
      ["Second", "First"],
    );
  });

  test("reads a single task", async () => {
    const created = await createTask({ title: "Single" });

    const res = await request(app)
      .get(`/api/tasks/${created.body.id}`)
      .set("Authorization", auth);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, created.body);
  });

  test("returns 404 for unknown tasks and 400 for invalid ids", async () => {
    const missing = await request(app).get("/api/tasks/999999").set("Authorization", auth);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Task not found");

    for (const id of ["abc", "0", "-1", "1.5"]) {
      const res = await request(app).get(`/api/tasks/${id}`).set("Authorization", auth);
      assert.equal(res.status, 400, `expected 400 for id ${id}`);
    }
  });

  test("PUT replaces a task", async () => {
    const created = await createTask({
      title: "Old",
      description: "Old description",
      priority: "High",
      dueDate: "2030-01-01",
    });

    const res = await request(app)
      .put(`/api/tasks/${created.body.id}`)
      .set("Authorization", auth)
      .send({ title: "New", status: "Completed" });

    assert.equal(res.status, 200);
    assert.equal(res.body.title, "New");
    assert.equal(res.body.status, "Completed");
    assert.equal(res.body.description, null);
    assert.equal(res.body.priority, "Medium");
    assert.equal(res.body.dueDate, null);
  });

  test("PATCH updates only the fields sent", async () => {
    const created = await createTask({
      title: "Keep me",
      description: "Keep this too",
      priority: "Low",
      dueDate: "2030-06-15",
    });

    const res = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .set("Authorization", auth)
      .send({ status: "Completed" });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "Completed");
    assert.equal(res.body.title, "Keep me");
    assert.equal(res.body.description, "Keep this too");
    assert.equal(res.body.priority, "Low");
    assert.equal(res.body.dueDate, "2030-06-15");
  });

  test("PATCH rejects an empty body and invalid fields", async () => {
    const created = await createTask({ title: "Patch me" });
    const url = `/api/tasks/${created.body.id}`;

    const empty = await request(app).patch(url).set("Authorization", auth).send({});
    const blankTitle = await request(app)
      .patch(url)
      .set("Authorization", auth)
      .send({ title: "" });

    assert.equal(empty.status, 400);
    assert.equal(blankTitle.status, 400);
  });

  test("deletes a task", async () => {
    const created = await createTask({ title: "Delete me" });
    const url = `/api/tasks/${created.body.id}`;

    const res = await request(app).delete(url).set("Authorization", auth);
    assert.equal(res.status, 204);

    const after = await request(app).get(url).set("Authorization", auth);
    assert.equal(after.status, 404);

    const again = await request(app).delete(url).set("Authorization", auth);
    assert.equal(again.status, 404);
  });

  test("users cannot read, update or delete each other's tasks", async () => {
    const other = await registerUser(app);
    const created = await createTask({ title: "Private" });
    const url = `/api/tasks/${created.body.id}`;

    const read = await request(app).get(url).set("Authorization", other.auth);
    const put = await request(app)
      .put(url)
      .set("Authorization", other.auth)
      .send({ title: "Hijacked" });
    const patch = await request(app)
      .patch(url)
      .set("Authorization", other.auth)
      .send({ title: "Hijacked" });
    const del = await request(app).delete(url).set("Authorization", other.auth);

    assert.deepEqual(
      [read.status, put.status, patch.status, del.status],
      [404, 404, 404, 404],
    );

    const stillThere = await request(app).get(url).set("Authorization", auth);
    assert.equal(stillThere.body.title, "Private");
  });
});

describe("API errors and security headers", () => {
  test("malformed JSON returns a JSON 400", async () => {
    const { app } = setup();
    const { auth } = await registerUser(app);

    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", auth)
      .set("Content-Type", "application/json")
      .send('{"title": ');

    assert.equal(res.status, 400);
    assert.match(res.headers["content-type"], /application\/json/);
    assert.equal(res.body.message, "Malformed JSON in request body");
  });

  test("non-JSON bodies return 415", async () => {
    const { app } = setup();
    const { auth } = await registerUser(app);

    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", auth)
      .set("Content-Type", "text/plain")
      .send("title=hello");

    assert.equal(res.status, 415);
  });

  test("oversized bodies return 413", async () => {
    const { app } = setup();
    const { auth } = await registerUser(app);

    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", auth)
      .send({ title: "big", description: "x".repeat(20_000) });

    assert.equal(res.status, 413);
  });

  test("unknown routes return a JSON 404", async () => {
    const { app } = setup();

    const res = await request(app).get("/api/nope");

    assert.equal(res.status, 404);
    assert.match(res.headers["content-type"], /application\/json/);
  });

  test("health check responds without authentication", async () => {
    const { app } = setup();

    const res = await request(app).get("/api/health");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });

  test("sends security headers and hides the framework", async () => {
    const { app } = setup();

    const res = await request(app).get("/api/health");

    assert.equal(res.headers["x-powered-by"], undefined);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.ok(res.headers["content-security-policy"]);
  });

  test("CORS allows the configured origin only", async () => {
    const { app } = setup();

    const allowed = await request(app)
      .options("/api/tasks")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    const blocked = await request(app)
      .options("/api/tasks")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  });

  test("internal errors do not leak details", async () => {
    const { app, db } = setup();
    const { auth } = await registerUser(app);
    db.exec("DROP TABLE tasks");

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const res = await request(app).get("/api/tasks").set("Authorization", auth);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { message: "Internal server error" });
    } finally {
      console.error = originalConsoleError;
    }
  });
});
