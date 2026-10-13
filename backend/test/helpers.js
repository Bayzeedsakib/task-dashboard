const request = require("supertest");
const { createDatabase } = require("../src/database");
const { createApp } = require("../src/app");

function testConfig(overrides = {}) {
  return {
    env: "test",
    port: 0,
    dbPath: ":memory:",
    corsOrigins: ["http://localhost:5173"],
    jwtSecret: "test-secret-that-is-at-least-32-characters-long",
    jwtExpiresIn: "1h",
    trustProxy: 0,
    rateLimit: { windowMs: 60_000, max: 10_000, authMax: 10_000 },
    ...overrides,
  };
}

function setup(configOverrides) {
  const config = testConfig(configOverrides);
  const db = createDatabase(config.dbPath);
  const app = createApp({ db, config });
  return { app, db, config };
}

let userCounter = 0;

async function registerUser(app, overrides = {}) {
  userCounter += 1;
  const credentials = {
    name: `User ${userCounter}`,
    email: `user${userCounter}@example.com`,
    password: "correct-horse-battery",
    ...overrides,
  };

  const res = await request(app).post("/api/auth/register").send(credentials);

  if (res.status !== 201) {
    throw new Error(`Registration failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { ...res.body, credentials, auth: `Bearer ${res.body.token}` };
}

module.exports = { testConfig, setup, registerUser };
