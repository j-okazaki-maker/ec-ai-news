/**
 * フロントエンド。
 * 初期表示は /api/news、以降は SSE (/api/stream) で push される新着を反映する。
 */

const $ = (sel) => document.querySelector(sel);

const el = {
  feed: $('#feed'),
  empty: $('#empty'),
  skeleton: $('#skeleton'),
  status: $('#status'),
  statusText: $('#status .status__text'),
  tabs: $('#tabs'),
  search: $('#search'),
  hotOnly: $('#hotOnly'),
  sourceFilter: $('#sourceFilter'),
  refreshBtn: $('#refreshBtn'),
  notifyBtn: $('#notifyBtn'),
  newBanner: $('#newBanner'),
  lastUpdated: $('#lastUpdated'),
  itemCount: $('#itemCount'),
  sourcesToggle: $('#sourcesToggle'),
  sourcesPanel: $('#sourcesPanel'),
  sourcesList: $('#sourcesList'),
  ticker: $('#ticker'),
  tickerTrack: $('#tickerTrack'),
};

const PREF_KEY = 'ec-ai-news:prefs';
const prefs = loadPrefs();

const state = {
  items: new Map(), // id -> item（サーバから受け取った全件）
  pendingIds: new Set(), // 未読の新着（画面上部に出すバナー用）
  category: prefs.category || 'all',
  q: '',
  hotOnly: Boolean(prefs.hotOnly),
  sourceId: prefs.sourceId || '',
  notify: Boolean(prefs.notify),
  lastUpdatedAt: null,
  connected: false,
};

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({
        category: state.category,
        hotOnly: state.hotOnly,
        sourceId: state.sourceId,
        notify: state.notify,
      }),
    );
  } catch {
    /* プライベートモードなどで保存できなくても動作に影響させない */
  }
}

/* ---------------- 表示ユーティリティ ---------------- */

const CATEGORY_LABEL = { ec: 'EC', ai: 'AI', both: 'EC×AI' };

function relativeTime(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function matchesFilter(item) {
  if (state.category !== 'all') {
    if (state.category === 'both') {
      if (item.category !== 'both') return false;
    } else if (item.category !== state.category && item.category !== 'both') {
      return false;
    }
  }
  if (state.hotOnly && !item.hot) return false;
  if (state.sourceId && item.sourceId !== state.sourceId) return false;
  if (state.q) {
    const needle = state.q.toLowerCase();
    const hay = `${item.title} ${item.summary || ''} ${item.source}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function sortedItems() {
  return [...state.items.values()]
    .filter(matchesFilter)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function renderCard(item, { isNew = false } = {}) {
  const li = document.createElement('li');
  li.className = `card${isNew ? ' is-new' : ''}`;
  li.dataset.id = item.id;
  li.dataset.category = item.category;
  li.dataset.hot = String(Boolean(item.hot));

  const top = document.createElement('div');
  top.className = 'card__top';

  const chip = document.createElement('span');
  chip.className = `chip chip--${item.category}`;
  chip.textContent = CATEGORY_LABEL[item.category] || item.category;
  top.append(chip);

  if (item.hot) {
    const hot = document.createElement('span');
    hot.className = 'chip chip--hot';
    hot.textContent = '注目';
    top.append(hot);
  }
  if (isNew) {
    const badge = document.createElement('span');
    badge.className = 'chip chip--new';
    badge.textContent = 'NEW';
    top.append(badge);
  }

  const source = document.createElement('span');
  source.className = 'card__source';
  source.textContent = item.source;
  top.append(source);

  const time = document.createElement('time');
  time.className = 'card__time';
  time.dateTime = item.publishedAt;
  time.title = new Date(item.publishedAt).toLocaleString('ja-JP');
  time.textContent = relativeTime(item.publishedAt);
  top.append(time);

  const title = document.createElement('h2');
  title.className = 'card__title';
  const link = document.createElement('a');
  link.href = item.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = item.title; // textContent なので配信元のHTMLは実行されない
  title.append(link);

  li.append(top, title);

  if (item.summary) {
    const p = document.createElement('p');
    p.className = 'card__summary';
    p.textContent = item.summary;
    li.append(p);
  }

  if (item.tags?.length) {
    const tags = document.createElement('div');
    tags.className = 'card__tags';
    for (const tag of item.tags) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = `#${tag}`;
      tags.append(span);
    }
    li.append(tags);
  }

  return li;
}

