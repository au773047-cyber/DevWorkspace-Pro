# DevWorkspace Pro — Supabase Database Setup

This project uses Supabase Auth and the `dwp_projects` / `dwp_files` tables for cloud project metadata and file contents.

## 1. Apply the database migration

The migration is in `supabase/migrations/20261026090000_devworkspace_projects_files_rls.sql`. It creates the tables, enables Row Level Security, and defines owner-scoped policies. The second migration restricts execution of the existing `rls_auto_enable()` function.

The migrations have already been applied to the Supabase project `ejwfbmtwrigvglpkrvtn` for the current working copy. For another project, apply them using Supabase CLI or the SQL migration workflow.

## 2. Configure the backend

Copy `backend/.env.example` to `backend/.env` and set:

- `SUPABASE_URL`: your project's URL.
- `SUPABASE_PUBLISHABLE_KEY`: your publishable key (`sb_publishable_...`).
- `CORS_ORIGIN`: the exact frontend origin, for example `http://localhost:5173`.

Never put a Supabase `service_role` or secret key in frontend code. This backend forwards the signed-in user's access token to Supabase REST, so database RLS applies to that user.

## 3. Run the backend

Requires Node.js 20 or newer:

```sh
cd backend
npm test
npm start
```

Health endpoint: `GET /api/health`.

## 4. API routes

- `GET /api/projects` — list the signed-in user's projects.
- `POST /api/projects` — create a project and its starter `index.html`.
- `GET /api/projects/:id` — list files and inferred folders in an owned project.
- `GET /api/projects/:id/file?path=index.html` — read a file.
- `PUT /api/projects/:id/file` — create/update a file (`{ "path": "src/app.js", "content": "..." }`).
- `POST /api/projects/:id/folder` — acknowledge a virtual folder; a folder appears in the tree when a file exists beneath it.
- `DELETE /api/projects/:id/entry?path=src/app.js` — delete a file or all files below a virtual folder.

## Verification status

The backend test suite uses a local mock of Supabase Auth and REST. Passing those tests verifies route behavior and access-control handling in the mock environment, not live end-to-end behavior against the production Supabase API. Production build, deployment, and real-user integration must still be tested separately.

## Frontend cloud project workflow (v3 integration)

1. Start the frontend with `npm run dev` and sign in using the account dialog.
2. Select **Connect** and enter the public URL of the deployed backend (not the Supabase URL). The backend health endpoint must report `storage: supabase-database`.
3. Use **Projects** to list projects owned by the signed-in user, open one by its number, or type `NEW` to create a cloud project.
4. Open a file, edit it, then press **Save**. Autosave also attempts to sync the current project files to the backend. The app keeps a browser-local copy as well.

Important: cloud open/create and API-backed file save/read are wired, but the entire application has not yet been verified against the live Supabase project. File rename/delete currently operate in the local editor model and need a follow-up pass to synchronize those operations to the cloud API. A real terminal, isolated code execution, Git/GitHub, AI agent, and deployment pipeline are not included in this milestone.

## Frontend cloud project workflow (v3 integration)

1. Start the frontend with `npm run dev` and sign in using the account dialog.
2. Select **Connect** and enter the public URL of the deployed backend (not the Supabase URL). The backend health endpoint must report `storage: supabase-database`.
3. Use **Projects** to list projects owned by the signed-in user, open one by its number, or type `NEW` to create a cloud project.
4. Open a file, edit it, then press **Save**. Autosave also attempts to sync project files to the backend. The app keeps a browser-local copy as well.

Important: cloud open/create and API-backed file save/read are wired, but the entire application has not yet been verified against the live Supabase project. File rename/delete currently operate in the local editor model and need a follow-up pass to synchronize those operations to the cloud API. A real terminal, isolated code execution, Git/GitHub, AI agent, and deployment pipeline are not included in this milestone.
