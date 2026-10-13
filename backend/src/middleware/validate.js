const { HttpError } = require("../errors");

function formatIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// Validates and normalises req.body against a zod schema.
function validateBody(schema) {
  return (req, res, next) => {
    if (req.body === undefined) {
      throw new HttpError(415, "Request body must be JSON (Content-Type: application/json)");
    }

    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new HttpError(400, "Validation failed", formatIssues(result.error.issues));
    }

    req.body = result.data;
    next();
  };
}

function parseId(value) {
  if (!/^[1-9]\d{0,15}$/.test(value)) {
    throw new HttpError(400, "Task id must be a positive integer");
  }

  return Number(value);
}

module.exports = { validateBody, parseId };
