# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install   # 依存パッケージのインストール
npm start     # サーバー起動（http://localhost:3000）
```

テスト・lintの設定はなし。動作確認はブラウザで直接行う。

デプロイは GitHub push → Render が自動ビルド（`render.yaml` 参照）。

## アーキテクチャ概要

### サーバー (`src/server.js`)

Express サーバー。主要 API エンドポイント：

| エンドポイント | 役割 |
|---|---|
| `POST /api/parse-pdf` | PDF → 商品情報（multer + pdf-parser） |
| `POST /api/from-page` | ブックマークレットからデータ受信 → token 発行 |
| `GET /api/get-page-data/:token` | token でデータ取得（30分 TTL） |
| `POST /api/lens-proxy` | 画像をサーバー一時保存 → Google Lens 用 URL 発行（5分 TTL） |
| `GET /api/proxy-image?url=` | 外部画像を CORS 回避してプロキシ配信 |
| `POST /api/analyze-product` | 複数画像 + タイトル → Claude Vision で商品識別・検索クエリ生成 |

メモリ内ストア（再起動で消える）：
- `pageDataStore`（token → bookmarklet データ、30分 TTL）
- `tempImages`（画像バッファ、5分 TTL）

### フロントエンド (`public/index.html`)

単一の HTML ファイル。JavaScript で以下を制御：

1. **2つの入力経路**
   - PDF ドロップ → `processFile()` → `/api/parse-pdf`
   - `?token=xxx` → `processFromBookmarklet()` → `/api/get-page-data/:token`

2. **描画関数**
   - `renderProductCard(data, imageUrl)` — 商品カード（ブランド・商品名・評価・価格）
   - `renderImageSearch(data, imageUrl)` — Google Lens ボタン・キーワード画像検索
   - `renderSearchLinks(data)` — 各サイト手動検索リンク一覧
   - `applyRefPrice()` — 小売参考価格入力 → 仕入れ目安（40%）計算

3. **AI識別**（`processFromBookmarklet` 内）  
   画像がある場合 `/api/analyze-product` を非同期で呼び、`renderSearchLinks` を更新クエリで再描画。

### ブックマークレット（2段構造）

ユーザーのブラウザに登録する「ローダー」は短い `javascript:` URL：
```
javascript:fetch('https://auction-price-checker.onrender.com/bm/eco.js').then(r=>r.text()).then(eval)
```

実行時にサーバーから本体スクリプトを fetch・eval する。こうすることで、ユーザーがブックマークを再登録せずにサーバー側でスクリプトを更新できる。

本体スクリプトは **`public/bm/`** 以下の静的ファイルが配信される（`express.static` が優先）：
- `public/bm/eco.js` — エコオク用（h2 テキスト解析）
- `public/bm/aucnet.js` — オークネット用（th/td テーブル解析 + innerText 正規表現フォールバック）

> ⚠️ `server.js` の末尾に `/bm/eco.js` と `/bm/aucnet.js` のルートハンドラが残っているが、`express.static` に遮られて**到達しない**。ルートハンドラ側を編集しても反映されない。必ず `public/bm/` 以下のファイルを編集すること。

ブックマークレットのデータフロー：
1. ページ上でクリック → `public/bm/eco.js`（または aucnet.js）が eval で実行
2. ページ情報（商品名・ブランド・画像URL・価格など）を収集して JSON で POST → `/api/from-page`
3. サーバーが token 発行 → ブックマークレットが `APP?token=xxx` を別タブで開く
4. フロントが `?token` を検出 → `/api/get-page-data/:token` で JSON 取得 → 描画

### スクレイパー (`src/scraper.js`)

`searchAllSites(query, preciseQuery)` が 5 サイトを並列スクレイピング：

| サイト | クエリ | priceType |
|---|---|---|
| Yahooショッピング | `preciseQuery` | `retail` |
| ヤフオク（出品中・落札済） | `query` | `auction_active` / `sold` |
| オークフリー | `query` | `sold` |
| 楽天市場 | `preciseQuery`（API優先） | `retail` |
| メルカリ | `query` | `market_active` / `sold` |

フィルタリング：`isRelevantItem()` でブランド名一致・商品種別語一致を確認。`PRICE_FLOOR = 1000` 円未満を除外。

各スクレイパーは `{ site, items, error, searchUrl }` を返す。`searchUrl` はフロントのサイト別内訳リンクに使用。

### 本番環境の注意点

- **Render 無料プラン**：15分無操作でスリープ、初回リクエストに約50秒かかる
- 環境変数 `RAKUTEN_APP_ID`（楽天 API）、`ANTHROPIC_API_KEY`（Claude Vision）は Render のダッシュボードで設定
- `RAKUTEN_APP_ID` が未設定の場合はスクレイピングにフォールバック
