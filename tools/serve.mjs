// Serves preview/ over http. Opening index.html straight from disk works too,
// but a real origin keeps the page honest about how browsers load its assets.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './lib.mjs';

const PORT = Number(process.env.PORT) || 4173;
const DIR = join(ROOT, 'preview');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^[\\/]+/, '');
  const path = join(DIR, rel || 'index.html');

  if (!path.startsWith(DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => {
  console.log(`preview: http://localhost:${PORT}`);
});
