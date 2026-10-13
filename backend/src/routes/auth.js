const express = require("express");
const bcrypt = require("bcryptjs");
const { HttpError } = require("../errors");
const { validateBody } = require("../middleware/validate");
const { signToken } = require("../middleware/auth");
const { registerSchema, loginSchema } = require("../schemas");

const BCRYPT_ROUNDS = 12;

// Compared against when the email is unknown, so a failed login takes the
// same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function createAuthRouter({ db, config, requireAuth, authLimiter }) {
  const router = express.Router();

  const findUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)",
  );
  const countUsers = db.prepare("SELECT COUNT(*) AS count FROM users");
  const claimLegacyTasks = db.prepare("UPDATE tasks SET userId = ? WHERE userId IS NULL");

  // Tasks created before accounts existed have no owner; the first account
  // registered on the database takes them over.
  const createUser = db.transaction((name, email, passwordHash) => {
    const isFirstUser = countUsers.get().count === 0;
    const result = insertUser.run(name, email, passwordHash);
    const userId = Number(result.lastInsertRowid);

    if (isFirstUser) {
      claimLegacyTasks.run(userId);
    }

    return userId;
  });

  router.post("/register", authLimiter, validateBody(registerSchema), async (req, res) => {
    const { name, email, password } = req.body;

    if (findUserByEmail.get(email)) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let userId;
    try {
      userId = createUser(name, email, passwordHash);
    } catch (err) {
      // Two registrations for the same email can race past the check above.
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw err;
    }

    const user = { id: userId, name, email };

    res.status(201).json({ token: signToken(user.id, config), user });
  });

  router.post("/login", authLimiter, validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    const user = findUserByEmail.get(email);
    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      throw new HttpError(401, "Invalid email or password");
    }

    res.json({ token: signToken(user.id, config), user: toPublicUser(user) });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

module.exports = { createAuthRouter };
