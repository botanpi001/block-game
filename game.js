/* =========================================================
   純JS版 ウボンゴ2D
   - PC: 左ドラッグ→離して配置 / ダブルクリックで90°回転
   - タブレット/スマホ: 0.3秒長押し→指を離して配置 / ダブルタップで90°回転
   - 右下ボタン: 選択中ピースを90°回転
   - グリッド吸着 / シルエット内のみ配置可 / 解がない問題は出題しない
   ========================================================= */

(function(){
  // -----------------------
  // DOM / レイアウト取得
  // -----------------------
  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const tray = document.getElementById('tray');
  const rotateBtn = document.getElementById('rotateBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const resetBtn = document.getElementById('resetBtn');
  const levelLabel = document.getElementById('levelLabel');
  const toast = document.getElementById('toast');

  // 盤面セル数（内部ロジックはセル数で管理）
  const GRID = 10;  // 10x10
  // ピース色（4種類固定：T, L, I, P）
  const COLORS = {
    T: '#ff7b7b', // T(テトロミノ)
    L: '#5cc9ff', // L(テトロミノ)
    I: '#ffd166', // I(テトロミノ)
    P: '#9ae6b4', // P(ペントミノ)
  };

  // 0度形状（セル相対座標）
  const SHAPES = {
    T: [ [0,0],[1,0],[2,0],[1,1] ],                // 面積4
    L: [ [0,0],[0,1],[0,2],[1,2] ],                // 面積4
    I: [ [0,0],[1,0],[2,0],[3,0] ],                // 面積4
    P: [ [0,0],[1,0],[0,1],[1,1],[0,2] ],          // 面積5
  };

  // ---------- ユーティリティ ----------
  const key = (x,y)=>`${x},${y}`;
  const toSet = (cells)=>{ const s=new Set(); for(const [x,y] of cells) s.add(key(x,y)); return s; };
  function rotateCells(cells, times=1){
    let out = cells.map(([x,y])=>[x,y]);
    for(let t=0;t<times;t++){
      out = out.map(([x,y])=>[ y, -x ]);
      const minX = Math.min(...out.map(c=>c[0]));
      const minY = Math.min(...out.map(c=>c[1]));
      out = out.map(([x,y])=>[x-minX,y-minY]);
    }
    return out;
  }
  function bounds(cells){
    const xs = cells.map(c=>c[0]), ys=cells.map(c=>c[1]);
    return { w: Math.max(...xs)-Math.min(...xs)+1, h: Math.max(...ys)-Math.min(...ys)+1 };
  }
  function shift(cells, dx, dy){ return cells.map(([x,y])=>[x+dx,y+dy]); }
  function shapeAt(type, rot, x, y){ return shift(rotateCells(SHAPES[type], rot), x, y); }

  // ---------- キャンバス描画 ----------
  function resizeCanvas(){
    const rect = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    board.width  = Math.floor(rect.width * dpr);
    board.height = Math.floor(rect.width * dpr); // 正方形
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function drawGridAndSilhouette(){
    const rect = board.getBoundingClientRect();
    const size = rect.width;
    const cellPx = size / GRID;

    ctx.clearRect(0,0,rect.width,rect.width);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-bg');
    ctx.fillRect(0,0,rect.width,rect.width);

    // シルエット
    ctx.fillStyle = '#a7c7ff';
    for(const k of puzzle.silhouette){
      const [x,y] = k.split(',').map(Number);
      ctx.fillRect(x*cellPx, y*cellPx, cellPx, cellPx);
    }

    // グリッド
    ctx.strokeStyle = '#d3e1ef';
    ctx.lineWidth = 1;
    for(let i=0;i<=GRID;i++){
      const p = i*cellPx;
      ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,rect.width); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(rect.width,p); ctx.stroke();
    }
  }
  function drawPlacedPieces(){
    const rect = board.getBoundingClientRect();
    const cellPx = rect.width / GRID;
    piecesState.forEach(ps=>{
      if(!ps.placed) return;
      ctx.fillStyle = COLORS[ps.type];
      const cells = shapeAt(ps.type, ps.rot, ps.pos.x, ps.pos.y);
      cells.forEach(([x,y])=>{
        ctx.fillRect(x*cellPx, y*cellPx, cellPx, cellPx);
      });
    });
  }
  function drawDragPreview(ps, gx, gy){
    if(!ps) return;
    const rect = board.getBoundingClientRect();
    const cellPx = rect.width / GRID;
    const cells = shapeAt(ps.type, ps.rot, gx, gy);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = COLORS[ps.type];
    cells.forEach(([x,y])=>{
      ctx.fillRect(x*cellPx, y*cellPx, cellPx, cellPx);
    });
    ctx.restore();
  }

  // ---------- 問題定義（解→シルエット生成：必ず連結＆重なりなし） ----------
  // それぞれ 3〜4 ピース・接して埋める解を定義
  const LEVELS_RAW = [
    { // Lv1: T + L + I
      pieces:['T','L','I'],
      solution:[
        {type:'T', rot:0, x:2, y:2},
        {type:'L', rot:1, x:2, y:3},
        {type:'I', rot:1, x:5, y:2},
      ]
    },
    { // Lv2: T + P + I
      pieces:['T','P','I'],
      solution:[
        {type:'P', rot:0, x:2, y:2},
        {type:'T', rot:1, x:4, y:3},
        {type:'I', rot:1, x:6, y:1},
      ]
    },
    { // Lv3: L + P + I
      pieces:['L','P','I'],
      solution:[
        {type:'L', rot:0, x:2, y:2},
        {type:'P', rot:2, x:3, y:2},
        {type:'I', rot:0, x:2, y:5},
      ]
    },
    { // Lv4: T + L + P
      pieces:['T','L','P'],
      solution:[
        {type:'T', rot:2, x:3, y:2},
        {type:'L', rot:3, x:5, y:2},
        {type:'P', rot:1, x:2, y:3},
      ]
    },
    { // Lv5: T + L + I + P（むずかしめ）
      pieces:['T','L','I','P'],
      solution:[
        {type:'P', rot:0, x:2, y:2},
        {type:'T', rot:3, x:4, y:2},
        {type:'L', rot:2, x:6, y:2},
        {type:'I', rot:1, x:3, y:5},
      ]
    },
  ];
  function buildLevels(){
    return LEVELS_RAW.map(raw=>{
      const set = new Set();
      for(const p of raw.solution){
        const cells = shapeAt(p.type, p.rot, p.x, p.y);
        for(const [x,y] of cells){
          if(x<0||y<0||x>=GRID||y>=GRID) throw new Error('解が盤外です');
          const k = key(x,y);
          if(set.has(k)) throw new Error('解が重なっています');
          set.add(k);
        }
      }
      // 連結チェック（4近傍BFS）
      const arr = [...set];
      const nbs = [[1,0],[-1,0],[0,1],[0,-1]];
      const vis = new Set([arr[0]]);
      const q=[arr[0]];
      while(q.length){
        const cur=q.pop();
        const [cx,cy]=cur.split(',').map(Number);
        for(const [dx,dy] of nbs){
          const nk=key(cx+dx,cy+dy);
          if(set.has(nk) && !vis.has(nk)){vis.add(nk); q.push(nk);}
        }
      }
      if(vis.size!==set.size) throw new Error('シルエットが非連結です');
      return { pieces:[...raw.pieces], silhouette:set, solution:raw.solution };
    });
  }
  const LEVELS = buildLevels();

  // ---------- 状態 ----------
  let levelIndex = 0;
  let puzzle = LEVELS[levelIndex];
  let piecesState = []; // {id,type,rot,placed,pos?}
  let selectedId = null;

  // ドラッグ管理
  let dragging = null;      // {id}
  let longPressTimer = null;
  const LONG_PRESS_MS = 300;
  const lastTapTime = {};   // ダブルタップ判定（piece idごと）

  // ---------- トースト ----------
  let toastTimer=null;
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toast.classList.remove('show'), 1400);
  }

  // ---------- ピースUI生成 ----------
  function paintPieceElement(el, type, rot){
    const cells = rotateCells(SHAPES[type], rot);
    const b = bounds(cells);
    el.style.gridTemplateColumns = `repeat(${b.w}, var(--grid))`;
    el.style.gridAutoRows = `var(--grid)`;
    el.style.gap = `var(--gap)`;
    el.innerHTML = '';
    const color = COLORS[type];
    const filled = new Set(cells.map(([x,y])=>key(x,y)));
    for(let y=0;y<b.h;y++){
      for(let x=0;x<b.w;x++){
        const cell = document.createElement('div');
        cell.style.width='var(--grid)'; cell.style.height='var(--grid)';
        if(filled.has(key(x,y))){
          cell.className='cell';
          cell.style.background=color;
        }else{
          cell.style.opacity='0';
        }
        el.appendChild(cell);
      }
    }
  }
  function renderTray(){
    tray.innerHTML = '';
    piecesState.forEach(ps=>{
      if(ps.placed) return; // 置いたものはトレイから消える
      const el = document.createElement('div');
      el.className = 'piece';
      el.tabIndex = 0;
      el.dataset.id = ps.id;
      paintPieceElement(el, ps.type, ps.rot);
      addPointerHandlers(el);
      tray.appendChild(el);
    });
  }

  // ---------- 配置処理 ----------
  function canPlace(id, px, py){
    const ps = piecesState.find(p=>p.id===id);
    const cells = shapeAt(ps.type, ps.rot, px, py);
    // 盤外
    if(cells.some(([x,y])=> x<0||y<0||x>=GRID||y>=GRID)) return {ok:false, reason:'盤外です'};
    // シルエット外
    if(cells.some(([x,y])=> !puzzle.silhouette.has(key(x,y)))) return {ok:false, reason:'シルエットの外です'};
    // 重なり
    for(const other of piecesState){
      if(other.id===id || !other.placed) continue;
      const ocells = shapeAt(other.type, other.rot, other.pos.x, other.pos.y);
      const set = toSet(ocells);
      for(const [x,y] of cells){ if(set.has(key(x,y))) return {ok:false, reason:'他のピースと重なっています'}; }
    }
    return {ok:true};
  }
  function placePiece(id, px, py){
    const check = canPlace(id, px, py);
    if(!check.ok){ showToast(check.reason); return false; }
    const ps = piecesState.find(p=>p.id===id);
    ps.placed = true;
    ps.pos = {x:px, y:py};
    selectedId = id;
    refreshBoard();
    renderTray();
    checkSolved();
    return true;
  }

  function checkSolved(){
    let placedSet = new Set();
    for(const ps of piecesState){
      if(!ps.placed) return false;
      const cells = shapeAt(ps.type, ps.rot, ps.pos.x, ps.pos.y);
      for(const [x,y] of cells) placedSet.add(key(x,y));
    }
    if(placedSet.size !== puzzle.silhouette.size) return false;
    for(const k of placedSet){ if(!puzzle.silhouette.has(k)) return false; }
    showToast('🎉 正解！');
    return true;
  }

  function refreshBoard(preview){
    drawGridAndSilhouette();
    drawPlacedPieces();
    if(preview) drawDragPreview(preview.ps, preview.gx, preview.gy);
  }

  // ---------- 入力（マウス/タッチ） ----------
  function addPointerHandlers(el){
    const id = el.dataset.id;

    // PC: マウス
    el.addEventListener('mousedown', (ev)=>{
      ev.preventDefault();
      selectedId = id;
      el.classList.add('grabbing');
      dragging = { id };
      // 開始時点でプレビュー描画
      const rect = board.getBoundingClientRect();
      const gx = Math.round((ev.clientX - rect.left) / (rect.width/GRID));
      const gy = Math.round((ev.clientY - rect.top ) / (rect.width/GRID));
      const ps = piecesState.find(p=>p.id===id);
      refreshBoard({ps, gx, gy});
    });

    window.addEventListener('mousemove', (ev)=>{
      if(!dragging) return;
      const ps = piecesState.find(p=>p.id===dragging.id);
      const rect = board.getBoundingClientRect();
      const gx = Math.round((ev.clientX - rect.left) / (rect.width/GRID));
      const gy = Math.round((ev.clientY - rect.top ) / (rect.width/GRID));
      refreshBoard({ps, gx, gy});
    });

    window.addEventListener('mouseup', (ev)=>{
      if(!dragging) return;
      const ps = piecesState.find(p=>p.id===dragging.id);
      el.classList.remove('grabbing');
      const rect = board.getBoundingClientRect();
      const gx = Math.round((ev.clientX - rect.left) / (rect.width/GRID));
      const gy = Math.round((ev.clientY - rect.top ) / (rect.width/GRID));
      placePiece(ps.id, gx, gy);
      dragging = null;
    });

    // ダブルクリックで回転（1回だけ）
    el.addEventListener('dblclick', (ev)=>{
      ev.preventDefault();
      const ps = piecesState.find(p=>p.id===id);
      ps.rot = (ps.rot+1) % 4;
      paintPieceElement(el, ps.type, ps.rot);
      refreshBoard();
    });

    // モバイル: タッチ
    el.addEventListener('touchstart', (ev)=>{
      ev.preventDefault();
      const now = performance.now();
      const last = lastTapTime[id] || 0;
      if(now - last < 300){
        // ダブルタップ → 1回だけ回転
        const ps = piecesState.find(p=>p.id===id);
        ps.rot = (ps.rot+1)%4;
        paintPieceElement(el, ps.type, ps.rot);
        refreshBoard();
        lastTapTime[id] = 0;
        return;
      }
      lastTapTime[id] = now;

      selectedId = id;
      el.classList.add('grabbing');

      const touch = ev.touches[0];
      longPressTimer = setTimeout(()=>{
        dragging = { id };
        // 初回プレビュー
        const rect = board.getBoundingClientRect();
        const gx = Math.round((touch.clientX - rect.left) / (rect.width/GRID));
        const gy = Math.round((touch.clientY - rect.top ) / (rect.width/GRID));
        const ps = piecesState.find(p=>p.id===id);
        refreshBoard({ps, gx, gy});
      }, LONG_PRESS_MS);
    }, {passive:false});

    el.addEventListener('touchmove', (ev)=>{
      ev.preventDefault();
      if(!dragging) return;
      const ps = piecesState.find(p=>p.id===dragging.id);
      const rect = board.getBoundingClientRect();
      const touch = ev.touches[0];
      const gx = Math.round((touch.clientX - rect.left) / (rect.width/GRID));
      const gy = Math.round((touch.clientY - rect.top ) / (rect.width/GRID));
      refreshBoard({ps, gx, gy});
    }, {passive:false});

    el.addEventListener('touchend', (ev)=>{
      ev.preventDefault();
      clearTimeout(longPressTimer);
      el.classList.remove('grabbing');
      if(!dragging){ refreshBoard(); return; }
      const ps = piecesState.find(p=>p.id===dragging.id);
      const rect = board.getBoundingClientRect();
      const touch = ev.changedTouches[0];
      const gx = Math.round((touch.clientX - rect.left) / (rect.width/GRID));
      const gy = Math.round((touch.clientY - rect.top ) / (rect.width/GRID));
      placePiece(ps.id, gx, gy);
      dragging = null;
    }, {passive:false});
  }

  // 右下の回転ボタン（選択中のみ）
  rotateBtn.addEventListener('click', ()=>{
    if(!selectedId){ showToast('ピースを選択してください'); return; }
    const el = tray.querySelector(`.piece[data-id="${selectedId}"]`);
    const ps = piecesState.find(p=>p.id===selectedId);
    // 配置済みはトレイに要素がないので回転不可（シルエットぴったりを崩さないため）
    if(ps.placed){ showToast('配置済みのピースは回転できません'); return; }
    ps.rot = (ps.rot+1)%4;
    if(el) paintPieceElement(el, ps.type, ps.rot);
    refreshBoard();
  });

  // 前後の問題
  prevBtn.addEventListener('click', ()=>{
    initLevel((levelIndex - 1 + LEVELS.length) % LEVELS.length);
  });
  nextBtn.addEventListener('click', ()=>{
    initLevel((levelIndex + 1) % LEVELS.length);
  });
  resetBtn.addEventListener('click', ()=>{
    initLevel(levelIndex);
  });

  // ---------- 初期化 ----------
  function initLevel(i){
    levelIndex = i;
    puzzle = LEVELS[levelIndex];
    levelLabel.textContent = `問題 ${levelIndex+1} / ${LEVELS.length}`;
    piecesState = puzzle.pieces.map((type,idx)=>({
      id:`p${idx}`, type, rot:0, placed:false, pos:null
    }));
    selectedId = null;
    renderTray();
    resizeCanvas();
    refreshBoard();
    showToast('シルエットに合わせてピースを置こう！');
  }

  window.addEventListener('resize', ()=>{ resizeCanvas(); refreshBoard(); });

  // 起動
  resizeCanvas();
  initLevel(0);
})();
