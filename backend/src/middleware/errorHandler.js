const { HttpError } = require("../errors");

function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
}

// Every error leaves the API as JSON in the shape { message, errors? }.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    const body = { message: err.message };
    if (err.errors) {
      body.errors = err.errors;
    }
    return res.status(err.status).json(body);
  }

  // Errors raised by express.json() while reading the body.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON in request body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }
  if (err.type === "encoding.unsupported" || err.type === "charset.unsupported") {
    return res.status(415).json({ message: "Unsupported request body encoding" });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}

module.exports = { notFoundHandler, errorHandler };
