(function(){
  var APP='https://auction-price-checker.onrender.com';
  var t=document.createElement('div');
  t.style.cssText='position:fixed;top:16px;right:16px;background:#6c5ce7;color:#fff;padding:14px 20px;border-radius:10px;z-index:99999;font-size:14px;font-family:sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:300px;line-height:1.5;';
  t.textContent='⏳ 送信中...しばらお待ちください';
  document.body.appendChild(t);

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

  var kw=clean.split(/\s+/).filter(function(w){return w.length>1;}).slice(0,3);
  var q=[brand].concat(kw).join(' ');
  var pq=[brand,clean].filter(Boolean).join(' ').substring(0,60);

  var data={
    source:'ecoauc',url:location.href,maker:brand,makerNormalized:brand,
    productName:clean,productNameNormalized:clean,grade:rank,evaluation:rank,
    damage:desc,images:imgs.slice(0,10),startPrice:sp,shape:shape,
    searchQuery:q,preciseQuery:pq
  };

  fetch(APP+'/api/from-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  .then(function(r){return r.json();})
  .then(function(j){
    if(j.token){
      t.style.background='#00b894';
      t.textContent='✅ 完了！価格チェッカーに移動します...';
      setTimeout(function(){location.href=APP+'?token='+j.token;},600);
    }else{
      t.style.background='#e17055';
      t.textContent='❌ エラー: '+JSON.stringify(j);
      setTimeout(function(){t.remove();},5000);
    }
  })
  .catch(function(e){
    t.style.background='#e17055';
    t.textContent='❌ サーバーに接続できません。初回は起動に50秒かかります。もう一度クリックしてください。';
    setTimeout(function(){t.remove();},8000);
  });
})();
