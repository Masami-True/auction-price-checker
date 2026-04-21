const fetch = require('node-fetch');
const cheerio = require('cheerio');

// ============================================================
// User-Agent設定
// ============================================================
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Googlebot UAを使うとメルカリがSSRコンテンツを返す
const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function headers(ua) {
  return {
    'User-Agent': ua || UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.5',
  };
}

// ============================================================
// メルカリ（Googlebot UAでSSRコンテンツを取得）
// ============================================================
async function scrapeMercari(query) {
  const results = { site: 'メルカリ', items: [], error: null };
  try {
    const onSaleUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}`;
    const soldUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}&status=sold_out`;

    const [onSaleRes, soldRes] = await Promise.allSettled([
      fetchWithTimeout(onSaleUrl, 25000, UA_BOT),
      fetchWithTimeout(soldUrl, 25000, UA_BOT),
    ]);

    const parseItems = (html, status, baseUrl) => {
      const $ = cheerio.load(html);
      $('[data-testid="item-cell"]').each((_, el) => {
        // 価格: priceContainerクラスの要素
        const priceText = $(el).find('[class*="priceContainer"]').first().text();
        const price = extractPrice(priceText);
        // 商品名: aria-labelに「商品名の画像 価格」の形式で入っている
        const ariaLabel = $(el).find('[role="img"][aria-label]').first().attr('aria-label') || '';
        const name = ariaLabel.replace(/の画像\s*[\d,¥¥]+円?$/, '').trim() || query;
        const link = $(el).find('a').first().attr('href');
        if (price > 0) {
          results.items.push({
            name,
            price,
            status,
            url: link ? (link.startsWith('http') ? link : `https://jp.mercari.com${link}`) : baseUrl,
          });
        }
      });
    };

    if (onSaleRes.status === 'fulfilled') parseItems(onSaleRes.value, '販売中', onSaleUrl);
    if (soldRes.status === 'fulfilled') parseItems(soldRes.value, 'SOLD', soldUrl);
  } catch (e) {
    results.error = e.message;
  }
  return results;
}

