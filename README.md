# ⚡ EC × AI ニュース速報

EC業界とAI業界のニュースを複数メディアのRSS/Atomから自動収集し、**速報として随時流れてくる**ライブフィードです。
サーバが定期的にフィードを取得し、新着があればSSE（Server-Sent Events）でブラウザへ即時プッシュします。画面を開いたまま放置しておけば、リロードなしで見出しが増えていきます。

<!-- 画面: 上部に速報ティッカー、タブ（すべて / EC / AI / EC×AI）、カード型のニュース一覧 -->

## できること

- **リアルタイム更新** — 新着はSSEでプッシュ。ページ先頭を見ていればその場に差し込まれ、下の方を読んでいる間は「🆕 新着N件」バナーで通知（読書中に表示が飛ばない）
- **EC / AI の自動仕分け** — 配信元のカテゴリに加えて本文キーワードで判定し、両方に関わる記事は **EC×AI** として別枠表示
- **速報スコア** — 「速報」「障害」「資金調達」「買収」などのキーワードで重要度を採点し、上位を「注目」バッジ＋上部ティッカーで強調
- **重複排除** — URLの正規化（`utm_*` 等の除去）と見出しの正規化で、同じ記事が複数メディアから来ても1件にまとめる
- **絞り込み** — カテゴリタブ／注目のみ／ソース別／キーワード検索（すべてクライアント側で即時）
- **デスクトップ通知** — 「注目」ニュースだけを、タブが非アクティブなときに通知（任意）
- **ソースの健全性表示** — どのフィードが取得できていないかを画面で確認できる
- **永続化** — 取得済みの記事はJSONに保存。再起動しても既読の記事が「新着」として再通知されない

キーボード: `/` 検索 / `R` 手動更新 / `1`〜`4` タブ切り替え

## 動かす

Node.js 20 以上が必要です。

```bash
npm install
npm start
# → http://localhost:3000
```

外部ネットワークが使えない環境や、動作だけ確認したいときは擬似フィードのデモモードで起動できます。

```bash
npm run demo   # 15秒ごとにデモ記事が流れてくる
```

## パソコンに何も入れずに使う（GitHub Actions + Pages）

Node.js をインストールできない場合は、**GitHubのサーバー側でニュースを取得**させ、できあがったページをブラウザで開くだけにできます。

`.github/workflows/news.yml` が30分ごとに動き、`scripts/build-site.js` が全フィードを取得して `docs/` を更新します。`docs/` をGitHub Pagesで配信すれば、URLを開くだけでニュースが読めます（ページ側は1分ごとに `news.json` を読み直すので、開きっぱなしでも自動で増えていきます）。

**設定は最初の一度だけ（すべてブラウザ操作）**

1. GitHubでこのリポジトリを開く → **Settings** → 左メニューの **Pages**
2. 「Build and deployment」の Source で **Deploy from a branch** を選ぶ
3. Branch を **`main`**、その隣のフォルダを **`/docs`** にして **Save**
4. 数分待つと **https://j-okazaki-maker.github.io/ec-ai-news/** で開けるようになります

以降はワークフローが `docs/` を更新するたびに、Pages が自動で配信し直します。

> **注意:** GitHub Pages を**非公開リポジトリ**で使うには有料プラン（GitHub Pro など）が必要です。非公開で運用する場合は、下の「1枚のHTMLとして持ち出す」をご利用ください。

### 1枚のHTMLとして持ち出す

Pages を使わない場合でも、同じワークフローが `docs/standalone.html` を書き出しています。CSS・JavaScript・ニュースデータをすべて1ファイルに埋め込んであるので、**GitHubからダウンロードしてダブルクリックするだけ**で読めます（通信もサーバも不要）。

ただし書き出した時点のスナップショットなので、自動では増えません。最新の内容が欲しいときは、ダウンロードし直してください。

手動で今すぐ取得したいときは、GitHubの **Actions** タブ →「ニュース取得」→ **Run workflow** から実行できます。

## 設定（環境変数）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `HOST` | `0.0.0.0` | 待ち受けアドレス |
| `POLL_INTERVAL_MS` | `180000`（3分） | フィードの取得間隔 |
| `MAX_ITEMS` | `1000` | 保持する記事の最大件数（超えた分は古い順に破棄） |
| `DATA_FILE` | `data/news.json` | 記事の保存先 |
| `DEMO_MODE` | — | `1` で擬似フィードを使うデモモード |

