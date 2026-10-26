# DevWorkspace Pro

DevWorkspace Pro is a web-first software workspace project. This archive includes the frontend, a Node.js API backend, Supabase database migrations, and setup notes.

## Important: GitHub Pages limitation

GitHub Pages can host static frontend files only. It does **not** run the Node.js backend or securely host backend environment variables. The frontend can be published on GitHub Pages, but API routes and backend features will not work until the backend is deployed to a Node.js-capable host and configured.

## Project contents

- `index.html` — application entry page
- `frontend/` — frontend source files
- `backend/` — Node.js API and tests
- `supabase/migrations/` — database/RLS SQL migrations
- `SUPABASE-DATABASE-SETUP.md` — database setup notes
- `backend/.env.example` — backend environment variable template

## Upload this project to GitHub from Android

1. Download and extract this ZIP on your phone using a file manager that supports ZIP extraction.
2. Open the repository: https://github.com/au773047-cyber/DevWorkspace-Pro
3. Use **Add file → Upload files** if the option is available in your browser.
4. Upload the *contents* of the extracted `devworkspace-pro-milestone-3` folder (not the ZIP itself), preserving the folder structure.
5. Commit the upload to the `main` branch.
6. In GitHub, open **Settings → Pages** and confirm the intended deployment source/branch. GitHub Pages does not execute `backend/`.

If uploading many files on mobile is difficult, use GitHub's browser interface in desktop mode or upload in smaller batches while preserving paths.

## Configure Supabase and backend

1. Review `SUPABASE-DATABASE-SETUP.md`.
2. Apply the SQL migrations to the correct Supabase project after reviewing them.
3. Deploy `backend/` to a Node.js host.
4. Set backend environment variables using the host's secret/environment settings:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `CORS_ORIGIN`
   - `PORT` (if required by the host)
5. Never put a Supabase service-role key or other server secret in frontend files or commit it to GitHub.
6. Update the frontend API configuration to the deployed backend URL, if needed.

## Verification status

This is a source package, not a claim that every production feature is deployed. After uploading, verify the GitHub Pages build, run backend tests, configure the real Supabase project, and test authentication and database access before treating the app as production-ready.
