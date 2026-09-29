# Secure Notes — Backend

Express + TypeScript + MongoDB/Mongoose REST API. See the repo-root `README.md` for the full
security and indexing writeup — this file is just setup/reference for this folder.

## Setup

```bash
cp .env.example .env   # fill in MONGODB_URI and generate two distinct JWT secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
npm run seed            # creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev              # http://localhost:4000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API with hot reload (`tsx watch`) |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled `dist/server.js` (production) |
| `npm run seed` | Creates/promotes the first admin (dev, uses `tsx`) |
| `npm run seed:prod` | Same, against the compiled build (run after `npm run build`) |
| `npm test` | Runs the Vitest + Supertest suite against an in-memory MongoDB |
| `npm run typecheck` | `tsc --noEmit` |

## API summary

All routes are under `/api`. Auth is via `httpOnly` cookies (see root README) — there is no
`Authorization: Bearer` header to manage on the client.

| Method & path | Who | What |
|---|---|---|
| POST `/auth/register` | anyone | Create a `user` account (role can't be self-assigned) |
| POST `/auth/login` | anyone | Log in |
| POST `/auth/refresh` | has a refresh cookie | Rotate the access + refresh cookies |
| POST `/auth/logout` | anyone | Clear cookies |
| POST `/auth/logout-all` | logged in | Revoke every session (bumps `tokenVersion`) |
| GET `/auth/me` | logged in | Current user |
| GET/POST `/notes` | logged in | List / create your own notes (cursor-paginated) |
| GET `/notes/all` | admin | Every user's notes, optional `?owner=<id>` |
| GET/PATCH/DELETE `/notes/:id` | owner (or admin to read) | One note |
| GET/POST `/posts` | public / logged in | Public post feed / create a post |
| GET `/posts/by-user/:id` | public | Scenario 2 — one user's posts via `$lookup` |
| DELETE `/posts/:id` | author or admin | Delete a post |
| GET/POST `/users`, `/users/:id`, PATCH/DELETE `/users/:id` | admin | User management |
| GET `/users/by-interest` | admin | Scenario 1 — users grouped by interest |
| GET `/insight` | admin | `explain()` output for every list/aggregation query above |

List endpoints take `?cursor=<id>&limit=<1-50>` and return `{ items, nextCursor }`.
