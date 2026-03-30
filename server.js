const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── Storage ────────────────────────────────────────────────────────────────
function resolveDataDir() {
  for (const dir of ['/data', '/tmp']) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write_test');
      fs.writeFileSync(probe, '1'); fs.unlinkSync(probe);
      console.log('Data dir: ' + dir); return dir;
    } catch (e) { /* try next */ }
  }
  console.log('Data dir: in-memory'); return null;
}
const DATA_DIR = resolveDataDir();

// In-memory fallback
let _mem = {
  surveys: {},        // { [id]: { id, title, active, questions, createdAt } }
  activeSurveyId: null,
  results: {}         // { [surveyId]: { responses: [] } }
};

function readStore() {
  if (!DATA_DIR) return JSON.parse(JSON.stringify(_mem));
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'store.json'), 'utf8')); }
  catch (e) { return JSON.parse(JSON.stringify(_mem)); }
}

function writeStore(data) {
  if (!DATA_DIR) { _mem = data; return; }
  fs.writeFileSync(path.join(DATA_DIR, 'store.json'), JSON.stringify(data, null, 2), 'utf8');
}

function genId() { return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

// ── HTTP helpers ───────────────────────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { cb(null, JSON.parse(body || '{}')); }
    catch (e) { cb(new Error('Invalid JSON')); }
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// ── Server ─────────────────────────────────────────────────────────────────
http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // ── API ───────────────────────────────────────────────────────────────

  // GET /api/surveys → alle Umfragen (Admin)
  if (req.method === 'GET' && pathname === '/api/surveys') {
    const store = readStore();
    json(res, 200, { surveys: Object.values(store.surveys), activeSurveyId: store.activeSurveyId });
    return;
  }

  // GET /api/survey → aktive Umfrage (für survey.html)
  if (req.method === 'GET' && pathname === '/api/survey') {
    const store = readStore();
    const active = store.activeSurveyId ? store.surveys[store.activeSurveyId] : null;
    json(res, 200, active || { active: false, title: '', questions: [] });
    return;
  }

  // POST /api/create → neue Umfrage erstellen
  if (req.method === 'POST' && pathname === '/api/create') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        const id = genId();
        store.surveys[id] = {
          id, active: false,
          title: body.title || 'Neue Umfrage',
          questions: body.questions || [],
          createdAt: new Date().toISOString()
        };
        if (!store.results) store.results = {};
        store.results[id] = { responses: [] };
        writeStore(store);
        json(res, 200, { ok: true, id });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // POST /api/activate → Umfrage aktivieren (alle anderen deaktivieren)
  if (req.method === 'POST' && pathname === '/api/activate') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        if (!store.surveys[body.id]) { json(res, 404, { error: 'Not found' }); return; }
        Object.keys(store.surveys).forEach(k => { store.surveys[k].active = false; });
        store.surveys[body.id].active = true;
        store.activeSurveyId = body.id;
        writeStore(store);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // POST /api/deactivate → Umfrage deaktivieren
  if (req.method === 'POST' && pathname === '/api/deactivate') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        if (!store.surveys[body.id]) { json(res, 404, { error: 'Not found' }); return; }
        store.surveys[body.id].active = false;
        if (store.activeSurveyId === body.id) store.activeSurveyId = null;
        writeStore(store);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // POST /api/delete → Umfrage löschen
  if (req.method === 'POST' && pathname === '/api/delete') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        if (!store.surveys[body.id]) { json(res, 404, { error: 'Not found' }); return; }
        delete store.surveys[body.id];
        if (store.results) delete store.results[body.id];
        if (store.activeSurveyId === body.id) store.activeSurveyId = null;
        writeStore(store);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // POST /api/submit → Antwort für aktive Umfrage speichern
  if (req.method === 'POST' && pathname === '/api/submit') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        if (!store.activeSurveyId) { json(res, 400, { error: 'Keine aktive Umfrage' }); return; }
        if (!store.results) store.results = {};
        if (!store.results[store.activeSurveyId]) store.results[store.activeSurveyId] = { responses: [] };
        store.results[store.activeSurveyId].responses.push({
          timestamp: new Date().toISOString(),
          name: body.name || 'Anonym',
          answers: body.answers || {}
        });
        writeStore(store);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // GET /api/results?id=xxx → Ergebnisse einer Umfrage
  if (req.method === 'GET' && pathname === '/api/results') {
    try {
      const store = readStore();
      const id = searchParams.get('id') || store.activeSurveyId;
      const results = (store.results && id && store.results[id]) ? store.results[id] : { responses: [] };
      json(res, 200, results);
    } catch (e) { json(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/reset → Ergebnisse einer Umfrage löschen
  if (req.method === 'POST' && pathname === '/api/reset') {
    readBody(req, (err, body) => {
      if (err) { json(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const store = readStore();
        const id = body.id || store.activeSurveyId;
        if (!id) { json(res, 400, { error: 'Keine Umfrage angegeben' }); return; }
        if (!store.results) store.results = {};
        store.results[id] = { responses: [] };
        writeStore(store);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 500, { error: e.message }); }
    });
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────
  const filePath = path.join(__dirname, pathname === '/' ? '/index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (e, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(page || 'Not Found');
      }); return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });

}).listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));
