const path = require("path");
const dotenv = require("dotenv");

const BACKEND_ROOT = path.join(__dirname, "..");

dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });

const MIN_SECRET_LENGTH = 32;

function toInt(value, fallback, name) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return number;
}

function resolveDbPath(value) {
  if (!value) {
    return path.join(BACKEND_ROOT, "tasks.db");
  }

  if (value === ":memory:") {
    return value;
  }

  // Relative paths are resolved against the backend folder, not the shell's
  // working directory, so the same database is used wherever the server starts.
  return path.resolve(BACKEND_ROOT, value);
}

function loadConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters (see .env.example)`,
    );
  }

  return {
    env: env.NODE_ENV || "development",
    port: toInt(env.PORT, 5000, "PORT"),
    dbPath: resolveDbPath(env.DB_PATH),
    corsOrigins: (env.CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || "1d",
    trustProxy: toInt(env.TRUST_PROXY, 0, "TRUST_PROXY"),
    rateLimit: {
      windowMs: toInt(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "RATE_LIMIT_WINDOW_MS"),
      max: toInt(env.RATE_LIMIT_MAX, 300, "RATE_LIMIT_MAX"),
      authMax: toInt(env.AUTH_RATE_LIMIT_MAX, 20, "AUTH_RATE_LIMIT_MAX"),
    },
  };
}

module.exports = { loadConfig };
