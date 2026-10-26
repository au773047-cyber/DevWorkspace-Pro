declare const require: any;
declare const JSZip: any;
declare const supabase: any;
const SUPABASE_URL = 'https://ejwfbmtwrigvglpkrvtn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ons_9n0yowOTmbB5llT9gg_4AZilcCo';
const authClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
let accessToken = '';
let authMode: 'login' | 'signup' = 'login';

type ProjectFile = { path: string; content: string; updatedAt: number };
const STORAGE_KEY = 'devworkspace-pro-project-v1';
const SERVER_CONFIG_KEY = 'devworkspace-pro-server-v1';
type ServerConfig = { baseUrl: string; projectId: string };
let serverConfig: ServerConfig | null = (() => { try { return JSON.parse(localStorage.getItem(SERVER_CONFIG_KEY) || 'null'); } catch { return null; } })();
const DEFAULT_FILES: ProjectFile[] = [
  { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Hello DevWorkspace</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="card">\n    <h1>Hello, DevWorkspace Pro!</h1>\n    <p>Edit this file, then press Run to preview your page.</p>\n    <button id="helloButton">Click me</button>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>', updatedAt: Date.now() },
  { path: 'style.css', content: 'body {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n  background: #eef4ff;\n  color: #17233d;\n}\n.card {\n  max-width: 520px;\n  margin: 24px;\n  padding: 32px;\n  border-radius: 18px;\n  background: white;\n  box-shadow: 0 12px 40px #22335518;\n}\nbutton { padding: 10px 16px; border: 0; border-radius: 8px; background: #3979d6; color: white; }', updatedAt: Date.now() },
  { path: 'script.js', content: "document.querySelector('#helloButton')?.addEventListener('click', () => {\n  alert('Your preview is running!');\n});", updatedAt: Date.now() }
];
let files: ProjectFile[] = loadProject();
let activePath = '';
let editor: any = null;
let monaco: any = null;
let dirty = false;
let activePanel = 'output';
let theme = localStorage.getItem('dwp-theme') || 'dark';
const $ = (id: string) => document.getElementById(id)!;
const tree = $('fileTree');
const tabs = $('tabs');
const panelContent = $('panelContent');

function loadProject(): ProjectFile[] {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length) return parsed; } } catch { /* recover with starter project */ }
  return DEFAULT_FILES.map(file => ({ ...file }));
}
function saveProject(silent = false) {
  try { if (editor && activePath) { const current = files.find(f => f.path === activePath); if (current) { current.content = editor.getValue(); current.updatedAt = Date.now(); } } localStorage.setItem(STORAGE_KEY, JSON.stringify(files)); if (serverConfig) files.forEach(file => { void syncFileToServer(file); }); dirty = false; updateDirtyStatus(); renderTree(); if (!silent) toast('Project saved in this browser.'); log('Saved project to browser storage.'); }
  catch (error) { toast('Could not save locally. Browser storage may be full.', true); log(`Save failed: ${String(error)}`, true); }
}

