/**
 * docs/standalone.html を作る。
 *
 * CSS・JS・ニュースデータをすべて1枚のHTMLに埋め込むので、ダウンロードして
 * ダブルクリックするだけで読める（サーバも通信も不要）。書き出した時点の
 * 内容が固定されるスナップショットなので、自動更新はしない。
 *
 * build-site.js のあとに実行すること（docs/news.json を読む）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'standalone.html');
const NEWS_JSON = join(ROOT, 'docs', 'news.json');
const LIMIT = Number(process.env.STANDALONE_ITEMS || 250);

if (!existsSync(NEWS_JSON)) {
  console.error('docs/news.json がありません。先に scripts/build-site.js を実行してください。');
  process.exit(1);
}

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const html = read('public', 'index.html');
const news = JSON.parse(read('docs', 'news.json'));

const payload = {
  generatedAt: news.generatedAt,
  stats: news.stats,
  sources: news.sources,
  items: news.items.slice(0, LIMIT),
};

// 埋め込むJSONの < を退避し、本文中の "</script>" でスクリプトが途切れないようにする
const json = JSON.stringify(payload).replace(/</g, '\\u003c');

const out = html
  .replace('  <link rel="stylesheet" href="style.css" />', `  <style>\n${read('public', 'style.css')}\n  </style>`)
  .replace(
    '  <script src="app.js" type="module"></script>',
    `  <script>window.__NEWS__ = ${json};</script>\n  <script type="module">\n${read('public', 'app.js')}\n  </script>`,
  );

writeFileSync(OUT, out);
console.log(`docs/standalone.html を書き出しました（${payload.items.length} 件 / ${(out.length / 1024).toFixed(0)} KB）`);
