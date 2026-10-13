const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { createRequireAuth } = require("./middleware/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { createAuthRouter } = require("./routes/auth");
const { createTasksRouter } = require("./routes/tasks");

function createApp({ db, config }) {
  const app = express();

  if (config.trustProxy) {
    app.set("trust proxy", config.trustProxy);
  }

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server) are allowed;
        // browsers are only allowed from the configured frontend origins.
        callback(null, !origin || config.corsOrigins.includes(origin));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "10kb" }));

  const rateLimitMessage = { message: "Too many requests, please try again later" };
  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: rateLimitMessage,
  });
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.authMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: "Too many authentication attempts, please try again later" },
  });

  const requireAuth = createRequireAuth(db, config);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", apiLimiter);
  app.use("/api/auth", createAuthRouter({ db, config, requireAuth, authLimiter }));
  app.use("/api/tasks", createTasksRouter({ db, requireAuth }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
