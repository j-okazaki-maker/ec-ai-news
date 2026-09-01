import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NewsStore } from '../src/store.js';

const item = (id, over = {}) => ({
  id,
  title: `記事${id}`,
  link: `https://example.com/${id}`,
  summary: '',
  source: 'テスト',
  sourceId: 'test',
  lang: 'ja',
  category: 'ec',
  tags: [],
  score: 0,
  hot: false,
  publishedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

test('新着のみを返し、重複は取り込まない', () => {
  const store = new NewsStore();
  assert.equal(store.ingest([item('a'), item('b')]).length, 2);
  assert.equal(store.ingest([item('b'), item('c')]).length, 1, 'b は既知なので c だけ新着');
  assert.equal(store.items.size, 3);
});

test('新着があると items イベントが飛ぶ', () => {
  const store = new NewsStore();
  const seen = [];
  store.on('items', (fresh) => seen.push(...fresh));
  store.ingest([item('a')]);
  store.ingest([item('a')]); // 重複 → 発火しない
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 'a');
});

test('公開日時の新しい順に並ぶ', () => {
  const store = new NewsStore();
  store.ingest([
    item('old', { publishedAt: '2026-08-30T00:00:00.000Z' }),
    item('new', { publishedAt: '2026-09-01T12:00:00.000Z' }),
    item('mid', { publishedAt: '2026-08-31T00:00:00.000Z' }),
  ]);
  assert.deepEqual(store.list().map((r) => r.id), ['new', 'mid', 'old']);
});

test('カテゴリ絞り込みで both は EC/AI 双方に出る', () => {
  const store = new NewsStore();
  store.ingest([item('e'), item('a', { category: 'ai' }), item('x', { category: 'both' })]);
  assert.deepEqual(store.list({ category: 'ec' }).map((r) => r.id).sort(), ['e', 'x']);
  assert.deepEqual(store.list({ category: 'ai' }).map((r) => r.id).sort(), ['a', 'x']);
});

test('キーワード検索・注目のみ・件数制限が効く', () => {
  const store = new NewsStore();
  store.ingest([
    item('1', { title: '楽天が新サービス' }),
    item('2', { title: 'AI企業が資金調達', hot: true }),
  ]);
  assert.deepEqual(store.list({ q: '楽天' }).map((r) => r.id), ['1']);
  assert.deepEqual(store.list({ hotOnly: true }).map((r) => r.id), ['2']);
  assert.equal(store.list({ limit: 1 }).length, 1);
});

test('since 以降に初めて見た記事だけを返す', () => {
  const store = new NewsStore();
  store.ingest([item('a')], { now: 1_000 });
  const cursor = new Date(2_000).toISOString();
  store.ingest([item('b')], { now: 3_000 });
  assert.deepEqual(store.list({ since: cursor }).map((r) => r.id), ['b']);
});

test('maxItems を超えたら古い記事から捨てる', () => {
  const store = new NewsStore({ maxItems: 2 });
  store.ingest([
    item('old', { publishedAt: '2026-08-01T00:00:00.000Z' }),
    item('mid', { publishedAt: '2026-08-02T00:00:00.000Z' }),
    item('new', { publishedAt: '2026-08-03T00:00:00.000Z' }),
  ]);
  assert.deepEqual(store.list().map((r) => r.id), ['new', 'mid']);
});

test('保存したデータを読み直せる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'news-store-'));
  const file = join(dir, 'news.json');
  try {
    const a = new NewsStore({ file });
    a.ingest([item('a'), item('b')]);

    const b = new NewsStore({ file });
    b.load();
    assert.equal(b.items.size, 2);
    assert.equal(b.ingest([item('a')]).length, 0, '再起動後も既知の記事は新着にしない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stats はカテゴリ別件数を返す', () => {
  const store = new NewsStore();
  store.ingest([item('e'), item('a', { category: 'ai' }), item('x', { category: 'both', hot: true })]);
  const s = store.stats();
  assert.equal(s.total, 3);
  assert.equal(s.ec, 2);
  assert.equal(s.ai, 2);
  assert.equal(s.both, 1);
  assert.equal(s.hot, 1);
});

test('別ソースの同じ記事は見出しで重複排除する', async () => {
  const { titleKey } = await import('../src/store.js');
  assert.equal(
    titleKey('【速報】楽天が新サービスを発表 - ITmedia NEWS'),
    titleKey('【速報】楽天が新サービスを発表'),
  );

  const store = new NewsStore();
  store.ingest([item('orig', { title: '楽天が新サービスを発表', link: 'https://a.test/1' })]);
  const dup = store.ingest([
    item('gnews', { title: '楽天が新サービスを発表 - ITmedia NEWS', link: 'https://news.google.com/x' }),
  ]);
  assert.equal(dup.length, 0);
  assert.equal(store.items.size, 1);

  assert.equal(store.ingest([item('other', { title: '別の記事' })]).length, 1);
});

test('間引き後も見出し索引が壊れない', () => {
  const store = new NewsStore({ maxItems: 1 });
  store.ingest([
    item('a', { title: '古い記事', publishedAt: '2026-08-01T00:00:00.000Z' }),
    item('b', { title: '新しい記事', publishedAt: '2026-08-02T00:00:00.000Z' }),
  ]);
  assert.deepEqual(store.list().map((r) => r.id), ['b']);
  assert.equal(store.ingest([item('c', { title: '新しい記事', link: 'https://x.test/c' })]).length, 0);
  assert.equal(store.ingest([item('d', { title: '古い記事', link: 'https://x.test/d' })]).length, 1,
    '間引かれた記事の見出しは索引から消える');
});
