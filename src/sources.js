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
 *
 * 取得できるかどうかは `node scripts/check-sources.js` で確認できます。
 */
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
    enabled: true,
  },
  {
    id: 'gnews-ec-ja',
    name: 'Googleニュース: EC/ネット通販',
    url: 'https://news.google.com/rss/search?q=%28EC%E6%A5%AD%E7%95%8C+OR+%E3%83%8D%E3%83%83%E3%83%88%E9%80%9A%E8%B2%A9+OR+%E9%9B%BB%E5%AD%90%E5%95%86%E5%8F%96%E5%BC%95%29+when%3A7d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    enabled: true,
  },
  {
    id: 'gnews-ecmall-ja',
    name: 'Googleニュース: 楽天/Amazon/ZOZO',
    url: 'https://news.google.com/rss/search?q=%28%E6%A5%BD%E5%A4%A9%E5%B8%82%E5%A0%B4+OR+Amazon%E3%82%B8%E3%83%A3%E3%83%91%E3%83%B3+OR+ZOZOTOWN+OR+Shopify%29+when%3A7d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ec',
    lang: 'ja',
    enabled: true,
  },

  // ---------------- EC業界（海外） ----------------
  {
    id: 'digitalcommerce360',
    name: 'Digital Commerce 360',
    url: 'https://www.digitalcommerce360.com/feed/',
    category: 'ec',
    lang: 'en',
    enabled: true,
  },
  {
    id: 'retaildive',
    name: 'Retail Dive',
    url: 'https://www.retaildive.com/feeds/news/',
    category: 'ec',
    lang: 'en',
    enabled: true,
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
    id: 'gnews-ai-ja',
    name: 'Googleニュース: 生成AI',
    url: 'https://news.google.com/rss/search?q=%28%E7%94%9F%E6%88%90AI+OR+%E5%A4%A7%E8%A6%8F%E6%A8%A1%E8%A8%80%E8%AA%9E%E3%83%A2%E3%83%87%E3%83%AB+OR+OpenAI+OR+Anthropic%29+when%3A7d&hl=ja&gl=JP&ceid=JP:ja',
    category: 'ai',
    lang: 'ja',
    enabled: true,
  },

  // ---------------- AI業界（海外） ----------------
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    category: 'ai',
    lang: 'en',
    enabled: true,
  },
  {
    id: 'venturebeat-ai',
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    category: 'ai',
    lang: 'en',
    enabled: true,
  },
  {
    id: 'theverge-ai',
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    category: 'ai',
    lang: 'en',
    enabled: true,
  },
  {
    id: 'openai-news',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    category: 'ai',
    lang: 'en',
    enabled: true,
  },
  {
    id: 'googleblog-ai',
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    category: 'ai',
    lang: 'en',
    enabled: true,
  },
];
