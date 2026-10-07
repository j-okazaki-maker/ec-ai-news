/**
 * ニュースソース定義。
 *
 * config/sources.json を置くと、この既定値の代わりにそちらが読み込まれる。
 * （形式は同じ。運用中にソースを足す/外すときはコードを触らず JSON 側を編集する）
 *
 *  id       : 一意なID（購読状態の保存キー）
 *  name     : UI表示名
 *  url      : RSS / Atom / RDF いずれかのフィードURL
 *  category : 'ec' | 'ai'  （記事側のキーワードで 'both' に昇格することがある）
 *  lang     : 'ja' | 'en'
 *  enabled  : false にすると取得しない
 *  filter   : true にすると、EC・AI のどちらにも関係しない記事を捨てる。
 *             総合ニュースやプレスリリースのフィードを混ぜるときに使う
 *  noPromo  : true にすると、消費者向けの商品PR（セール告知・新商品紹介）を
 *             落とす。「Amazon」「楽天市場」に反応して買い物情報を拾ってしまう
 *             検索フィードや総合ITメディアに付ける
 *  eventOnly: true にすると、資金調達・買収・提携・決算・障害・規制など
 *             「実際に動きがあった」記事だけを拾う。自社サービスの宣伝
 *             リリースを落とすのに使う
 *
 * 取得できるかどうかは `node scripts/check-sources.js` で確認できます。
 */
/**
 * 除外する配信元。Googleニュースは転載サイトやスパムも拾ってくるため、
 * 名指しで落とす。気になる配信元が出てきたら、ここに名前を足すだけでよい。
 * 判定は大文字小文字を無視した部分一致。
 */
export const BLOCKED_PUBLISHERS = [
  'Mshale', // 動画の転載サイト。見出し末尾にランダムな文字列が付く
];

