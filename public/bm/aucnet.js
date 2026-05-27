(function(){
  var APP='https://auction-price-checker.onrender.com';

  // ① 別タブを今すぐ開く（ユーザージェスチャーが有効なうちに）
  var win = null;
  try { win = window.open('', '_blank'); } catch(e) {}

  // ローダーが作ったトーストを再利用（なければ新規作成）
  var t=document.getElementById('_bmt');
  if(!t){
    t=document.createElement('div');
    t.id='_bmt';
    document.body.appendChild(t);
  }
  t.style.cssText='position:fixed;top:16px;right:16px;background:#6c5ce7;color:#fff;padding:14px 20px;border-radius:10px;z-index:99999;font-size:14px;font-family:sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:320px;line-height:1.5;';
  t.textContent='⏳ 商品情報を読み取り中...';

  // ② ブランド名日本語変換マップ
  var BRAND_JP = {
    'LOUIS VUITTON':'ルイヴィトン','CHANEL':'シャネル','HERMES':'エルメス',
    'GUCCI':'グッチ','PRADA':'プラダ','COACH':'コーチ','BURBERRY':'バーバリー',
    'CELINE':'セリーヌ','BOTTEGA VENETA':'ボッテガヴェネタ','FENDI':'フェンディ',
    'DIOR':'ディオール','BALENCIAGA':'バレンシアガ','GIVENCHY':'ジバンシー',
    'SAINT LAURENT':'サンローラン','VALENTINO':'ヴァレンティノ',
    'GOYARD':'ゴヤール','LOEWE':'ロエベ','MIU MIU':'ミュウミュウ',
    'VERSACE':'ヴェルサーチ','BVLGARI':'ブルガリ','CARTIER':'カルティエ',
  };

  var txt=document.body.innerText;
  var h1el=document.querySelector('h1,.itemName,[class*="item-name"],[class*="product-name"]');
  var h1text=h1el?h1el.innerText.trim():document.title.replace(/【[^】]*】/g,'').replace(/\s*[-|]\s*.*$/,'').trim();
  var brandEl=document.querySelector('[class*="brand"],[class*="maker"],[class*="Brand"],[class*="Maker"]');
  var brand=brandEl?brandEl.innerText.trim():h1text.split(/[\s　]/)[0]||'';
  var brandJP = BRAND_JP[brand.toUpperCase().trim()] || brand;

  var rankEl=document.querySelector('[class*="rank"],[class*="grade"],[class*="Rank"],[class*="Grade"]');
  var rank=rankEl?rankEl.innerText.replace(/\s+/g,'').trim():(txt.match(/(?:ランク|グレード)[：:]\s*([A-S0-9]+)/)||[])[1]||'';
  var descEl=document.querySelector('[class*="comment"],[class*="damage"],[class*="detail-desc"]');
  var desc=descEl?descEl.innerText.trim():'';

  var imgs=[];
  document.querySelectorAll('img[src]').forEach(function(el){
    var s=el.src;
    if(s&&s.startsWith('http')&&!s.match(/logo|icon|btn|arrow|sprite|\.gif/i)&&imgs.indexOf(s)<0)imgs.push(s);
  });

  var modelM=txt.match(/型番[：:\s]+([A-Z0-9\-]{3,})/);
  var model=modelM?modelM[1]:'';
  var spM=txt.match(/(?:スタート|開始)価格?[：:\xA5￥\s]+([\d,]+)/);
  var sp=spM?spM[1].replace(/,/g,''):'';

  // ② 精密クエリ
  // 長財布・短財布・二つ折りは商品種別を絞る重要語なので除外しない
  var GENERIC=/^(バッグ|鞄|財布|トートバッグ|ショルダーバッグ|ハンドバッグ|ポーチ|クラッチ|リュック)$/;
  var titleWords=h1text.replace(brand,'').trim().split(/\s+/).filter(function(w){
    return w.length>1&&!GENERIC.test(w);
  }).slice(0,4);
  var q=[brandJP].concat(titleWords).join(' ').substring(0,50);
  var pq=model?[brandJP,model].join(' '):[brandJP,h1text.replace(brand,'').trim()].filter(Boolean).join(' ').substring(0,50);

  var data={
    source:'aucnet',url:location.href,maker:brand,makerNormalized:brandJP,
    productName:h1text,productNameNormalized:h1text,grade:rank,evaluation:rank,
    damage:desc,images:imgs.slice(0,10),startPrice:sp,modelNumber:model,
    searchQuery:q,preciseQuery:pq
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
        if(win&&!win.closed){
          win.location.href=url;
          win.focus();
        }else{
          window.open(url,'_blank');
        }
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
