const express = require("express");
const { HttpError } = require("../errors");
const { validateBody, parseId } = require("../middleware/validate");
const { taskInputSchema, taskPatchSchema } = require("../schemas");

const TASK_COLUMNS =
  "id, title, description, status, priority, dueDate, createdAt, updatedAt";

// Empty strings from form fields are stored as NULL.
function withDefaults(input) {
  return {
    title: input.title,
    description: input.description || null,
    status: input.status ?? "Pending",
    priority: input.priority ?? "Medium",
    dueDate: input.dueDate || null,
  };
}

function createTasksRouter({ db, requireAuth }) {
  const router = express.Router();

  const listTasks = db.prepare(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE userId = ? ORDER BY id DESC`,
  );
  const findTask = db.prepare(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND userId = ?`,
  );
  const insertTask = db.prepare(`
    INSERT INTO tasks (userId, title, description, status, priority, dueDate)
    VALUES (@userId, @title, @description, @status, @priority, @dueDate)
  `);
  const updateTask = db.prepare(`
    UPDATE tasks
    SET
        title = @title,
        description = @description,
        status = @status,
        priority = @priority,
        dueDate = @dueDate,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = @id AND userId = @userId
  `);
  const deleteTask = db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?");

  // Tasks belonging to other users are reported as missing, not forbidden,
  // so ids of other accounts' tasks are not revealed.
  function getOwnedTask(req) {
    const task = findTask.get(parseId(req.params.id), req.user.id);

    if (!task) {
      throw new HttpError(404, "Task not found");
    }

    return task;
  }

  function saveTask(existing, fields, userId) {
    updateTask.run({ ...fields, id: existing.id, userId });
    return findTask.get(existing.id, userId);
  }

  router.use(requireAuth);

  router.get("/", (req, res) => {
    res.json(listTasks.all(req.user.id));
  });

  router.get("/:id", (req, res) => {
    res.json(getOwnedTask(req));
  });

  router.post("/", validateBody(taskInputSchema), (req, res) => {
    const result = insertTask.run({ ...withDefaults(req.body), userId: req.user.id });
    const task = findTask.get(result.lastInsertRowid, req.user.id);

    res.status(201).location(`${req.baseUrl}/${task.id}`).json(task);
  });

  // Full replacement: fields left out are reset to their defaults.
  router.put("/:id", validateBody(taskInputSchema), (req, res) => {
    const existing = getOwnedTask(req);

    res.json(saveTask(existing, withDefaults(req.body), req.user.id));
  });

  // Partial update: only the fields sent are changed.
  router.patch("/:id", validateBody(taskPatchSchema), (req, res) => {
    const existing = getOwnedTask(req);
    const merged = withDefaults({ ...existing, ...req.body });

    res.json(saveTask(existing, merged, req.user.id));
  });

  router.delete("/:id", (req, res) => {
    const existing = getOwnedTask(req);

    deleteTask.run(existing.id, req.user.id);

    res.status(204).end();
  });

  return router;
}

module.exports = { createTasksRouter };
