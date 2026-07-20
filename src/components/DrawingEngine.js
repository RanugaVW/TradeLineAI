/**
 * DrawingEngine — TradeLine AI
 * SVG overlay providing TradingView-parity drawing tools on Lightweight Charts.
 *
 * Tools: Trend Line, Extended Line, Ray, Horizontal Line, Vertical Line,
 *        Parallel Channel, Pitchfork, Rectangle/Zone, Triangle, Ellipse,
 *        Fib Retracement, Fib Extension, Fib Fan, Fib Time Zones,
 *        Text Label, Callout Arrow, Anchored Note,
 *        Price Measure, Long Position, Short Position.
 *
 * Features: Undo/Redo (50-step), Keyboard shortcuts, Copy/Paste,
 *           Drag-to-move, Handle resize, Per-symbol localStorage,
 *           Live preview while drawing, Color/style/width per drawing.
 */
export class DrawingEngine {
  constructor(chartViewer) {
    this.cv = chartViewer;
    this.chart = chartViewer.chart;
    this.series = chartViewer.candlestickSeries;
    this.container = chartViewer.container;

    // Active tool state
    this.activeTool = 'select';
    this.activeColor = '#2196F3';
    this.activeLineWidth = 2;
    this.activeLineStyle = 'solid'; // 'solid' | 'dashed' | 'dotted'
    this.activeFill = 'rgba(33,150,243,0.10)';

    // Drawing store
    this.drawings = [];
    this.selectedIds = new Set();
    this.hoveredId = null;

    // Drawing state machine
    this.isDrawing = false;
    this.tempPoints = [];
    this.previewPoint = null;

    // Drag state
    this.isDragging = false;
    this.dragInfo = null;

    // Undo / Redo
    this.undoStack = [];
    this.redoStack = [];

    // Clipboard
    this._clipboard = [];

    // Internal
    this._nextId = 1;
    this._animFrame = null;
    this._symbolKey = '';

    // SVG layers
    this.svgEl = null;
    this.drawingsGroup = null;
    this.previewGroup = null;
    this.handlesGroup = null;
    this.overlayRect = null; // Transparent click-catcher in drawing mode

    this._initSVG();
    this._initListeners();
  }

  // =========================================================
  // 1. SVG INIT
  // =========================================================

  _initSVG() {
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(this.svgEl.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      overflow: 'visible', zIndex: '10',
      pointerEvents: 'none',
    });
    this.svgEl.id = 'drawing-overlay-svg';

    // Defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.svgEl.appendChild(defs);

    // Transparent overlay rect (only active in drawing mode to capture clicks)
    this.overlayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.overlayRect.setAttribute('x', 0); this.overlayRect.setAttribute('y', 0);
    this.overlayRect.setAttribute('width', '100%'); this.overlayRect.setAttribute('height', '100%');
    this.overlayRect.setAttribute('fill', 'transparent');
    this.overlayRect.style.pointerEvents = 'none';
    this.svgEl.appendChild(this.overlayRect);

    this.drawingsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.previewGroup  = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.handlesGroup  = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svgEl.appendChild(this.drawingsGroup);
    this.svgEl.appendChild(this.previewGroup);
    this.svgEl.appendChild(this.handlesGroup);

