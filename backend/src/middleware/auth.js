const jwt = require("jsonwebtoken");
const { HttpError } = require("../errors");

const JWT_ALGORITHM = "HS256";

function signToken(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    subject: String(userId),
    expiresIn: config.jwtExpiresIn,
  });
}

function createRequireAuth(db, config) {
  const findUser = db.prepare("SELECT id, name, email FROM users WHERE id = ?");

  return function requireAuth(req, res, next) {
    const header = req.get("Authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError(401, "Authentication required");
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw new HttpError(401, "Invalid or expired token");
    }

    const user = findUser.get(Number(payload.sub));

    if (!user) {
      throw new HttpError(401, "Invalid or expired token");
    }

    req.user = user;
    next();
  };
}

module.exports = { signToken, createRequireAuth };
