import { fetchAll } from './fetcher.js';

/**
 * 一定間隔で全フィードを取得し、ストアへ流し込む。
 */
export class Poller {
  /**
   * @param {{store:import('./store.js').NewsStore, sources:object[], intervalMs?:number,
   *          timeoutMs?:number, concurrency?:number, fetchImpl?:typeof fetch}} options
   */
  constructor({ store, sources, intervalMs = 180_000, timeoutMs = 15_000, concurrency = 4, fetchImpl }) {
    this.store = store;
    this.sources = sources;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.concurrency = concurrency;
    this.fetchImpl = fetchImpl;
    this.timer = null;
    this.running = false;
    this.lastRunAt = null;
  }

  get enabledSources() {
    return this.sources.filter((s) => s.enabled !== false);
  }

  /**
   * 1巡ぶん取得する。多重起動は自然にスキップされる（手動更新と定期更新の衝突対策）。
   * @returns {Promise<{fresh:object[], ok:number, failed:number, skipped?:boolean}>}
   */
  async runOnce() {
    if (this.running) return { fresh: [], ok: 0, failed: 0, skipped: true };
    this.running = true;
    try {
      const results = await fetchAll(this.enabledSources, {
        timeoutMs: this.timeoutMs,
        concurrency: this.concurrency,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      });

      const collected = [];
      let ok = 0;
      let failed = 0;
      for (const res of results) {
        if (res.ok) ok += 1;
        else failed += 1;
        this.store.setSourceStatus(res.sourceId, {
          ok: res.ok,
          error: res.error || null,
          items: res.items.length,
          ms: res.ms,
        });
        collected.push(...res.items);
      }

      const fresh = this.store.ingest(collected);
      this.lastRunAt = new Date().toISOString();
      console.log(
        `[poll] ${new Date().toLocaleTimeString('ja-JP')} 取得成功 ${ok}/${ok + failed} 件のソース, 新着 ${fresh.length} 件`,
      );
      return { fresh, ok, failed };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer) return;
    this.runOnce().catch((err) => console.error('[poll] 初回取得に失敗:', err));
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error('[poll] 定期取得に失敗:', err));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