    this.container.appendChild(this.svgEl);
  }

  // =========================================================
  // 2. COORDINATE HELPERS
  // =========================================================

  _priceToY(price) { return this.series.priceToCoordinate(price); }
  _yToPrice(y)     { return this.series.coordinateToPrice(y); }
  _timeToX(time)   { return this.chart.timeScale().timeToCoordinate(time); }
  _xToTime(x)      { return this.chart.timeScale().coordinateToTime(x); }

  _getXY(e) {
    const rect = this.container.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  _xyToChart(x, y) {
    return { time: this._xToTime(x), price: this._yToPrice(y) };
  }

  // =========================================================
  // 3. EVENT LISTENERS
  // =========================================================

  _initListeners() {
    // Capture phase: we get events BEFORE the chart canvas, allowing us to block pan/zoom during drawing
    this.container.addEventListener('mousedown',  this._onMouseDown.bind(this),  { capture: true });
    this.container.addEventListener('touchstart', this._onTouchStart.bind(this), { capture: true, passive: false });
    document.addEventListener('mousemove', this._onMouseMove.bind(this));
    document.addEventListener('mouseup',   this._onMouseUp.bind(this));
    document.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend',  this._onTouchEnd.bind(this));

    this.container.addEventListener('dblclick',     this._onDblClick.bind(this));
    this.container.addEventListener('contextmenu',  this._onRightClick.bind(this));

    // Global keyboard
    document.addEventListener('keydown', this._onKeyDown.bind(this));

    // Chart viewport → re-render drawings
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._scheduleRender());

    // Crosshair move → preview
    this.chart.subscribeCrosshairMove((param) => {
      if (param?.point) {
        this.previewPoint = param.point;
        if (this.isDrawing) this._scheduleRender();
      }
    });

    // Resize
    new ResizeObserver(() => this._scheduleRender()).observe(this.container);
  }

  _scheduleRender() {
    if (this._animFrame) return;
    this._animFrame = requestAnimationFrame(() => { this._animFrame = null; this._renderAll(); });
  }

  // Mouse / Touch
  _onMouseDown(e) {
    if (e.button !== 0) return;
    const pt = this._getXY(e);
    const cpt = this._xyToChart(pt.x, pt.y);

    if (this.activeTool !== 'select') {
      e.stopPropagation(); e.preventDefault();
      if (cpt.time == null || cpt.price == null) return;
      this._handleDrawClick(pt, cpt);
    } else {
      const hit = this._hitTest(pt.x, pt.y);
      if (hit) {
        e.stopPropagation();
        this._selectHit(hit, e, cpt, pt);
      }
    }
  }

  _onMouseMove(e) {
    const pt = this._getXY(e);
    if (this.isDragging) { e.preventDefault(); this._doDrag(pt); return; }
    if (this.isDrawing)  { this.previewPoint = pt; this._scheduleRender(); return; }
    if (this.activeTool === 'select') {
      const hit = this._hitTest(pt.x, pt.y);
      const newId = hit?.id ?? null;
      if (newId !== this.hoveredId) {
        this.hoveredId = newId;
        this.container.style.cursor = hit ? 'pointer' : '';
        this._scheduleRender();
      }
    }
  }

  _onMouseUp(e) { if (this.isDragging) this._endDrag(); }

  _onTouchStart(e) {
    if (this.activeTool !== 'select') { e.preventDefault(); }
    const pt = this._getXY(e);
    const cpt = this._xyToChart(pt.x, pt.y);
    if (this.activeTool !== 'select') {
      e.stopPropagation();
      if (cpt.time != null && cpt.price != null) this._handleDrawClick(pt, cpt);
    }
  }
  _onTouchMove(e) {
    const pt = this._getXY(e);
    if (this.isDragging) { e.preventDefault(); this._doDrag(pt); return; }
    if (this.isDrawing) { this.previewPoint = pt; this._scheduleRender(); }
  }
  _onTouchEnd(e) { if (this.isDragging) this._endDrag(); }

  _onDblClick(e) {
    const pt = this._getXY(e);
    if (this.isDrawing && this.tempPoints.length >= 2) {
      const cpt = this._xyToChart(pt.x, pt.y);
      this._finishDrawing(cpt); return;
    }
    if (this.activeTool === 'select') {
      const hit = this._hitTest(pt.x, pt.y);
      if (hit && ['text','callout','note'].includes(this.drawings.find(d=>d.id===hit.id)?.type)) {
        this._editText(hit.id);
      }
    }
  }

  _onRightClick(e) {
    if (this.isDrawing) { e.preventDefault(); this._cancelDraw(); }
  }

  _onKeyDown(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const inInput = e.target.matches('input,textarea,select,[contenteditable]');

    if (ctrl && !shift && e.key === 'z') { e.preventDefault(); this.undo(); return; }
    if (ctrl && shift && e.key === 'z')  { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.key === 'y')           { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.key === 'a' && !inInput) { e.preventDefault(); this._selectAll(); return; }
    if (ctrl && e.key === 'c' && !inInput) { this._copy(); return; }
    if (ctrl && e.key === 'v' && !inInput) { this._paste(); return; }

    if (e.key === 'Escape') {
      if (this.isDrawing) this._cancelDraw();
      else this._deselectAll();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      e.preventDefault(); this._deleteSelected();
    }
  }

  // =========================================================
  // 4. DRAWING STATE MACHINE
  // =========================================================

  _TOOL_CLICKS = {
    trendline: 2, 'extended-line': 2, ray: 2, fib: 2, 'fib-ext': 2,
    measure: 2, callout: 2, channel: 3, pitchfork: 3, triangle: 3, 'fib-fan': 3,
    horizontal: 1, vertical: 1, text: 1, note: 1, long: 3, short: 3,
    zone: 2, ellipse: 2, 'fib-time': 2,
  };

  _handleDrawClick(pt, cpt) {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.tempPoints = [cpt];
    } else {
      this.tempPoints.push(cpt);
    }
    const needed = this._TOOL_CLICKS[this.activeTool] ?? 2;
    if (this.tempPoints.length >= needed) {
      this._finishDrawing(cpt);
    }
    this._scheduleRender();
  }

  _finishDrawing() {
    const type = this.activeTool;
    let points = [...this.tempPoints];

    // Normalise horizontal/vertical to just what they need
    if (type === 'horizontal') points = [{ time: points[0].time, price: points[0].price }];
    if (type === 'vertical')   points = [{ time: points[0].time, price: points[0].price }];

    const drawing = {
      id: `d_${this._nextId++}`,
      type,
      points,
      style: {
        color: this.activeColor,
        lineWidth: this.activeLineWidth,
        lineStyle: this.activeLineStyle,
        fill: this.activeFill,
      },
      text: ['text','callout','note'].includes(type) ? '' : undefined,
    };

    this.isDrawing = false;
    this.tempPoints = [];
    this.previewPoint = null;

    if (['text','callout','note'].includes(type)) {
      this._promptText(drawing);
    } else {
      this._snapshot();
      this.drawings.push(drawing);
      this.selectedIds = new Set([drawing.id]);
      this._saveToStorage();
      this._scheduleRender();
    }
  }

  _cancelDraw() {
    this.isDrawing = false;
    this.tempPoints = [];
    this.previewPoint = null;
    this._scheduleRender();
  }

  // =========================================================
  // 5. SELECTION & DRAG
  // =========================================================

  _selectHit(hit, e, cpt, pt) {
    if (!e.shiftKey && !this.selectedIds.has(hit.id)) this.selectedIds.clear();
    this.selectedIds.add(hit.id);
    this._scheduleRender();

    this.isDragging = true;
    this.dragInfo = {
      id: hit.id,
      isHandle: hit.handleIndex != null,
      handleIndex: hit.handleIndex,
      startCpt: cpt,
      startPt: pt,
      snapshot: JSON.parse(JSON.stringify(this.drawings)),
    };
  }

  _doDrag(pt) {
    const { id, isHandle, handleIndex, startCpt, snapshot } = this.dragInfo;
    const cpt = this._xyToChart(pt.x, pt.y);
    if (cpt.time == null || cpt.price == null) return;

    const drawing = this.drawings.find(d => d.id === id);
    const orig = snapshot.find(d => d.id === id);
    if (!drawing || !orig) return;

    if (isHandle) {
      const op = orig.points[handleIndex];
      drawing.points[handleIndex] = {
        time:  cpt.time  ?? op.time,
        price: cpt.price ?? op.price,
      };
    } else {
      const dt = (cpt.time  ?? startCpt.time)  - (startCpt.time  ?? 0);
      const dp = (cpt.price ?? startCpt.price) - (startCpt.price ?? 0);
      drawing.points = orig.points.map(p => ({
        time:  p.time  != null ? p.time  + dt : null,
        price: p.price != null ? p.price + dp : null,
      }));
    }
    this._scheduleRender();
  }

  _endDrag() {
    if (this.isDragging) { this._snapshot(); this._saveToStorage(); }
    this.isDragging = false;
    this.dragInfo = null;
  }

  // =========================================================
  // 6. HIT TESTING
  // =========================================================

  _hitTest(mx, my) {
    // Handles first (highest priority)
    for (const id of this.selectedIds) {
      const d = this.drawings.find(x => x.id === id);
      if (!d) continue;
      const handles = this._handlePositions(d);
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i];
        if (h && Math.hypot(mx - h.x, my - h.y) <= 9) return { id, handleIndex: i };
      }
    }
    // Bodies (reverse order = top drawing first)
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      if (this._nearDrawing(this.drawings[i], mx, my)) return { id: this.drawings[i].id };
    }
    return null;
  }

  _handlePositions(d) {
    return d.points.map(p => {
      const x = p.time  != null ? this._timeToX(p.time)  : null;
      const y = p.price != null ? this._priceToY(p.price) : null;
      return (x != null && y != null) ? { x, y } : null;
    });
  }

  _nearDrawing(d, mx, my) {
    const pts = d.points.map(p => ({
      x: p.time  != null ? this._timeToX(p.time)  : null,
      y: p.price != null ? this._priceToY(p.price) : null,
    })).filter(p => p.x != null && p.y != null);

    if (pts.length === 0) return false;
    const T = 10; // threshold px

    if (d.type === 'horizontal') return pts[0].y != null && Math.abs(my - pts[0].y) < T;
    if (d.type === 'vertical')   return pts[0].x != null && Math.abs(mx - pts[0].x) < T;
    if (d.type === 'text' || d.type === 'note') return pts[0] && Math.hypot(mx-pts[0].x, my-pts[0].y) < 24;

    if (['zone','long','short','ellipse'].includes(d.type) && pts.length >= 2) {
      const x0=Math.min(...pts.map(p=>p.x)), x1=Math.max(...pts.map(p=>p.x));
      const y0=Math.min(...pts.map(p=>p.y)), y1=Math.max(...pts.map(p=>p.y));
      if (mx>=x0-T && mx<=x1+T && my>=y0-T && my<=y1+T) return true;
    }
    if (d.type === 'triangle' && pts.length >= 3) {
      if (this._pointInPoly(mx, my, pts)) return true;
    }

    // Line segment(s)
    for (let i = 0; i < pts.length - 1; i++) {
      if (this._segDist(mx,my,pts[i],pts[i+1]) < T) return true;
    }
    // Fib / channel: check all pairs
    if (pts.length === 2 && ['fib','fib-ext','measure','channel'].includes(d.type)) {
      if (this._segDist(mx,my,pts[0],pts[1]) < T) return true;
    }
    return false;
  }

  _segDist(px, py, a, b) {
    const dx = b.x-a.x, dy = b.y-a.y;
    const l2 = dx*dx+dy*dy;
    if (l2 === 0) return Math.hypot(px-a.x, py-a.y);
    const t = Math.max(0, Math.min(1, ((px-a.x)*dx+(py-a.y)*dy)/l2));
    return Math.hypot(px-(a.x+t*dx), py-(a.y+t*dy));
  }

  _pointInPoly(px, py, pts) {
    let inside = false;
    for (let i=0, j=pts.length-1; i<pts.length; j=i++) {
      if (((pts[i].y>py)!==(pts[j].y>py)) &&
          (px < (pts[j].x-pts[i].x)*(py-pts[i].y)/(pts[j].y-pts[i].y)+pts[i].x))
        inside = !inside;
    }
    return inside;
  }

  // =========================================================
  // 7. UNDO / REDO
  // =========================================================

  _snapshot() {
    this.undoStack.push(JSON.stringify(this.drawings));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.drawings));
    this.drawings = JSON.parse(this.undoStack.pop());
    this.selectedIds.clear();
    this._saveToStorage(); this._scheduleRender();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.drawings));
    this.drawings = JSON.parse(this.redoStack.pop());
    this.selectedIds.clear();
    this._saveToStorage(); this._scheduleRender();
  }

  // =========================================================
  // 8. CLIPBOARD / SELECTION HELPERS
  // =========================================================

  _selectAll()  { this.selectedIds = new Set(this.drawings.map(d=>d.id)); this._scheduleRender(); }
  _deselectAll(){ this.selectedIds.clear(); this._scheduleRender(); }

  _deleteSelected() {
    if (!this.selectedIds.size) return;
    this._snapshot();
    this.drawings = this.drawings.filter(d => !this.selectedIds.has(d.id));
    this.selectedIds.clear();
    this._saveToStorage(); this._scheduleRender();
  }

  _copy() {
    this._clipboard = this.drawings
      .filter(d => this.selectedIds.has(d.id))
      .map(d => JSON.parse(JSON.stringify(d)));
  }

  _paste() {
    if (!this._clipboard.length) return;
    this._snapshot();
    const offset = 0.002;
    const pasted = this._clipboard.map(d => ({
      ...JSON.parse(JSON.stringify(d)),
      id: `d_${this._nextId++}`,
      points: d.points.map(p => ({ ...p, price: p.price != null ? p.price*(1+offset) : p.price })),
    }));
    this.drawings.push(...pasted);
    this.selectedIds = new Set(pasted.map(d=>d.id));
    this._saveToStorage(); this._scheduleRender();
  }

  // =========================================================
  // 9. SVG HELPERS
  // =========================================================

  _el(tag, attrs={}, style={}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const [k,v] of Object.entries(style)) e.style[k] = v;
    return e;
  }

  _line(x1,y1,x2,y2,stroke,sw,dash) {
    const el = this._el('line',{x1,y1,x2,y2,stroke,'stroke-width':sw,'stroke-linecap':'round'});
    if (dash && dash!=='none') el.setAttribute('stroke-dasharray', dash);
    return el;
  }

  _rect(x,y,w,h,fill,stroke,sw,rx=0) {
    return this._el('rect',{x,y,width:Math.max(0,w),height:Math.max(0,h),fill:fill||'none',stroke:stroke||'none','stroke-width':sw||0,rx});
  }

  _txt(x,y,text,fill,size=10,anchor='start') {
    const e = this._el('text',{x,y,fill,'font-size':size,'font-family':'Inter,sans-serif','text-anchor':anchor,'dominant-baseline':'middle'});
    e.textContent = text;
    return e;
  }

  _hitbox(x1,y1,x2,y2) {
    const l = this._el('line',{x1,y1,x2,y2,stroke:'transparent','stroke-width':16,cursor:'pointer'},{ pointerEvents:'all' });
    return l;
  }

  _dash(style) {
    return style==='dashed'?'8,4': style==='dotted'?'2,4':'none';
  }

  // =========================================================
  // 10. RENDER ENGINE
  // =========================================================

  _renderAll() {
    if (!this.svgEl) return;
    const W = this.container.clientWidth, H = this.container.clientHeight;
    this.svgEl.setAttribute('width', W);
    this.svgEl.setAttribute('height', H);
    this.svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    this.drawingsGroup.innerHTML = '';
    this.previewGroup.innerHTML  = '';
    this.handlesGroup.innerHTML  = '';

    this.drawings.forEach(d => {
      const el = this._renderDrawing(d, W, H);
      if (el) this.drawingsGroup.appendChild(el);
    });

    if (this.isDrawing) {
      const prev = this._renderPreview(W, H);
      if (prev) this.previewGroup.appendChild(prev);
    }

    this.selectedIds.forEach(id => {
      const d = this.drawings.find(x => x.id === id);
      if (d) { const h = this._renderHandles(d); if (h) this.handlesGroup.appendChild(h); }
    });

    // Pointer events: all when drawing, else only on individual elements
    this.svgEl.style.pointerEvents = this.activeTool !== 'select' ? 'all' : 'none';
    this.overlayRect.style.pointerEvents = this.activeTool !== 'select' ? 'all' : 'none';
  }

  _renderDrawing(d, W, H) {
    const sel  = this.selectedIds.has(d.id);
    const hov  = this.hoveredId === d.id;
    const s    = d.style;
    const stroke = sel ? '#FFFFFF' : hov ? '#64B5F6' : s.color;
    const sw   = (s.lineWidth||2) + (sel ? 1 : 0);
    const dash = this._dash(s.lineStyle);

    const g = this._el('g', {'data-id': d.id}, { cursor: this.activeTool==='select'?'pointer':'crosshair' });

    const dispatch = {
      trendline:      () => this._drawLine(g,d,stroke,sw,dash,false,false,W,H),
      'extended-line':() => this._drawLine(g,d,stroke,sw,dash,true, true, W,H),
      ray:            () => this._drawLine(g,d,stroke,sw,dash,false,true, W,H),
      horizontal:     () => this._drawHorizontal(g,d,stroke,sw,dash,W),
      vertical:       () => this._drawVertical(g,d,stroke,sw,dash,H),
      channel:        () => this._drawChannel(g,d,stroke,sw,dash),
      pitchfork:      () => this._drawPitchfork(g,d,stroke,sw,W),
      zone:           () => this._drawZone(g,d,stroke,sw),
      triangle:       () => this._drawTriangle(g,d,stroke,sw,dash),
      ellipse:        () => this._drawEllipse(g,d,stroke,sw,dash),
      fib:            () => this._drawFib(g,d,W),
      'fib-ext':      () => this._drawFibExt(g,d,W),
      'fib-fan':      () => this._drawFibFan(g,d,stroke,W,H),
      'fib-time':     () => this._drawFibTime(g,d,stroke,H),
      text:           () => this._drawText(g,d,stroke),
      callout:        () => this._drawCallout(g,d,stroke,sw),
      note:           () => this._drawNote(g,d,stroke),
      measure:        () => this._drawMeasure(g,d,W),
      long:           () => this._drawPosition(g,d,true, W),
      short:          () => this._drawPosition(g,d,false,W),
    };
    (dispatch[d.type] || (() => {}))();
    return g;
  }

  // --- Line tools ---
  _drawLine(g,d,stroke,sw,dash,extLeft,extRight,W) {
    if (d.points.length<2) return;
    const [p1,p2] = d.points;
    let x1=this._timeToX(p1.time), y1=this._priceToY(p1.price);
    let x2=this._timeToX(p2.time), y2=this._priceToY(p2.price);
    if (x1==null||y1==null||x2==null||y2==null) return;

    const dx=x2-x1, dy=y2-y1;
    if ((extLeft||extRight) && dx!==0) {
      const slope = dy/dx;
      if (extLeft)  { y1 = y2 - slope*x2; x1=0; }
      if (extRight) { y2 = y1 + slope*(W-x1); x2=W; }
    }
    g.appendChild(this._hitbox(x1,y1,x2,y2));
    g.appendChild(this._line(x1,y1,x2,y2,stroke,sw,dash));

    // Price label at right end
    const lx=Math.max(x1,x2), ly=(x2>=x1)?y2:y1;
    const pr = this._yToPrice(ly);
    if (pr!=null) {
      g.appendChild(this._rect(lx+2,ly-9,60,18,stroke,'none',0,3));
      g.appendChild(this._txt(lx+5,ly,`$${pr.toFixed(4)}`,'#fff',9));
    }
  }

  _drawHorizontal(g,d,stroke,sw,dash,W) {
    const p = d.points[0];
    const y = this._priceToY(p.price);
    if (y==null) return;
    g.appendChild(this._hitbox(0,y,W,y));
    g.appendChild(this._line(0,y,W,y,stroke,sw,dash));
    g.appendChild(this._rect(W-66,y-9,64,18,stroke,'none',0,3));
    g.appendChild(this._txt(W-63,y,`$${p.price.toFixed(4)}`,'#fff',9));
  }

  _drawVertical(g,d,stroke,sw,dash,H) {
    const p = d.points[0];
    const x = this._timeToX(p.time);
    if (x==null) return;
    g.appendChild(this._hitbox(x,0,x,H));
    g.appendChild(this._line(x,0,x,H,stroke,sw,dash));
    const dt = new Date(p.time*1000);
    const lbl = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    g.appendChild(this._rect(x-36,H-19,74,16,stroke,'none',0,3));
    g.appendChild(this._txt(x,H-11,lbl,'#fff',9,'middle'));
  }

  _drawChannel(g,d,stroke,sw,dash) {
    if (d.points.length<3) return;
    const [p1,p2,p3] = d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    const x3=this._timeToX(p3.time),y3=this._priceToY(p3.price);
    if (x1==null||y1==null||x2==null||y2==null||x3==null||y3==null) return;
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    const dot=(x3-x1)*nx+(y3-y1)*ny;
    const ox=dot*nx,oy=dot*ny;
    g.appendChild(this._line(x1,y1,x2,y2,stroke,sw,dash));
    g.appendChild(this._line(x1+ox,y1+oy,x2+ox,y2+oy,stroke,sw,dash));
    const poly=this._el('polygon',{points:`${x1},${y1} ${x2},${y2} ${x2+ox},${y2+oy} ${x1+ox},${y1+oy}`,fill:d.style.fill||'rgba(33,150,243,0.06)',stroke:'none'},{pointerEvents:'all'});
    g.appendChild(poly);
  }

  _drawPitchfork(g,d,stroke,sw,W) {
    if (d.points.length<3) return;
    const [p1,p2,p3] = d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    const x3=this._timeToX(p3.time),y3=this._priceToY(p3.price);
    if (!x1||!y1||!x2||!y2||!x3||!y3) return;
    const mx=(x2+x3)/2,my=(y2+y3)/2;
    const dx=mx-x1,dy=my-y1;
    const t=(W-x1)/(dx||1);
    g.appendChild(this._line(x1,y1,x1+t*dx,y1+t*dy,stroke,sw,'none'));
    g.appendChild(this._line(x2,y2,x2+t*dx,y2+t*dy,stroke,sw,'6,3'));
    g.appendChild(this._line(x3,y3,x3+t*dx,y3+t*dy,stroke,sw,'6,3'));
    g.appendChild(this._line(x2,y2,x3,y3,stroke,sw,'4,4'));
  }

  _drawZone(g,d,stroke,sw) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    if (x1==null||y1==null||x2==null||y2==null) return;
    const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.abs(y2-y1);
    const r=this._rect(rx,ry,rw,rh,d.style.fill||'rgba(33,150,243,0.10)',stroke,sw,2);
    r.style.pointerEvents='all'; g.appendChild(r);
    g.appendChild(this._txt(rx+4,ry+10,`$${p1.price.toFixed(4)}`,stroke,9));
    g.appendChild(this._txt(rx+4,ry+rh-2,`$${p2.price.toFixed(4)}`,stroke,9));
  }

  _drawTriangle(g,d,stroke,sw,dash) {
    if (d.points.length<3) return;
    const pts=d.points.map(p=>({x:this._timeToX(p.time),y:this._priceToY(p.price)}));
    if (pts.some(p=>p.x==null||p.y==null)) return;
    const poly=this._el('polygon',{points:pts.map(p=>`${p.x},${p.y}`).join(' '),fill:d.style.fill||'rgba(33,150,243,0.07)',stroke,
      'stroke-width':sw,'stroke-dasharray':this._dash(d.style.lineStyle)},{ pointerEvents:'all' });
    g.appendChild(poly);
  }

  _drawEllipse(g,d,stroke,sw,dash) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    if (x1==null||y1==null||x2==null||y2==null) return;
    const cx=(x1+x2)/2,cy=(y1+y2)/2,rx=Math.abs(x2-x1)/2,ry=Math.abs(y2-y1)/2;
    const el=this._el('ellipse',{cx,cy,rx,ry,fill:d.style.fill||'rgba(33,150,243,0.07)',stroke,'stroke-width':sw},{pointerEvents:'all'});
    if (dash&&dash!=='none') el.setAttribute('stroke-dasharray',dash);
    g.appendChild(el);
  }

  // --- Fibonacci tools ---
  _FIB_LEVELS = [
    { r:0,     lbl:'0.000',      col:'#ef5350' },
    { r:0.236, lbl:'0.236',      col:'#ff9800' },
    { r:0.382, lbl:'0.382',      col:'#ffeb3b' },
    { r:0.5,   lbl:'0.500',      col:'#4caf50' },
    { r:0.618, lbl:'0.618 ✦ GP',  col:'#00bcd4' },
    { r:0.65,  lbl:'0.650 GP',   col:'#2196f3' },
    { r:0.786, lbl:'0.786',      col:'#9c27b0' },
    { r:1.0,   lbl:'1.000',      col:'#ef5350' },
  ];

  _drawFib(g,d,W) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),x2=this._timeToX(p2.time);
    if (x1==null||x2==null) return;
    const high=Math.max(p1.price,p2.price), low=Math.min(p1.price,p2.price), range=high-low;
    const lx=Math.min(x1,x2);

    this._FIB_LEVELS.forEach(lv => {
      const price=high-lv.r*range;
      const y=this._priceToY(price);
      if (y==null) return;
      g.appendChild(this._line(lx,y,W,y,lv.col,1,'6,3'));
      g.appendChild(this._rect(W-88,y-9,86,18,'rgba(9,13,22,0.80)','none',0,3));
      g.appendChild(this._txt(W-85,y,`${lv.lbl}  $${price.toFixed(5)}`,lv.col,9));
      g.appendChild(this._txt(lx+3,y-7,lv.lbl,lv.col,8));
    });
    // Anchor line
    const ay1=this._priceToY(p1.price),ay2=this._priceToY(p2.price);
    if (ay1!=null&&ay2!=null) g.appendChild(this._line(x1,ay1,x2,ay2,d.style.color,1,'none'));
  }

  _FIB_EXT_LEVELS = [
    { r:1.0,   lbl:'1.000', col:'#ef5350' },
    { r:1.272, lbl:'1.272', col:'#ff9800' },
    { r:1.618, lbl:'1.618 ✦', col:'#ffeb3b' },
    { r:2.0,   lbl:'2.000', col:'#4caf50' },
    { r:2.618, lbl:'2.618', col:'#00bcd4' },
    { r:3.618, lbl:'3.618', col:'#2196f3' },
  ];

  _drawFibExt(g,d,W) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const up=p2.price>p1.price;
    const high=Math.max(p1.price,p2.price), low=Math.min(p1.price,p2.price), range=high-low;

    this._FIB_EXT_LEVELS.forEach(lv => {
      const price=up ? low+lv.r*range : high-lv.r*range;
      const y=this._priceToY(price);
      if (y==null) return;
      g.appendChild(this._line(0,y,W,y,lv.col,1,'6,3'));
      g.appendChild(this._rect(W-86,y-9,84,18,'rgba(9,13,22,0.80)','none',0,3));
      g.appendChild(this._txt(W-83,y,`${lv.lbl}  $${price.toFixed(5)}`,lv.col,9));
    });
  }

  _drawFibFan(g,d,stroke,W,H) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    if (!x1||!y1||!x2||!y2) return;
    const ratios=[0.236,0.382,0.5,0.618,0.786];
    const cols=['#ff9800','#ffeb3b','#4caf50','#00bcd4','#9c27b0'];
    const rangeY=y2-y1,rangeX=x2-x1;
    ratios.forEach((r,i)=>{
      const ty=y1+r*rangeY, dx=x2-x1, dy=ty-y1;
      const t=(W-x1)/(dx||1);
      g.appendChild(this._line(x1,y1,x1+t*dx,y1+t*dy,cols[i],1,'6,3'));
      g.appendChild(this._txt(Math.min(W-30,x1+t*dx+4),y1+t*dy-7,`${r}`,cols[i],9));
    });
  }

  _drawFibTime(g,d,stroke,H) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),x2=this._timeToX(p2.time);
    if (!x1||!x2) return;
    const step=x2-x1;
    const fibs=[1,2,3,5,8,13,21];
    const cols=['#ef5350','#ff9800','#ffeb3b','#4caf50','#00bcd4','#2196f3','#9c27b0'];
    fibs.forEach((n,i)=>{
      const x=x1+n*step;
      g.appendChild(this._line(x,0,x,H,cols[i],1,'6,3'));
      g.appendChild(this._txt(x+3,24,`${n}`,cols[i],9));
    });
  }

  // --- Annotation tools ---
  _drawText(g,d,stroke) {
    const p=d.points[0];
    const x=this._timeToX(p.time),y=this._priceToY(p.price);
    if (x==null||y==null) return;
    const lines=(d.text||'Text').split('\n');
    const lh=16, maxW=Math.max(...lines.map(l=>l.length*7.5),40)+12;
    const bg=this._rect(x-4,y-lh*lines.length/2-4,maxW,lh*lines.length+8,'rgba(12,20,36,0.88)',stroke,1,4);
    bg.style.pointerEvents='all'; g.appendChild(bg);
    lines.forEach((line,i)=>{
      g.appendChild(this._txt(x,y-lh*(lines.length/2-i-0.5),line,stroke,12));
    });
  }

  _drawCallout(g,d,stroke,sw) {
    if (d.points.length<2) return;
    const [pa,pl]=d.points;
    const ax=this._timeToX(pa.time),ay=this._priceToY(pa.price);
    const lx=this._timeToX(pl.time),ly=this._priceToY(pl.price);
    if (ax==null||ay==null||lx==null||ly==null) return;
    g.appendChild(this._line(ax,ay,lx,ly,stroke,sw,'none'));
    const ang=Math.atan2(ay-ly,ax-lx),al=10,aa=0.4;
    const arr=this._el('polygon',{points:`${ax},${ay} ${ax-al*Math.cos(ang-aa)},${ay-al*Math.sin(ang-aa)} ${ax-al*Math.cos(ang+aa)},${ay-al*Math.sin(ang+aa)}`,fill:stroke,stroke:'none'});
    g.appendChild(arr);
    const text=d.text||'Note';
    const tw=text.length*7.5+12;
    const bg=this._rect(lx-4,ly-11,tw,22,'rgba(12,20,36,0.88)',stroke,1,4);
    bg.style.pointerEvents='all'; g.appendChild(bg);
    g.appendChild(this._txt(lx,ly,text,stroke,11));
  }

  _drawNote(g,d,stroke) {
    const p=d.points[0];
    const x=this._timeToX(p.time),y=this._priceToY(p.price);
    if (x==null||y==null) return;
    const c=this._el('circle',{cx:x,cy:y,r:10,fill:stroke,stroke:'rgba(255,255,255,0.3)','stroke-width':2},{pointerEvents:'all',cursor:'pointer'});
    g.appendChild(c);
    const icon=this._txt(x,y,'✎','#fff',11,'middle');
    g.appendChild(icon);
    if (this.selectedIds.has(d.id)&&d.text) {
      const tw=d.text.length*7.5+12;
      const bg=this._rect(x+14,y-11,Math.max(tw,40),22,'rgba(12,20,36,0.9)',stroke,1,4);
      g.appendChild(bg);
      g.appendChild(this._txt(x+18,y,d.text,stroke,11));
    }
  }

  _drawMeasure(g,d,W) {
    if (d.points.length<2) return;
    const [p1,p2]=d.points;
    const x1=this._timeToX(p1.time),y1=this._priceToY(p1.price);
    const x2=this._timeToX(p2.time),y2=this._priceToY(p2.price);
    if (x1==null||y1==null||x2==null||y2==null) return;

    const dp=p2.price-p1.price;
    const pct=((dp/p1.price)*100).toFixed(2);
    const col=dp>=0?'#4caf50':'#ef5350';
    const fill=dp>=0?'rgba(76,175,80,0.09)':'rgba(239,83,80,0.09)';

    const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.abs(y2-y1);
    const box=this._rect(rx,ry,rw,rh,fill,col,1,2);
    box.style.pointerEvents='all'; g.appendChild(box);
    g.appendChild(this._line(rx,y1,rx+rw,y1,col,1,'none'));
    g.appendChild(this._line(rx,y2,rx+rw,y2,col,1,'none'));
    g.appendChild(this._line(x2,y1,x2,y2,col,1,'none'));

    const cx=(x1+x2)/2,cy=(y1+y2)/2;
    const bars=Math.round(Math.abs(p2.time-p1.time)/3600);
    const lbl=`${dp>=0?'+':''}${pct}%  |  $${Math.abs(dp).toFixed(5)}  |  ${bars}h`;
    const tw=lbl.length*7+12;
    g.appendChild(this._rect(cx-tw/2,cy-10,tw,20,'rgba(9,13,22,0.90)',col,1,4));
    g.appendChild(this._txt(cx,cy,lbl,col,11,'middle'));
  }

  _drawPosition(g,d,isLong,W) {
    if (d.points.length<1) return;
    const ep=d.points[0], tpp=d.points[1], slp=d.points[2];
    const ye=this._priceToY(ep.price);
    if (ye==null) return;
    const xe=this._timeToX(ep.time)||W*0.1;
    const profCol='#4caf50', lossCol='#ef5350', entCol='#2196f3';

    // Entry line
    g.appendChild(this._line(xe,ye,W,ye,entCol,2,'none'));
    g.appendChild(this._rect(W-80,ye-10,78,20,entCol,'none',0,3));
    g.appendChild(this._txt(W-77,ye,`Entry $${ep.price.toFixed(5)}`,'#fff',9));

    if (tpp) {
      const ytp=this._priceToY(tpp.price);
      if (ytp!=null) {
        const ry=Math.min(ye,ytp),rh=Math.abs(ytp-ye);
        g.appendChild(this._rect(xe,ry,W-xe,rh,'rgba(76,175,80,0.12)',profCol,1,0));
        g.appendChild(this._line(xe,ytp,W,ytp,profCol,2,'none'));
        const rr=slp ? (Math.abs(tpp.price-ep.price)/Math.abs(ep.price-slp.price)).toFixed(2) : '—';
        g.appendChild(this._rect(W-80,ytp-10,78,20,profCol,'none',0,3));
        g.appendChild(this._txt(W-77,ytp,`TP $${tpp.price.toFixed(5)} R:${rr}`,'#fff',9));
      }
    }

    if (slp) {
      const ysl=this._priceToY(slp.price);
      if (ysl!=null) {
        const ry=Math.min(ye,ysl),rh=Math.abs(ysl-ye);
        g.appendChild(this._rect(xe,ry,W-xe,rh,'rgba(239,83,80,0.12)',lossCol,1,0));
        g.appendChild(this._line(xe,ysl,W,ysl,lossCol,2,'none'));
        g.appendChild(this._rect(W-80,ysl-10,78,20,lossCol,'none',0,3));
        g.appendChild(this._txt(W-77,ysl,`SL $${slp.price.toFixed(5)}`,'#fff',9));
      }
    }
  }

  // --- Preview while drawing ---
  _renderPreview(W,H) {
    if (!this.tempPoints.length) return null;
    const g = this._el('g',{opacity:'0.55'});
    const last=this.tempPoints[this.tempPoints.length-1];
    const pp=this.previewPoint;
    if (!pp) return null;
    const px=pp.x, py=pp.y;
    const x1=this._timeToX(last.time),y1=this._priceToY(last.price);
    if (x1==null||y1==null) return null;

    const col=this.activeColor, sw=this.activeLineWidth;

    const t=this.activeTool;
    if (['trendline','extended-line','ray','channel','pitchfork','triangle','measure','callout','fib','fib-ext','fib-fan','fib-time'].includes(t)) {
      g.appendChild(this._line(x1,y1,px,py,col,sw,'8,4'));
    } else if (t==='horizontal') {
      g.appendChild(this._line(0,py,W,py,col,sw,'8,4'));
    } else if (t==='vertical') {
      g.appendChild(this._line(px,0,px,H,col,sw,'8,4'));
    } else if (['zone','ellipse','long','short'].includes(t)) {
      g.appendChild(this._rect(Math.min(x1,px),Math.min(y1,py),Math.abs(px-x1),Math.abs(py-y1),'rgba(33,150,243,0.06)',col,sw));
    }

    // Cursor dot
    const dot=this._el('circle',{cx:px,cy:py,r:4,fill:col,stroke:'#fff','stroke-width':1.5});
    g.appendChild(dot);

    // Price readout
    const pr=this._yToPrice(py);
    if (pr!=null) g.appendChild(this._txt(px+8,py-10,`$${pr.toFixed(5)}`,col,10));

    // Already placed temp points — show as anchors
    this.tempPoints.forEach(tp=>{
      const tx=this._timeToX(tp.time),ty=this._priceToY(tp.price);
      if (tx==null||ty==null) return;
      const anchor=this._el('circle',{cx:tx,cy:ty,r:4,fill:col,stroke:'#fff','stroke-width':1.5});
      g.appendChild(anchor);
    });

    return g;
  }

  _renderHandles(d) {
    const g=this._el('g');
    d.points.forEach((p,i)=>{
      const x=p.time!=null?this._timeToX(p.time):null;
      const y=p.price!=null?this._priceToY(p.price):null;
      if (x==null||y==null) return;
      const h=this._el('circle',{cx:x,cy:y,r:6,fill:'#2196F3',stroke:'#fff','stroke-width':2},{pointerEvents:'all',cursor:'move'});
      g.appendChild(h);
    });
    return g;
  }

  // =========================================================
  // 11. TEXT EDITING
  // =========================================================

  _promptText(drawing) {
    const p=drawing.points[0];
    const x=this._timeToX(p.time)||100, y=this._priceToY(p.price)||100;
    const inp=this._makeTextInput(x,y,drawing.style.color,'');
    inp.placeholder='Type & press Enter…';

    const finish=()=>{
      drawing.text=inp.value||'Note';
      inp.remove();
      this._snapshot();
      this.drawings.push(drawing);
      this.selectedIds=new Set([drawing.id]);
      this._saveToStorage(); this._scheduleRender();
    };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish();} if(e.key==='Escape'){inp.remove();this._cancelDraw();} });
    inp.addEventListener('blur',finish);
  }

  _editText(id) {
    const d=this.drawings.find(x=>x.id===id);
    if (!d) return;
    const p=d.points[0];
    const x=this._timeToX(p.time)||100, y=this._priceToY(p.price)||100;
    const inp=this._makeTextInput(x,y,d.style.color,d.text||'');

    const finish=()=>{
      this._snapshot();
      d.text=inp.value;
      inp.remove();
      this._saveToStorage(); this._scheduleRender();
    };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish();} if(e.key==='Escape'){inp.remove();this._scheduleRender();} });
    inp.addEventListener('blur',finish);
  }

  _makeTextInput(x,y,color,value) {
    const inp=document.createElement('textarea');
    inp.value=value;
    Object.assign(inp.style,{
      position:'absolute', left:`${x}px`, top:`${y-20}px`,
      minWidth:'160px', minHeight:'32px',
      background:'rgba(10,18,34,0.96)', color, border:`1px solid ${color}`,
      borderRadius:'5px', padding:'5px 8px', fontSize:'12px',
      fontFamily:'Inter,sans-serif', zIndex:'30', resize:'both', outline:'none',
    });
    this.container.appendChild(inp);
    inp.focus(); inp.select();
    return inp;
  }

  // =========================================================
  // 12. PERSISTENCE
  // =========================================================

  _saveToStorage() {
    try { localStorage.setItem(`tl_drawings_${this._symbolKey}`, JSON.stringify(this.drawings)); } catch(_){}
  }

  _loadFromStorage() {
    try {
      const saved=localStorage.getItem(`tl_drawings_${this._symbolKey}`);
      if (saved) {
        this.drawings=JSON.parse(saved);
        this._nextId=Math.max(0,...this.drawings.map(d=>parseInt(d.id.split('_')[1])||0))+1;
        this._scheduleRender();
      }
    } catch(_){ this.drawings=[]; }
  }

  setSymbol(symbol) {
    this._saveToStorage();
    this._symbolKey=symbol.replace(/\W/g,'_');
    this.drawings=[]; this.selectedIds.clear();
    this.undoStack=[]; this.redoStack=[];
    this._loadFromStorage();
  }

  // =========================================================
  // 13. PUBLIC API
  // =========================================================

  setActiveTool(tool) {
    this.activeTool=tool;
    if (this.isDrawing) this._cancelDraw();
    this.svgEl.style.cursor=tool==='select'?'':'crosshair';
    this._scheduleRender();
    // Dispatch event so toolbar can update
    this.container.dispatchEvent(new CustomEvent('drawingToolChange',{detail:{tool},bubbles:true}));
  }

  setActiveColor(c)     { this.activeColor=c; }
  setActiveLineWidth(w) { this.activeLineWidth=w; }
  setActiveLineStyle(s) { this.activeLineStyle=s; }
  setActiveFill(f)      { this.activeFill=f; }

  clearAll() {
    this._snapshot(); this.drawings=[]; this.selectedIds.clear();
    this._saveToStorage(); this._scheduleRender();
  }

  getDrawings()     { return this.drawings; }
  getDrawingCount() { return this.drawings.length; }
  serialize()       { return JSON.stringify(this.drawings); }
  deserialize(json) { try { this.drawings=JSON.parse(json); this._scheduleRender(); } catch(_){} }
}
