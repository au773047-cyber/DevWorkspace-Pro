import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const MAX_BODY = 2 * 1024 * 1024;

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:5173', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > MAX_BODY) { reject(Object.assign(new Error('Request body too large'), { statusCode: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })); } });
    req.on('error', reject);
  });
}
function validPath(input) {
  if (typeof input !== 'string' || !input || input.length > 500 || input.includes('\\') || input.includes('\0') || input.startsWith('/') || /^[a-zA-Z]:/.test(input)) return false;
  const parts = input.split('/');
  return parts.every(p => p && p !== '.' && p !== '..');
}
async function authenticate(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw Object.assign(new Error('Supabase authentication is not configured'), { statusCode: 503 });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${match[1]}` } });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  return { ...user, accessToken: match[1] };
}
async function db(user, table, { method = 'GET', query = '', body, prefer } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${user.accessToken}`, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase request failed (${response.status})`;
    const statusCode = response.status === 404 ? 404 : response.status === 401 || response.status === 403 ? 403 : response.status >= 400 && response.status < 500 ? 400 : 502;
    throw Object.assign(new Error(message), { statusCode });
  }
  return data;
}
function projectIdOrThrow(id) { if (!/^[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error('Invalid project id'), { statusCode: 400 }); return id; }
async function requireOwnedProject(user, id) {
  const rows = await db(user, 'dwp_projects', { query: `select=id,name,description& id=eq.${encodeURIComponent(id)}&limit=1`.replace('& id=', '&id=') });
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  return rows[0];
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:5173', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'devworkspace-workspace-api', status: 'running', auth: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY), storage: 'supabase-database' });
    const user = await authenticate(req);
    if (!user) return send(res, 401, { error: 'Sign in is required. Send a valid Supabase access token in the Authorization header.' });
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const projects = await db(user, 'dwp_projects', { query: 'select=id,name,description,created_at,updated_at&order=updated_at.desc' });
      return send(res, 200, { projects: Array.isArray(projects) ? projects : [] });
    }
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || 'untitled-project').trim().slice(0, 120) || `project-${randomUUID().slice(0, 8)}`;
      const created = await db(user, 'dwp_projects', { method: 'POST', query: 'select=id,name,description,created_at,updated_at', body: { owner_id: user.id, name, description: String(body.description || '').slice(0, 2000) }, prefer: 'return=representation' });
      const project = Array.isArray(created) ? created[0] : null;
      if (!project?.id) throw new Error('Project was created but no project record was returned');
      await db(user, 'dwp_files', { method: 'POST', query: 'select=id', body: { project_id: project.id, owner_id: user.id, path: 'index.html', content: '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>New Project</title></head><body><h1>Hello, DevWorkspace!</h1></body></html>\n' }, prefer: 'return=minimal' });
      return send(res, 201, { project });
    }
    const match = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (!match) return send(res, 404, { error: 'Route not found' });
    const id = projectIdOrThrow(decodeURIComponent(match[1]));
    const sub = match[2] ? decodeURIComponent(match[2]) : '';
    const project = await requireOwnedProject(user, id);
    if (!sub && req.method === 'GET') {
      const rows = await db(user, 'dwp_files', { query: `select=path&project_id=eq.${encodeURIComponent(id)}&order=path.asc` });
      const entries = new Map();
      for (const row of rows || []) {
        const parts = row.path.split('/');
        for (let i = 1; i < parts.length; i++) { const p = parts.slice(0, i).join('/'); entries.set(p, { path: p, type: 'directory' }); }
        entries.set(row.path, { path: row.path, type: 'file' });
      }
      return send(res, 200, { project, entries: [...entries.values()].sort((a, b) => a.path.localeCompare(b.path)) });
    }
    if (sub === 'file' && req.method === 'GET') {
      const filePath = url.searchParams.get('path') || '';
      if (!validPath(filePath)) return send(res, 400, { error: 'Invalid relative file path' });
      const rows = await db(user, 'dwp_files', { query: `select=path,content&project_id=eq.${encodeURIComponent(id)}&path=eq.${encodeURIComponent(filePath)}&limit=1` });
      if (!Array.isArray(rows) || !rows.length) return send(res, 404, { error: 'File not found' });
      return send(res, 200, { path: rows[0].path, content: rows[0].content });
    }
    if (sub === 'file' && req.method === 'PUT') {
      const body = await readBody(req); const filePath = String(body.path || '');
      if (!validPath(filePath)) return send(res, 400, { error: 'Invalid relative file path' });
      if (typeof body.content !== 'string') return send(res, 400, { error: 'content must be a string' });
      const encodedProject = encodeURIComponent(id); const encodedPath = encodeURIComponent(filePath);
      const existing = await db(user, 'dwp_files', { query: `select=id&project_id=eq.${encodedProject}&path=eq.${encodedPath}&limit=1` });
      if (Array.isArray(existing) && existing.length) {
        await db(user, 'dwp_files', { method: 'PATCH', query: `project_id=eq.${encodedProject}&path=eq.${encodedPath}`, body: { content: body.content, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      } else {
        await db(user, 'dwp_files', { method: 'POST', query: 'select=id', body: { project_id: id, owner_id: user.id, path: filePath, content: body.content }, prefer: 'return=minimal' });
      }
      return send(res, 200, { saved: true, path: filePath, bytes: Buffer.byteLength(body.content) });
    }
    if (sub === 'folder' && req.method === 'POST') {
      const body = await readBody(req); const folder = String(body.path || '');
      if (!validPath(folder)) return send(res, 400, { error: 'Invalid relative folder path' });
      return send(res, 201, { created: true, path: folder, note: 'Folders are virtual and appear when a file is saved inside them.' });
    }
    if (sub === 'entry' && req.method === 'DELETE') {
      const entryPath = url.searchParams.get('path') || '';
      if (!validPath(entryPath)) return send(res, 400, { error: 'Invalid relative entry path' });
      const prefix = `${entryPath}/`;
      const matches = await db(user, 'dwp_files', { query: `select=path&project_id=eq.${encodeURIComponent(id)}&or=(path.eq.${encodeURIComponent(entryPath)},path.like.${encodeURIComponent(prefix)}*)` });
      if (!Array.isArray(matches) || !matches.length) return send(res, 404, { error: 'File or folder not found' });
      const paths = matches.map(x => x.path);
      for (const p of paths) await db(user, 'dwp_files', { method: 'DELETE', query: `project_id=eq.${encodeURIComponent(id)}&path=eq.${encodeURIComponent(p)}` });
      return send(res, 200, { deleted: true, path: entryPath, count: paths.length });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const msg = err?.message || 'Internal server error';
    return send(res, err?.statusCode || 500, { error: msg });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`DevWorkspace API listening on port ${PORT}`));
export { server };
