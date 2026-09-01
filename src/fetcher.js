import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { classify } from './classify.js';
import { BLOCKED_PUBLISHERS } from './sources.js';

/**
 * 転載スパムの見出しは「… Hilary Duff (yQZIFEkh)」のように、末尾へ
 * 無関係な語とランダムな英数字が付く。この形だけを狙って落とす。
 */
const SPAM_TITLE = /\(\s*[A-Za-z][A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*\s*\)\s*$/;

const isBlockedPublisher = (name) => {
  const lower = (name || '').toLowerCase();
  return lower !== '' && BLOCKED_PUBLISHERS.some((b) => lower.includes(b.toLowerCase()));
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // <content:encoded> などの名前空間付きタグをそのままキーとして扱う
  removeNSPrefix: false,
  parseTagValue: false,
  // 実在のフィードは &amp; などを何千回も含むので既定の上限では弾かれてしまう。
  // 展開回数の上限だけを緩め、XML爆弾対策として効く入れ子の深さと
  // 展開後サイズの上限はむしろ既定より厳しく保つ。
  processEntities: {
    enabled: true,
    maxExpansionDepth: 4,
    maxTotalExpansions: 200_000,
    maxExpandedLength: 200_000,
  },
});

// 素性を名乗りつつ、UA を見て弾くサイトにも通る慣例的な形にしておく
const USER_AGENT =
  'Mozilla/5.0 (compatible; ec-ai-news-live/1.0; +https://github.com/j-okazaki-maker/ec-ai-news)';

/** 1ソースから取り込む上限。全文アーカイブを配信するフィードに埋め尽くされるのを防ぐ。 */
const MAX_ITEMS_PER_SOURCE = 40;

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|yclid|ref|ref_src|cmpid|oc$)/i;

/** URL からトラッキングパラメータを落として正規化する。ID の安定化に使う。 */
export function canonicalUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return String(raw).trim();
  }
}

export function makeId(link, title) {
  const base = canonicalUrl(link) || `title:${title || ''}`;
  return createHash('sha1').update(base).digest('hex').slice(0, 16);
}

/** 文字コードから文字へ。範囲外の値でも例外にしない。 */
function safeChar(code) {
  try {
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  } catch {
    return '';
  }
}

const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // &#8216; &#x2018; のような数値参照も戻す（英語圏のフィードで多い）
    .replace(/&#(\d+);/g, (_, code) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();

/** fast-xml-parser はテキストのみの要素を文字列に、属性付きをオブジェクトにする。両方を吸収する。 */
function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return text(node['#text'] ?? '');
  return '';
}

function firstLink(entry) {
  // Atom: <link rel="alternate" href="...">（複数あり得る）
  const link = entry.link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => l?.['@_rel'] === 'alternate' && l['@_href']) || link.find((l) => l?.['@_href']);
    if (alt) return alt['@_href'];
    return text(link);
  }
  if (link && typeof link === 'object') return link['@_href'] || text(link);
  if (typeof link === 'string' && link) return link;
  return text(entry.guid) || text(entry.id) || '';
}

function parseDate(entry) {
  const raw =
    text(entry.pubDate) ||
    text(entry.published) ||
    text(entry.updated) ||
    text(entry['dc:date']) ||
    text(entry.date) ||
    '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** RSS 2.0 / RDF(RSS 1.0) / Atom を判別してエントリ配列を取り出す。 */
export function extractEntries(xml) {
  const doc = parser.parse(xml);
  if (doc?.rss?.channel) return asArray(doc.rss.channel.item);
  if (doc?.['rdf:RDF']) return asArray(doc['rdf:RDF'].item);
  if (doc?.RDF) return asArray(doc.RDF.item);
  if (doc?.feed) return asArray(doc.feed.entry);
  return [];
}

/** フィード本文（XML文字列）を正規化済みニュース項目の配列に変換する。 */
export function parseFeed(xml, source) {
  const entries = extractEntries(xml);
  const items = [];

  for (const entry of entries) {
    let title = stripHtml(text(entry.title));
    const link = firstLink(entry);
    if (!title || !link) continue;

    // Googleニュースは <source> に元の媒体名を入れ、見出し末尾にも「 - 媒体名」を付ける。
    // 配信元の名前で見せたいので、媒体名を取り出して見出しからは落とす。
    const publisher = stripHtml(text(entry.source));
    let displaySource = source.name;
    if (publisher) {
      if (isBlockedPublisher(publisher)) continue;
      displaySource = publisher;
      const suffix = ` - ${publisher}`;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
    }
    if (SPAM_TITLE.test(title)) continue;

    const summaryRaw =
      entry['content:encoded'] ?? entry.description ?? entry.summary ?? entry.content ?? '';
    let summary = stripHtml(text(summaryRaw)).slice(0, 320);
    const publishedAt = parseDate(entry);

    // Googleニュースなどは要約が見出しの繰り返しになる。同じ文が2度並ぶだけなので捨てる
    const squash = (t) => t.replace(/\s+/g, '').toLowerCase();
    if (summary && squash(summary).startsWith(squash(title).slice(0, 24))) summary = '';

    const base = { title, summary };
    const { category, tags, score, hot, strong, events } = classify(base, source.category);

    // filter 付きのソース（総合ニュースやプレスリリース）は、業界を名指しする語が
    // 出てこない記事を捨てる。「出店」「販売」だけの記事を拾わないため
    if (source.filter && strong.ec === 0 && strong.ai === 0) continue;

    // eventOnly のソースは、企業・市場が動いた記事だけを拾う。自社サービスの
    // 宣伝リリース（「AI」と言っているだけのもの）を落とすため
    if (source.eventOnly && events === 0) continue;

    items.push({
      id: makeId(link, title),
      title,
      link: canonicalUrl(link),
      summary,
      source: displaySource,
      sourceId: source.id,
      lang: source.lang || 'ja',
      category,
      tags,
      score,
      hot,
      publishedAt,
    });
  }

  // 新しい順に上限まで
  items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

/**
 * 1ソースを取得して正規化する。ネットワーク・パース失敗は例外にせず結果に載せる。
 * @returns {Promise<{sourceId:string, ok:boolean, items:object[], error?:string, ms:number}>}
 */
export async function fetchSource(source, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetchImpl(source.url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { sourceId: source.id, ok: false, items: [], error: `HTTP ${res.status}`, ms: Date.now() - startedAt };
    }
    const xml = await res.text();
    const items = parseFeed(xml, source);
    return { sourceId: source.id, ok: true, items, ms: Date.now() - startedAt };
  } catch (err) {
    const error = err?.name === 'TimeoutError' ? `タイムアウト (${timeoutMs}ms)` : String(err?.message || err);
    return { sourceId: source.id, ok: false, items: [], error, ms: Date.now() - startedAt };
  }
}

/** 全ソースを並行取得する（同時実行数を絞ってサーバ側に優しくする）。 */
export async function fetchAll(sources, { concurrency = 4, ...opts } = {}) {
  const queue = [...sources];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const source = queue.shift();
      results.push(await fetchSource(source, opts));
    }
  });
  await Promise.all(workers);
  return results;
}