// ============================================================
// ヤフオク（出品中 & 落札済み）
// ============================================================
async function scrapeYahooAuctions(query) {
  const results = { site: 'ヤフオク!', items: [], error: null };
  try {
    const activeUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(query)}&auccat=0`;
    const closedUrl = `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(query)}&auccat=0`;

    const [activeRes, closedRes] = await Promise.allSettled([
      fetchWithTimeout(activeUrl),
      fetchWithTimeout(closedUrl),
    ]);

    if (activeRes.status === 'fulfilled') {
      const $ = cheerio.load(activeRes.value);
      $('.Product').each((_, el) => {
        const priceText = $(el).find('.Product__priceValue').first().text();
        const price = extractPrice(priceText);
        const name = $(el).find('.Product__title a').first().text().trim();
        const link = $(el).find('.Product__title a').first().attr('href');
        if (price > 0) {
          results.items.push({ name: name || query, price, status: '出品中', url: link || activeUrl });
        }
      });
    }

    if (closedRes.status === 'fulfilled') {
      const $ = cheerio.load(closedRes.value);
      $('.Product').each((_, el) => {
        const priceText = $(el).find('.Product__priceValue').first().text();
        const price = extractPrice(priceText);
        const name = $(el).find('.Product__title a').first().text().trim();
        const link = $(el).find('.Product__title a').first().attr('href');
        if (price > 0) {
          results.items.push({ name: name || query, price, status: '落札済', url: link || closedUrl });
        }
      });
    }
  } catch (e) {
    results.error = e.message;
  }
  return results;
}

// ============================================================
// 楽天市場（公式API優先 / スクレイピングフォールバック）
// ============================================================
async function scrapeRakuten(query) {
  const results = { site: '楽天市場', items: [], error: null };
  const appId = process.env.RAKUTEN_APP_ID;

  try {
    if (appId) {
      // ── 公式API（無料・IPアドレス制限なし）──
      const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706` +
        `?applicationId=${appId}&keyword=${encodeURIComponent(query)}&format=json&hits=30&sort=-reviewCount`;
      const json = await fetchWithTimeout(url, 25000);
      const data = JSON.parse(json);
      if (data.Items) {
        data.Items.forEach(({ Item }) => {
          if (Item.itemPrice > 0) {
            results.items.push({
              name: Item.itemName.substring(0, 100),
              price: Item.itemPrice,
              status: '販売中',
              url: Item.itemUrl,
            });
          }
        });
      }
    } else {
      // ── スクレイピング（ローカル動作用フォールバック）──
      const url = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(query)}/`;
      const html = await fetchWithTimeout(url, 25000);
      const $ = cheerio.load(html);
      $('.searchresultitem').each((_, el) => {
        const priceText = $(el).find('[class*="price--"]').not('[class*="unit"]').first().text();
        const price = extractPrice(priceText);
        const linkEl = $(el).find('a[href*="rakuten"]').first();
        const name = linkEl.attr('title') || linkEl.find('img').attr('alt') || query;
        const link = linkEl.attr('href');
        if (price > 0) {
          results.items.push({ name: name.substring(0, 100), price, status: '販売中', url: link || url });
        }
      });
    }
  } catch (e) {
    results.error = e.message;
  }
  return results;
}

// ============================================================
// オークフリー（落札相場）
// ============================================================
async function scrapeAucfree(query) {
  const results = { site: 'オークフリー', items: [], error: null };

  // aucfreeは直近30日のデータのみのため、0件の場合はクエリを短縮してリトライ
  const queries = buildAucfreeQueries(query);

  try {
    for (const q of queries) {
      const url = `https://aucfree.com/search?q=${encodeURIComponent(q)}`;
      const html = await fetchWithTimeout(url, 25000);
      const $ = cheerio.load(html);

      $('tr').each((_, el) => {
        const titleEl = $(el).find('a.item_title');
        const priceEl = $(el).find('a.item_price');
        if (!titleEl.length || !priceEl.length) return;

        const name = titleEl.text().trim();
        const priceText = priceEl.first().text();
        const price = extractPrice(priceText);
        const href = titleEl.attr('href');
        if (price > 0) {
          results.items.push({
            name: name || q,
            price,
            status: '落札済',
            url: href ? (href.startsWith('http') ? href : `https://aucfree.com${href}`) : url,
          });
        }
      });

      if (results.items.length > 0) break; // 結果が得られたら終了
    }
  } catch (e) {
    results.error = e.message;
  }
  return results;
}

// オークフリー用クエリ候補を生成（元クエリ→JP置換→ブランド+商品タイプの順でリトライ）
function buildAucfreeQueries(query) {
  const BRAND_JP = [
    [/LOUIS\s*VUITTON/gi, 'ルイヴィトン'],
    [/CHANEL/gi, 'シャネル'],
    [/GUCCI/gi, 'グッチ'],
    [/HERMES/gi, 'エルメス'],
    [/PRADA/gi, 'プラダ'],
    [/COACH/gi, 'コーチ'],
    [/BURBERRY/gi, 'バーバリー'],
  ];

  const queries = [query];

  // 英語ブランド名を日本語に置換
  let jp = query;
  for (const [re, jname] of BRAND_JP) jp = jp.replace(re, jname);
  if (jp !== query) queries.push(jp);

  // 英語ブランド名（先頭の大文字連続）を除去した短縮クエリ
  const withoutEn = query.replace(/^[A-Z][A-Z\s\.&]+\s+/, '').trim();
  if (withoutEn && withoutEn !== query) queries.push(withoutEn);

  // JP品番 + 最後のワード（例: "ルイヴィトン ウエストバッグ"）
  const jpBrand = jp.split(/\s+/)[0];
  const lastWord = query.split(/\s+/).pop();
  if (jpBrand && lastWord && jpBrand !== lastWord) {
    queries.push(`${jpBrand} ${lastWord}`);
  }

  return [...new Set(queries)];
}

