import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { NewsStore } from '../src/store.js';
import { Poller } from '../src/poller.js';
import { createApp } from '../src/server.js';
import { DEMO_SOURCES, createDemoFetch } from '../src/demo.js';

async function startTestServer() {
  const store = new NewsStore({ file: null, maxItems: 50 });
  const poller = new Poller({
    store,
    sources: DEMO_SOURCES,
    intervalMs: 3_600_000,
    fetchImpl: createDemoFetch(),
  });
  const { server } = createApp({ store, poller, sources: DEMO_SOURCES });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, poller, server, base, close: () => new Promise((r) => server.close(r)) };
}

test('/api/health がステータスを返す', async () => {
  const app = await startTestServer();
  try {
    const res = await fetch(`${app.base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.total, 0);
  } finally {
    await app.close();
  }
});

test('/api/refresh で取得し /api/news に反映される', async () => {
  const app = await startTestServer();
  try {
    const refresh = await (await fetch(`${app.base}/api/refresh`, { method: 'POST' })).json();
    assert.ok(refresh.fresh > 0, '擬似フィードから新着が入る');
    assert.equal(refresh.failed, 0);

    const news = await (await fetch(`${app.base}/api/news`)).json();
    assert.equal(news.items.length, refresh.fresh);
    assert.ok(news.stats.total > 0);

    // 新しい順に並んでいること
    const times = news.items.map((i) => Date.parse(i.publishedAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  } finally {
    await app.close();
  }
});

test('/api/news のカテゴリ・検索・件数指定が効く', async () => {
  const app = await startTestServer();
  try {
    await fetch(`${app.base}/api/refresh`, { method: 'POST' });

    const ec = await (await fetch(`${app.base}/api/news?category=ec`)).json();
    assert.ok(ec.items.length > 0);
    assert.ok(ec.items.every((i) => i.category === 'ec' || i.category === 'both'));

    const limited = await (await fetch(`${app.base}/api/news?limit=2`)).json();
    assert.equal(limited.items.length, 2);

    const searched = await (await fetch(`${app.base}/api/news?q=${encodeURIComponent('障害')}`)).json();
    assert.ok(searched.items.every((i) => `${i.title}${i.summary}`.includes('障害')));

    const hot = await (await fetch(`${app.base}/api/news?hot=1`)).json();
    assert.ok(hot.items.every((i) => i.hot === true));
  } finally {
    await app.close();
  }
});

test('/api/sources が取得結果つきのソース一覧を返す', async () => {
  const app = await startTestServer();
  try {
    await fetch(`${app.base}/api/refresh`, { method: 'POST' });
    const { sources } = await (await fetch(`${app.base}/api/sources`)).json();
    assert.equal(sources.length, DEMO_SOURCES.length);
    assert.ok(sources.every((s) => s.status?.ok === true));
  } finally {
    await app.close();
  }
});

test('/api/stream が新着を SSE で push する', async () => {
  const app = await startTestServer();
  const controller = new AbortController();
  try {
    const res = await fetch(`${app.base}/api/stream`, { signal: controller.signal });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    const readUntil = async (marker) => {
      while (!buffer.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`ストリームが ${marker} の前に閉じた`);
        buffer += value;
      }
    };

    await readUntil('event: hello');
    // 接続が clients に登録されてから取得を走らせる
    await app.poller.runOnce();
    await readUntil('event: news');

    const payload = JSON.parse(buffer.split('event: news\ndata: ')[1].split('\n')[0]);
    assert.ok(payload.items.length > 0);
    assert.ok(payload.items[0].title);
  } finally {
    controller.abort();
    await app.close();
  }
});

test('静的ファイルを配信し、範囲外のパスは辿れない', async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.base}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /EC × AI ニュース速報/);

    assert.equal((await fetch(`${app.base}/api/unknown`)).status, 404);
    assert.notEqual((await fetch(`${app.base}/../package.json`)).status, 200);
  } finally {
    await app.close();
  }
});
