(function(){
  var APP='https://auction-price-checker.onrender.com';

  // ① 別タブを今すぐ開く
  var win = null;
  try { win = window.open('', '_blank'); } catch(e) {}

  // トースト
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

  // ── ① DOM: label→value テーブル読み取り（th/td両対応）──
  function getField(label) {
    var all = document.querySelectorAll('th, td');
    for (var i = 0; i < all.length; i++) {
      // innerText で改行・空白を正規化して比較
      var cellText = (all[i].innerText || all[i].textContent || '').replace(/[\s　]+/g,' ').trim();
      if (cellText === label) {
        // 同じ <tr> 内の次のセルを探す
        var next = all[i].nextElementSibling;
        if (next) {
          var val = (next.innerText || next.textContent || '').replace(/[\s　]+/g,' ').trim();
          return (val === '-' || val === '') ? '' : val;
        }
      }
    }
    return '';
  }

  // ── ② テキスト正規表現フォールバック ──
  // ページ全体のテキストからラベル行の次の行を取得
  var bodyText = document.body.innerText || '';
  function getByRegex(label) {
    // "ラベル\n値" のパターン（ラベルが補足ラベルより先にマッチしないよう境界指定）
    var escaped = label.replace(/[/\\^$.*+?()[\]{}|]/g,'\\$&');
    var m = bodyText.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\n([^\\n]+)'));
    if (m) {
      var val = m[1].trim();
      return (val === '-' || val === '') ? '' : val;
    }
    return '';
  }

  function field(label) {
    return getField(label) || getByRegex(label) || '';
  }

  // ── フィールド取得 ──
  var brand     = field('メーカー');
  var productName = field('商品名');
  // 「商品名補足」が取れた場合は除外済み（getField は完全一致）

  var lineType  = field('ライン/タイプ') || field('ライン') || field('タイプ');
  var shape     = field('形状');
  var genre     = field('ジャンル');
  var model     = field('型番');
  var serial    = field('製造番号(シリアルNo)') || field('シリアルNo') || field('製造番号');
  var receiptNo = field('受付番号');

  // 評価: "C（2/2+）" の先頭アルファベット
  var rankRaw   = field('評価(外装/内側)') || field('評価');
  var rank      = (rankRaw.match(/^([A-S])/)||[])[1] || rankRaw;

  // ダメージコメント
  var desc1 = field('セールスコメント/ダメージコメント');
  var desc2 = field('セールスコメント2') || field('セールスコメント２');
  var desc3 = field('セールスコメント');
  var damage = [desc1, desc2 || desc3].filter(Boolean).join(' / ');

  // 特記事項
  var tokki = '';
  (function(){
    var all = document.querySelectorAll('td, th');
    for(var i=0;i<all.length;i++){
      var txt2=(all[i].innerText||'').trim();
      if(txt2==='特記事項'&&all[i].nextElementSibling){
        tokki=(all[i].nextElementSibling.innerText||'').replace(/\s+/g,' ').trim();
        break;
      }
    }
  })();

  // 価格（Buy It Now / スタート）
  var spM = bodyText.match(/Buy\s*It\s*Now価格[^0-9]*([\d,]+)/i)
         || bodyText.match(/スタート価格?[^0-9]*([\d,]+)/)
         || bodyText.match(/開始価格?[^0-9]*([\d,]+)/);
  var sp = spM ? spM[1].replace(/,/g,'') : '';

  // 画像収集（商品画像に限定：サムネイル列を優先）
  var imgs = [];
  // AucNetのサムネイル画像は特定のコンテナに入っていることが多い
  var candidates = [];
  document.querySelectorAll('img[src]').forEach(function(el){
    var s = el.src || '';
    if (!s.startsWith('http')) return;
    // ロゴ・アイコン類を除外
    if (s.match(/logo|icon|btn|arrow|sprite|header|footer|common|\.gif$/i)) return;
    // AucNetのブランドロゴ除外（/brand/ パスはブランドロゴ）
    if (s.match(/\/brand\//i)) return;
    // 小さいアイコン画像を除外
    if ((el.naturalWidth > 0 && el.naturalWidth < 50) || (el.width > 0 && el.width < 50)) return;
    candidates.push(s);
  });
  // 重複除去
  candidates.forEach(function(s){ if(imgs.indexOf(s)<0) imgs.push(s); });

  // ── ブランド日本語化 ──
  var brandJP = BRAND_JP[brand.toUpperCase().trim()] || brand;

  // ── 検索クエリ構築 ──
  var GENERIC=/^(バッグ|鞄|財布|トートバッグ|ショルダーバッグ|ハンドバッグ|ポーチ|クラッチ|リュック|ジャンル|バッグ類)$/;

  var cleanLine = (lineType||'')
    .replace(/（[^）]*）/g,'').replace(/\([^)]*\)/g,'')
    .replace(/・/g,' ').replace(/\s+/g,' ').trim();

  var featureWords = [cleanLine, shape, genre]
    .join(' ').split(/[\s・]+/)
    .filter(function(w){ return w.length>1 && !GENERIC.test(w); })
    .filter(function(w,i,a){ return a.indexOf(w)===i; })
    .slice(0,4);

  var q  = [brandJP].concat(featureWords).join(' ').substring(0,60);
  var pq = model
    ? [brandJP, model].join(' ')
    : [brandJP].concat(featureWords).join(' ').substring(0,60);

  // ── デバッグトースト（5秒表示後に送信） ──
  t.textContent = '📋 ' + [brand||'（ブランドなし）', productName||'（商品名なし）', rank||'（評価なし）'].join(' / ');

  setTimeout(function(){
    t.textContent='⏳ 送信中...';

    var data = {
      source:'aucnet', url:location.href,
      maker:brand, makerNormalized:brandJP,
      productName:productName, productNameNormalized:productName,
      lineType:lineType, shape:shape, genre:genre,
      grade:rank, evaluation:rank,
      damage:damage + (tokki ? ' 【特記】'+tokki : ''),
      images:imgs.slice(0,10),
      startPrice:sp, modelNumber:model, serial:serial, receiptNo:receiptNo,
      searchQuery:q, preciseQuery:pq
    };

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
  }, 2000);
})();