// ============================================================
// Yahooショッピング（Google ShoppingはJavaScript必須のため代替）
// ============================================================
async function scrapeYahooShopping(query) {
  const results = { site: 'Yahooショッピング', items: [], error: null };
  try {
    const url = `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(query)}`;
    const html = await fetchWithTimeout(url, 25000);
    const $ = cheerio.load(html);

    const seen = new Set();

    // data-beacon属性にo_prc（価格）とtargurl（URL）が埋め込まれている
    $('[data-beacon]').each((_, el) => {
      const beacon = $(el).attr('data-beacon') || '';
      const priceMatch = beacon.match(/o_prc:(\d+)/);
      const urlMatch = beacon.match(/targurl:([^;\"]+)/);
      if (!priceMatch || !urlMatch) return;

      const price = parseInt(priceMatch[1]);
      const itemUrl = 'https://' + urlMatch[1];
      if (seen.has(itemUrl) || price <= 0) return;
      seen.add(itemUrl);

      // 商品名はimg[alt]から取得
      const name = $(el).find('img[alt]').filter((i, img) => {
        const alt = $(img).attr('alt') || '';
        return alt.length > 5 && !alt.includes('Yahoo');
      }).first().attr('alt') || query;

      results.items.push({ name: name.substring(0, 100), price, status: '販売中', url: itemUrl });
    });
  } catch (e) {
    results.error = e.message;
  }
  return results;
}

// ============================================================
// ユーティリティ
// ============================================================
function extractPrice(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[¥￥円税込税抜送料無料,\s]/g, '');
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

async function fetchWithTimeout(url, timeoutMs = 25000, ua) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: headers(ua),
      signal: controller.signal,
      redirect: 'follow',
    });
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// メインの検索関数：全サイトを並行で検索
// query      = 広域クエリ（メルカリ・ヤフオク・オークフリー向け）
// preciseQuery = 精密クエリ（楽天API・Yahooショッピング向け、省略時はqueryを使用）
// ============================================================
async function searchAllSites(query, preciseQuery) {
  const pq = preciseQuery || query;
  const scrapers = [
    scrapeMercari(query),
    scrapeYahooAuctions(query),
    scrapeRakuten(pq),        // 楽天は精密クエリ優先
    scrapeAucfree(query),
    scrapeYahooShopping(pq),  // Yahooショッピングも精密クエリ優先
  ];

  const allResults = await Promise.allSettled(scrapers);

  const sites = allResults.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['メルカリ', 'ヤフオク!', '楽天市場', 'オークフリー', 'Yahooショッピング'];
    return { site: names[i], items: [], error: r.reason?.message || '取得失敗' };
  });

  const allItems = sites.flatMap(s => s.items).filter(i => i.price > 0);
  const prices = allItems.map(i => i.price);

  let summary = null;
  if (prices.length > 0) {
    const sorted = [...prices].sort((a, b) => a - b);
    const minPrice = sorted[0];
    const maxPrice = sorted[sorted.length - 1];
    const avgPrice = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const medianPrice = sorted[Math.floor(sorted.length / 2)];

    const minItem = allItems.find(i => i.price === minPrice);
    const maxItem = allItems.find(i => i.price === maxPrice);

    summary = {
      totalItems: allItems.length,
      minPrice,
      maxPrice,
      avgPrice,
      medianPrice,
      minSource: { site: findSiteForItem(sites, minItem), url: minItem.url, name: minItem.name },
      maxSource: { site: findSiteForItem(sites, maxItem), url: maxItem.url, name: maxItem.name },
    };
  }

  return { sites, summary };
}

function findSiteForItem(sites, targetItem) {
  for (const s of sites) {
    if (s.items.includes(targetItem)) return s.site;
  }
  return '不明';
}

module.exports = { searchAllSites };
