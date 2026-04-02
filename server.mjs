import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const dataDir = path.join(__dirname, 'data');
const leaderboardFile = path.join(dataDir, 'leaderboard.json');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const maxEntries = 20;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function sanitizeName(input) {
  return String(input ?? '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 10)
    .toUpperCase();
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(
      (entry) =>
        entry &&
        typeof entry.name === 'string' &&
        typeof entry.score === 'number' &&
        typeof entry.levelName === 'string' &&
        typeof entry.timestamp === 'number'
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    })
    .slice(0, maxEntries);
}

async function ensureLeaderboardFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(leaderboardFile);
  } catch {
    await fs.writeFile(leaderboardFile, '[]', 'utf8');
  }
}

async function readLeaderboard() {
  await ensureLeaderboardFile();
  try {
    const raw = await fs.readFile(leaderboardFile, 'utf8');
    return normalizeEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeLeaderboard(entries) {
  await ensureLeaderboardFile();
  const normalized = normalizeEntries(entries);
  await fs.writeFile(leaderboardFile, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function getStaticFilePath(requestPath) {
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  if (requestPath === '/' || requestPath === '') {
    filePath = path.join(distDir, 'index.html');
  }

  return filePath;
}

async function serveStatic(req, res) {
  let filePath = getStaticFilePath(req.url || '/');

  try {
    let stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.stat(filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size });
    res.end(data);
  } catch {
    try {
      const indexPath = path.join(distDir, 'index.html');
      const data = await fs.readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      sendJson(res, 500, { error: 'Build output not found. Run npm run build first.' });
    }
  }
}

const server = createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  if (method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url === '/api/leaderboard' && method === 'GET') {
    sendJson(res, 200, await readLeaderboard());
    return;
  }

  if (url === '/api/leaderboard' && method === 'POST') {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const name = sanitizeName(payload.name);
        const score = Math.max(0, Math.floor(Number(payload.score) || 0));
        const levelName = typeof payload.levelName === 'string' ? payload.levelName.slice(0, 40) : 'ROUND-01';

        if (!name) {
          sendJson(res, 400, { error: 'Name must be 1-10 English letters.' });
          return;
        }

        const current = await readLeaderboard();
        const updated = await writeLeaderboard([
          ...current,
          { name, score, levelName, timestamp: Date.now() },
        ]);
        sendJson(res, 200, updated);
      } catch {
        sendJson(res, 400, { error: 'Invalid leaderboard payload.' });
      }
    });
    return;
  }

  if (url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  await serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`BrickPush server running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
});
