// Run against a locally running backend: node backend/smoke-test.mjs
const base = process.env.API_URL || 'http://127.0.0.1:8787';
const health = await fetch(`${base}/api/health`);
if (!health.ok) throw new Error(`Health endpoint failed: ${health.status}`);
const healthData = await health.json();
if (!healthData.ok) throw new Error('Health endpoint returned ok=false');
const createdResponse = await fetch(`${base}/api/projects`, {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({name:`smoke-test-${Date.now()}`})
});
const created = await createdResponse.json();
if (!createdResponse.ok || !created.project?.id) throw new Error(`Project create failed: ${JSON.stringify(created)}`);
const id = encodeURIComponent(created.project.id);
const save = await fetch(`${base}/api/projects/${id}/file`, {
  method:'PUT', headers:{'content-type':'application/json'},
  body:JSON.stringify({path:'test.txt',content:'DevWorkspace API smoke test'})
});
if (!save.ok) throw new Error(`File save failed: ${await save.text()}`);
const read = await fetch(`${base}/api/projects/${id}/file?path=test.txt`);
const file = await read.json();
if (!read.ok || file.content !== 'DevWorkspace API smoke test') throw new Error('Saved file did not round-trip');
console.log('PASS: health, create project, save file, read file');
