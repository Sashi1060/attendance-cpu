# Student Attendance System

A full-stack rebuild of the original browser-only attendance app. The frontend
(HTML/CSS/vanilla JS) is unchanged in spirit, but it now talks to an Express
API backed by MongoDB instead of `localStorage`, so records are shared across
devices and browsers.

## Project Structure

```
attendance-backend/
  public/            # static frontend, served by Express
    index.html
    style.css
    script.js
  models/
    Student.js        # Mongoose schema
  routes/
    students.js        # /api/students routes
  server.js            # app entry point
  package.json
  .env.example
  .gitignore
  railway.json
  README.md
```

## Features

- Student registration with server-side validation
- KID-based check-in, with duplicate KID prevention (unique index + app-level check)
- Email and mobile number format validation
- Admin attendance dashboard loaded from the database
- Client-side search over the loaded student list
- CSV export (browser-side, from the currently loaded list)
- Clear all data, with confirmation
- Individual record delete, with confirmation
- Responsive UI

## Requirements

- Node.js 20+
- A MongoDB database (e.g. MongoDB Atlas)

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (see `.env.example`) and set:

   ```
   MONGO_URI=your_mongodb_connection_string
   PORT=3000
   NODE_ENV=development
   ```

   `ALLOWED_ORIGINS` is only needed in production if the frontend is hosted
   separately from this Express app (see CORS section below).

3. Start the server:

   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your browser.

## API Overview

| Method | Route                          | Description                              |
|--------|--------------------------------|-------------------------------------------|
| GET    | `/health`                      | Health check, returns `{ status: "ok" }` |
| GET    | `/api/students`                | List all students, sorted by registration time |
| POST   | `/api/students`                | Register a student                        |
| POST   | `/api/students/:kid/check-in`  | Check in a student by KID                 |
| DELETE | `/api/students/:kid`           | Delete one student by KID                 |
| DELETE | `/api/students`                | Clear all attendance records              |

Registering with a KID that already exists returns `409 Conflict`. Checking in
a KID that isn't registered returns `404 Not Found` with the message
`Student not registered. Please register first.` Checking in a KID that has
already checked in does **not** overwrite the existing check-in time — the
response includes the original time.

## Security Notes

- `helmet` sets standard security headers.
- `cors` restricts cross-origin API access to an allowlist (see below).
- `express-rate-limit` applies a general limit to all `/api` routes and a
  stricter limit to registration/check-in.
- `express-mongo-sanitize` strips MongoDB operator injection attempts from
  request bodies/params.
- `express-validator` validates and enforces max lengths on all input fields.
- JSON body size is capped at 20kb.
- Stack traces are never returned to clients in production; errors are logged
  server-side only, and the `MONGO_URI` value is never logged.
- The KID field has a unique index in MongoDB in addition to the app-level
  duplicate check, so duplicates can't slip through under concurrent requests.

### ⚠️ No Admin Authentication

**This app does not implement login or authentication.** Anyone who has the
deployed URL can register students, check students in, search, export CSV,
delete individual records, and **clear all attendance data**. There is no
distinction between a "student" view and an "admin" view — it's all on one
page, protected only by not sharing the link.

**Do not share the deployment URL publicly or post it anywhere public.**
Treat the URL itself as the access control. If you need real admin
authentication (login, sessions/JWT, role checks), that needs to be added
before this is used for anything sensitive — it is intentionally out of scope
here since implementing it partially/insecurely would be worse than not
having it.

### CORS Behavior

- Because Express serves the frontend from `/public`, normal browser use is
  same-origin and works without any CORS configuration.
- In development, `localhost`/`127.0.0.1` on ports 3000 and 5500 are allowed
  (useful if you serve the frontend separately, e.g. with a live-reload tool).
- In production, only origins listed in the `ALLOWED_ORIGINS` environment
  variable (comma-separated) are allowed. If you don't set it and don't need
  cross-origin access, that's fine — same-origin requests still work.
- Wildcard (`*`) origins are never used in production.

## MongoDB Best Practices

- **Least privilege**: create a MongoDB user scoped to only the database this
  app uses (e.g. `attendance`), not an admin user, and not shared with other
  apps.
- **Network access**: in MongoDB Atlas, restrict Network Access to the IPs
  that need it. If you don't know Railway's outbound IPs in advance, you may
  need to temporarily allow `0.0.0.0/0` (all IPs) — if you do, understand
  that this relies entirely on your username/password for protection, so use
  a strong, unique password.
- **Rotate credentials if exposed**: if your `MONGO_URI` (which contains your
  username and password) is ever committed to git, pasted into a public
  channel, or otherwise exposed, rotate the database user's password
  immediately in Atlas and update the environment variable everywhere it's
  used.
- Never commit `.env` — it's already in `.gitignore`. Commit `.env.example`
  instead, which contains no real secrets.

## Deploying to Railway

1. Push this project to a GitHub repository (make sure `.env` is not
   committed — check `git status` before your first commit).

2. In Railway:
   - Create a new project.
   - Deploy from your GitHub repo (or use the Railway CLI: `railway up`).

3. Add environment variables in the Railway project settings:
   - `MONGO_URI` — your MongoDB connection string
   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS` — only if you're hosting the frontend somewhere other
     than this same Express app (comma-separated origins)

   Do **not** set `PORT` manually — Railway provides it automatically, and
   `server.js` reads `process.env.PORT`.

4. Railway will detect this as a Node app via Nixpacks (no Dockerfile
   needed), run `npm install`, and start it with `npm start` as configured in
   `railway.json`.

5. Once deployed, visit the Railway-provided URL. Since Express serves the
   frontend from `/public`, this is the only service you need — no separate
   static hosting or second deployment.

6. Check `GET /health` to confirm the service is up: it should return
   `{ "status": "ok" }`.

## Notes on Data Format

- `registeredAt` and `checkIn` are stored as real MongoDB `Date` values (not
  formatted strings), which the frontend formats for display and CSV export
  using the browser's local timezone.
- KIDs are always normalized to uppercase, both in the browser before
  sending and again on the server, so lookups are case-insensitive by
  construction.
