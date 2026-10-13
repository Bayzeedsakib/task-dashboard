const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Database = require("better-sqlite3");
const { loadConfig } = require("../src/config");
const { createDatabase } = require("../src/database");

const SECRET = "x".repeat(32);

describe("config", () => {
  test("requires a long JWT secret", () => {
    assert.throws(() => loadConfig({}), /JWT_SECRET/);
    assert.throws(() => loadConfig({ JWT_SECRET: "short" }), /JWT_SECRET/);
  });

  test("applies defaults", () => {
    const config = loadConfig({ JWT_SECRET: SECRET });

    assert.equal(config.port, 5000);
    assert.deepEqual(config.corsOrigins, ["http://localhost:5173"]);
    assert.equal(config.dbPath, path.join(__dirname, "..", "tasks.db"));
  });

  test("resolves a relative DB_PATH against the backend folder", () => {
    const config = loadConfig({ JWT_SECRET: SECRET, DB_PATH: "data/app.db" });

    assert.equal(config.dbPath, path.join(__dirname, "..", "data", "app.db"));
  });

  test("parses a comma-separated CORS_ORIGIN list", () => {
    const config = loadConfig({
      JWT_SECRET: SECRET,
      CORS_ORIGIN: "http://a.test, http://b.test",
    });

    assert.deepEqual(config.corsOrigins, ["http://a.test", "http://b.test"]);
  });

  test("rejects a non-numeric PORT", () => {
    assert.throws(() => loadConfig({ JWT_SECRET: SECRET, PORT: "abc" }), /PORT/);
  });
});

describe("database", () => {
  test("adds the owner column to a database created before accounts existed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "task-db-"));
    const file = path.join(dir, "legacy.db");

    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        priority TEXT NOT NULL DEFAULT 'Medium',
        dueDate TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO tasks (title) VALUES ('Old task');
    `);
    legacy.close();

    const db = createDatabase(file);
    const columns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
    const task = db.prepare("SELECT * FROM tasks").get();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });

    assert.ok(columns.includes("userId"));
    assert.equal(task.title, "Old task");
    assert.equal(task.userId, null);
  });
});
