import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NewsStore } from './store.js';
import { Poller } from './poller.js';
import { DEFAULT_SOURCES } from './sources.js';
import { DEMO_SOURCES, createDemoFetch } from './demo.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEMO_MODE = process.env.DEMO_MODE === '1';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || (DEMO_MODE ? 15_000 : 180_000));
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 1000);
const DATA_FILE = process.env.DATA_FILE || join(ROOT, 'data', 'news.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** config/sources.json があればそれを使う（コードを触らずソースを差し替えるため）。 */
function loadSources() {
  if (DEMO_MODE) return DEMO_SOURCES;
  const configPath = join(ROOT, 'config', 'sources.json');
  if (!existsSync(configPath)) return DEFAULT_SOURCES;
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.sources;
    if (!Array.isArray(list) || list.length === 0) throw new Error('sources が空です');
    console.log(`[config] config/sources.json から ${list.length} 件のソースを読み込みました`);
    return list;
  } catch (err) {
    console.warn(`[config] config/sources.json を読めないため既定のソースを使います: ${err.message}`);
    return DEFAULT_SOURCES;
  }
}

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

export function createApp({ store, poller, sources }) {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();

  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      // 切断済みクライアントへの書き込みは無視する
      res.write(frame, () => {});
    }
  };

  store.on('items', (fresh) => {
    if (fresh.length > 0) broadcast('news', { items: fresh, stats: store.stats() });
  });

  // プロキシやブラウザに接続を切られないよう、定期的にコメント行を流す
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n', () => {});
  }, 25_000);
  heartbeat.unref?.();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        demoMode: DEMO_MODE,
        pollIntervalMs: poller.intervalMs,
        lastPollAt: poller.lastRunAt,
        clients: clients.size,
        ...store.stats(),
      });
    }

    if (pathname === '/api/sources') {
      const status = store.getSourceStatus();
      return sendJson(res, 200, {
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          lang: s.lang || 'ja',
          enabled: s.enabled !== false,
          status: status[s.id] || null,
        })),
      });
    }

    if (pathname === '/api/news') {
      const limit = Math.min(Number(url.searchParams.get('limit') || 100) || 100, 500);
      return sendJson(res, 200, {
        items: store.list({
          category: url.searchParams.get('category') || 'all',
          sourceId: url.searchParams.get('source') || null,
          q: url.searchParams.get('q') || '',
          hotOnly: url.searchParams.get('hot') === '1',
          since: url.searchParams.get('since') || null,
          limit,
        }),
        stats: store.stats(),
        serverTime: new Date().toISOString(),
      });
    }

    if (pathname === '/api/refresh' && req.method === 'POST') {
      const result = await poller.runOnce();
      return sendJson(res, 200, {
        fresh: result.fresh.length,
        ok: result.ok,
        failed: result.failed,
        skipped: Boolean(result.skipped),
        stats: store.stats(),
      });
    }

    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 5000\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ stats: store.stats(), serverTime: new Date().toISOString() })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return undefined;
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'not_found' });
    }

    return serveStatic(res, pathname);
  });

  server.on('close', () => clearInterval(heartbeat));
  return { server, clients, broadcast };
}

function main() {
  const sources = loadSources();
  const store = new NewsStore({ file: DATA_FILE, maxItems: MAX_ITEMS });
  store.load();

  const poller = new Poller({
    store,
    sources,
    intervalMs: POLL_INTERVAL_MS,
    ...(DEMO_MODE ? { fetchImpl: createDemoFetch() } : {}),
  });

  const { server } = createApp({ store, poller, sources });

  server.listen(PORT, HOST, () => {
    console.log('─'.repeat(56));
    console.log(' EC × AI ニュース速報');
    console.log(`  URL       : http://localhost:${PORT}`);
    console.log(`  ソース数  : ${sources.filter((s) => s.enabled !== false).length}`);
    console.log(`  更新間隔  : ${Math.round(POLL_INTERVAL_MS / 1000)} 秒`);
    console.log(`  モード    : ${DEMO_MODE ? 'デモ（擬似フィード）' : '本番（実フィード取得）'}`);
    console.log(`  保存先    : ${DATA_FILE}`);
    console.log('─'.repeat(56));
    poller.start();
  });

  const shutdown = () => {
    console.log('\n終了します…');
    poller.stop();
    store.save();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
