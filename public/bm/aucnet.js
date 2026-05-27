(function(){
  var APP='https://auction-price-checker.onrender.com';

  // ① 別タブを今すぐ開く（ユーザージェスチャーが有効なうちに）
  var win = null;
  try { win = window.open('', '_blank'); } catch(e) {}

  // トースト表示
  var t=document.getElementById('_bmt');
  if(!t){ t=document.createElement('div'); t.id='_bmt'; document.body.appendChild(t); }
  t.style.cssText='position:fixed;top:16px;right:16px;background:#6c5ce7;color:#fff;padding:14px 20px;border-radius:10px;z-index:99999;font-size:14px;font-family:sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:320px;line-height:1.5;';
  t.textContent='⏳ 商品情報を読み取り中...';

  // ブランド名日本語変換マップ
  var BRAND_JP = {
    'LOUIS VUITTON':'ルイヴィトン','CHANEL':'シャネル','HERMES':'エルメス',
    'GUCCI':'グッチ','PRADA':'プラダ','COACH':'コーチ','BURBERRY':'バーバリー',
    'CELINE':'セリーヌ','BOTTEGA VENETA':'ボッテガヴェネタ','FENDI':'フェンディ',
    'DIOR':'ディオール','BALENCIAGA':'バレンシアガ','GIVENCHY':'ジバンシー',
    'SAINT LAURENT':'サンローラン','VALENTINO':'ヴァレンティノ',
    'GOYARD':'ゴヤール','LOEWE':'ロエベ','MIU MIU':'ミュウミュウ',
    'VERSACE':'ヴェルサーチ','BVLGARI':'ブルガリ','CARTIER':'カルティエ',
  };

  // ── AucNetテーブルからラベル→値を取得するヘルパー ──
  function getField(label) {
    var cells = document.querySelectorAll('td, th');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].textContent.trim() === label) {
        var next = cells[i].nextElementSibling;
        if (next) {
          var val = next.textContent.trim();
          return (val === '-' || val === '') ? '' : val;
        }
      }
    }
    return '';
  }

  // ── 各フィールド取得 ──
  var brand      = getField('メーカー') || '';
  var productName= getField('商品名')   || '';
  var lineType   = getField('ライン/タイプ') || getField('ライン') || '';
  var shape      = getField('形状')     || '';
  var model      = getField('型番')     || '';
  var genre      = getField('ジャンル') || '';

  // 評価: "C（2/2+）" → "C"
  var rankRaw = getField('評価(外装/内側)') || getField('評価') || '';
  var rank = (rankRaw.match(/^([A-S])/)||[])[1] || rankRaw;

  // ダメージコメント
  var desc1 = getField('セールスコメント/ダメージコメント') || '';
  var desc2 = getField('セールスコメント2') || getField('セールスコメント２') || '';
  var damage = [desc1, desc2].filter(Boolean).join(' / ');

  // 特記事項（リンクテキスト集約）
  var tokki = '';
  var tokkiEl = document.querySelector('td[data-th="特記事項"], .tokki');
  if (!tokkiEl) {
    var tds = document.querySelectorAll('td');
    for (var j = 0; j < tds.length; j++) {
      if (tds[j].textContent.trim() === '特記事項' && tds[j].nextElementSibling) {
        tokkiEl = tds[j].nextElementSibling; break;
      }
    }
  }
  if (tokkiEl) tokki = tokkiEl.innerText.replace(/\s+/g,' ').trim();

  // Buy It Now価格 / スタート価格
  var txt = document.body.innerText;
  var spM = txt.match(/Buy\s*It\s*Now価格[：:\s]*([\d,]+)/i)
           || txt.match(/スタート価格?[：:\s]*([\d,]+)/)
           || txt.match(/開始価格?[：:\s]*([\d,]+)/);
  var sp = spM ? spM[1].replace(/,/g,'') : '';

  // 画像収集（サムネイル・メイン画像）
  var imgs = [];
  document.querySelectorAll('img[src]').forEach(function(el){
    var s = el.src;
    if (s && s.startsWith('http') && !s.match(/logo|icon|btn|arrow|sprite|header|\.gif/i) && imgs.indexOf(s) < 0) {
      imgs.push(s);
    }
  });

  // ── ブランド日本語化 ──
  var brandJP = BRAND_JP[brand.toUpperCase().trim()] || brand;

  // ── 検索クエリ構築 ──
  // productName例: "マトラッセ（バッグ）・ショルダーバッグ"
  // → 括弧内・記号を除去して特徴語を抽出
  var GENERIC = /^(バッグ|鞄|財布|トートバッグ|ショルダーバッグ|ハンドバッグ|ポーチ|クラッチ|リュック|ジャンル)$/;

  // productNameからライン名とshapeを組み合わせて詳細クエリを作る
  var cleanLine = lineType
    .replace(/（[^）]*）/g,'')   // 括弧内除去
    .replace(/\([^)]*\)/g,'')
    .replace(/・/g,' ')
    .replace(/\s+/g,' ').trim();

  // ジャンル・形状も含める
  var featureWords = [cleanLine, shape, genre]
    .join(' ')
    .split(/[\s・]+/)
    .filter(function(w){ return w.length > 1 && !GENERIC.test(w); })
    .filter(function(w,i,a){ return a.indexOf(w) === i; }) // 重複除去
    .slice(0,4);

  var q  = [brandJP].concat(featureWords).join(' ').substring(0,60);
  var pq = model
    ? [brandJP, model].join(' ')
    : [brandJP].concat(featureWords).join(' ').substring(0,60);

  var data = {
    source:'aucnet', url:location.href,
    maker:brand, makerNormalized:brandJP,
    productName:productName, productNameNormalized:productName,
    lineType:lineType, shape:shape,
    grade:rank, evaluation:rank,
    damage:damage + (tokki ? ' 【特記】'+tokki : ''),
    images:imgs.slice(0,10),
    startPrice:sp, modelNumber:model,
    searchQuery:q, preciseQuery:pq
  };

  t.textContent='⏳ 送信中...';

  fetch(APP+'/api/from-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  .then(function(r){return r.json();})
  .then(function(j){
    if(j.token){
      t.style.background='#00b894';
      t.textContent='✅ 完了！別タブで価格チェッカーを開きます...';
      setTimeout(function(){
        var url=APP+'?token='+j.token;
        if(win&&!win.closed){ win.location.href=url; win.focus(); }
        else{ window.open(url,'_blank'); }
        setTimeout(function(){t.remove();},800);
      },400);
    }else{
      t.style.background='#e17055';
      t.textContent='❌ エラー: '+JSON.stringify(j);
      if(win&&!win.closed)win.close();
      setTimeout(function(){t.remove();},5000);
    }
  })
  .catch(function(e){
    t.style.background='#e17055';
    t.textContent='❌ サーバーエラー。もう一度クリックしてください。';
    if(win&&!win.closed)win.close();
    setTimeout(function(){t.remove();},8000);
  });
})();
