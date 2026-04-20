const pdfParse = require('pdf-parse');

// 全角→半角変換
function normalizeFullWidth(str) {
  return str
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const result = {};

  // ============================================================
  // pdf-parseの出力は、ラベル群が先に出て、その後に値群が来る。
  // ラベルの出現順序を利用して値をマッピングする。
  // ============================================================

  // ラベル群のインデックスを探す
  const labelOrder = [
    '開催回数', '開催日', '受付番号', 'セリ順',
    '商品名', '商品名補足', 'メーカー', 'ライン/タイプ',
    '形状', 'ジャンル',
  ];

  // 「ジャンル」の後にある値ブロックを探す
  let genreIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'ジャンル') { genreIdx = i; break; }
  }

  // 「固有No」の次の行以降が値ブロック
  let valueStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('固有No')) { valueStartIdx = i + 1; break; }
  }

  // 値ブロック: 固有No の次の行から、日付パターン（2026/04/13等）を含む行を探す
  // 実際のパターン: セールスコメント/ダメージコメント → 訂正 → 詳細情報 → ... → 日付値（2026/04/13）
  let dateLineIdx = -1;
  for (let i = valueStartIdx; i < lines.length; i++) {
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(lines[i])) {
      dateLineIdx = i;
      break;
    }
  }

  if (dateLineIdx >= 0) {
    // dateLineIdx = 開催日の値
    // その次: 受付番号の値, セリ順の値, 商品名の値, ...
    result.auctionDate = lines[dateLineIdx] || '';

    // 受付番号
    result.receiptNo = lines[dateLineIdx + 1] || '';

    // セリ順（スキップ）
    // 商品名
    result.productName = lines[dateLineIdx + 3] || '';
    result.productNameNormalized = normalizeFullWidth(result.productName);

    // メーカー
    result.maker = lines[dateLineIdx + 4] || '';
    result.makerNormalized = normalizeFullWidth(result.maker);

    // ライン/タイプ
    result.lineType = lines[dateLineIdx + 5] || '';

    // 形状
    result.shape = lines[dateLineIdx + 6] || '';

    // ジャンル
    result.genre = lines[dateLineIdx + 7] || '';
  }

  // 製造番号: "VI0991" パターン（英字+数字）
  const serialMatch = text.match(/([A-Z]{2}\d{4,})/);
  result.serial = serialMatch ? serialMatch[1] : '';

  // 型番: 「型番」ラベルの次の行を探す
  result.modelNumber = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '型番') {
      // 型番の値は離れた場所にある可能性、次の行が値でなければ空
      const nextLine = lines[i + 1] || '';
      if (nextLine && !['取消区分', '固有No', 'セールス'].some(l => nextLine.includes(l))) {
        result.modelNumber = nextLine;
      }
      break;
    }
  }

  // 評価: "B ( 2+ / 2+ )" のようなパターン
  const evalMatch = text.match(/([A-Z])\s*\(\s*(\d\+?)\s*\/\s*(\d\+?)\s*\)/);
  if (evalMatch) {
    result.evaluation = `${evalMatch[1]} ( ${evalMatch[2]} / ${evalMatch[3]} )`;
    result.grade = evalMatch[1];
  } else {
    result.evaluation = '';
    result.grade = '';
  }

  // スタート価格: "24,000 円" パターン
  const priceMatches = text.match(/([\d,]+)\s*円/g);
  if (priceMatches) {
    // 通常、結果価格(0円)とスタート価格の順で出る or "0 円24,000 円" の形
    // 最も大きい値をスタート価格とする
    const prices = priceMatches.map(p => {
      const n = parseInt(p.replace(/[円,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    }).filter(p => p > 0);
    result.startPrice = prices.length > 0 ? Math.max(...prices).toString() : '';
  } else {
    result.startPrice = '';
  }

  // 特記事項（ダメージ）
  const damageStart = text.indexOf('ショルダ');
  const damageEnd = text.indexOf('型番');
  if (damageStart > -1 && damageEnd > damageStart) {
    result.damage = text.substring(damageStart, damageEnd)
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    // 代替: 特記事項の後のテキストを探す
    const tokki = text.indexOf('特記事項');
    if (tokki > -1) {
      let dmg = text.substring(tokki + 4);
      const endMarkers = ['型番', '取消区分'];
      for (const m of endMarkers) {
        const idx = dmg.indexOf(m);
        if (idx > 0) dmg = dmg.substring(0, idx);
      }
      dmg = dmg.replace(/\s+/g, ' ').trim();
      if (dmg.length > 2) result.damage = dmg;
      else result.damage = '';
    } else {
      result.damage = '';
    }
  }

  // 色
  const colorMatch = text.match(/色系統色\s*(.+?)(?:\n|スタート)/s);
  result.color = (colorMatch && colorMatch[1].trim() !== '-') ? colorMatch[1].trim() : '';

  // 検索クエリを生成
  const line = result.lineType ? result.lineType.replace(/[（）()]/g, ' ').replace(/バッグ/g, '').trim() : '';
  result.searchQuery = [result.makerNormalized, line, result.shape].filter(Boolean).join(' ');

  return result;
}

module.exports = { parsePDF };
