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
