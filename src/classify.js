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
 */
const HOT_KEYWORDS = [
  [['速報', '緊急', 'breaking'], 30],
  [['発表', '公開', 'リリース', 'launch', 'launches', 'unveil', 'announce'], 12],
  [['資金調達', '調達', 'funding', 'raises', 'series a', 'series b', 'ipo', '上場'], 20],
  [['買収', '統合', 'acquisition', 'acquires', 'merger', '提携', '協業', 'partnership'], 18],
  [['決算', '売上', '過去最高', 'earnings', 'revenue', 'quarterly'], 10],
  [['障害', '不具合', '停止', 'outage', 'down', '流出', '漏えい', '漏洩', 'breach', 'hack'], 25],
  [['規制', '法改正', '訴訟', 'lawsuit', 'regulation', 'ban', '行政指導'], 15],
  [['撤退', '閉鎖', '倒産', 'shutdown', 'layoff', '人員削減'], 18],
  [['新サービス', '新機能', '新モデル', 'new model', 'update', 'v2', 'ga提供'], 8],
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
  const tags = new Set();
  for (const [keywords, weight] of HOT_KEYWORDS) {
    const hits = countHits(text, keywords);
    if (hits.length > 0) {
      score += weight;
      tags.add(hits[0]);
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
  };
}

export const __testing = { EC_KEYWORDS, AI_KEYWORDS, countHits };
