const express = require('express');
const multer = require('multer');
const path = require('path');
const { parsePDF } = require('./pdf-parser');
const { searchAllSites } = require('./scraper');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
// API: Google Lens プロキシ
// ブラウザからのクロスオリジンform送信はセキュリティでブロックされるため
// サーバー経由でlens.google.comにPOSTしリダイレクト先URLを返す
// ============================================================
app.post('/api/lens-proxy', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '画像が必要です' });

    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/png' });
    const form = new FormData();
    form.append('encoded_image', blob, 'product.png');

    const lensRes = await fetch('https://lens.google.com/v3/upload', {
      method: 'POST',
      body: form,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.5',
      },
      redirect: 'manual',
    });

    const location = lensRes.headers.get('location');
    if (location) {
      res.json({ url: location });
    } else {
      res.status(502).json({ error: 'Google Lensからリダイレクト先を取得できませんでした (status: ' + lensRes.status + ')' });
    }
  } catch (e) {
    console.error('Lens proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// API: 価格検索
// ============================================================
app.post('/api/search-prices', express.json(), async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: '検索クエリが必要です' });

    console.log(`[価格検索] クエリ: "${query}"`);
    const results = await searchAllSites(query);
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
