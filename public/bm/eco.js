(function(){
  var APP='https://auction-price-checker.onrender.com';

  // ① 別タブを今すぐ開く（ユーザージェスチャーが有効なうちに。後で開くとポップアップブロックされる）
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

  // エコオクはh1がなくh2に「ブランド名\n(SKU)▼注意▼ブランド 商品名」が入る
  var h2el=document.querySelector('h2');
  var fullTitle=h2el?h2el.innerText.trim():'';
  var titleLines=fullTitle.split('\n').map(function(s){return s.trim();}).filter(Boolean);
  var brand=titleLines[0]||'';
  var titleLine=titleLines[1]||titleLines[0]||'';
  var clean=titleLine
    .replace(/\([^)]+\)/g,'')
    .replace(/▼[^▼]*▼/g,'')
    .replace(new RegExp(brand+'\\s*','gi'),'')
    .replace(/\s+/g,' ').trim();

  // ② ブランド日本語名を取得
  var brandJP = BRAND_JP[brand.toUpperCase().trim()] || brand;

  var txt=document.body.innerText;
  var rank=(txt.match(/([A-S])\s*ランク/)||[])[1]||'';
  var desc=(txt.match(/〈商品説明〉[\r\n]+([\s\S]*?)(?=\n\s*[♥★♦]|\n開始価格)/)||[])[1]||'';
  desc=desc.trim();

  var imgs=[];
  document.querySelectorAll('a[href*="assets.ecoauc.com/images"]').forEach(function(a){
    var s=a.closest?a.closest('.swiper-slide'):null;
    if(s&&s.classList.contains('swiper-slide-duplicate'))return;
    if(imgs.indexOf(a.href)<0)imgs.push(a.href);
  });

  var sp=(txt.match(/開始価格[\s\S]*?\xA5\s*([\d,]+)/)||[])[1]||'';
  sp=sp.replace(/,/g,'');
  var shape=(txt.match(/形状コード[\r\n]+([^\r\n]+)/)||[])[1]||'';
  shape=shape.trim();

  // ② 精密クエリ: 汎用語を除いた特徴語を最大5語使用
  // 長財布・短財布・二つ折りは商品種別を絞る重要語なので除外しない
  var GENERIC=/^(バッグ|鞄|財布|トートバッグ|ショルダーバッグ|ハンドバッグ|ポーチ|クラッチ|リュック|ウォレット)$/;
  var kw=clean.split(/\s+/).filter(function(w){
    return w.length>1 && !GENERIC.test(w);
  }).slice(0,5);

  // 特徴語がない場合はshapeも追加
  if(kw.length===0 && shape) kw=[shape];

  var q=[brandJP].concat(kw).join(' ');
  var pq=[brandJP,clean].filter(Boolean).join(' ').substring(0,60);

  var data={
    source:'ecoauc',url:location.href,maker:brand,makerNormalized:brandJP,
    productName:clean,productNameNormalized:clean,grade:rank,evaluation:rank,
    damage:desc,images:imgs.slice(0,10),startPrice:sp,shape:shape,
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
          // ① 先に開いた別タブに移動
          win.location.href=url;
          win.focus();
        }else{
          // ポップアップブロックされた場合のフォールバック
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
