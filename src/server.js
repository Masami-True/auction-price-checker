require('dotenv').config({ override: true });
const express = require('express');
const multer = require('multer');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { parsePDF } = require('./pdf-parser');
const { searchAllSites } = require('./scraper');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 一時画像ストア（メモリ内、5分TTL）
const tempImages = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of tempImages) {
    if (now - data.timestamp > 5 * 60 * 1000) tempImages.delete(id);
  }
}, 60 * 1000);

// 静的ファイル配信
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================
// API: PDFアップロード → 商品情報を解析
// ============================================================
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDFファイルが必要です' });
    const productData = await parsePDF(req.file.buffer);
    res.json({ success: true, product: productData });
  } catch (e) {
    console.error('PDF parse error:', e);
    res.status(500).json({ error: 'PDFの解析に失敗しました: ' + e.message });
  }
});

// ============================================================
// 一時画像の配信エンドポイント（Google Lens用）
// ============================================================
app.get('/temp/:id', (req, res) => {
  const data = tempImages.get(req.params.id);
  if (!data) return res.status(404).send('Not found');
  res.set('Content-Type', data.mimetype);
  res.send(data.buffer);
});

// ============================================================
// API: Google Lens プロキシ
// 画像をサーバーに一時保存して公開URLを発行し、
// uploadbyurl方式でユーザーのブラウザセッションからLensを開く
// ============================================================
app.post('/api/lens-proxy', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '画像が必要です' });

    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    tempImages.set(id, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype || 'image/png',
      timestamp: Date.now(),
    });

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imageUrl = `${protocol}://${host}/temp/${id}`;
    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;

    res.json({ url: lensUrl });
  } catch (e) {
    console.error('Lens proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// API: 画像から商品を特定して価格検索まで一括実行
// ============================================================
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '画像が必要です' });

    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/png';

    // Claude Vision で商品情報を特定
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `この商品画像を見て、日本のフリマ・オークションサイトで検索するのに最適なクエリを1行で出力してください。
ブランド名・商品名・型番・色・サイズなど特定できる情報を含めてください。
クエリのみ出力し、説明文は不要です。`,
          },
        ],
      }],
    });

    const query = message.content[0].text.trim();
    console.log(`[画像解析] 特定クエリ: "${query}"`);

    // そのまま価格検索を実行
    const results = await searchAllSites(query);
    console.log(`[画像解析] 価格検索完了: ${results.summary ? results.summary.totalItems + '件' : '0件'}`);

    res.json({ success: true, query, results });
  } catch (e) {
    console.error('Analyze image error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// API: 価格検索
// ============================================================
app.post('/api/search-prices', express.json(), async (req, res) => {
  try {
    const { query, preciseQuery } = req.body;
    if (!query) return res.status(400).json({ error: '検索クエリが必要です' });

    console.log(`[価格検索] 広域: "${query}" / 精密: "${preciseQuery || '(なし)'}"`);
    const results = await searchAllSites(query, preciseQuery);
    console.log(`[価格検索] 完了: ${results.summary ? results.summary.totalItems + '件' : '0件'}`);

    res.json({ success: true, results });
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: '価格検索に失敗しました: ' + e.message });
  }
});

// ============================================================
// サーバー起動
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('============================================');
  console.log('  オークション仕入れ 価格チェッカー');
  console.log(`  http://localhost:${PORT} で起動しました`);
  console.log('============================================');
  console.log('');
});
