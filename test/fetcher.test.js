import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed, canonicalUrl, makeId, fetchSource } from '../src/fetcher.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const ecSource = { id: 'test-ec', name: 'テストEC', url: 'https://example.com/feed', category: 'ec', lang: 'ja' };
const aiSource = { id: 'test-ai', name: 'Test AI', url: 'https://example.org/feed', category: 'ai', lang: 'en' };

test('RSS 2.0 を解析して正規化できる', () => {
  const items = parseFeed(fixture('rss2.xml'), ecSource);
  assert.equal(items.length, 2, 'title 欠落の項目は落とす');

  const [first, second] = items;
  assert.equal(first.title, '楽天、生成AIを使った出店者向け新サービスを発表');
  assert.equal(first.link, 'https://example.com/news/1', 'utm_* は除去される');
  assert.equal(first.summary.includes('<'), false, 'HTMLタグは除去される');
  assert.ok(first.summary.includes('生成AI'));
  assert.equal(first.category, 'both', 'EC と AI の両方に触れる記事は both');
  assert.equal(first.source, 'テストEC');
  assert.equal(new Date(first.publishedAt).toISOString(), '2026-09-01T00:00:00.000Z');

  assert.equal(second.hot, true, '「速報」「障害」を含む記事は注目扱い');
  assert.ok(second.summary.includes('決済システム'), 'content:encoded を要約に使う');
});

test('RDF(RSS 1.0) を解析できる', () => {
  const items = parseFeed(fixture('rdf.xml'), ecSource);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://example.jp/a');
  assert.equal(new Date(items[0].publishedAt).toISOString(), '2026-08-31T22:15:00.000Z');
});

test('Atom を解析し alternate リンクを優先する', () => {
  const items = parseFeed(fixture('atom.xml'), aiSource);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, 'https://example.org/posts/1');
  assert.equal(items[1].link, 'https://example.org/posts/2');
  assert.equal(items[1].category, 'both', 'Shopify × AI は both');
});

test('壊れた XML でも例外を投げず空配列を返す', () => {
  assert.deepEqual(parseFeed('<not-a-feed>', ecSource), []);
  assert.deepEqual(parseFeed('', ecSource), []);
});

test('canonicalUrl と makeId は同一記事に同じIDを与える', () => {
  assert.equal(canonicalUrl('https://a.test/p/1/?utm_source=x&id=9#top'), 'https://a.test/p/1?id=9');
  assert.equal(
    makeId('https://a.test/p/1?utm_medium=rss', 't'),
    makeId('https://a.test/p/1', 't'),
  );
});

test('fetchSource は HTTP エラーを結果として返す', async () => {
  const res = await fetchSource(ecSource, {
    fetchImpl: async () => new Response('nope', { status: 503 }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'HTTP 503');
  assert.deepEqual(res.items, []);
});

test('fetchSource はネットワーク例外を握りつぶす', async () => {
  const res = await fetchSource(ecSource, {
    fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /ENOTFOUND/);
});

test('fetchSource は成功時に正規化済み項目を返す', async () => {
  const res = await fetchSource(aiSource, {
    fetchImpl: async () => new Response(fixture('atom.xml'), { status: 200 }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
});
