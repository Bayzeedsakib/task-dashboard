const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function createDatabase(filename) {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);

  if (filename !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        passwordHash TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Pending'
            CHECK (status IN ('Pending', 'In Progress', 'Completed')),
        priority TEXT NOT NULL DEFAULT 'Medium'
            CHECK (priority IN ('Low', 'Medium', 'High')),
        dueDate TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Databases created before user accounts existed have no owner column.
  // Their tasks are handed to the first account registered (see routes/auth.js).
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
  if (!taskColumns.some((column) => column.name === "userId")) {
    db.exec(
      "ALTER TABLE tasks ADD COLUMN userId INTEGER REFERENCES users(id) ON DELETE CASCADE",
    );
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_userId ON tasks(userId)");

  return db;
}

module.exports = { createDatabase };