例: `POLL_INTERVAL_MS=60000 PORT=8080 npm start`

> 取得間隔を短くしすぎると配信元に負荷をかけます。1〜5分程度を目安にしてください。

## ニュースソースを変える

既定のソースは `src/sources.js` に定義しています（国内外のEC/AIメディアとGoogleニュース検索フィード）。
コードを触らずに差し替えたい場合は、`config/sources.example.json` を `config/sources.json` にコピーして編集してください。起動時にそちらが優先されます。

```json
{
  "sources": [
    { "id": "my-feed", "name": "自社EC情報", "url": "https://example.com/feed", "category": "ec", "lang": "ja", "enabled": true }
  ]
}
```

| フィールド | 説明 |
| --- | --- |
| `id` | 一意なID（絞り込みの保存キーに使う） |
| `name` | 画面に出す表示名 |
| `url` | RSS 2.0 / RSS 1.0(RDF) / Atom のいずれか |
| `category` | `ec` または `ai`（記事側のキーワードで `both` に昇格することがある） |
| `lang` | `ja` / `en` |
| `filter` | `true` にすると、EC・AIを名指しする語が出てこない記事を捨てる。PR TIMESや総合ニュースのように雑多なフィードを混ぜるときに使う |
| `enabled` | `false` にすると取得しない |

「注目」判定や絞り込みに使うキーワードは `src/classify.js` にまとめてあります。業界を名指しする語（`EC_STRONG` / `AI_STRONG`）と、他業種の記事にも普通に出る語（`EC_WEAK` / `AI_WEAK`）に分けてあり、`filter` は前者だけを見ます。業界特有の語を足すと精度が上がります。

**フィードが取得できているか確かめる**

```bash
node scripts/check-sources.js                      # 登録済みの全ソース
node scripts/check-sources.js https://example.com/feed   # 差し替え候補の下調べ
```

GitHubの **Actions** タブ →「ソースの疎通確認」→ **Run workflow** からブラウザだけでも実行できます（URLを空白区切りで渡せます）。

## API

| エンドポイント | 説明 |
| --- | --- |
| `GET /api/news` | 記事一覧。`category` / `source` / `q` / `hot=1` / `since` / `limit` で絞り込み |
| `GET /api/stream` | SSE。新着時に `event: news` で `{ items, stats }` を配信 |
| `GET /api/sources` | ソース一覧と直近の取得結果（成功/失敗・件数・所要時間） |
| `POST /api/refresh` | 手動で全ソースを取得 |
| `GET /api/health` | 稼働状況と件数の統計 |

## 構成

```
src/
  server.js    HTTPサーバ・APIルーティング・SSE配信・静的配信
  poller.js    定期取得のスケジューリング
  fetcher.js   RSS/Atom/RDF の取得と正規化（ID採番・URL正規化・HTML除去）
  classify.js  EC/AI のカテゴリ判定・タグ付け・速報スコア
  store.js     インメモリ保管・重複排除・絞り込み・JSON永続化
  sources.js   既定のニュースソース定義
  demo.js      デモモード用の擬似フィード
public/        フロントエンド（依存ライブラリなしの素のJS）
scripts/
  build-site.js       ニュースを取得して docs/（静的サイト）を組み立てる
  build-standalone.js 全部入りの1枚HTML（docs/standalone.html）を書き出す
  check-sources.js    各フィードがいま取得できるかを確認する
docs/          GitHub Pages 用の出力。Actions が自動更新する
test/          node:test によるテスト
```

フロントエンドは配信のされ方を自動で見分けます。Nodeのサーバがいれば **SSEで即時プッシュ**、GitHub Pages のような静的配信なら **`news.json` を1分ごとに読み直し**ます。

## テスト

```bash
npm test
```

フィードの解析（RSS 2.0 / RDF / Atom、壊れたXML）、重複排除、絞り込み、API、SSE配信までをローカルのフィクスチャと擬似サーバで検証します。外部ネットワークには接続しません。

## 注意

- 見出し・要約・リンク先の著作権は各配信元に帰属します。本アプリは見出しと短い要約のみを表示し、本文は配信元のページへリンクします。
- 配信元のRSSのURLは変更・廃止されることがあります。取得に失敗しているソースは画面の「ソースの状態」で確認し、`config/sources.json` で差し替えてください。
