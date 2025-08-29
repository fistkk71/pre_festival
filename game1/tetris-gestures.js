// tetris-gestures.js — スワイプ左右＝移動、タップ＝回転／ボタン不要
// 使い方：tetris.js の後に読み込むと、setupTouchControls を上書きします。
// <script src="tetris.js"></script>
// <script src="tetris-gestures.js"></script>

(function(){
  function setupTouchControls(game){
    // 入力対象。キャンバスが無ければ body で拾う
    var canvas = document.getElementById("board");
    var surface = canvas || document.body;

    // iOSのスクロールを抑止しやすくする
    try { surface.style.touchAction = "none"; } catch {}

    var startX = 0, startY = 0, startT = 0;
    var appliedX = 0;

    // 1マス動く距離の基準：BLOCK があればそれに準拠、なければ 24px
    function unit(){
      var u = (typeof window.BLOCK === "number" && window.BLOCK > 0) ? Math.floor(window.BLOCK * 0.6) : 24;
      return Math.max(14, Math.min(48, u)); // 暴走防止のクランプ
    }

    function getPoint(e){
      var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
      return { x: t.clientX, y: t.clientY };
    }

    function onStart(e){
      if (!game || !game.live) return;
      var p = getPoint(e);
      startX = appliedX = p.x;
      startY = p.y;
      startT = Date.now();
      e.preventDefault();
    }

    function onMove(e){
      if (!game || !game.live) return;
      var p = getPoint(e);
      var dx = p.x - appliedX;
      var u = unit();
      if (Math.abs(dx) >= u){
        var steps = (dx > 0) ? Math.floor(dx / u) : Math.ceil(dx / u);
        var dir = steps > 0 ? 1 : -1;
        var cnt = Math.abs(steps);
        for (var i=0;i<cnt;i++){
          game.curr && game.curr.move(dir, 0, game.board);
        }
        appliedX += steps * u;
        // すぐ描画すると指に追従感が出る
        if (typeof game.draw === "function") game.draw();
      }
      e.preventDefault();
    }

    function onEnd(e){
      if (!game) return;
      var p = getPoint(e);
      var dt = Date.now() - startT;
      var moved = Math.hypot(p.x - startX, p.y - startY);

      // 素早いタップ（移動ほぼなし）は回転
      if (dt <= 250 && moved < 12){
        if (game.live && game.curr) game.curr.rotate(game.board);
      }
      e.preventDefault();
    }

    // リスナー登録（タッチ＆マウス）
    surface.addEventListener("touchstart", onStart, { passive: false });
    surface.addEventListener("touchmove",  onMove,  { passive: false });
    surface.addEventListener("touchend",   onEnd,   { passive: false });
    surface.addEventListener("touchcancel",function(e){ e.preventDefault(); }, { passive:false });

    surface.addEventListener("mousedown", onStart);
    surface.addEventListener("mousemove", onMove);
    surface.addEventListener("mouseup",   onEnd);
  }

  // 既存の関数を上書き公開
  window.setupTouchControls = setupTouchControls;
})();
