/**
 * 各フィードがいま取得できるかを確認する。
 *
 *   node scripts/check-sources.js                 … 登録済みの全ソースを確認
 *   node scripts/check-sources.js <URL> <URL> …   … 指定したURLだけを確認（差し替え候補の下調べ用）
 *
 * 登録済みソースの確認では「取得できた件数」と「取り込み規則を通った件数」の
 * 両方を出し、落ちた見出しも並べる。filter が厳しすぎて記事が載っていない
 * ソースを見つけるため。候補URLを指定したときは全見出しを出す。
 *
 * ネットワークが使える環境で実行してください（GitHub Actions の
 * 「ソースの疎通確認」ワークフローからも手動で実行できます）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, passesSourceRules } from '../src/fetcher.js';
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
const isProbe = urls.length > 0;

// 候補URLの下調べでは規則を当てずに素の見出しを見たいので、規則なしのソースとして扱う
const targets = isProbe
  ? urls.map((url, i) => ({ id: `候補${i + 1}`, name: url, url, category: 'ec', lang: 'ja' }))
  : loadSources().filter((s) => s.enabled !== false);

const MAX_TITLES = isProbe ? 15 : 6;

console.log(`${targets.length} 件を確認します\n`);

let ng = 0;
for (const source of targets) {
  // fetchSource は取り込み規則を当てた後の記事を返すので、素の件数は raw から数える
  const res = await fetchSource(source, { timeoutMs: 30_000, includeRaw: true });

  if (!res.ok) {
    ng += 1;
    console.log(`✗ ${source.id}  ${res.error}  ${source.url}`);
    continue;
  }

  const raw = res.rawItems || res.items;
  const kept = raw.filter((i) => passesSourceRules(i, source));

  if (raw.length === 0) {
    ng += 1;
    console.log(`△ ${source.id}  取得できたが記事が0件（形式が違う可能性）  ${source.url}`);
    continue;
  }

  const rules = ['filter', 'eventOnly', 'noPromo'].filter((k) => source[k]);
  const note = rules.length ? `  規則: ${rules.join('/')}` : '';
  console.log(`✓ ${source.id}  取得 ${raw.length} 件 → 採用 ${kept.length} 件 (${res.ms}ms)${note}`);
  console.log(`    ${source.url}`);

  if (isProbe) {
    for (const item of raw.slice(0, MAX_TITLES)) console.log(`      ${item.title.slice(0, 70)}`);
  } else {
    const dropped = raw.filter((i) => !passesSourceRules(i, source));
    for (const item of dropped.slice(0, MAX_TITLES)) console.log(`    × ${item.title.slice(0, 70)}`);
    if (dropped.length > MAX_TITLES) console.log(`    × …ほか ${dropped.length - MAX_TITLES} 件`);
  }
  console.log('');
}

console.log(`\n失敗・要確認: ${ng} 件 / ${targets.length} 件`);
