const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── In-Memory Store (kein Filesystem nötig) ────────────────────────────────
let surveyData = { active: false, title: '', questions: [] };
let surveyResults = { responses: [] };

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

  if (req.method === 'GET' && pathname === '/api/survey') {
    apiResponse(res, 200, surveyData);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/submit') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      surveyResults.responses.push({
        timestamp: new Date().toISOString(),
        answers: body.answers || {}
      });
      apiResponse(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/results') {
    apiResponse(res, 200, surveyResults);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/create') {
    readBody(req, (err, body) => {
      if (err) { apiResponse(res, 400, { error: 'Invalid JSON' }); return; }
      surveyData = {
        active: true,
        title: body.title || 'Neue Umfrage',
        questions: body.questions || []
      };
      surveyResults = { responses: [] };
      apiResponse(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    surveyResults = { responses: [] };
    apiResponse(res, 200, { ok: true });
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
