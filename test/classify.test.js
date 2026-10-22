import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, isAdTitle, isNonArticle, isConsumerPromo, isAdultContent, isMarketReportSpam, isGossipTitle } from '../src/classify.js';
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

test('写真ギャラリーやSNSのプロフィールページは記事として扱わない', () => {
  assert.equal(isNonArticle('画像294 / 315＞不在票が入っていたけど、なぜか玄関前に置かれた荷物'), true);
  assert.equal(isNonArticle('＜画像3 / 8＞“資源回収”も！多様化するネットスーパーの最新サービスとは？'), true);
  assert.equal(isNonArticle('nimo (@nimoyama) on X'), true);

  // 本物の記事は落とさない
  assert.equal(isNonArticle('ヤマト運輸／9月の小口貨物取扱実績、宅配便は5.3％減'), false);
  assert.equal(isNonArticle('楽天市場、画像生成AIで商品画像を自動作成する新機能'), false);
});

test('値引き表現のゆれ（％オフ・半額・お買い得）も商品PRとして拾う', () => {
  const promo = (t) => isConsumerPromo(t);

  assert.equal(promo('これが令和の最新版！「たまごっちパラダイス」が22％オフでお買い得'), true);
  assert.equal(promo('Microsoft Officeが最大21％オフ！ Amazonプライム感謝祭を見逃すな'), true);
  assert.equal(promo('新型Fire TV Stick 4Kが早くも半額 プライム感謝祭はAmazonデバイスが安い'), true);
  assert.equal(promo('『ふらいんぐうぃっち』が50%オフ！【Amazonマンガ週末祭】'), true);
  // 「10万円」のように万・億・兆をはさむ金額も拾う
  assert.equal(promo('「スマホに10万円は高すぎる！」Amazonでお買い得、3万円以下から買えるスマホ5選'), true);
  assert.equal(promo('世界最軽量レベルのノートPC「FMV WU5-K3」が、26万円台！'), true);

  // 金額が出てくる業界ニュースは商品PR扱いしない
  assert.equal(promo('AIスタートアップが30億円を資金調達'), false);
  assert.equal(promo('楽天グループ決算、売上は2兆円超'), false);
  assert.equal(promo('厳しさ増す生協の経営環境 専門家が指摘する“3兆円の総合力”の可能性'), false);
  assert.equal(promo('国際郵便の料金値上げ＆割引制度見直しまとめ【2027年2月1日改定】'), false);
});

test('アダルト向けのSEOスパムを落とす', () => {
  assert.equal(isAdultContent('生成AIエロ画像・エロ動画作成ツール10選｜初心者向けの無料'), true);
  assert.equal(isAdultContent('AI彼女 作る アプリ'), true);
  assert.equal(isAdultContent('無料 NSFW AIアニメジェネレーター'), true);
  assert.equal(isAdultContent('AI Porn Generators 2026購入ガイド：ツールの選び方'), true);
  assert.equal(isAdultContent('AIコンパニオン 比較 一覧'), true);

  // 「ピエロ」「ヒエログリフ」の「エロ」に反応しないこと
  assert.equal(isAdultContent('ピエロの衣装を販売するECサイトが開店'), false);
  assert.equal(isAdultContent('ヒエログリフをAIで解読する研究が進む'), false);
  assert.equal(isAdultContent('OpenAIが新モデルを発表'), false);
});

test('機械生成の市場調査レポート記事を落とす', () => {
  assert.equal(
    isMarketReportSpam('B2B（企業間）EC市場の成長予測 2026年〜2033年：売上高、市場シェア、競争環境'),
    true,
  );
  assert.equal(
    isMarketReportSpam('日本のEコマース市場規模、2034年までに7,018億米ドルに到達へ（年平均成長率10.15%）'),
    true,
  );
  assert.equal(isMarketReportSpam('自律移動ロボット市場シェア上位メーカー'), true);
  assert.equal(
    isMarketReportSpam('サービスとしての配送 市場は、2025年から2036年の予測期間において…'),
    true,
  );

  // 年号が入るだけの普通の記事は落とさない
  assert.equal(isMarketReportSpam('【EC利用実態調査2026】生成AIショッピングアシスタントの認知率'), false);
  assert.equal(isMarketReportSpam('国際郵便の料金値上げまとめ【2027年2月1日改定】'), false);
  assert.equal(isMarketReportSpam('2026年の年末商戦、EC各社の施策まとめ'), false);
});

test('写真ギャラリーのページ（オリコンなど）を記事として扱わない', () => {
  assert.equal(isNonArticle('画像・写真 | 櫻坂46松本和子、自身初ソログラビア 18枚目'), true);
  assert.equal(isNonArticle('画像・写真 | 卒業発表の“キャプテン”が思い語る 18枚目'), true);
  assert.equal(isNonArticle('フォトギャラリー：東京ゲームショウ2026'), true);

  // 「枚」が本文の数字として出てくる記事は落とさない
  assert.equal(isNonArticle('ZOZOTOWN、限定Tシャツを全10型で販売'), false);
  assert.equal(isNonArticle('リカバリーウェアReD累計出荷枚数300万枚を突破'), false);
});

test('芸能ゴシップの見出しを落とす', () => {
  assert.equal(isGossipTitle('櫻坂46松本和子、自身初ソログラビア'), true);
  assert.equal(isGossipTitle('人気タレントの写真集が発売'), true);
  assert.equal(isGossipTitle('俳優Aと女優Bの熱愛が発覚'), true);

  assert.equal(isGossipTitle('楽天市場、出店企業向けの新機能を提供開始'), false);
  assert.equal(isGossipTitle('OpenAIが新しい推論モデルを発表'), false);
});
