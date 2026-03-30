const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const SURVEY_DATA_FILE = path.join('/tmp', 'survey_data.json');
const SURVEY_RESULTS_FILE = path.join('/tmp', 'survey_results.json');

const EMPTY_SURVEY = { active: false, title: '', questions: [] };
const EMPTY_RESULTS = { responses: [] };

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ── Helpers ────────────────────────────────────────────────────────────────

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

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

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ── API Routes ────────────────────────────────────────────────────────

  // GET /api/survey → aktive Umfrage zurückgeben
  if (req.method === 'GET' && pathname === '/api/survey') {
    const survey = readJSON(SURVEY_DATA_FILE, EMPTY_SURVEY);
    apiResponse(res, 200, survey);
    return;
  }

  // POST /api/submit → Antwort speichern
  if (req.method === 'POST' && pathname === '/api/submit') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const results = readJSON(SURVEY_RESULTS_FILE, EMPTY_RESULTS);
        results.responses.push({
          timestamp: new Date().toISOString(),
          answers: body.answers || {}
        });
        writeJSON(SURVEY_RESULTS_FILE, results);
        apiResponse(res, 200, { ok: true });
      } catch (e) {
        apiResponse(res, 500, { error: 'Speicherfehler' });
      }
    });
    return;
  }

  // GET /api/results → alle Ergebnisse zurückgeben
  if (req.method === 'GET' && pathname === '/api/results') {
    const results = readJSON(SURVEY_RESULTS_FILE, EMPTY_RESULTS);
    apiResponse(res, 200, results);
    return;
  }

  // POST /api/create → neue Umfrage aktivieren (ersetzt bestehende + leert Ergebnisse)
  if (req.method === 'POST' && pathname === '/api/create') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      try {
        const survey = {
          active: true,
          title: body.title || 'Neue Umfrage',
          questions: body.questions || []
        };
        writeJSON(SURVEY_DATA_FILE, survey);
        writeJSON(SURVEY_RESULTS_FILE, EMPTY_RESULTS);
        apiResponse(res, 200, { ok: true });
      } catch (e) {
        apiResponse(res, 500, { error: 'Speicherfehler' });
      }
    });
    return;
  }

  // POST /api/reset → Ergebnisse löschen
  if (req.method === 'POST' && pathname === '/api/reset') {
    try {
      writeJSON(SURVEY_RESULTS_FILE, EMPTY_RESULTS);
      apiResponse(res, 200, { ok: true });
    } catch (e) {
      apiResponse(res, 500, { error: 'Speicherfehler' });
    }
    return;
  }

  // ── Static File Serving ───────────────────────────────────────────────

  let filePath = '.' + (pathname === '/' ? '/index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile('./index.html', (e, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(page || 'Not Found');
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });

}).listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));