function render({ newIds = new Set() } = {}) {
  const rows = sortedItems();
  const frag = document.createDocumentFragment();
  for (const item of rows.slice(0, 200)) {
    frag.append(renderCard(item, { isNew: newIds.has(item.id) }));
  }
  el.feed.replaceChildren(frag);
  el.skeleton.hidden = true;
  el.empty.hidden = rows.length > 0;
  el.itemCount.textContent = `${rows.length} 件表示`;
  updateCounts();
  updateTicker();
}

function updateCounts() {
  const all = [...state.items.values()];
  const counts = {
    total: all.length,
    ec: all.filter((i) => i.category === 'ec' || i.category === 'both').length,
    ai: all.filter((i) => i.category === 'ai' || i.category === 'both').length,
    both: all.filter((i) => i.category === 'both').length,
  };
  for (const node of el.tabs.querySelectorAll('.tab__count')) {
    node.textContent = counts[node.dataset.count] ?? 0;
  }
}

function updateTicker() {
  const hot = [...state.items.values()]
    .filter((i) => i.hot)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 8);

  if (hot.length === 0) {
    el.ticker.hidden = true;
    return;
  }
  el.ticker.hidden = false;
  const frag = document.createDocumentFragment();
  // アニメーションが -50% で折り返すので同じ内容を2周ぶん並べる
  for (let pass = 0; pass < 2; pass += 1) {
    for (const item of hot) {
      const a = document.createElement('a');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${item.source}｜${item.title}`;
      frag.append(a);
    }
  }
  el.tickerTrack.replaceChildren(frag);
}

function refreshTimestamps() {
  for (const time of el.feed.querySelectorAll('.card__time')) {
    time.textContent = relativeTime(time.dateTime);
  }
  if (state.lastUpdatedAt) {
    el.lastUpdated.textContent = `最終更新: ${relativeTime(state.lastUpdatedAt)}`;
  }
}

function setStatus(stateName, text) {
  el.status.dataset.state = stateName;
  el.statusText.textContent = text;
}

function updateBanner() {
  const count = [...state.pendingIds].filter((id) => {
    const item = state.items.get(id);
    return item && matchesFilter(item);
  }).length;

  el.newBanner.hidden = count === 0;
  el.newBanner.textContent = `🆕 新着 ${count} 件 — クリックで表示`;
  document.title = count > 0 ? `(${count}) EC × AI ニュース速報` : 'EC × AI ニュース速報';
}

/* ---------------- データ取得 ---------------- */

/**
 * 3通りの配信のされ方に対応する。
 *   server   … Node のサーバつき。新着は SSE で push される
 *   static   … GitHub Pages などの静的配信。news.json を定期的に読み直す
 *   embedded … news.json を1枚のHTMLに埋め込んだスナップショット。更新はしない
 */
const mode = { kind: 'server' };
let knownSources = [];

function absorb(payload) {
  for (const item of payload.items || []) state.items.set(item.id, item);
  state.lastUpdatedAt = payload.generatedAt || payload.stats?.lastUpdatedAt || null;
  if (Array.isArray(payload.sources)) knownSources = payload.sources;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadInitial() {
  try {
    if (window.__NEWS__) {
      mode.kind = 'embedded';
      absorb(window.__NEWS__);
    } else {
      try {
        absorb(await getJson('api/news?limit=300'));
        mode.kind = 'server';
      } catch {
        absorb(await getJson('news.json')); // サーバがいなければ静的ファイルを読む
        mode.kind = 'static';
      }
    }
    render();
    refreshTimestamps();
  } catch (err) {
    el.skeleton.hidden = true;
    el.empty.hidden = false;
    el.empty.textContent = `ニュースを取得できませんでした: ${err.message}`;
  }
}

function renderSources(sources) {
  const options = [new Option('すべてのソース', '')];
  for (const s of sources) {
    options.push(new Option(`${s.name}（${(s.category || '').toUpperCase()}）`, s.id));
  }
  el.sourceFilter.replaceChildren(...options);
  el.sourceFilter.value = state.sourceId;

  el.sourcesList.replaceChildren(
    ...sources.map((s) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      const ok = s.status?.ok;
      dot.className = `dot ${ok === true ? 'dot--ok' : ok === false ? 'dot--ng' : ''}`;
      const name = document.createElement('span');
      name.textContent = s.name;
      li.append(dot, name);
      if (s.status && !s.status.ok) {
        const err = document.createElement('span');
        err.className = 'sources__err';
        err.textContent = s.status.error || 'エラー';
        li.append(err);
      } else if (s.status) {
        const count = document.createElement('span');
        count.className = 'sources__err';
        count.style.color = 'var(--text-dim)';
        count.textContent = `${s.status.items} 件`;
        li.append(count);
      }
      return li;
    }),
  );
}

async function loadSources() {
  if (mode.kind !== 'server') {
    renderSources(knownSources);
    return;
  }
  try {
    const { sources } = await getJson('api/sources');
    knownSources = sources;
    renderSources(sources);
  } catch {
    /* ソース一覧は補助情報なので、取れなくても本体は動かす */
  }
}

function notifyHot(items) {
  if (!state.notify || Notification.permission !== 'granted' || document.hasFocus()) return;
  for (const item of items.filter((i) => i.hot).slice(0, 3)) {
    new Notification(`【${CATEGORY_LABEL[item.category]}速報】${item.source}`, {
      body: item.title,
      tag: item.id,
    });
  }
}

function onNewItems(items) {
  if (!items?.length) return;
  const atTop = window.scrollY < 80;
  const newIds = new Set();

  for (const item of items) {
    if (state.items.has(item.id)) continue;
    state.items.set(item.id, item);
    newIds.add(item.id);
    if (!atTop) state.pendingIds.add(item.id);
  }
  if (newIds.size === 0) return;

  state.lastUpdatedAt = new Date().toISOString();
  if (atTop) {
    // 先頭を見ている人には、そのまま差し込んでハイライトする
    render({ newIds });
  } else {
    updateCounts();
    updateTicker();
  }
  updateBanner();
  refreshTimestamps();
  notifyHot(items);
  loadSources();
}

function connectStream() {
  const source = new EventSource('api/stream');

  source.addEventListener('open', () => {
    state.connected = true;
    setStatus('live', 'LIVE 配信中');
  });
  source.addEventListener('hello', () => setStatus('live', 'LIVE 配信中'));
  source.addEventListener('news', (event) => {
    try {
      const data = JSON.parse(event.data);
      onNewItems(data.items);
    } catch {
      /* 壊れたフレームは捨てる */
    }
  });
  source.addEventListener('error', () => {
    state.connected = false;
    setStatus('error', '再接続中…'); // EventSource が自動で張り直す
  });
}

/** 静的配信のときは news.json を読み直して差分を取り込む。 */
async function pollStatic() {
  try {
    const data = await getJson('news.json');
    if (Array.isArray(data.sources)) knownSources = data.sources;
    onNewItems(data.items || []);
    state.lastUpdatedAt = data.generatedAt || state.lastUpdatedAt;
    refreshTimestamps();
    setStatus('live', '自動更新中');
  } catch {
    setStatus('error', '更新を確認できません');
  }
}

function startUpdates() {
  if (mode.kind === 'server') {
    connectStream();
    return;
  }
  if (mode.kind === 'static') {
    setStatus('live', '自動更新中');
    setInterval(pollStatic, 60_000);
    return;
  }
  // 埋め込みスナップショットは更新手段を持たないので、更新系のボタンを隠す
  setStatus('snapshot', '保存時点の内容');
  el.refreshBtn.hidden = true;
  el.notifyBtn.hidden = true;
}

/* ---------------- 操作 ---------------- */

el.tabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  for (const t of el.tabs.querySelectorAll('.tab')) t.classList.toggle('is-active', t === tab);
  state.category = tab.dataset.category;
  savePrefs();
  render();
  updateBanner();
});

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = el.search.value.trim();
    render();
  }, 150);
});

el.hotOnly.addEventListener('change', () => {
  state.hotOnly = el.hotOnly.checked;
  savePrefs();
  render();
  updateBanner();
});

el.sourceFilter.addEventListener('change', () => {
  state.sourceId = el.sourceFilter.value;
  savePrefs();
  render();
  updateBanner();
});

el.refreshBtn.addEventListener('click', async () => {
  el.refreshBtn.disabled = true;
  el.refreshBtn.textContent = '↻ 取得中…';
  try {
    if (mode.kind === 'static') {
      await pollStatic();
    } else {
      const data = await (await fetch('api/refresh', { method: 'POST' })).json();
      if (data.fresh === 0) {
        // 新着ゼロでもソースの健全性は更新しておく
        state.lastUpdatedAt = new Date().toISOString();
        refreshTimestamps();
      }
      await loadSources();
    }
  } catch {
    setStatus('error', '更新に失敗しました');
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.textContent = '↻ 更新';
  }
});

el.newBanner.addEventListener('click', () => {
  const revealed = new Set(state.pendingIds); // どれが新着だったか分かるよう印を残す
  state.pendingIds.clear();
  render({ newIds: revealed });
  updateBanner();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

el.sourcesToggle.addEventListener('click', () => {
  el.sourcesPanel.hidden = !el.sourcesPanel.hidden;
});

function paintNotifyBtn() {
  el.notifyBtn.classList.toggle('is-on', state.notify);
  el.notifyBtn.textContent = state.notify ? '🔔 通知オン' : '🔔 通知オフ';
}

el.notifyBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    el.notifyBtn.textContent = '🔕 非対応';
    return;
  }
  if (state.notify) {
    state.notify = false;
  } else {
    const permission = await Notification.requestPermission();
    state.notify = permission === 'granted';
    if (!state.notify) el.notifyBtn.title = '通知がブラウザ側でブロックされています';
  }
  savePrefs();
  paintNotifyBtn();
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, select, textarea')) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  if (event.key === '/') {
    event.preventDefault();
    el.search.focus();
  } else if (event.key.toLowerCase() === 'r') {
    el.refreshBtn.click();
  } else if (['1', '2', '3', '4'].includes(event.key)) {
    el.tabs.querySelectorAll('.tab')[Number(event.key) - 1]?.click();
  }
});

// 先頭まで戻ったら新着バナーは役目を終える
window.addEventListener('scroll', () => {
  if (window.scrollY < 80 && state.pendingIds.size > 0) {
    state.pendingIds.clear();
    render();
    updateBanner();
  }
}, { passive: true });

/* ---------------- 起動 ---------------- */

el.hotOnly.checked = state.hotOnly;
for (const tab of el.tabs.querySelectorAll('.tab')) {
  tab.classList.toggle('is-active', tab.dataset.category === state.category);
}
if (state.notify && (!('Notification' in window) || Notification.permission !== 'granted')) {
  state.notify = false;
}
paintNotifyBtn();

setInterval(refreshTimestamps, 20_000);

await loadInitial();
await loadSources();
startUpdates();
