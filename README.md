# Secure Notes — Backend REST API

A production-grade REST API built with Express, TypeScript, and MongoDB (Mongoose) featuring JWT authentication, role-based access control (RBAC), Argon2id password hashing, and optimized database indexing & aggregation pipelines.

Built for the **Care Guide BD Technical Interview Assessment**.

---

## 🚀 Live Demo & Links

- **Live Backend API (Render):** [https://secure-notes-backend-fte2.onrender.com/health](https://secure-notes-backend-fte2.onrender.com/health)
- **Live Frontend App (Vercel):** [https://securenotes-beta.vercel.app](https://securenotes-beta.vercel.app)
- **Frontend GitHub Repo:** [https://github.com/mdkaiumhasan/secure-notes-frontend](https://github.com/mdkaiumhasan/secure-notes-frontend)
- **Seeded Admin Account for Evaluation:**
  - **Email:** `admin@example.com`
  - **Password:** `CareGuide12345`

---

## 🛠️ Quick Start (Local Setup)

**Prerequisites:** Node.js 20+, MongoDB instance (local `mongod` or MongoDB Atlas).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MONGODB_URI, PORT=4000, and two 32+ char JWT secrets:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Seed initial admin user
npm run seed

# 4. Start local development server (with hot reload)
npm run dev    # Server runs on http://localhost:4000
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs the API with live reload (`tsx watch`) |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled `dist/server.js` (production) |
| `npm run seed` | Seeds/updates the first admin in dev mode |
| `npm run seed:prod` | Seeds/updates the admin in production |
| `npm test` | Runs the full Vitest + Supertest integration test suite (14/14 tests pass) |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`) |

---

## 🔒 Security Architecture

- **Password Hashing:** `argon2id` (OWASP-recommended parameters). Passwords and password hashes are never returned in any API response (`select: false` with JSON transform sanitizer).
- **Session & Tokens:** Dual JWT tokens (short-lived access token + 7-day refresh token) stored exclusively in `httpOnly`, `Secure` (production), `SameSite=Lax` cookies. Tokens are never stored in browser `localStorage`, preventing XSS theft.
- **Instant Token Revocation (`tokenVersion`):** Any password change, role update, or logout-all immediately increments `tokenVersion`, invalidating all previously issued JWTs.
- **CSRF Defense:** Defense-in-depth on top of `SameSite=Lax` cookies: every state-changing request requires a custom `X-Requested-With` header, and incoming `Origin` headers are verified against an explicit allowlist.
- **IDOR Protection:** Ownership checks are baked directly into database queries (e.g., `Note.findOne({ _id, owner: req.user.id })`), preventing unauthorized object access by design.
- **Strict Validation:** Every endpoint validates incoming bodies, query parameters, and URL params using Zod with `.strict()`, rejecting unexpected payload fields.
- **Admin Self-Lockout Prevention:** Admins cannot delete or demote themselves, and the last remaining admin cannot be deleted or demoted.
- **Cascade Deletion:** Deleting a user cascades to cleanly delete all associated notes and posts, eliminating orphaned data and dangling references.

---

## ⚡ Database Indexing Strategy (Zero Unnecessary Indexes)

Per the assignment's explicit constraint: **"DO NOT MAKE ANY UNNECESSARY INDEXES. You will be evaluated on the efficiency of your indexing strategy."**

All indexes are declared explicitly with `schema.index(...)` in model files with inline comments explaining their operational necessity.

| Index | Collection | Operational Justification |
|---|---|---|
| `{ email: 1 }` (unique) | `users` | Serves login lookup and enforces unique email constraint |
| `{ interests: 1 }` (multikey) | `users` | Serves Scenario 1 aggregation (`$match` filtering on `interests` array) |
| `{ owner: 1, _id: -1 }` (compound) | `notes` | Serves user note listings (`owner == userId`) with reverse chronological sorting (`_id: -1`), avoiding in-memory sort |
| `{ author: 1, _id: -1 }` (compound) | `posts` | Serves Scenario 2 `$lookup` and user post listings sorted newest first |

### Why No Extra Indexes?
- **Default `_id` Index:** MongoDB automatically creates a clustered unique index on `_id`. All single document lookups (note-by-id, user-by-id), admin all-notes lists, admin all-users lists, and public post feeds rely solely on this default index. Creating extra indexes for these operations would waste memory and violate the task constraint.

### Live Proof: Query Insight (`GET /api/insight`)
The API provides an admin-only diagnostics endpoint (`/api/insight`) that executes each list query and aggregation with `.explain('executionStats')`. It returns:
- The exact index used (`IXSCAN`)
- Number of keys examined vs documents examined
- Execution duration in milliseconds (confirming 0-1ms execution with zero `COLLSCAN`)

---

## 📊 Aggregation Pipelines

Implemented in `backend/src/pipelines.ts`:

### Scenario 1: Group Users by Interests (`GET /api/users/by-interest`)
- **Constraint:** Executed using exactly **one** `User.aggregate()` call.
- **Pipeline Stages:**
  1. `$match`: Index-friendly filter (`{ interests: { $gt: '' } }`) using multikey index `{ interests: 1 }`.
  2. `$unwind`: Expands the `interests` array.
  3. `$group`: Groups by interest, aggregates user count, and collects top 20 users per interest via `$firstN`.
  4. `$sort`: Orders by highest user count descending.
  5. `$skip` & `$limit`: Cursor-free pagination.
  6. `$project`: Formats clean response payload.

### Scenario 2: User Posts with `$lookup` (`GET /api/posts/by-user/:id`)
- **Constraint:** Single aggregation pipeline with a `$lookup` stage.
- **Pipeline Stages:**
  1. `$match`: Matches target user by `_id`.
  2. `$lookup`: Joins `posts` collection using a correlated sub-pipeline on `author == userId`.
  3. Sub-pipeline uses index `{ author: 1, _id: -1 }` to filter, sort, and paginate posts before projection.

---

## 📡 REST API Summary

All endpoints are prefixed with `/api`. Authentication is handled via `httpOnly` cookies.

| Method & Route | Access | Description |
|---|---|---|
| `POST /auth/register` | Public | Register new user account |
| `POST /auth/login` | Public | Authenticate and receive `httpOnly` cookies |
| `POST /auth/refresh` | Refresh Cookie | Rotate access and refresh tokens |
| `POST /auth/logout` | Public | Clear auth cookies |
| `POST /auth/logout-all` | Authenticated | Invalidate all user sessions via `tokenVersion` |
| `GET /auth/me` | Authenticated | Retrieve current user profile |
| `GET /notes` | Authenticated | List user's own notes (keyset paginated) |
| `POST /notes` | Authenticated | Create a new note |
| `GET /notes/all` | Admin | List notes across all users (with optional `?owner=`) |
| `GET /notes/:id` | Owner / Admin | Retrieve a specific note |
| `PATCH /notes/:id` | Owner | Update note title / content |
| `DELETE /notes/:id` | Owner | Delete note |
| `GET /posts` | Public | Public post feed |
| `POST /posts` | Authenticated | Create a new post |
| `GET /posts/by-user/:id` | Public | Scenario 2: Retrieve user's posts via `$lookup` |
| `DELETE /posts/:id` | Author / Admin | Delete a post |
| `GET /users` | Admin | List all users (keyset paginated) |
| `POST /users` | Admin | Create user account |
| `GET /users/:id` | Admin | Get user by ID |
| `PATCH /users/:id` | Admin | Update user name, role, or interests |
| `DELETE /users/:id` | Admin | Cascade delete user and associated notes/posts |
| `GET /users/by-interest` | Admin | Scenario 1: Aggregation of users grouped by interests |
| `GET /insight` | Admin | Live MongoDB `explain('executionStats')` diagnostic report |
| `GET /health` | Public | Healthcheck endpoint (`{"ok": true}`) |

---

## 🧪 Automated Testing

The backend includes a comprehensive integration test suite using **Vitest** and **Supertest** with in-memory MongoDB:

```bash
npm test
```

### Test Coverage Highlights:
- User registration, login, and cookie issuance
- Role-based authorization (403 for non-admins on admin routes)
- IDOR prevention (User B cannot access or modify User A's notes)
- CSRF validation and header enforcement
- Token invalidation via `tokenVersion`
- Last-admin self-demotion prevention
- Scenario 1 & 2 aggregation pipeline execution
- **Result:** 14/14 tests passing
