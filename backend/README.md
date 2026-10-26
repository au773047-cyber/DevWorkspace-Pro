# DevWorkspace Pro Workspace API — Milestone 2

This is a starter Node.js workspace API. It stores project files under `backend/workspaces/` by default.

## Run

Requires Node.js 20+.

```sh
cd backend
npm start
```

Health check: `GET http://localhost:8787/api/health`

## Routes

- `GET /api/projects` — list projects
- `POST /api/projects` JSON `{ "name": "my-project" }` — create a project and starter `index.html`
- `GET /api/projects/:id` — list project entries
- `GET /api/projects/:id/file?path=index.html` — read a UTF-8 text file
- `PUT /api/projects/:id/file` JSON `{ "path": "index.html", "content": "..." }` — write a UTF-8 text file
- `POST /api/projects/:id/folder` JSON `{ "path": "src" }` — create a folder
- `DELETE /api/projects/:id/entry?path=src/old.js` — delete an entry

## Important limitations

This API is a development starter, not a production-ready public service. It has no authentication, authorization, per-user isolation, rate limiting, audit log, or hardened sandbox. Do not expose it publicly or store sensitive projects in it until those controls are implemented. It intentionally does not execute terminal commands or run user code in this milestone. Test on a trusted development environment only.


## Supabase Authentication (required for server workspaces)

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the backend environment. The API validates each Bearer access token against Supabase Auth `/auth/v1/user`; all workspace files are stored under a per-user directory. `/api/health` is public and reports whether auth configuration is present. Never put a Supabase secret/service-role key in frontend code.

Copy `.env.example` to `.env` for local setup and keep `.env` out of version control. Configure the Supabase Auth Site URL and allowed redirect URLs for the actual deployed frontend before testing email confirmation.
