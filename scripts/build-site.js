/**
 * 静的サイト（docs/）を組み立てる。GitHub Actions から定期実行する想定。
 *
 *  1. 全フィードを取得して、前回までの記事とマージする
 *  2. docs/news.json に書き出す（記事・統計・ソースの取得結果）
 *  3. public/ のフロントエンドを docs/ にコピーする
 *
 * サーバを立てられない環境でも、docs/ を配信するだけでニュースが読める。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NewsStore } from '../src/store.js';
import { fetchAll, cleanSummary } from '../src/fetcher.js';
import { DEFAULT_SOURCES } from '../src/sources.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const NEWS_JSON = join(DOCS, 'news.json');
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 400);

function loadSources() {
  const configPath = join(ROOT, 'config', 'sources.json');
  if (!existsSync(configPath)) return DEFAULT_SOURCES;
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.sources;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_SOURCES;
}

const sources = loadSources();
const enabled = sources.filter((s) => s.enabled !== false);
const store = new NewsStore({ file: null, maxItems: MAX_ITEMS });

// 前回までの記事を読み込む（firstSeenAt はそのまま引き継がれる）
if (existsSync(NEWS_JSON)) {
  try {
    const prev = JSON.parse(readFileSync(NEWS_JSON, 'utf8'));
    // 整形の規則を後から変えても、保存済みの記事に反映されるようにする
    store.ingest((prev.items || []).map((i) => ({ ...i, summary: cleanSummary(i.summary) })));
    console.log(`前回までの記事: ${store.items.size} 件`);
  } catch (err) {
    console.warn(`既存の news.json を読めませんでした: ${err.message}`);
  }
}

const results = await fetchAll(enabled, { concurrency: 5, timeoutMs: 20_000 });

const collected = [];
for (const res of results) {
  store.setSourceStatus(res.sourceId, {
    ok: res.ok,
    error: res.error || null,
    items: res.items.length,
    ms: res.ms,
  });
  collected.push(...res.items);
  const label = res.ok ? `${String(res.items.length).padStart(3)} 件` : `失敗: ${res.error}`;
  console.log(`  ${res.ok ? '✓' : '✗'} ${res.sourceId.padEnd(22)} ${label}`);
}

const fresh = store.ingest(collected);
const okCount = results.filter((r) => r.ok).length;
console.log(`取得成功 ${okCount}/${results.length} ソース / 新着 ${fresh.length} 件 / 保持 ${store.items.size} 件`);

if (okCount === 0 && store.items.size === 0) {
  // 1件も取れず手元にも何もない状態で空ファイルを置くと、サイトが真っ白になる
  console.error('どのソースからも取得できず、既存の記事もありません。書き出しを中止します。');
  process.exit(1);
}

const status = store.getSourceStatus();
mkdirSync(DOCS, { recursive: true });
writeFileSync(
  NEWS_JSON,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    stats: store.stats(),
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      lang: s.lang || 'ja',
      enabled: s.enabled !== false,
      status: status[s.id] || null,
    })),
    items: store.list({ limit: MAX_ITEMS }),
  }),
);

for (const file of ['index.html', 'style.css', 'app.js']) {
  copyFileSync(join(ROOT, 'public', file), join(DOCS, file));
}
writeFileSync(join(DOCS, '.nojekyll'), ''); // GitHub Pages に素のまま配信させる

console.log(`docs/ を更新しました（${store.items.size} 件）`);