async function apiRequest(path: string, options: RequestInit = {}) {
  if (!serverConfig) throw new Error('No backend connected');
  const response = await fetch(`${serverConfig.baseUrl.replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Backend request failed (${response.status})`);
  return data;
}
async function connectServer() {
  const current = serverConfig?.baseUrl || 'https://your-backend.example.com';
  const baseUrl = prompt('Enter your deployed DevWorkspace backend URL (include https://):', current);
  if (!baseUrl) return;
  const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
  try {
    const health = await fetch(`${cleanUrl}/api/health`, { headers: { accept: 'application/json' } });
    if (!health.ok) throw new Error(`Health check failed (${health.status})`);
    const info = await health.json();
    if (!info.ok) throw new Error('The URL did not return a valid DevWorkspace health response.');
    const projectName = prompt('Name for the server workspace project:', 'my-devworkspace-project');
    if (!projectName) return;
    const created = await fetch(`${cleanUrl}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name: projectName })
    });
    const result = await created.json().catch(() => ({}));
    if (!created.ok || !result.project?.id) throw new Error(result.error || 'Could not create server project.');
    serverConfig = { baseUrl: cleanUrl, projectId: result.project.id };
    localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(serverConfig));
    for (const file of files) {
      const response = await fetch(`${cleanUrl}/api/projects/${encodeURIComponent(serverConfig.projectId)}/file`, {
        method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ path: file.path, content: file.content })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not sync ${file.path}`);
    }
    $('projectLabel').textContent = serverConfig.projectId;
    document.querySelector('.sidebar-bottom')?.replaceChildren();
    log(`Connected to backend. Created workspace "${serverConfig.projectId}" and uploaded ${files.length} files.`);
    toast('Backend connected and initial files synced.');
  } catch (error) {
    log(`Backend connection failed: ${String(error)}`, true);
    toast(`Backend connection failed: ${String(error)}`, true);
  }
}
async function syncFileToServer(file: ProjectFile) {
  if (!serverConfig) return;
  try {
    await apiRequest(`/api/projects/${encodeURIComponent(serverConfig.projectId)}/file`, {
      method: 'PUT', body: JSON.stringify({ path: file.path, content: file.content })
    });
    log(`Synced ${file.path} to server.`);
  } catch (error) {
    log(`Server sync failed for ${file.path}: ${String(error)}`, true);
    toast('Local save succeeded, but server sync failed.', true);
  }
}
function updateDirtyStatus() { $('dirtyStatus').textContent = dirty ? '● Unsaved changes' : 'Saved locally'; }
function toast(message: string, error = false) { const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message; $('toastRegion').appendChild(el); window.setTimeout(() => el.remove(), 3200); }
function log(message: string, error = false) { const line = document.createElement('div'); line.className = 'log-line'; const time = document.createElement('span'); time.className = 'log-time'; time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); line.append(time, document.createTextNode(message)); if (error) line.style.color = 'var(--danger)'; panelContent.appendChild(line); panelContent.scrollTop = panelContent.scrollHeight; }
function extLanguage(path: string) { const ext = path.split('.').pop()?.toLowerCase(); return ({ html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript', json: 'json', md: 'markdown', py: 'python', xml: 'xml', yaml: 'yaml', yml: 'yaml', sh: 'shell', sql: 'sql' } as Record<string,string>)[ext || ''] || 'plaintext'; }
function fileIcon(path: string) { const ext = path.split('.').pop()?.toLowerCase(); const icons: Record<string,string> = { html:'fa-brands fa-html5', htm:'fa-brands fa-html5', css:'fa-brands fa-css3-alt', js:'fa-brands fa-js', ts:'fa-solid fa-code', json:'fa-solid fa-brackets-curly', md:'fa-brands fa-markdown', py:'fa-brands fa-python' }; return icons[ext || ''] || 'fa-regular fa-file-code'; }
function renderTree() {
  tree.replaceChildren();
  const paths = files.map(f => f.path).sort((a,b) => a.localeCompare(b));
  const folders = new Set<string>();
  paths.forEach(path => { const parts = path.split('/'); for (let i=1;i<parts.length;i++) folders.add(parts.slice(0,i).join('/')); });
  const entries = [...folders].map(path => ({ path, folder: true })).concat(paths.map(path => ({ path, folder: false }))).sort((a,b) => a.path.localeCompare(b.path) || Number(b.folder)-Number(a.folder));
  entries.forEach(entry => { const depth = entry.path.split('/').length - 1; const row = document.createElement('div'); row.className = `tree-row${!entry.folder && entry.path === activePath ? ' active' : ''}`; row.style.paddingLeft = `${7 + depth * 13}px`; const icon = document.createElement('i'); icon.className = entry.folder ? 'file-icon fa-regular fa-folder' : `file-icon ${fileIcon(entry.path)}`; const label = document.createElement('span'); label.className = 'file-name'; label.textContent = entry.path.split('/').pop() || entry.path; row.append(icon,label); if (entry.folder) { row.style.color = 'var(--muted)'; row.title = `Folder: ${entry.path}`; } else { row.title = entry.path; row.addEventListener('click', () => openFile(entry.path)); row.addEventListener('contextmenu', e => { e.preventDefault(); if (confirm(`Delete ${entry.path}? This cannot be undone.`)) deleteFile(entry.path); }); } tree.appendChild(row); });
}
function renderTabs() {
  tabs.replaceChildren();
  const openPaths = (window as any).__openPaths as string[];
  if (!openPaths.length) { const empty = document.createElement('div'); empty.className = 'empty-tab'; empty.textContent = 'Welcome'; tabs.appendChild(empty); return; }
  openPaths.forEach(path => { const tab = document.createElement('div'); tab.className = `tab${path === activePath ? ' active' : ''}`; const icon = document.createElement('i'); icon.className = fileIcon(path); const label = document.createElement('span'); label.textContent = path.split('/').pop() || path; const close = document.createElement('button'); close.className = 'tab-close'; close.innerHTML = '<i class="fa-solid fa-xmark"></i>'; close.title = 'Close tab'; close.addEventListener('click', e => { e.stopPropagation(); closeTab(path); }); tab.append(icon,label,close); tab.addEventListener('click', () => openFile(path)); tabs.appendChild(tab); });
}
function openFile(path: string) { const file = files.find(f => f.path === path); if (!file) return; if (dirty && activePath && editor) { const current = files.find(f => f.path === activePath); if (current) current.content = editor.getValue(); } activePath = path; const openPaths = (window as any).__openPaths as string[]; if (!openPaths.includes(path)) openPaths.push(path); if (editor && monaco) { editor.setValue(file.content); monaco.editor.setModelLanguage(editor.getModel(), extLanguage(path)); } $('editorEmpty').classList.add('hidden'); $('languageStatus').textContent = extLanguage(path).toUpperCase(); updateCursor(); dirty = false; updateDirtyStatus(); renderTree(); renderTabs(); }
function closeTab(path: string) { const openPaths = (window as any).__openPaths as string[]; const index = openPaths.indexOf(path); if (index >= 0) openPaths.splice(index,1); if (activePath === path) { activePath = ''; if (openPaths.length) openFile(openPaths[openPaths.length-1]); else { editor?.setValue(''); $('editorEmpty').classList.remove('hidden'); dirty = false; updateDirtyStatus(); } } renderTabs(); }
function newFile() { ($('fileNameInput') as HTMLInputElement).value = ''; ($('newFileDialog') as HTMLDialogElement).showModal(); window.setTimeout(() => $('fileNameInput').focus(), 50); }
function createFile() { const input = $('fileNameInput') as HTMLInputElement; let path = input.value.trim().replace(/^\/+/, ''); if (!path) return; if (path.split('/').some(p => !p || p === '.' || p === '..')) { toast('Use a valid relative file path.', true); return; } if (files.some(f => f.path === path)) { toast('That file already exists.', true); return; } files.push({ path, content: '', updatedAt: Date.now() }); saveProject(true); openFile(path); log(`Created file ${path}`); toast(`Created ${path}`); }
function deleteFile(path: string) { files = files.filter(f => f.path !== path); closeTab(path); saveProject(true); renderTree(); log(`Deleted ${path}`); toast(`Deleted ${path}`); }
function updateCursor() { if (!editor) return; const p = editor.getPosition(); if (p) $('cursorStatus').textContent = `Ln ${p.lineNumber}, Col ${p.column}`; }
function getPreviewHTML() { const get = (name: string) => files.find(f => f.path === name)?.content || ''; let html = get('index.html') || '<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><h1>No index.html found</h1></body></html>'; const css = get('style.css'); const js = get('script.js'); if (css && !/href=["']style\.css["']/.test(html)) html = html.replace('</head>', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head>`); else if (css) html = html.replace(/<link([^>]+href=["']style\.css["'][^>]*)>/i, `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`); if (js && !/src=["']script\.js["']/.test(html)) html = html.replace('</body>', `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body>`); else if (js) html = html.replace(/<script([^>]+src=["']script\.js["'][^>]*)><\/script>/i, `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`); return html; }
function runPreview() { saveProject(true); $('previewFrame').setAttribute('srcdoc', getPreviewHTML()); $('previewPane').classList.remove('hidden'); log('Rendered index.html in the isolated preview frame.'); toast('Preview refreshed.'); }
function togglePreview() { const pane = $('previewPane'); if (pane.classList.contains('hidden')) runPreview(); else pane.classList.add('hidden'); }
function exportProject() { saveProject(true); if (typeof JSZip === 'undefined') { toast('ZIP library did not load. Check your internet connection.', true); return; } const zip = new JSZip(); files.forEach(file => zip.file(file.path, file.content)); zip.file('README.txt', 'DevWorkspace Pro project export.\nExported from browser local workspace.\n'); zip.generateAsync({ type: 'blob' }).then((blob: Blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'devworkspace-project.zip'; a.click(); URL.revokeObjectURL(url); log('Exported project ZIP.'); toast('Project ZIP exported.'); }).catch((e: unknown) => toast(`Export failed: ${String(e)}`, true)); }
async function importProject(file: File) { if (typeof JSZip === 'undefined') { toast('ZIP library did not load. Check your internet connection.', true); return; } try { const zip = await JSZip.loadAsync(file); const imported: ProjectFile[] = []; const names = Object.keys(zip.files); for (const name of names) { const entry = zip.files[name]; if (entry.dir || name.startsWith('__MACOSX/') || name.includes('/.git/')) continue; if (name.startsWith('/') || name.split('/').some(part => part === '..')) continue; if (entry._data?.uncompressedSize > 2_000_000) continue; const content = await entry.async('string'); imported.push({ path: name, content, updatedAt: Date.now() }); if (imported.length >= 300) break; } if (!imported.length) { toast('No suitable text files found in this ZIP.', true); return; } if (!confirm(`Import ${imported.length} files and replace the current local project?`)) return; files = imported; (window as any).__openPaths = []; activePath = ''; editor?.setValue(''); $('editorEmpty').classList.remove('hidden'); saveProject(true); renderTree(); renderTabs(); $('projectLabel').textContent = file.name.replace(/\.zip$/i,''); $('treeProjectName').textContent = $('projectLabel').textContent.toUpperCase(); log(`Imported ${imported.length} files from ${file.name}.`); toast(`Imported ${imported.length} files.`); } catch (e) { toast(`Could not import ZIP: ${String(e)}`, true); } }
function searchProject(query: string) { const results = $('searchResults'); results.replaceChildren(); const q = query.toLowerCase(); if (!q) return; let count = 0; files.forEach(file => { file.content.split('\n').forEach((line,index) => { if (line.toLowerCase().includes(q) && count < 100) { const item = document.createElement('div'); item.className = 'search-result'; const title = document.createElement('strong'); title.textContent = file.path; const snippet = document.createElement('small'); snippet.textContent = `${index+1}: ${line.trim().slice(0,180)}`; item.append(title,snippet); item.addEventListener('click', () => { ($('searchDialog') as HTMLDialogElement).close(); openFile(file.path); }); results.appendChild(item); count++; } }); }); if (!count) { const empty = document.createElement('p'); empty.textContent = 'No matches found.'; results.appendChild(empty); } }
function showPanel(panel: string) { activePanel = panel; document.querySelectorAll<HTMLButtonElement>('.panel-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panel)); panelContent.replaceChildren(); if (panel === 'terminal') { log(serverConfig ? 'Backend workspace is connected, but shell terminal execution is not implemented yet.' : 'Terminal backend is not connected. Use Connect to attach a deployed workspace API.'); log('Next milestone: add a secured, isolated command runner; do not run shell commands in the browser.'); } else if (panel === 'problems') { log('No language-server diagnostics are configured in this milestone.'); log('The Problems count is not a verified compiler/test result.'); } else { log('Output panel ready.'); } }
function setTheme() { document.body.classList.toggle('light-theme', theme === 'light'); localStorage.setItem('dwp-theme', theme); $('themeBtn').innerHTML = theme === 'light' ? '<i class="fa-regular fa-moon"></i>' : '<i class="fa-regular fa-sun"></i>'; if (editor && monaco) editor.updateOptions({ theme: theme === 'light' ? 'vs' : 'vs-dark' }); }

(window as any).__openPaths = [];
renderTree(); setTheme();

const loader = (window as any).require;
if (loader) {
  loader.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
  loader(['vs/editor/editor.main'], () => {
    monaco = (window as any).monaco;
    editor = monaco.editor.create($('editor'), { value: '', language: 'html', theme: theme === 'light' ? 'vs' : 'vs-dark', automaticLayout: true, fontSize: 14, fontFamily: '"Fira Code", Consolas, monospace', minimap: { enabled: window.innerWidth > 700 }, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, suggestOnTriggerCharacters: true, quickSuggestions: true });
    editor.onDidChangeModelContent(() => { if (!activePath) return; dirty = true; updateDirtyStatus(); const current = files.find(f => f.path === activePath); if (current) current.content = editor.getValue(); updateCursor(); window.clearTimeout((window as any).__autosaveTimer); (window as any).__autosaveTimer = window.setTimeout(() => { if (editor && activePath) { const currentFile = files.find(f => f.path === activePath); if (currentFile) currentFile.content = editor.getValue(); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(files)); if (serverConfig) files.forEach(file => { void syncFileToServer(file); }); dirty = false; updateDirtyStatus(); } catch { /* explicit save will show error */ } } }, 1200); });
    editor.onDidChangeCursorPosition(updateCursor);
    $('editorEmpty').classList.remove('hidden');
    log('Monaco Editor loaded.');
    if (files.length) openFile(files.some(f => f.path === 'index.html') ? 'index.html' : files[0].path);
  }, (error: unknown) => { log(`Monaco failed to load: ${String(error)}`, true); toast('Code editor failed to load. Check internet connection.', true); });
} else { toast('Monaco loader is unavailable. Check internet connection.', true); }


function updateAuthUI(session: any) {
  accessToken = session?.access_token || '';
  $('authBtnLabel').textContent = session?.user?.email ? 'Account' : 'Sign in';
  $('authHelp').textContent = session?.user?.email ? `Signed in as ${session.user.email}` : 'Sign in or create an account to access your private server workspace.';
  $('authSubmitBtn').classList.toggle('hidden', Boolean(session));
  $('authModeBtn').classList.toggle('hidden', Boolean(session));
  $('authEmail').classList.toggle('hidden', Boolean(session));
  $('authPassword').classList.toggle('hidden', Boolean(session));
  $('authLogoutBtn').classList.toggle('hidden', !session);
  $('authMessage').textContent = '';
}
async function initAuth() {
  const { data } = await authClient.auth.getSession();
  updateAuthUI(data.session);
  authClient.auth.onAuthStateChange((_event: string, session: any) => updateAuthUI(session));
}
$('authBtn').addEventListener('click', () => { ($('authDialog') as HTMLDialogElement).showModal(); });
$('authCancelBtn').addEventListener('click', () => ($('authDialog') as HTMLDialogElement).close());
$('authModeBtn').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  $('authSubmitBtn').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
  $('authModeBtn').textContent = authMode === 'login' ? 'Create account' : 'I already have an account';
  $('authPassword').setAttribute('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
  $('authHelp').textContent = authMode === 'login' ? 'Sign in to access your private server workspace.' : 'Create an account. Check your email if confirmation is enabled.';
});
$('authForm').addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  const email = ($('authEmail') as HTMLInputElement).value.trim();
  const password = ($('authPassword') as HTMLInputElement).value;
  $('authSubmitBtn').setAttribute('disabled', 'true');
  $('authMessage').textContent = 'Please wait…';
  try {
    const result = authMode === 'signup'
      ? await authClient.auth.signUp({ email, password })
      : await authClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (authMode === 'signup' && !result.data.session) {
      $('authMessage').textContent = 'Account created. Check your email to confirm, then sign in.';
      return;
    }
    updateAuthUI(result.data.session);
    ($('authDialog') as HTMLDialogElement).close();
    toast(authMode === 'signup' ? 'Account created and signed in.' : 'Signed in successfully.');
  } catch (error) {
    $('authMessage').textContent = error instanceof Error ? error.message : 'Authentication failed.';
  } finally { $('authSubmitBtn').removeAttribute('disabled'); }
});
$('authLogoutBtn').addEventListener('click', async () => {
  const { error } = await authClient.auth.signOut();
  if (error) { $('authMessage').textContent = error.message; return; }
  updateAuthUI(null); ($('authDialog') as HTMLDialogElement).close(); toast('Signed out.');
});
void initAuth();

$('connectServerBtn').addEventListener('click', () => { void connectServer(); }); $('newFileBtn').addEventListener('click', newFile); $('addFileBtn').addEventListener('click', newFile); $('saveBtn').addEventListener('click', () => saveProject()); $('runBtn').addEventListener('click', runPreview); $('previewBtn').addEventListener('click', togglePreview); $('closePreviewBtn').addEventListener('click', () => $('previewPane').classList.add('hidden')); $('exportBtn').addEventListener('click', exportProject); $('importBtn').addEventListener('click', () => ($('zipInput') as HTMLInputElement).click()); $('zipInput').addEventListener('change', e => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) void importProject(file); (e.target as HTMLInputElement).value = ''; }); $('createFileConfirm').addEventListener('click', e => { e.preventDefault(); const form = $('newFileForm') as HTMLFormElement; if (!form.reportValidity()) return; createFile(); ($('newFileDialog') as HTMLDialogElement).close(); }); $('themeBtn').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; setTheme(); }); $('hidePanelBtn').addEventListener('click', () => $('bottomPanel').classList.toggle('collapsed')); $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('mobile-open')); $('aboutBtn').addEventListener('click', () => ($('aboutDialog') as HTMLDialogElement).showModal()); $('searchInput').addEventListener('input', e => searchProject((e.target as HTMLInputElement).value)); document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); const view = btn.dataset.view; if (view === 'search') { ($('searchDialog') as HTMLDialogElement).showModal(); $('searchInput').focus(); } else if (view === 'git') { showPanel('output'); log('Git backend is not connected yet. This is a UI placeholder, not a real repository status.'); toast('Git integration is planned for a later milestone.'); } else if (view === 'run') { showPanel('problems'); } else { $('sidebar').classList.remove('mobile-open'); } })); document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(btn => btn.addEventListener('click', () => showPanel(btn.dataset.panel || 'output')));
window.addEventListener('keydown', e => { const mac = navigator.platform.toUpperCase().includes('MAC'); if ((mac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); } if ((mac ? e.metaKey : e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runPreview(); } if (e.key === 'Escape') $('sidebar').classList.remove('mobile-open'); });
window.addEventListener('beforeunload', e => { if (dirty) { saveProject(true); } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => log(`Service worker registration failed: ${String(err)}`, true)));
