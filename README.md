# Task Dashboard — Backend API

REST API for the Task Dashboard, built with Node.js, Express 5 and SQLite (`better-sqlite3`). It supports full CRUD on tasks. Each user only sees and changes their own tasks, and the API is secured with JWT authentication, input validation, CORS restrictions, security headers and rate limiting.

Frontend repository: [task-dashboard-frontend](https://github.com/Bayzeedsakib/task-dashboard-frontend) (React + Vite).

## Requirements

- Node.js 20.6 or newer

## Getting started

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random value. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then start the server:

```bash
npm run dev    # restarts on file changes
# or
npm start
```

The API listens on http://localhost:5000. The SQLite database file (`backend/tasks.db` by default) is created on first start.

To run the whole app, start the backend, then run the frontend (`npm install && npm run dev` in the frontend repository) and open http://localhost:5173.

## Configuration

All settings are read from `backend/.env` (see `.env.example`).

| Variable               | Default                 | Purpose                                                   |
| ---------------------- | ----------------------- | --------------------------------------------------------- |
| `JWT_SECRET`           | **required**            | Secret for signing login tokens (at least 32 characters)  |
| `PORT`                 | `5000`                  | Port to listen on                                         |
| `JWT_EXPIRES_IN`       | `1d`                    | Token lifetime                                            |
| `CORS_ORIGIN`          | `http://localhost:5173` | Comma-separated browser origins allowed to call the API   |
| `DB_PATH`              | `tasks.db`              | SQLite file, resolved relative to the `backend` folder    |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min)       | Rate-limit window                                         |
| `RATE_LIMIT_MAX`       | `300`                   | Requests per IP per window across `/api`                  |
| `AUTH_RATE_LIMIT_MAX`  | `20`                    | Failed login/register attempts per IP per window          |
| `TRUST_PROXY`          | `0`                     | Number of reverse proxies in front of the API             |

## API

All request and response bodies are JSON. Every endpoint except `/api/health`, `/api/auth/register` and `/api/auth/login` requires an `Authorization: Bearer <token>` header.

### Auth

| Method | Path                 | Body                        | Response                    |
| ------ | -------------------- | --------------------------- | --------------------------- |
| POST   | `/api/auth/register` | `{ name, email, password }` | `201 { token, user }`       |
| POST   | `/api/auth/login`    | `{ email, password }`       | `200 { token, user }`       |
| GET    | `/api/auth/me`       | —                           | `200 { user }`              |

Passwords must be 8–72 characters and are stored as bcrypt hashes.

### Tasks

| Method | Path             | Body                       | Response                       |
| ------ | ---------------- | -------------------------- | ------------------------------ |
| GET    | `/api/tasks`     | —                          | `200 [task, …]` (newest first) |
| GET    | `/api/tasks/:id` | —                          | `200 task`                     |
| POST   | `/api/tasks`     | task fields                | `201 task`                     |
| PUT    | `/api/tasks/:id` | task fields (full replace) | `200 task`                     |
| PATCH  | `/api/tasks/:id` | any subset of task fields  | `200 task`                     |
| DELETE | `/api/tasks/:id` | —                          | `204`                          |

Task fields:

| Field         | Type                                      | Rules                                 |
| ------------- | ----------------------------------------- | ------------------------------------- |
| `title`       | string                                    | required, 1–200 characters            |
| `description` | string or null                            | up to 2000 characters                 |
| `status`      | `"Pending"`, `"In Progress"`, `"Completed"` | defaults to `"Pending"`               |
| `priority`    | `"Low"`, `"Medium"`, `"High"`             | defaults to `"Medium"`                |
| `dueDate`     | `"YYYY-MM-DD"` or null                    | must be a real calendar date          |

Unknown fields are rejected. With `PUT`, any field you leave out is reset to its default. With `PATCH`, only the fields you send are changed.

### Errors

Errors always come back as JSON:

```json
{
  "message": "Validation failed",
  "errors": [{ "field": "title", "message": "Title is required" }]
}
```

| Status | When                                                      |
| ------ | --------------------------------------------------------- |
| 400    | Validation failed, malformed JSON, or an invalid id       |
| 401    | Missing, invalid or expired token; wrong email/password   |
| 404    | Task not found (including tasks owned by another user)    |
| 409    | Email already registered                                  |
| 413    | Request body larger than 10 KB                            |
| 415    | Request body is not JSON                                  |
| 429    | Rate limit exceeded                                       |
| 500    | Unexpected server error (no details are exposed)          |

### Example

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"a-long-password"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -X POST http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Write report","priority":"High","dueDate":"2030-01-15"}'
```

## Security measures

- **Authentication:** JWT (HS256, with the algorithm pinned on verification). Passwords are hashed with bcrypt at cost 12. Failed logins take the same time and return the same message whether or not the email exists.
- **Authorization:** every task query is scoped to the logged-in user. Other users' tasks return 404.
- **Validation:** request bodies are checked with `zod` schemas. Unknown fields are rejected, and the database adds `CHECK` constraints on status and priority.
- **SQL injection:** all queries use prepared statements with bound parameters.
- **CORS:** only the origins in `CORS_ORIGIN` are allowed.
- **Headers:** `helmet` sets security headers and removes `X-Powered-By`.
- **Rate limiting:** a general limit on `/api` and a stricter limit on failed authentication attempts.
- **Body size:** JSON bodies are capped at 10 KB.
- **Errors:** a central error handler returns JSON and never includes stack traces.

## Tests

```bash
cd backend
npm test
```

The suite uses Node's built-in test runner and `supertest` against an in-memory database. It covers authentication, CRUD, validation, ownership checks, error responses, CORS, security headers and rate limiting.

## Project structure

```
backend/
  server.js              entry point: loads config, opens the database, starts the server
  src/
    app.js               Express app: middleware, routes, error handling
    config.js            reads and validates environment variables
    database.js          SQLite connection and schema
    schemas.js           zod validation schemas
    errors.js            HttpError
    middleware/
      auth.js            JWT signing and the requireAuth middleware
      validate.js        request body and id validation
      errorHandler.js    404 and error handlers
    routes/
      auth.js            /api/auth
      tasks.js           /api/tasks
  test/                  API tests
```

## Upgrading an existing database

Databases created before user accounts were added get a `userId` column automatically on startup. Their existing tasks are assigned to the first account registered.
