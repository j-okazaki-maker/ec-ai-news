/**
 * デモモード（DEMO_MODE=1）用の擬似フィード。
 * 外部ネットワークが使えない環境でも、速報が流れてくる様子を確認できる。
 */

const EC_HEADLINES = [
  ['大手ECモール、出店者向けに生成AIの商品説明自動生成を提供開始', '発表'],
  ['【速報】ネット通販大手の決済システムで一時障害', '障害'],
  ['越境EC支援スタートアップが12億円を資金調達', '資金調達'],
  ['D2Cブランド、実店舗展開でOMO強化へ', ''],
  ['物流各社、ラストワンマイル配送の共同化で提携', '提携'],
  ['ECサイト構築SaaS、年間流通総額が過去最高を更新', '決算'],
];

const AI_HEADLINES = [
  ['OpenAI、エージェント向けの新モデルを発表', '発表'],
  ['国内AIスタートアップ、日本語LLMの最新版を公開', 'リリース'],
  ['生成AIの利用に関する新ガイドラインを政府が公表', '規制'],
  ['AI半導体大手、四半期決算で市場予想を上回る', '決算'],
  ['【速報】大手クラウドのAI推論APIで大規模障害', '障害'],
  ['AIエージェントをECの接客に活用する実証実験が開始', '提携'],
];

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildFeed(title, rows) {
  const items = rows
    .map(
      ({ headline, link, date, body }) => `
    <item>
      <title>${escapeXml(headline)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(body)}</description>
      <pubDate>${date.toUTCString()}</pubDate>
    </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${escapeXml(title)}</title><link>https://demo.local/</link>${items}
</channel></rss>`;
}

export const DEMO_SOURCES = [
  { id: 'demo-ec', name: 'デモEC通信', url: 'https://demo.local/ec.xml', category: 'ec', lang: 'ja', enabled: true },
  { id: 'demo-ai', name: 'デモAIウォッチ', url: 'https://demo.local/ai.xml', category: 'ai', lang: 'ja', enabled: true },
];

/**
 * 呼ばれるたびに見出しを1本ずつ増やしていく fetch 互換関数を返す。
 */
export function createDemoFetch() {
  let round = 0;
  return async function demoFetch(url) {
    round += 1;
    const isEc = String(url).includes('ec.xml');
    const pool = isEc ? EC_HEADLINES : AI_HEADLINES;
    const take = Math.min(pool.length, 2 + round);

    const prefix = `https://demo.local/${isEc ? 'ec' : 'ai'}`;
    const rows = pool.slice(0, take).map(([headline, kind], i) => ({
      headline,
      // 見出しごとに固定のURL。既出分は重複排除され、増えた分だけが新着になる
      link: `${prefix}/${i}`,
      date: new Date(Date.now() - i * 7 * 60_000),
      body: `${kind || '業界動向'}に関するデモ記事です。実データではありません。`,
    }));

    // 見出しを出し切ったあとも速報が流れ続けるよう、続報を1本ずつ足す
    if (take >= pool.length) {
      const [headline, kind] = pool[round % pool.length];
      rows.unshift({
        headline: `${headline}（第${round}報）`,
        link: `${prefix}/followup-${round}`,
        date: new Date(),
        body: `${kind || '業界動向'}の続報です。デモ用の擬似記事で、実データではありません。`,
      });
    }

    return new Response(buildFeed(isEc ? 'デモEC通信' : 'デモAIウォッチ', rows), {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' },
    });
  };
}
