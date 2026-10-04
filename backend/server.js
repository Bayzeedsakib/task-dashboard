const express = require("express");
const db = require("./database");

const app = express();

const PORT = 5000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Task Dashboard API is running",
  });
});

app.get("/api/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY id DESC").all();

  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  const { title, description, status, priority, dueDate } = req.body;

  const result = db
    .prepare(
      `
        INSERT INTO tasks (title, description, status, priority, dueDate)
        VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(
      title,
      description,
      status || "Pending",
      priority || "Medium",
      dueDate || null,
    );

  const newTask = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(newTask);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, dueDate } = req.body;

  const existingTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

  if (!existingTask) {
    return res.status(404).json({
      message: "Task not found",
    });
  }

  db.prepare(
    `
        UPDATE tasks
        SET
            title = ?,
            description = ?,
            status = ?,
            priority = ?,
            dueDate = ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
  ).run(title, description, status, priority, dueDate, id);

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

  res.json(updatedTask);
});

app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;

  const existingTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

  if (!existingTask) {
    return res.status(404).json({
      message: "Task not found",
    });
  }

  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

  res.json({
    message: "Task deleted successfully",
  });
});
