import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, isAdTitle } from '../src/classify.js';
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

test('企業・市場が動いた記事だけを見分けられる', () => {
  // 自社サービスの宣伝リリース（「AI」と言っているだけ）
  assert.equal(classify({ title: 'AI顔認証を活用した見守り支援システムの運用を開始' }, 'ai').events, 0);
  assert.equal(classify({ title: '【新機能リリース】AIロープレに新機能を追加' }, 'ai').events, 0);

  // 実際に動きがあった記事
  assert.ok(classify({ title: 'AIスタートアップが10億円を資金調達' }, 'ai').events > 0);
  assert.ok(classify({ title: 'Buyeeがトイズキングと連携し、OMO施策を開始' }, 'ec').events > 0);
  assert.ok(classify({ title: 'JR東日本、対話AIプラットフォームの実証実験を開始' }, 'ai').events > 0);
});

test('eventOnly のソースは宣伝リリースを取り込まない', () => {
  const source = { id: 'pr', name: 'PR', url: 'https://e.test/f', category: 'ec', lang: 'ja', filter: true, eventOnly: true };
  const items = parseFeed(
    feed(
      'AI顔認証を活用した見守り支援システムの運用を開始',
      '楽天市場に出店する企業がAIスタートアップを買収',
    ),
    source,
  );
  assert.deepEqual(items.map((i) => i.title), ['楽天市場に出店する企業がAIスタートアップを買収']);
});

test('転載スパムの見出しと除外配信元は取り込まない', () => {
  const source = { id: 'g', name: 'Googleニュース', url: 'https://e.test/f', category: 'ec', lang: 'ja' };
  const item = (title, publisher) =>
    `<item><title>${title}</title><link>https://e.test/${encodeURIComponent(title.slice(0, 8))}</link>` +
    (publisher ? `<source url="https://x.test">${publisher}</source>` : '') +
    '</item>';
  const xml =
    '<?xml version="1.0"?><rss version="2.0"><channel>' +
    item('田中が山根の服をZOZOTOWNで購入！！ Cwu (yJliC2A0PL)', 'Mshale') + // 除外配信元
    item('ネット通販の話題 (aB12cD34)', 'どこかのサイト') + // 見出し末尾がランダム文字列
    item('Amazonの新機能について (TechCrunch)', 'TechCrunch') + // 数字がないので通常の括弧書き
    item('楽天市場が新サービスを発表', 'ITmedia') +
    '</channel></rss>';

  assert.deepEqual(
    parseFeed(xml, source).map((i) => i.source),
    ['TechCrunch', 'ITmedia'],
  );
});

test('消費者向けの商品PRと業界ニュースを見分ける', async () => {
  const { isConsumerPromo } = await import('../src/classify.js');

  // 買い物情報（業界ニュースではない）
  assert.equal(isConsumerPromo('「ジョージア ブラック」ラベルレス24本がお得'), true);
  assert.equal(isConsumerPromo('Switch 2用ソフト『ゼルダの伝説』が予約受付中！限定特典まとめ'), true);
  assert.equal(isConsumerPromo('DODの「お財布ショルダーバッグ」が登場！ 旅行にも良さそう'), true);

  // 企業・市場の動きが書かれていれば商品PR扱いにしない
  assert.equal(isConsumerPromo('モトローラが「公式ストア楽天市場店」をオープン！数量限定セットも'), false);
  assert.equal(isConsumerPromo('米アマゾン、自社ECサイトでも「プライム配送」導入を可能にする新機能'), false);
  assert.equal(isConsumerPromo('Amazon、家族介護向け無料プログラムを提供 介護用品をお得に'), false);
});

test('noPromo のソースは買い物情報を取り込まない', () => {
  const source = { id: 'g', name: 'Googleニュース', url: 'https://e.test/f', category: 'ec', lang: 'ja', noPromo: true };
  const items = parseFeed(
    feed(
      '「ジョージア ブラック」ラベルレス24本が楽天市場でお得',
      '楽天市場に出店する企業向けの新機能を提供開始',
    ),
    source,
  );
  assert.deepEqual(items.map((i) => i.title), ['楽天市場に出店する企業向けの新機能を提供開始']);
});

test('EC の受け取り・配送まわりの語で流通・物流媒体の業界ニュースを拾う', () => {
  const ec = (title) => classify({ title }, 'ec').strong.ec > 0;

  // 流通・物流の専門媒体から拾いたい記事
  assert.equal(ec('ヤマト運輸／9月の小口貨物取扱実績、宅配便は5.3％減'), true);
  assert.equal(ec('原信・ナルス、「原信ナルス オンラインショップ」をリニューアル'), true);
  assert.equal(ec('カインズ、次世代の統合サプライチェーン計画基盤にRELEXを採用'), true);
  assert.equal(ec('イオンが集める購買データは4兆円超 業態の枠をなくす相互送客'), true);
  assert.equal(ec('愛知県、手荷物当日配送と無人ロッカーを実証'), true);
  assert.equal(ec('埼玉県：再配達削減に向けたモニター500人を募集、置き配バッグなど'), true);

  // 店舗オープンや食品の新商品は引き続き拾わない
  assert.equal(ec('ヤオコー、埼玉県入間市に「ヤオコーまるひろ入間SC店」オープン'), false);
  assert.equal(ec('ファミマ／「無限クリーム」誕生、ホイップ使ったスイーツ6品発売'), false);
  assert.equal(ec('サンエー 決算／3～8月増収増益、季節商材・食品・土産が好調'), false);
});

test('見出しの頭に広告表記が付いた記事は落とす', () => {
  assert.equal(isAdTitle('【PR】【シリーズ】GLPはMarqへ（3）／顧客の成功から逆算する施設開発'), true);
  assert.equal(isAdTitle('[PR] 物流施設の内覧会を開催'), true);
  assert.equal(isAdTitle('【広告】ECサイト構築セミナー'), true);
  assert.equal(isAdTitle('PR: 新しい倉庫管理システム'), true);

  // 本文中の PR や、PR会社のニュースは落とさない
  assert.equal(isAdTitle('プラップジャパン、世界最大のPR会社・米エデルマン傘下に'), false);
  assert.equal(isAdTitle('PR TIMESが新機能を提供開始'), false);
  assert.equal(isAdTitle('ヤマト運輸／宅配便の取扱実績を発表'), false);
});
