const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { setup, registerUser } = require("./helpers");

describe("auth", () => {
  test("registers a user and returns a token without the password hash", async () => {
    const { app } = setup();

    const res = await request(app).post("/api/auth/register").send({
      name: "  Ada  ",
      email: "ADA@Example.com",
      password: "a-long-password",
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.deepEqual(res.body.user, { id: 1, name: "Ada", email: "ada@example.com" });
  });

  test("stores passwords hashed", async () => {
    const { app, db } = setup();
    await registerUser(app, { password: "plain-text-password" });

    const row = db.prepare("SELECT passwordHash FROM users").get();

    assert.notEqual(row.passwordHash, "plain-text-password");
    assert.match(row.passwordHash, /^\$2[aby]\$12\$/);
  });

  test("rejects a duplicate email regardless of case", async () => {
    const { app } = setup();
    await registerUser(app, { email: "dup@example.com" });

    const res = await request(app).post("/api/auth/register").send({
      name: "Someone",
      email: "DUP@example.com",
      password: "another-password",
    });

    assert.equal(res.status, 409);
  });

  test("validates registration input", async () => {
    const { app } = setup();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "", email: "not-an-email", password: "short" });

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Validation failed");
    const fields = res.body.errors.map((error) => error.field).sort();
    assert.deepEqual(fields, ["email", "name", "password"]);
  });

  test("logs in with correct credentials", async () => {
    const { app } = setup();
    const { credentials } = await registerUser(app);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: credentials.password });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, credentials.email);
  });

  test("rejects a wrong password and an unknown email with the same message", async () => {
    const { app } = setup();
    const { credentials } = await registerUser(app);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.message, unknownEmail.body.message);
  });

  test("GET /me returns the current user", async () => {
    const { app } = setup();
    const { auth, user } = await registerUser(app);

    const res = await request(app).get("/api/auth/me").set("Authorization", auth);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, user);
  });

  test("rejects missing, malformed, forged and expired tokens", async () => {
    const { app, config } = setup();
    const { user } = await registerUser(app);

    const forged = jwt.sign({}, "some-other-secret-that-is-long-enough", {
      subject: String(user.id),
    });
    const expired = jwt.sign({}, config.jwtSecret, {
      subject: String(user.id),
      expiresIn: -10,
    });
    const unsigned = jwt.sign({ sub: String(user.id) }, null, { algorithm: "none" });

    const headers = [
      undefined,
      "Token abc",
      "Bearer not-a-jwt",
      `Bearer ${forged}`,
      `Bearer ${expired}`,
      `Bearer ${unsigned}`,
    ];

    for (const header of headers) {
      const req = request(app).get("/api/tasks");
      if (header) {
        req.set("Authorization", header);
      }
      const res = await req;
      assert.equal(res.status, 401, `expected 401 for ${header}`);
    }
  });

  test("rejects tokens for users that no longer exist", async () => {
    const { app, db } = setup();
    const { auth } = await registerUser(app);
    db.prepare("DELETE FROM users").run();

    const res = await request(app).get("/api/tasks").set("Authorization", auth);

    assert.equal(res.status, 401);
  });

  test("the first account takes over tasks that have no owner", async () => {
    const { app, db } = setup();
    db.prepare("INSERT INTO tasks (title) VALUES ('Legacy task')").run();

    const first = await registerUser(app);
    const second = await registerUser(app);

    const firstTasks = await request(app).get("/api/tasks").set("Authorization", first.auth);
    const secondTasks = await request(app).get("/api/tasks").set("Authorization", second.auth);

    assert.deepEqual(
      firstTasks.body.map((task) => task.title),
      ["Legacy task"],
    );
    assert.deepEqual(secondTasks.body, []);
  });

  test("rate limits repeated failed logins", async () => {
    const { app } = setup({ rateLimit: { windowMs: 60_000, max: 10_000, authMax: 3 } });

    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-password" });
      statuses.push(res.status);
    }

    assert.deepEqual(statuses, [401, 401, 401, 429]);
  });
});
