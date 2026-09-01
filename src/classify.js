/**
 * 記事のカテゴリ判定・タグ付け・速報スコア算出。
 *
 * フィードのカテゴリ（source.category）を出発点に、本文中のキーワードで
 * EC / AI 両方にまたがる記事を 'both' に昇格させる。
 */

/**
 * 業界を名指しする語（strong）と、他業種の記事にも普通に出る語（weak）を分ける。
 * 分類にはどちらも使うが、プレスリリースのような雑多なフィードを絞り込むときは
 * strong に当たったものだけを拾う（「出店」「販売」だけの記事を弾くため）。
 */
const EC_STRONG = [
  'EC', 'Eコマース', 'eコマース', '電子商取引', 'ネット通販', '越境EC', 'ネットショップ',
  'オンラインストア', 'オンライン販売', '楽天市場', '楽天グループ', 'Amazon', 'アマゾン',
  'ZOZO', 'Shopify', 'メルカリ', 'Yahoo!ショッピング', 'PayPayモール', 'アスクル',
  'D2C', 'DtoC', 'OMO', 'ラストワンマイル', 'フルフィルメント', '受注管理',
  'ショッピングカート', 'マーケットプレイス', 'ネットスーパー', '通販サイト',
  'e-commerce', 'ecommerce', 'marketplace', 'checkout', 'fulfillment',
  'omnichannel', 'DTC', 'online retailer', 'online shopping',
];

const EC_WEAK = [
  '通販', '楽天', 'BASE', 'STORES', 'リテール', '小売', '物流', '決済', 'カート',
  '販売', '出店', '流通総額', 'commerce', 'retail', 'shopper',
];

const AI_STRONG = [
  'AI', '人工知能', '生成AI', '機械学習', 'ディープラーニング', '深層学習',
  'LLM', '大規模言語モデル', '基盤モデル', 'マルチモーダル', 'AIエージェント',
  'ChatGPT', 'GPT', 'Claude', 'Gemini', 'Copilot', 'Llama', 'Sora',
  'OpenAI', 'Anthropic', 'DeepSeek', 'Mistral', 'Hugging Face',
  'artificial intelligence', 'machine learning', 'deep learning',
  'generative ai', 'foundation model', 'transformer',
];

const AI_WEAK = [
  'エージェント', 'RAG', '推論', 'プロンプト', 'NVIDIA', 'GPU', '半導体',
  'neural', 'inference', 'model',
];

const EC_KEYWORDS = [...EC_STRONG, ...EC_WEAK];
const AI_KEYWORDS = [...AI_STRONG, ...AI_WEAK];

/**
 * 速報スコアの加点キーワード。値が大きいほど「注目」扱いされやすい。
 *
 * event: true は「企業・市場が実際に動いた」ことを示す語。プレスリリースの
 * ような雑多なフィードから、宣伝ではなく業界の動きだけを拾うのに使う。
 * 「発表」「新機能」はどんな宣伝リリースにも出てくるので event: false。
 */
const HOT_KEYWORDS = [
  { words: ['速報', '緊急', 'breaking'], weight: 30, event: true },
  { words: ['発表', '公開', 'リリース', 'launch', 'launches', 'unveil', 'announce'], weight: 12, event: false },
  {
    words: ['資金調達', '調達', '出資', 'funding', 'raises', 'series a', 'series b', 'ipo', '上場'],
    weight: 20,
    event: true,
  },
  {
    words: [
      '買収', '統合', '合併', '子会社化', '事業譲渡', 'acquisition', 'acquires', 'merger',
      '提携', '業務提携', '資本提携', '協業', 'partnership',
    ],
    weight: 18,
    event: true,
  },
  { words: ['決算', '売上', '過去最高', '業績', 'earnings', 'revenue', 'quarterly'], weight: 10, event: true },
  {
    words: ['障害', '不具合', '停止', 'outage', 'down', '流出', '漏えい', '漏洩', 'breach', 'hack'],
    weight: 25,
    event: true,
  },
  { words: ['規制', '法改正', '訴訟', 'lawsuit', 'regulation', 'ban', '行政指導'], weight: 15, event: true },
  // 単独の宣伝では出にくく、複数社が関わる動きを示す語
  {
    words: ['連携', '共同開発', '共同研究', '実証実験', '導入事例', '突破', 'pilot', 'partners with'],
    weight: 10,
    event: true,
  },
  { words: ['撤退', '閉鎖', '倒産', '参入', 'shutdown', 'layoff', '人員削減'], weight: 18, event: true },
  { words: ['新サービス', '新機能', '新モデル', 'new model', 'update', 'v2', 'ga提供'], weight: 8, event: false },
];

const norm = (s) => (s || '').toLowerCase();

function countHits(haystack, keywords) {
  const lower = norm(haystack);
  const hits = [];
  for (const kw of keywords) {
    const k = norm(kw);
    if (!k) continue;
    // 英字のみの短いキーワードは単語境界で判定（"ai" が "said" に当たるのを防ぐ）
    if (/^[a-z0-9.\- ]+$/.test(k) && k.length <= 4) {
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
      if (re.test(lower)) hits.push(kw);
    } else if (lower.includes(k)) {
      hits.push(kw);
    }
  }
  return hits;
}

/**
 * @param {{title?:string, summary?:string}} item
 * @param {'ec'|'ai'} baseCategory ソース側のカテゴリ
 * @returns {{category:'ec'|'ai'|'both', tags:string[], score:number, hot:boolean}}
 */
export function classify(item, baseCategory) {
  const text = `${item.title || ''} ${item.summary || ''}`;

  const ecStrong = countHits(text, EC_STRONG);
  const aiStrong = countHits(text, AI_STRONG);
  const ecHits = [...ecStrong, ...countHits(text, EC_WEAK)];
  const aiHits = [...aiStrong, ...countHits(text, AI_WEAK)];

  let category = baseCategory === 'ai' ? 'ai' : 'ec';
  if (ecHits.length > 0 && aiHits.length > 0) {
    category = 'both';
  } else if (baseCategory === 'ec' && ecHits.length === 0 && aiHits.length > 0) {
    category = 'ai';
  } else if (baseCategory === 'ai' && aiHits.length === 0 && ecHits.length > 0) {
    category = 'ec';
  }

  let score = 0;
  let eventHits = 0;
  const tags = new Set();
  for (const { words, weight, event } of HOT_KEYWORDS) {
    const hits = countHits(text, words);
    if (hits.length > 0) {
      score += weight;
      tags.add(hits[0]);
      if (event) eventHits += 1;
    }
  }
  // EC × AI の交差記事はこのアプリの主題なので底上げする
  if (category === 'both') {
    score += 15;
    tags.add('EC×AI');
  }

  return {
    category,
    tags: [...tags].slice(0, 4),
    score,
    hot: score >= 25,
    // 総合ニュースのフィードから EC/AI の記事だけを拾うときに使う。
    // strong は業界を名指しする語だけを数えたもの
    matches: { ec: ecHits.length, ai: aiHits.length },
    strong: { ec: ecStrong.length, ai: aiStrong.length },
    // 企業・市場が動いた記事か（宣伝リリースを落とすのに使う）
    events: eventHits,
  };
}

export const __testing = { EC_KEYWORDS, AI_KEYWORDS, countHits };
