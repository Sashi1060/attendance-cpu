# Student Attendance System

A full-stack rebuild of the original browser-only attendance app. The frontend
(HTML/CSS/vanilla JS) is unchanged in spirit, but it now talks to an Express
API backed by MongoDB instead of `localStorage`, so records are shared across
devices and browsers. Registration is one-time; returning students use
Sign In / Sign Out instead of registering again.

A separate frontend for this API is hosted on Vercel at
`https://cpu-attendance.vercel.app/` — see [CODEX_PROMPT.md](CODEX_PROMPT.md)
for the spec used to build its admin panel and QR code features against this
same API.

## Project Structure

```
attendance-backend/
  public/              # static frontend, served by Express (local/reference UI)
    index.html
    style.css
    script.js
  models/
    Student.js          # Mongoose schema
  middleware/
    requireAdmin.js      # admin key auth middleware
  routes/
    students.js          # /api/students routes
    admin.js              # /api/admin routes
  server.js                # app entry point
  package.json
  .env.example
  .gitignore
  railway.json
  CODEX_PROMPT.md          # spec for building the Vercel frontend's admin/QR features
  README.md
```

## Features

- Student registration with server-side validation — one-time per KID
- Sign In / Sign Out by KID, with duplicate KID prevention on registration
  (unique index + app-level check)
- Per-student QR code (PNG) that deep-links back into the app for sign-in/out
- Email and mobile number format validation
- Admin-key-protected roster, delete, and clear-all endpoints
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
   ADMIN_KEY=a_long_random_secret
   PUBLIC_APP_URL=https://cpu-attendance.vercel.app
   ```

   Generate `ADMIN_KEY` with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

   `ALLOWED_ORIGINS` is only needed in production if the frontend is hosted
   separately from this Express app (see CORS section below).

3. Start the server:

   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your browser. The dashboard is behind an
   "Unlock Dashboard" prompt — enter your `ADMIN_KEY` to view/export/delete
   records.

## API Overview

All routes are prefixed with `/api` unless noted. Admin-only routes require
an `Authorization: Bearer <ADMIN_KEY>` header.

| Method | Route                          | Auth  | Description                              |
|--------|--------------------------------|-------|--------------------------------------------|
| GET    | `/health`                      | none  | Health check, returns `{ status: "ok" }`  |
| POST   | `/api/admin/verify`            | none  | Verify an admin key: `{ key }` → `{ valid: true }` or `401` |
| GET    | `/api/students`                | admin | Full roster, sorted by registration time  |
| POST   | `/api/students`                | none  | Register a student                        |
| GET    | `/api/students/:kid`           | none  | Look up one student by KID                |
| GET    | `/api/students/:kid/qrcode`    | none  | PNG QR code for that student               |
| POST   | `/api/students/:kid/sign-in`   | none  | Sign a student in                          |
| POST   | `/api/students/:kid/sign-out`  | none  | Sign a student out                         |
| DELETE | `/api/students/:kid`           | admin | Delete one student by KID                  |
| DELETE | `/api/students`                | admin | Clear all attendance records               |

Notes:

- Registering with a KID that already exists returns `409 Conflict`.
- Signing in/out a KID that isn't registered returns `404 Not Found` with the
  message `Student not registered. Please register first.`
- Signing in a KID that's already signed in does **not** overwrite the
  existing `signInAt` — the response includes `alreadySignedIn: true` and the
  original time in the message.
- Signing out before signing in returns `400 Bad Request`. Signing out a KID
  that's already signed out does **not** overwrite `signOutAt` — the response
  includes `alreadySignedOut: true`.
- The QR code encodes `${PUBLIC_APP_URL}/?kid=<KID>` if `PUBLIC_APP_URL` is
  set, otherwise just the bare KID. The frontend is expected to read a `?kid=`
  query param on load and offer to sign that student in/out.
- Student documents have this shape:

  ```json
  {
    "_id": "...",
    "studentName": "Jane Doe",
    "kid": "KID001",
    "email": "jane@example.com",
    "mobileNumber": "9876543210",
    "registeredAt": "2026-08-25T05:32:40.778Z",
    "signInAt": null,
    "signOutAt": null
  }
  ```

## Security Notes

- `helmet` sets standard security headers.
- `cors` restricts cross-origin API access to an allowlist (see below).
- `express-rate-limit` applies a general limit to all `/api` routes, a
  stricter limit to registration/sign-in/sign-out, and a strict limit to
  admin key verification (to slow down brute-forcing).
- `express-mongo-sanitize` strips MongoDB operator injection attempts from
  request bodies/params.
- `express-validator` validates and enforces max lengths on all input fields.
- JSON body size is capped at 20kb.
- Stack traces are never returned to clients in production; errors are logged
  server-side only, and neither `MONGO_URI` nor `ADMIN_KEY` are ever logged.
- The KID field has a unique index in MongoDB in addition to the app-level
  duplicate check, so duplicates can't slip through under concurrent requests.
- Admin key comparison uses `crypto.timingSafeEqual` to avoid timing attacks.

### Admin Authentication

Admin-only routes (`GET /api/students`, `DELETE /api/students/:kid`,
`DELETE /api/students`) require a `Authorization: Bearer <ADMIN_KEY>` header
matching the `ADMIN_KEY` environment variable. This is a single shared
secret, not a per-user login system — anyone with the key has full admin
access. Treat it like a password:

- Generate a long, random value (see command above) — don't use something
  guessable.
- Share it only with whoever needs to run the dashboard.
- Rotate it (update the env var and redeploy) if it's ever exposed.
- Registration, sign-in, sign-out, single-student lookup, and QR code
  generation remain unauthenticated by design — students need to use those
  without a key.

## CORS Behavior

- Because Express serves a reference frontend from `/public`, normal
  same-origin browser use works without any CORS configuration.
- In development, `localhost`/`127.0.0.1` on ports 3000 and 5500 are allowed.
- In production, only origins listed in the `ALLOWED_ORIGINS` environment
  variable (comma-separated) are allowed — this **must** include your Vercel
  frontend's origin (e.g. `https://cpu-attendance.vercel.app`) since it's a
  different domain than the Railway-hosted API.
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
   - `ADMIN_KEY` — a long random secret (see command above)
   - `PUBLIC_APP_URL` — your Vercel frontend URL, e.g.
     `https://cpu-attendance.vercel.app`
   - `ALLOWED_ORIGINS` — include your Vercel frontend's origin, e.g.
     `https://cpu-attendance.vercel.app`

   Do **not** set `PORT` manually — Railway provides it automatically, and
   `server.js` reads `process.env.PORT`.

4. Railway will detect this as a Node app via Nixpacks (no Dockerfile
   needed), run `npm install`, and start it with `npm start` as configured in
   `railway.json`.

5. Check `GET /health` on the Railway URL to confirm the service is up: it
   should return `{ "status": "ok" }`.

6. Point the Vercel frontend at the Railway API URL (see `CODEX_PROMPT.md`).

## Notes on Data Format

- `registeredAt`, `signInAt`, and `signOutAt` are stored as real MongoDB
  `Date` values (not formatted strings); the frontend formats them for
  display and CSV export using the browser's local timezone.
- KIDs are always normalized to uppercase, both in the browser before
  sending and again on the server, so lookups are case-insensitive by
  construction.
