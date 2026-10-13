const { z } = require("zod");

const TASK_STATUSES = ["Pending", "In Progress", "Completed"];
const TASK_PRIORITIES = ["Low", "Medium", "High"];

const taskFields = {
  title: z
    .string({ error: "Title must be a string" })
    .trim()
    .min(1, { error: "Title is required" })
    .max(200, { error: "Title must be at most 200 characters" }),
  description: z
    .string({ error: "Description must be a string" })
    .trim()
    .max(2000, { error: "Description must be at most 2000 characters" })
    .nullable(),
  status: z.enum(TASK_STATUSES, {
    error: `Status must be one of: ${TASK_STATUSES.join(", ")}`,
  }),
  priority: z.enum(TASK_PRIORITIES, {
    error: `Priority must be one of: ${TASK_PRIORITIES.join(", ")}`,
  }),
  dueDate: z.union([z.iso.date(), z.literal(""), z.null()], {
    error: "Due date must be a valid date in YYYY-MM-DD format",
  }),
};

// Used for POST and PUT: title is required, anything omitted gets its default.
const taskInputSchema = z.strictObject({
  title: taskFields.title,
  description: taskFields.description.optional(),
  status: taskFields.status.optional(),
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate.optional(),
});

// Used for PATCH: any subset of fields, but at least one.
const taskPatchSchema = z
  .strictObject(taskFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update",
  });

const email = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .max(254, { error: "Email must be at most 254 characters" })
  .pipe(z.email({ error: "Email must be a valid email address" }));

const registerSchema = z.strictObject({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, { error: "Name is required" })
    .max(100, { error: "Name must be at most 100 characters" }),
  email,
  password: z
    .string({ error: "Password is required" })
    .min(8, { error: "Password must be at least 8 characters" })
    .max(72, { error: "Password must be at most 72 characters" }),
});

const loginSchema = z.strictObject({
  email,
  password: z
    .string({ error: "Password is required" })
    .min(1, { error: "Password is required" })
    .max(72, { error: "Password must be at most 72 characters" }),
});

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  taskInputSchema,
  taskPatchSchema,
  registerSchema,
  loginSchema,
};
