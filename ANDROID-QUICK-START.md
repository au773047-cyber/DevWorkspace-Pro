# DevWorkspace Pro — Android Quick Start

This version includes `frontend/main.js`, generated from the TypeScript source, so the browser does not need to load `.ts` directly.

## Required file links in `index.html`

```html
<link rel="stylesheet" href="frontend/style.css" />
<script type="module" src="frontend/main.js"></script>
```

## Important
- Keep `index.html`, `frontend/style.css`, and `frontend/main.js` in the same folder layout shown above.
- Run the project using an editor/preview server that serves `.js` files as JavaScript. Do not open `app.ts` as a script in a plain static file preview.
- If your editor still reports a MIME type such as `video/mp2ts`, its preview server is mis-serving the file; use a proper local web server/preview feature or a hosting service.
- This plain-JavaScript version removes the browser's direct dependency on TypeScript transpilation. It does not make backend/terminal/Git runtime features available by itself; those still require a deployed/connected backend.
