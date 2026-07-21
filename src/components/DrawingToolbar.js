/**
 * DrawingToolbar — TradeLine AI
 * TradingView-parity drawing toolbar with 20 tools in 4 groups,
 * color picker, line-style selector, width selector, undo/redo buttons.
 */
export class DrawingToolbar {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.activeTool = 'select';
    this.onToolChange = options.onToolChange || (() => {});
    this.onFavoriteToggle = options.onFavoriteToggle || (() => {});
    this.onUndo = options.onUndo || (() => {});
    this.onRedo = options.onRedo || (() => {});
    this.onClear = options.onClear || (() => {});
    this.onColorChange = options.onColorChange || (() => {});
    this.onWidthChange = options.onWidthChange || (() => {});
    this.onStyleChange = options.onStyleChange || (() => {});

    this.activeColor = '#2196F3';
    this.activeWidth = 2;
    this.activeStyle = 'solid';
    this.activeStyle = 'solid';
    this.favorites = options.favorites || [];
    this.isCollapsed = false;

    // Group collapse state
    this.groupOpen = { lines: true, shapes: true, fib: true, annotations: true };

    this.render();
    this._initKeyboardHints();
    this._initCollapseButton();
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    this._refreshActiveState();
  }

  // Legacy no-op kept for backward compat
  setRole() {}

  _initCollapseButton() {
    // Create floating reopen button (injected into body once)
    if (!document.getElementById('reopen-drawing-btn')) {
      const btn = document.createElement('button');
      btn.id = 'reopen-drawing-btn';
      btn.className = 'reopen-drawing-floating-btn';
      btn.title = 'Show Drawing Toolbar';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span style="writing-mode:vertical-rl;font-size:8px;letter-spacing:1px;">TOOLS</span>
      `;
      btn.addEventListener('click', () => this._toggleCollapse());
      document.body.appendChild(btn);
    }

    // Collapse button inside toolbar (top-right corner)
    const collapseBtn = this.container.querySelector('#dtb-collapse-btn');
    collapseBtn?.addEventListener('click', () => this._toggleCollapse());
  }

  _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.container.classList.toggle('toolbar-collapsed', this.isCollapsed);
    const reopenBtn = document.getElementById('reopen-drawing-btn');
    if (reopenBtn) reopenBtn.classList.toggle('visible', this.isCollapsed);

    // Trigger chart resize
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }

  _refreshActiveState() {
    const btns = this.container.querySelectorAll('.dtb-tool-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.tool === this.activeTool));
    
    // Also refresh favorite stars
    const favBtns = this.container.querySelectorAll('.dtb-favorite-btn');
    favBtns.forEach(btn => {
      const isFav = this.favorites.includes(btn.dataset.favTool);
      btn.classList.toggle('is-favorite', isFav);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
      }
      btn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="dtb-wrapper" id="drawing-toolbar">

        <!-- Collapse toggle at very top -->
        <button class="dtb-icon-btn dtb-collapse-top" id="dtb-collapse-btn"
                title="Hide Drawing Toolbar"
                style="width:100%;border-radius:0;border-bottom:1px solid var(--border-color);margin-bottom:3px;height:22px;flex-shrink:0;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <!-- Undo / Redo row -->
        <div class="dtb-undo-row">
          <button class="dtb-icon-btn" id="dtb-undo" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-4.9L1 10"></path></svg>
          </button>
          <button class="dtb-icon-btn" id="dtb-redo" title="Redo (Ctrl+Shift+Z)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-.49-4.9L23 10"></path></svg>
          </button>
          <div class="dtb-sep"></div>
          <button class="dtb-icon-btn dtb-clear" id="dtb-clear" title="Clear All Drawings">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>

        <!-- Pointer / Select -->
        <button class="dtb-tool-btn active" data-tool="select" title="Select / Move (Esc)">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7 18 3-7 7-3L3 3z"></path></svg>
          <span class="dtb-shortcut">Esc</span>
        </button>

        <div class="dtb-sep"></div>

        <!-- ─── LINES GROUP ─── -->
        ${this._group('lines', 'Lines', `
          ${this._btn('trendline',       'Trend Line',      'Alt+T', this._svg_trendline())}
          ${this._btn('extended-line',   'Extended Line',   '',       this._svg_extended())}
          ${this._btn('ray',             'Ray',             'Alt+R',  this._svg_ray())}
          ${this._btn('horizontal',      'Horizontal Line', 'Alt+H',  this._svg_horizontal())}
          ${this._btn('vertical',        'Vertical Line',   'Alt+V',  this._svg_vertical())}
          ${this._btn('channel',         'Parallel Channel','',       this._svg_channel())}
          ${this._btn('pitchfork',       'Pitchfork',       '',       this._svg_pitchfork())}
        `)}

        <!-- ─── SHAPES GROUP ─── -->
        ${this._group('shapes', 'Shapes', `
          ${this._btn('zone',     'Rectangle / Zone', 'Alt+Z', this._svg_zone())}
          ${this._btn('triangle', 'Triangle',         '',      this._svg_triangle())}
          ${this._btn('ellipse',  'Ellipse',          '',      this._svg_ellipse())}
        `)}

        <!-- ─── FIBONACCI GROUP ─── -->
        ${this._group('fib', 'Fibonacci', `
          ${this._btn('fib',       'Fib Retracement', 'Alt+F', this._svg_fib())}
          ${this._btn('fib-ext',   'Fib Extension',   '',      this._svg_fib_ext())}
          ${this._btn('fib-fan',   'Fib Fan',         '',      this._svg_fib_fan())}
          ${this._btn('fib-time',  'Fib Time Zones',  '',      this._svg_fib_time())}
        `)}

        <!-- ─── ANNOTATIONS GROUP ─── -->
        ${this._group('annotations', 'Annotate', `
          ${this._btn('text',    'Text Label',       'Alt+L', this._svg_text())}
          ${this._btn('callout', 'Callout Arrow',    '',      this._svg_callout())}
          ${this._btn('note',    'Anchored Note',    '',      this._svg_note())}
          ${this._btn('measure', 'Price Measure',    'Alt+M', this._svg_measure())}
          ${this._btn('long',    'Long Position',    '',      this._svg_long())}
          ${this._btn('short',   'Short Position',   '',      this._svg_short())}
        `)}

        <div class="dtb-sep"></div>

        <!-- Style Controls -->
        <div class="dtb-style-controls">
          <!-- Color swatch -->
          <label class="dtb-color-wrap" title="Drawing Color">
            <span class="dtb-color-swatch" id="dtb-color-swatch" style="background:${this.activeColor};"></span>
            <input type="color" id="dtb-color-picker" value="${this.activeColor}" style="width:0;height:0;opacity:0;position:absolute;">
          </label>

          <!-- Line style -->
          <select class="dtb-select" id="dtb-line-style" title="Line Style">
            <option value="solid">—</option>
            <option value="dashed">- -</option>
            <option value="dotted">···</option>
          </select>

          <!-- Line width -->
          <select class="dtb-select" id="dtb-line-width" title="Line Width">
            <option value="1">1px</option>
            <option value="2" selected>2px</option>
            <option value="3">3px</option>
            <option value="4">4px</option>
          </select>
        </div>

      </div>
    `;

    this._attachEvents();
  }

  _group(id, label, btnsHTML) {
    const open = this.groupOpen[id];
    return `
      <div class="dtb-group" data-group="${id}">
        <button class="dtb-group-header ${open ? 'open' : ''}" data-group-toggle="${id}">
          <span>${label}</span>
          <svg class="dtb-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="dtb-group-body ${open ? 'open' : ''}">
          ${btnsHTML}
        </div>
      </div>
    `;
  }

  _btn(tool, title, shortcut, svgIcon) {
    const sc = shortcut ? `<span class="dtb-shortcut">${shortcut}</span>` : '';
    const isFav = this.favorites.includes(tool);
    return `
      <div class="dtb-tool-wrapper">
        <button class="dtb-tool-btn ${this.activeTool === tool ? 'active' : ''}"
                data-tool="${tool}"
                title="${title}${shortcut ? ' (' + shortcut + ')' : ''}">
          ${svgIcon}
          ${sc}
        </button>
        <button class="dtb-favorite-btn ${isFav ? 'is-favorite' : ''}" data-fav-tool="${tool}" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
      </div>
    `;
  }

  getToolSVG(toolId) {
    const map = {
      'trendline': this._svg_trendline(),
      'extended-line': this._svg_extended(),
      'ray': this._svg_ray(),
      'horizontal': this._svg_horizontal(),
      'vertical': this._svg_vertical(),
      'channel': this._svg_channel(),
      'pitchfork': this._svg_pitchfork(),
      'zone': this._svg_zone(),
      'triangle': this._svg_triangle(),
      'ellipse': this._svg_ellipse(),
      'fib': this._svg_fib(),
      'fib-ext': this._svg_fib_ext(),
      'fib-fan': this._svg_fib_fan(),
      'fib-time': this._svg_fib_time(),
      'text': this._svg_text(),
      'callout': this._svg_callout(),
      'note': this._svg_note(),
      'measure': this._svg_measure(),
      'long': this._svg_long(),
      'short': this._svg_short(),
    };
    return map[toolId] || '';
  }

  getToolTitle(toolId) {
     const map = {
        'trendline': 'Trend Line',
        'extended-line': 'Extended Line',
        'ray': 'Ray',
        'horizontal': 'Horizontal Line',
        'vertical': 'Vertical Line',
        'channel': 'Parallel Channel',
        'pitchfork': 'Pitchfork',
        'zone': 'Rectangle / Zone',
        'triangle': 'Triangle',
        'ellipse': 'Ellipse',
        'fib': 'Fib Retracement',
        'fib-ext': 'Fib Extension',
        'fib-fan': 'Fib Fan',
        'fib-time': 'Fib Time Zones',
        'text': 'Text Label',
        'callout': 'Callout Arrow',
        'note': 'Anchored Note',
        'measure': 'Price Measure',
        'long': 'Long Position',
        'short': 'Short Position',
     };
     return map[toolId] || toolId;
  }

  _attachEvents() {
    // Tool buttons
    this.container.querySelectorAll('.dtb-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTool = btn.dataset.tool;
        this._refreshActiveState();
        this.onToolChange(this.activeTool);
      });
    });

    // Favorite buttons
    this.container.querySelectorAll('.dtb-favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = btn.dataset.favTool;
        this.onFavoriteToggle(tool);
      });
    });

    // Group toggles
    this.container.querySelectorAll('[data-group-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.groupToggle;
        this.groupOpen[g] = !this.groupOpen[g];
        btn.classList.toggle('open', this.groupOpen[g]);
        const body = this.container.querySelector(`.dtb-group[data-group="${g}"] .dtb-group-body`);
        if (body) body.classList.toggle('open', this.groupOpen[g]);
      });
    });

    // Undo / Redo / Clear
    this.container.querySelector('#dtb-undo')?.addEventListener('click', () => this.onUndo());
    this.container.querySelector('#dtb-redo')?.addEventListener('click', () => this.onRedo());
    this.container.querySelector('#dtb-clear')?.addEventListener('click', () => this.onClear());

    // Color picker
    const picker = this.container.querySelector('#dtb-color-picker');
    const swatch = this.container.querySelector('#dtb-color-swatch');
    this.container.querySelector('.dtb-color-wrap')?.addEventListener('click', () => picker?.click());
    picker?.addEventListener('input', (e) => {
      this.activeColor = e.target.value;
      if (swatch) swatch.style.background = this.activeColor;
      this.onColorChange(this.activeColor);
    });

    // Line style
    this.container.querySelector('#dtb-line-style')?.addEventListener('change', (e) => {
      this.activeStyle = e.target.value;
      this.onStyleChange(this.activeStyle);
    });

    // Line width
    this.container.querySelector('#dtb-line-width')?.addEventListener('change', (e) => {
      this.activeWidth = parseInt(e.target.value);
      this.onWidthChange(this.activeWidth);
    });
  }

  _initKeyboardHints() {
    const shortcuts = {
      't': 'trendline', 'r': 'ray', 'h': 'horizontal',
      'v': 'vertical', 'z': 'zone', 'f': 'fib',
      'l': 'text', 'm': 'measure',
    };
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      if (e.altKey && shortcuts[e.key]) {
        e.preventDefault();
        this.activeTool = shortcuts[e.key];
        this._refreshActiveState();
        this.onToolChange(this.activeTool);
      }
      if (e.key === 'Escape') {
        this.activeTool = 'select';
        this._refreshActiveState();
        this.onToolChange('select');
      }
    });
  }

  // ─── SVG ICONS ─────────────────────────────────────────────
  _svgWrap(content) {
    return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${content}</svg>`;
  }
  _svg_trendline()  { return this._svgWrap(`<line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>`); }
  _svg_extended()   { return this._svgWrap(`<line x1="2" y1="22" x2="22" y2="2"/>`); }
  _svg_ray()        { return this._svgWrap(`<line x1="4" y1="20" x2="22" y2="4"/><circle cx="4" cy="20" r="2"/>`); }
  _svg_horizontal() { return this._svgWrap(`<line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="6" x2="6" y2="6" stroke-dasharray="2,2"/>`); }
  _svg_vertical()   { return this._svgWrap(`<line x1="12" y1="2" x2="12" y2="22"/><line x1="6" y1="2" x2="6" y2="6" stroke-dasharray="2,2"/>`); }
  _svg_channel()    { return this._svgWrap(`<line x1="4" y1="18" x2="20" y2="8"/><line x1="4" y1="22" x2="20" y2="12"/>`); }
  _svg_pitchfork()  { return this._svgWrap(`<path d="M4 20 L12 4"/><path d="M4 20 L2 12"/><path d="M4 20 L20 12"/><line x1="8" y1="10" x2="8" y2="20" stroke-dasharray="2,2"/>`); }
  _svg_zone()       { return this._svgWrap(`<rect x="3" y="5" width="18" height="14" rx="1" stroke-dasharray="0"/>`); }
  _svg_triangle()   { return this._svgWrap(`<polygon points="12 4 22 20 2 20"/>`); }
  _svg_ellipse()    { return this._svgWrap(`<ellipse cx="12" cy="12" rx="10" ry="6"/>`); }
  _svg_fib()        { return this._svgWrap(`<line x1="3" y1="18" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="4,2"/><line x1="3" y1="15" x2="21" y2="15" stroke-dasharray="4,2"/>`); }
  _svg_fib_ext()    { return this._svgWrap(`<line x1="3" y1="20" x2="21" y2="4"/><line x1="3" y1="8" x2="21" y2="8" stroke-dasharray="4,2"/><line x1="3" y1="2" x2="21" y2="2" stroke-dasharray="4,2"/>`); }
  _svg_fib_fan()    { return this._svgWrap(`<line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="10" stroke-dasharray="4,2"/><line x1="4" y1="20" x2="20" y2="16" stroke-dasharray="4,2"/>`); }
  _svg_fib_time()   { return this._svgWrap(`<line x1="4" y1="4" x2="4" y2="20"/><line x1="10" y1="4" x2="10" y2="20" stroke-dasharray="3,2"/><line x1="20" y1="4" x2="20" y2="20" stroke-dasharray="3,2"/>`); }
  _svg_text()       { return this._svgWrap(`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`); }
  _svg_callout()    { return this._svgWrap(`<polygon points="12 2 22 20 2 20"/><line x1="12" y1="20" x2="12" y2="22" stroke-dasharray="2,2"/>`); }
  _svg_note()       { return this._svgWrap(`<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`); }
  _svg_measure()    { return this._svgWrap(`<path d="M2 2v20M22 2v20M2 12h20" stroke-dasharray="4,2"/>`); }
  _svg_long()       { return this._svgWrap(`<rect x="3" y="8" width="18" height="13" fill="rgba(76,175,80,0.25)" stroke="#4CAF50"/><line x1="3" y1="14" x2="21" y2="14" stroke="#2196F3"/>`); }
  _svg_short()      { return this._svgWrap(`<rect x="3" y="3" width="18" height="13" fill="rgba(239,83,80,0.25)" stroke="#EF5350"/><line x1="3" y1="9" x2="21" y2="9" stroke="#2196F3"/>`); }
}
