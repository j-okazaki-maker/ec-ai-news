/**
 * 各フィードがいま取得できるかを確認する。
 *
 *   node scripts/check-sources.js                 … 登録済みの全ソースを確認
 *   node scripts/check-sources.js <URL> <URL> …   … 指定したURLだけを確認（差し替え候補の下調べ用）
 *
 * ネットワークが使える環境で実行してください（GitHub Actions の
 * 「ソースの疎通確認」ワークフローからも手動で実行できます）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource } from '../src/fetcher.js';
import { DEFAULT_SOURCES } from '../src/sources.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function loadSources() {
  const configPath = join(ROOT, 'config', 'sources.json');
  if (!existsSync(configPath)) return DEFAULT_SOURCES;
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.sources;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_SOURCES;
}

const urls = process.argv.slice(2).flatMap((arg) => arg.split(/[\s,]+/)).filter(Boolean);

const targets = urls.length
  ? urls.map((url, i) => ({ id: `候補${i + 1}`, name: url, url, category: 'ec', lang: 'ja' }))
  : loadSources().filter((s) => s.enabled !== false);

console.log(`${targets.length} 件を確認します\n`);

let ng = 0;
for (const source of targets) {
  const res = await fetchSource(source, { timeoutMs: 20_000 });
  if (res.ok && res.items.length > 0) {
    console.log(`✓ ${source.id}  ${res.items.length} 件 (${res.ms}ms)  ${source.url}`);
    console.log(`    例: ${res.items[0].title.slice(0, 60)}`);
  } else if (res.ok) {
    ng += 1;
    console.log(`△ ${source.id}  取得できたが記事が0件（形式が違う可能性）  ${source.url}`);
  } else {
    ng += 1;
    console.log(`✗ ${source.id}  ${res.error}  ${source.url}`);
  }
}

console.log(`\n失敗・要確認: ${ng} 件 / ${targets.length} 件`);
