const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── Storage: Railway Volume → /tmp → in-memory fallback ───────────────────
function resolveDataDir() {
  const candidates = ['/data', '/tmp'];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // test write access
      const probe = path.join(dir, '.write_test');
      fs.writeFileSync(probe, '1');
      fs.unlinkSync(probe);
      console.log('Survey data dir: ' + dir);
      return dir;
    } catch (e) { /* try next */ }
  }
  console.log('Survey data dir: in-memory (no writable filesystem found)');
  return null;
}

const DATA_DIR = resolveDataDir();

// in-memory fallback
let _memSurvey = { active: false, title: '', questions: [] };
let _memResults = { responses: [] };

function readJSON(filename, fallback) {
  if (!DATA_DIR) return fallback;
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')); }
  catch (e) { return fallback; }
}

function writeJSON(filename, data) {
  if (!DATA_DIR) {
    if (filename === 'survey_data.json') _memSurvey = data;
    else _memResults = data;
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
}

function getSurvey() {
  return DATA_DIR ? readJSON('survey_data.json', { active: false, title: '', questions: [] }) : _memSurvey;
}

function getResults() {
  return DATA_DIR ? readJSON('survey_results.json', { responses: [] }) : _memResults;
}

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

function apiResponse(res, status, data) {
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
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ── API ───────────────────────────────────────────────────────────────

  if (req.method === 'GET' && pathname === '/api/survey') {
    apiResponse(res, 200, getSurvey());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/submit') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const results = getResults();
        results.responses.push({ timestamp: new Date().toISOString(), answers: body.answers || {} });
        writeJSON('survey_results.json', results);
        apiResponse(res, 200, { ok: true });
      } catch (e) { apiResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/results') {
    apiResponse(res, 200, getResults());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/create') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        writeJSON('survey_data.json', { active: true, title: body.title || 'Neue Umfrage', questions: body.questions || [] });
        writeJSON('survey_results.json', { responses: [] });
        apiResponse(res, 200, { ok: true });
      } catch (e) { apiResponse(res, 500, { error: e.message }); }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    try {
      writeJSON('survey_results.json', { responses: [] });
      apiResponse(res, 200, { ok: true });
    } catch (e) { apiResponse(res, 500, { error: e.message }); }
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────

  const filePath = path.join(__dirname, pathname === '/' ? '/index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (e, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(page || 'Not Found');
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });

}).listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));
