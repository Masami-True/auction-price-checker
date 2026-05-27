(function(){
  var APP='https://auction-price-checker.onrender.com';
  var t=document.createElement('div');
  t.style.cssText='position:fixed;top:16px;right:16px;background:#6c5ce7;color:#fff;padding:14px 20px;border-radius:10px;z-index:99999;font-size:14px;font-family:sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:300px;line-height:1.5;';
  t.textContent='⏳ 送信中...しばらお待ちください';
  document.body.appendChild(t);

  var txt=document.body.innerText;
  var h1el=document.querySelector('h1,.itemName,[class*="item-name"],[class*="product-name"]');
  var h1text=h1el?h1el.innerText.trim():document.title.replace(/【[^】]*】/g,'').replace(/\s*[-|]\s*.*$/,'').trim();
  var brandEl=document.querySelector('[class*="brand"],[class*="maker"],[class*="Brand"],[class*="Maker"]');
  var brand=brandEl?brandEl.innerText.trim():h1text.split(/[\s　]/)[0]||'';
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

  var q=[brand,h1text].filter(Boolean).join(' ').substring(0,50);
  var pq=model?[brand,model].join(' '):[brand,h1text].filter(Boolean).join(' ').substring(0,50);

  var data={
    source:'aucnet',url:location.href,maker:brand,makerNormalized:brand,
    productName:h1text,productNameNormalized:h1text,grade:rank,evaluation:rank,
    damage:desc,images:imgs.slice(0,10),startPrice:sp,modelNumber:model,
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
