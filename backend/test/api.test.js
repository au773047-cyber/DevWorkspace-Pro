import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

let base, server, mockSupabase;
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const projects = [], files = [];
async function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? reject(e) : resolve(p)); }); }); }
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === null ? '' : JSON.stringify(body)); }
function currentUser(req) { return req.headers.authorization === 'Bearer test-token' ? USER_ID : req.headers.authorization === 'Bearer other-token' ? OTHER_USER_ID : null; }
function filterRows(table, search, uid) {
  const source = table === 'dwp_projects' ? projects : files;
  return source.filter(row => row.owner_id === uid && [...search.entries()].every(([k, v]) => {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'or') return true;
    const m = v.match(/^(eq|like)\.(.*)$/);
    if (!m) return true;
    const val = decodeURIComponent(m[2]);
    if (m[1] === 'eq') return String(row[k]) === val;
    return String(row[k]).startsWith(val.replace(/\*/g, ''));
  })).slice(0, Number(search.get('limit') || 9999));
}
before(async () => {
  const port = await freePort();
  mockSupabase = (await import('node:http')).createServer(async (req, res) => {
    const uid = currentUser(req);
    if (req.url.startsWith('/auth/v1/user')) return uid ? json(res, 200, { id: uid, email: 'user@example.com' }) : json(res, 401, { message: 'bad token' });
    if (req.url.startsWith('/rest/v1/')) {
      if (!uid) return json(res, 401, { message: 'unauthorized' });
      const u = new URL(req.url, 'http://localhost'); const table = u.pathname.split('/').pop(); const rows = table === 'dwp_projects' ? projects : table === 'dwp_files' ? files : null;
      if (!rows) return json(res, 404, { message: 'table not found' });
      const q = new URLSearchParams(u.search);
      if (req.method === 'GET') return json(res, 200, filterRows(table, q, uid));
      let body = ''; for await (const chunk of req) body += chunk;
      const input = body ? JSON.parse(body) : {};
      if (req.method === 'POST') {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input };
        if (row.owner_id !== uid) return json(res, 403, { message: 'RLS denied' });
        rows.push(row);
        return json(res, 201, req.headers.prefer?.includes('return=representation') ? [row] : null);
      }
      const matches = filterRows(table, q, uid);
      if (req.method === 'PATCH') { for (const row of matches) Object.assign(row, input); return json(res, 204, null); }
      if (req.method === 'DELETE') { for (const row of matches) rows.splice(rows.indexOf(row), 1); return json(res, 204, null); }
    }
    return json(res, 404, { message: 'not found' });
  });
  await new Promise(resolve => mockSupabase.listen(port, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  const apiPort = await freePort(); process.env.PORT = String(apiPort); process.env.CORS_ORIGIN = `http://127.0.0.1:${apiPort}`; base = `http://127.0.0.1:${apiPort}`;
  ({ server } = await import('../src/server.js'));
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
});
after(async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); if (mockSupabase?.listening) await new Promise(resolve => mockSupabase.close(resolve)); });
const auth = token => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

test('health endpoint reports database storage mode', async () => { const r = await fetch(`${base}/api/health`); const d = await r.json(); assert.equal(r.status, 200); assert.equal(d.storage, 'supabase-database'); });
test('creates a Supabase-backed project and saves/reads a file', async () => {
  const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: auth('test-token'), body: JSON.stringify({ name: 'API project' }) });
  assert.equal(created.status, 201); const { project } = await created.json(); assert.match(project.id, /^[0-9a-f-]{36}$/i);
  const saved = await fetch(`${base}/api/projects/${project.id}/file`, { method: 'PUT', headers: auth('test-token'), body: JSON.stringify({ path: 'src/hello.js', content: 'console.log("hello")' }) }); assert.equal(saved.status, 200);
  const read = await fetch(`${base}/api/projects/${project.id}/file?path=src%2Fhello.js`, { headers: auth('test-token') }); assert.equal(read.status, 200); assert.equal((await read.json()).content, 'console.log("hello")');
});
test('blocks traversal-style file paths', async () => { const c = await fetch(`${base}/api/projects`, { method: 'POST', headers: auth('test-token'), body: JSON.stringify({ name: 'Traversal test' }) }); const { project } = await c.json(); const r = await fetch(`${base}/api/projects/${project.id}/file`, { method: 'PUT', headers: auth('test-token'), body: JSON.stringify({ path: '../outside.txt', content: 'bad' }) }); assert.equal(r.status, 400); });
test('rejects requests without a valid access token', async () => { const r = await fetch(`${base}/api/projects`); assert.equal(r.status, 401); });
test('users cannot list or read another user project', async () => { const c = await fetch(`${base}/api/projects`, { method: 'POST', headers: auth('test-token'), body: JSON.stringify({ name: 'Private project' }) }); const { project } = await c.json(); const list = await fetch(`${base}/api/projects`, { headers: auth('other-token') }); assert.equal((await list.json()).projects.some(p => p.id === project.id), false); const read = await fetch(`${base}/api/projects/${project.id}`, { headers: auth('other-token') }); assert.equal(read.status, 404); });
