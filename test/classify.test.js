import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classify.js';
import { parseFeed } from '../src/fetcher.js';

test('EC と AI の両方に触れる記事は both になる', () => {
  const r = classify({ title: '楽天市場、生成AIで商品説明を自動生成' }, 'ec');
  assert.equal(r.category, 'both');
  assert.ok(r.tags.includes('EC×AI'));
});

test('ソースのカテゴリと中身が食い違う記事は中身に合わせる', () => {
  assert.equal(classify({ title: 'OpenAIが新しい大規模言語モデルを公開' }, 'ec').category, 'ai');
  assert.equal(classify({ title: 'ZOZOTOWNの越境ECが好調' }, 'ai').category, 'ec');
});

test('速報性の高い語ほどスコアが上がり、注目扱いになる', () => {
  const outage = classify({ title: '【速報】大手ECモールでシステム障害' }, 'ec');
  const normal = classify({ title: 'ネットショップ運営のコツを解説' }, 'ec');
  assert.ok(outage.score > normal.score);
  assert.equal(outage.hot, true);
  assert.equal(normal.hot, false);
});

test('短い英単語は単語境界で判定する（said を ai と誤認しない）', () => {
  assert.equal(classify({ title: 'He said nothing' }, 'ai').matches.ai, 0);
  assert.ok(classify({ title: 'A new AI model' }, 'ai').matches.ai > 0);
});

test('業界を名指しする語と一般的な語を区別する', () => {
  // 「出店」「販売」は他業種のプレスリリースにも普通に出るので strong では数えない
  const generic = classify({ title: '兵庫・静岡に初出店！ゴルフ練習場オープン' }, 'ec');
  assert.equal(generic.strong.ec, 0);

  const real = classify({ title: '楽天市場に出店する店舗向けの新サービス' }, 'ec');
  assert.ok(real.strong.ec > 0);
});

const prSource = { id: 'pr', name: 'PR', url: 'https://e.test/f', category: 'ec', lang: 'ja', filter: true };
const feed = (...titles) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${titles
    .map((t, i) => `<item><title>${t}</title><link>https://e.test/${i}</link></item>`)
    .join('')}</channel></rss>`;

test('filter 付きのソースは業界に関係ない記事を取り込まない', () => {
  const items = parseFeed(
    feed(
      '兵庫・静岡に初出店！ゴルフ練習場オープンのお知らせ',
      '冬のウェルネス滞在プラン販売開始',
      '楽天市場での店舗運営支援サービスを統合',
      '生成AIを活用した問い合わせ対応の実証実験を開始',
    ),
    prSource,
  );
  assert.deepEqual(items.map((i) => i.category), ['ec', 'ai']);
});

test('filter なしのソースは全件を取り込む', () => {
  const items = parseFeed(feed('ゴルフ練習場オープン', '楽天市場の新サービス'), { ...prSource, filter: false });
  assert.equal(items.length, 2);
});
