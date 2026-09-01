import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 見出しの表記ゆれを吸収した重複判定キーを作る。
 * Googleニュースは「記事タイトル - 媒体名」の形で配信するため、配信元の
 * オリジナル記事と URL が違っても同じ記事として畳めるようにしている。
 */
export function titleKey(title) {
  return String(title || '')
    .replace(/\s*[-|｜–—]\s*[^-|｜–—]{1,30}$/u, '')
    .toLowerCase()
    .replace(/[\s\u3000【】「」『』［］\[\]()（）"'`.,、。・:：;；!！?？]/gu, '')
    .trim();
}

/**
 * ニュース記事のインメモリ・ストア。
 * - id と見出しで重複排除（同じ記事が複数フィードに出ても1件）
 * - 新着があれば 'items' イベントを発火（SSE配信に使う）
 * - JSON ファイルへ永続化するので再起動しても既読済みの記事が「新着」に戻らない
 */
export class NewsStore extends EventEmitter {
  /**
   * @param {{file?:string|null, maxItems?:number}} options
   */
  constructor({ file = null, maxItems = 1000 } = {}) {
    super();
    this.file = file;
    this.maxItems = maxItems;
    /** @type {Map<string, object>} */
    this.items = new Map();
    /** @type {Map<string, string>} 正規化した見出し -> 記事ID */
    this.titles = new Map();
    this.sourceStatus = new Map();
    this.lastUpdatedAt = null;
  }

  load() {
    if (!this.file) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const item of raw.items || []) {
        if (item?.id) this.items.set(item.id, item);
      }
      this.#reindexTitles();
      this.lastUpdatedAt = raw.lastUpdatedAt || null;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[store] 保存データを読み込めませんでした: ${err.message}`);
      }
    }
  }

  save() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(
        tmp,
        JSON.stringify({ lastUpdatedAt: this.lastUpdatedAt, items: this.list({ limit: this.maxItems }) }),
      );
      renameSync(tmp, this.file); // 書き込み途中のファイルを読ませない
    } catch (err) {
      console.warn(`[store] 保存に失敗しました: ${err.message}`);
    }
  }

  /**
   * 取得結果を取り込む。戻り値は「今回はじめて見た記事」のみ。
   * @param {object[]} incoming
   * @param {{now?:number}} opts
   */
  ingest(incoming, { now = Date.now() } = {}) {
    const fresh = [];
    for (const item of incoming) {
      if (!item?.id || this.items.has(item.id)) continue;
      const key = titleKey(item.title);
      if (key && this.titles.has(key)) continue; // 別ソースの同じ記事
      const stored = {
        ...item,
        firstSeenAt: item.firstSeenAt || new Date(now).toISOString(),
        // 配信日時が取れないフィードは「初めて見た時刻」で代用する
        publishedAt: item.publishedAt || new Date(now).toISOString(),
      };
      this.items.set(stored.id, stored);
      if (key) this.titles.set(key, stored.id);
      fresh.push(stored);
    }

    if (fresh.length > 0) {
      this.#prune();
      this.lastUpdatedAt = new Date(now).toISOString();
      this.save();
      this.emit('items', fresh);
    }
    return fresh;
  }

  #prune() {
    if (this.items.size <= this.maxItems) return;
    const keep = this.list({ limit: this.maxItems });
    this.items = new Map(keep.map((item) => [item.id, item]));
    this.#reindexTitles();
  }

  #reindexTitles() {
    this.titles = new Map();
    for (const item of this.items.values()) {
      const key = titleKey(item.title);
      if (key) this.titles.set(key, item.id);
    }
  }

  setSourceStatus(sourceId, status) {
    this.sourceStatus.set(sourceId, { ...status, checkedAt: new Date().toISOString() });
  }

  getSourceStatus() {
    return Object.fromEntries(this.sourceStatus);
  }

  /**
   * 絞り込み＋新しい順のソートを行う。
   * @param {{category?:string, sourceId?:string, q?:string, hotOnly?:boolean, since?:string, limit?:number}} filter
   */
  list({ category = 'all', sourceId = null, q = '', hotOnly = false, since = null, limit = 100 } = {}) {
    const needle = q.trim().toLowerCase();
    const sinceMs = since ? Date.parse(since) : null;

    let rows = [...this.items.values()];

    if (category && category !== 'all') {
      rows = rows.filter((r) => r.category === category || r.category === 'both');
    }
    if (sourceId) rows = rows.filter((r) => r.sourceId === sourceId);
    if (hotOnly) rows = rows.filter((r) => r.hot);
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          (r.summary || '').toLowerCase().includes(needle) ||
          r.source.toLowerCase().includes(needle),
      );
    }
    if (Number.isFinite(sinceMs)) {
      rows = rows.filter((r) => Date.parse(r.firstSeenAt || r.publishedAt) > sinceMs);
    }

    rows.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return limit > 0 ? rows.slice(0, limit) : rows;
  }

  stats() {
    const rows = [...this.items.values()];
    const count = (cat) => rows.filter((r) => r.category === cat || r.category === 'both').length;
    return {
      total: rows.length,
      ec: count('ec'),
      ai: count('ai'),
      both: rows.filter((r) => r.category === 'both').length,
      hot: rows.filter((r) => r.hot).length,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }
}
