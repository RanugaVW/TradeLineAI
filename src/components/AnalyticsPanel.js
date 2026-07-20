/**
 * Analytics Panel Component (TradeLine AI)
 * Features:
 * 1. Collapsible/Re-openable Side Panel: Click "◀ Hide Panel" to hide panel completely and expand TradingView chart to 100% full screen width!
 * 2. Floating "📊 Market Analytics ▶" button pinned to right screen edge when collapsed for instant re-opening.
 * 3. Displays summary cards and qualified S/R levels breakdown table.
 * 4. Clickable Table Rows: Clicking ANY S/R line in the list automatically focuses, highlights, and extends that line on the main chart!
 */

export class AnalyticsPanel {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.isCollapsed = false;
    this.data = {
      symbol: '',
      currentPrice: 0,
      source: '',
      supportLines: [],
      resistanceLines: [],
      candleCount: 0
    };
    this.onLineClick = options.onLineClick || (() => {});
    this.onTogglePanel = options.onTogglePanel || (() => {});
    this.render();
  }

  update(analysisData) {
    this.data = { ...this.data, ...analysisData };
    this.render();
  }

  togglePanel() {
    this.isCollapsed = !this.isCollapsed;
    this.render();
    if (this.onTogglePanel) {
      this.onTogglePanel(this.isCollapsed);
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
  }

  render() {
    if (!this.container) return;

    // Remove existing floating button if any
    const existingFloat = document.getElementById('reopen-analytics-floating-btn');
    if (existingFloat) existingFloat.remove();

    if (this.isCollapsed) {
      this.container.classList.add('analytics-panel-collapsed');
      this.container.innerHTML = '';

      const floatBtn = document.createElement('button');
      floatBtn.type = 'button';
      floatBtn.id = 'reopen-analytics-floating-btn';
      floatBtn.className = 'reopen-analytics-floating-btn';
      floatBtn.title = 'Re-open Market Analytics Panel';
      floatBtn.innerHTML = '📊 Market Analytics ▶';
      floatBtn.addEventListener('click', () => this.togglePanel());
      document.body.appendChild(floatBtn);
      return;
    }

    this.container.classList.remove('analytics-panel-collapsed');

    const { symbol, currentPrice, source, supportLines, resistanceLines, candleCount } = this.data;
    const allLines = [...resistanceLines.slice().reverse(), ...supportLines];

    this.container.innerHTML = `
      <!-- Panel Header with Close Button -->
      <div class="analytics-header-bar">
        <span class="analytics-header-title">📊 Market Analytics</span>
        <button type="button" id="close-analytics-btn" class="close-analytics-btn" title="Close / Hide Analytics Panel to expand chart width">
          ◀ Hide Panel
        </button>
      </div>

      <!-- Market Header Card -->
      <div class="panel-card market-card" title="Live crypto market statistics and active data feed provider">
        <div class="card-header">
          <div class="symbol-info">
            <h3 class="symbol-title">${symbol || 'PI-USDT'}</h3>
            <span class="source-tag">${source || 'Connecting...'}</span>
          </div>
          <div class="price-display">
            <span class="price-val">$${currentPrice ? currentPrice.toFixed(4) : '0.0000'}</span>
            <span class="price-sub">Current Market Price</span>
          </div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-box support-box" title="Total valid support lines & ascending trendlines">
            <span class="metric-num text-green">${supportLines.length}</span>
            <span class="metric-label">Support ⓘ</span>
          </div>
          <div class="metric-box resistance-box" title="Total valid resistance lines & descending trendlines">
            <span class="metric-num text-red">${resistanceLines.length}</span>
            <span class="metric-label">Resistance ⓘ</span>
          </div>
          <div class="metric-box" title="Total OHLCV historical candlestick bars scanned">
            <span class="metric-num text-blue">${candleCount}</span>
            <span class="metric-label">Candles Scanned ⓘ</span>
          </div>
        </div>
      </div>

      <!-- Detected Levels Table (Click any row to focus on chart!) -->
      <div class="panel-card levels-card">
        <div class="card-header">
          <h4 class="card-title">Key S/R & Slanted Lines</h4>
          <span class="badge-info">${allLines.length} Valid Lines (Click row to focus)</span>
        </div>

        <div class="table-wrapper">
          ${allLines.length === 0 ? `
            <div class="empty-state">
              <p>No active Support or Resistance lines detected for current view.</p>
              <small>Click "📐 Support & Resistance Auto-Detector" tab to enable automated lines.</small>
            </div>
          ` : `
            <table class="levels-table">
              <thead>
                <tr>
                  <th>Type ⓘ</th>
                  <th>Price ⓘ</th>
                  <th>Bounces ⓘ</th>
                  <th>Distance % ⓘ</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${allLines.map((line, idx) => {
                  const isSup = line.type === 'SUPPORT';
                  const typeText = `${line.type} ${line.isSlanted ? '(Slanted)' : '(Horizontal)'}`;

                  return `
                    <tr class="level-row ${isSup ? 'row-support' : 'row-resistance'}" data-line-index="${idx}" title="Click to focus and extend $${line.price.toFixed(4)} line directly on chart!">
                      <td>
                        <span class="type-badge ${isSup ? 'badge-sup' : 'badge-res'}">
                          ${typeText}
                        </span>
                      </td>
                      <td class="price-cell">$${line.price.toFixed(4)}</td>
                      <td>
                        <span class="bounce-count-badge">${line.bounces}x Touch</span>
                      </td>
                      <td class="${line.distancePct < 0 ? 'text-green' : 'text-red'}">
                        ${line.distancePct > 0 ? '+' : ''}${line.distancePct}%
                      </td>
                      <td>
                        <button type="button" class="focus-line-btn" title="Focus and extend line on chart">🎯 Focus</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    this.attachEvents(allLines);
  }

  attachEvents(allLines) {
    const closeBtn = this.container.querySelector('#close-analytics-btn');
    closeBtn?.addEventListener('click', () => this.togglePanel());

    const rows = this.container.querySelectorAll('.level-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-line-index'), 10);
        if (!isNaN(idx) && allLines[idx]) {
          this.onLineClick(allLines[idx]);
        }
      });
    });
  }
}