export const DEFAULT_SOURCES = [
  // ---------------- EC業界（国内） ----------------
  {
    id: 'netshop-tantousha',
    name: 'ネットショップ担当者フォーラム',
    url: 'https://netshop.impress.co.jp/rss.xml',
    category: 'ec',
    lang: 'ja',
    enabled: true,
  },
  {
    id: 'ecnomikata',
    name: 'ECのミカタ',
    url: 'https://ecnomikata.com/rss/',
    category: 'ec',
    lang: 'ja',
    enabled: true,
  },
  {
    id: 'markezine',
    name: 'MarkeZine',
    url: 'https://markezine.jp/rss/new/index.xml',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'itmedia-marketing',
    name: 'ITmedia マーケティング',
    url: 'https://rss.itmedia.co.jp/rss/2.0/marketing.xml',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'logi-today',
    name: 'LOGISTICS TODAY',
    url: 'https://www.logi-today.com/feed',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'prtimes',
    name: 'PR TIMES',
    url: 'https://prtimes.jp/index.rdf',
    category: 'ec',
    lang: 'ja',
    filter: true, // 全業種のプレスリリースが流れるので、EC・AI 関連だけに絞る
    eventOnly: true, // さらに、資金調達・提携・買収など実際に動きがあったものだけ
    enabled: true,
  },
  {
    id: 'webtan',
    name: 'Web担当者Forum',
    url: 'https://webtan.impress.co.jp/rss.xml',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'ryutsuu',
    name: '流通ニュース',
    url: 'https://www.ryutsuu.biz/feed',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'nikkei-xtrend',
    name: '日経クロストレンド',
    url: 'https://xtrend.nikkei.com/rss/index.rdf',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'diamond-rm',
    name: 'ダイヤモンド・チェーンストア',
    url: 'https://diamond-rm.net/feed/',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'advertimes',
    name: '宣伝会議 AdverTimes',
    url: 'https://www.advertimes.com/feed/',
    category: 'ec',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'nhk-keizai',
    name: 'NHKニュース 経済',
    url: 'https://www.nhk.or.jp/rss/news/cat5.xml',
    category: 'ec',
    lang: 'ja',
    filter: true, // 経済ニュース全般なので EC・AI 関連だけ拾う
    enabled: true,
  },
  {
    id: 'gnews-ec-ja',
    name: 'Googleニュース: EC/ネット通販',
    url: 'https://news.google.com/rss/search?q=%28EC%E6%A5%AD%E7%95%8C+OR+%E3%83%8D%E3%83%83%E3%83%88%E9%80%9A%E8%B2%A9+OR+%E9%9B%BB%E5%AD%90%E5%95%86%E5%8F%96%E5%BC%95%29+when%3A2d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    noPromo: true, // 消費者向けの商品PR（セール・新商品紹介）を落とす
    enabled: true,
  },
  {
    id: 'gnews-ecmall-ja',
    name: 'Googleニュース: 楽天/Amazon/ZOZO',
    url: 'https://news.google.com/rss/search?q=%28%E6%A5%BD%E5%A4%A9%E5%B8%82%E5%A0%B4+OR+Amazon%E3%82%B8%E3%83%A3%E3%83%91%E3%83%B3+OR+ZOZOTOWN+OR+Shopify%29+when%3A2d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    noPromo: true, // 消費者向けの商品PR（セール・新商品紹介）を落とす
    enabled: true,
  },

  {
    id: 'gnews-ecbuturyu-ja',
    name: 'Googleニュース: EC物流/置き配',
    url: 'https://news.google.com/rss/search?q=%28%E3%83%8D%E3%83%83%E3%83%88%E3%82%B9%E3%83%BC%E3%83%91%E3%83%BC%20OR%20%E7%BD%AE%E3%81%8D%E9%85%8D%20OR%20%E3%83%A9%E3%82%B9%E3%83%88%E3%83%AF%E3%83%B3%E3%83%9E%E3%82%A4%E3%83%AB%20OR%20EC%E7%89%A9%E6%B5%81%29%20when%3A2d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    noPromo: true,
    enabled: true,
  },
  {
    id: 'gnews-ecglobal-ja',
    name: 'Googleニュース: 越境EC/D2C',
    url: 'https://news.google.com/rss/search?q=%28%E8%B6%8A%E5%A2%83EC%20OR%20D2C%20OR%20EC%E3%83%A2%E3%83%BC%E3%83%AB%29%20when%3A2d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    filter: true, // 「D2C」などは無関係な記事も拾うので、EC・AI を名指しする語が要る
    noPromo: true,
    enabled: true,
  },
  {
    id: 'lnews',
    name: 'LNEWS（物流）',
    url: 'https://www.lnews.jp/feed',
    category: 'ec',
    lang: 'ja',
    filter: true, // 物流全般の媒体なので、EC・配送まわりの記事だけ拾う
    enabled: true,
  },

  // ---------------- EC業界（海外） ----------------
  {
    id: 'digitalcommerce360',
    name: 'Digital Commerce 360',
    url: 'https://www.digitalcommerce360.com/feed/',
    category: 'ec',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
  {
    id: 'retaildive',
    name: 'Retail Dive',
    url: 'https://www.retaildive.com/feeds/news/',
    category: 'ec',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },

  // ---------------- AI業界（国内） ----------------
  {
    id: 'itmedia-aiplus',
    name: 'ITmedia AI+',
    url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',
    category: 'ai',
    lang: 'ja',
    enabled: true,
  },
  {
    id: 'ainow',
    name: 'AINOW',
    url: 'https://ainow.ai/feed/',
    category: 'ai',
    lang: 'ja',
    enabled: true,
  },
  {
    id: 'xtech-nikkei',
    name: '日経クロステック',
    url: 'https://xtech.nikkei.com/rss/index.rdf',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'publickey',
    name: 'Publickey',
    url: 'https://www.publickey1.jp/atom.xml',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'internet-watch',
    name: 'INTERNET Watch',
    url: 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'itmedia-news',
    name: 'ITmedia NEWS 速報',
    url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
    category: 'ai',
    lang: 'ja',
    filter: true, // 総合ニュースなので EC・AI 関連だけ拾う
    enabled: true,
  },
  {
    id: 'cnet-japan',
    name: 'CNET Japan',
    url: 'https://feeds.japan.cnet.com/rss/cnet/all.rdf',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'zdnet-japan',
    name: 'ZDNET Japan',
    url: 'https://feeds.japan.zdnet.com/rss/zdnet/all.rdf',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'itmedia-enterprise',
    name: 'ITmedia エンタープライズ',
    url: 'https://rss.itmedia.co.jp/rss/2.0/enterprise.xml',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'cloud-watch',
    name: 'クラウド Watch',
    url: 'https://cloud.watch.impress.co.jp/data/rss/1.0/clw/feed.rdf',
    category: 'ai',
    lang: 'ja',
    filter: true,
    enabled: true,
  },
  {
    id: 'ascii',
    name: 'ASCII.jp',
    url: 'https://ascii.jp/rss.xml',
    category: 'ai',
    lang: 'ja',
    filter: true,
    noPromo: true, // 消費者向けの商品PR（セール・新商品紹介）を落とす
    enabled: true,
  },
  {
    id: 'gnews-ai-ja',
    name: 'Googleニュース: 生成AI',
    url: 'https://news.google.com/rss/search?q=%28%E7%94%9F%E6%88%90AI+OR+%E5%A4%A7%E8%A6%8F%E6%A8%A1%E8%A8%80%E8%AA%9E%E3%83%A2%E3%83%87%E3%83%AB+OR+OpenAI+OR+Anthropic%29+when%3A2d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ai',
    lang: 'ja',
    noPromo: true, // 消費者向けの商品PR（セール・新商品紹介）を落とす
    enabled: true,
  },

  // ---------------- AI業界（海外） ----------------
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    category: 'ai',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'ai',
    lang: 'en',
    filter: true,
    enabled: false, // 英語のため無効化
  },
  {
    id: 'venturebeat-ai',
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    category: 'ai',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
  {
    id: 'theverge-ai',
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    category: 'ai',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
  {
    id: 'openai-news',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    category: 'ai',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
  {
    id: 'googleblog-ai',
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    category: 'ai',
    lang: 'en',
    enabled: false, // 英語のため無効化
  },
];
