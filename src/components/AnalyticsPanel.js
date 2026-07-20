/**
 * Analytics Panel Component (TradeLine AI)
 * Features:
 * 1. Collapsible/Re-openable Side Panel: Click "◀ Hide Panel" to hide panel completely and expand TradingView chart to 100% full screen width!
 * 2. Displays S/R levels breakdown table + 1-click line focus.
 * 3. ⚡ Automated Pattern Engine Integration: Displays detected Candlestick Patterns, Market Structure (BOS / CHoCH / FVG / Order Blocks), RSI/MACD Divergences, and Fib Golden Pocket status!
 */

export class AnalyticsPanel {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.isCollapsed = false;
    this.activeTab = 'sr'; // 'sr' or 'patterns'
    this.data = {
      symbol: '',
      currentPrice: 0,
      source: '',
      supportLines: [],
      resistanceLines: [],
      candleCount: 0,
      patterns: null
    };
    this.onLineClick = options.onLineClick || (() => {});
    this.onPatternClick = options.onPatternClick || (() => {});
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
      floatBtn.innerHTML = '◀ Analytics';
      floatBtn.addEventListener('click', () => this.togglePanel());
      document.body.appendChild(floatBtn);
      return;
    }

    this.container.classList.remove('analytics-panel-collapsed');

    const { symbol, currentPrice, source, supportLines, resistanceLines, candleCount, patterns } = this.data;
    const allLines = [...resistanceLines.slice().reverse(), ...supportLines];

    const cPatterns = patterns?.candlestickPatterns || [];
    const mStructure = patterns?.marketStructure || {};
    const indicators = patterns?.indicators || {};
    const divergences = patterns?.divergences || [];
    const fibonacci = patterns?.fibonacci || null;
    const chartPats = patterns?.chartPatterns || [];

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
          <div class="metric-box support-box" title="Total valid support lines">
            <span class="metric-num text-green">${supportLines.length}</span>
            <span class="metric-label">Support ⓘ</span>
          </div>
          <div class="metric-box resistance-box" title="Total valid resistance lines">
            <span class="metric-num text-red">${resistanceLines.length}</span>
            <span class="metric-label">Resistance ⓘ</span>
          </div>
          <div class="metric-box" title="Total OHLCV historical candlestick bars scanned">
            <span class="metric-num text-blue">${candleCount}</span>
            <span class="metric-label">Candles ⓘ</span>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs inside Analytics Side Panel -->
      <div class="analytics-tabs-bar">
        <button type="button" class="analytics-tab-btn ${this.activeTab === 'sr' ? 'active' : ''}" id="tab-btn-sr">
          📐 Key S/R (${allLines.length})
        </button>
        <button type="button" class="analytics-tab-btn ${this.activeTab === 'patterns' ? 'active' : ''}" id="tab-btn-patterns">
          ⚡ Auto Patterns (${cPatterns.length + divergences.length + (mStructure.bosEvents?.length || 0)})
        </button>
      </div>

      <!-- TAB 1: Key S/R Lines Table -->
      ${this.activeTab === 'sr' ? `
        <div class="panel-card levels-card">
          <div class="card-header">
            <h4 class="card-title">Key S/R & Slanted Lines</h4>
            <span class="badge-info">${allLines.length} Valid Lines</span>
          </div>

          <div class="table-wrapper">
            ${allLines.length === 0 ? `
              <div class="empty-state">
                <p>No active Support or Resistance lines detected for current view.</p>
                <small>Click "📐 Support & Resistance Auto-Detector" tab in top bar to enable lines.</small>
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
      ` : ''}

      <!-- TAB 2: Automated Patterns & Market Structure -->
      ${this.activeTab === 'patterns' ? `
        <div class="panel-card patterns-card">
          <div class="card-header">
            <h4 class="card-title">⚡ Automated Technical Pattern Engine</h4>
            <span class="badge-info">A-Z System Active</span>
          </div>

          <!-- Section A: Live Candlestick Patterns -->
          <div class="pattern-section">
            <h5 class="section-subtitle">🕯️ Detected Candlestick Patterns</h5>
            ${cPatterns.length === 0 ? `
              <p class="section-empty">Scanning for 1-candle, 2-candle, and 3-candle reversal setups...</p>
            ` : `
              <div class="pattern-badges-grid">
                ${cPatterns.map(p => `
                  <div class="pattern-chip chip-${p.type.toLowerCase()}" title="${p.desc}">
                    <span class="chip-title">${p.name}</span>
                    <span class="chip-type">${p.type}</span>
                    <small class="chip-price">@ $${p.price.toFixed(4)}</small>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Section B: Market Structure (BOS, CHoCH, FVG, OB) -->
          <div class="pattern-section">
            <h5 class="section-subtitle">🏛️ Market Structure & Smart Money</h5>
            <div class="structure-list">
              ${(mStructure.bosEvents || []).map(b => `
                <div class="structure-item item-bos">
                  <span class="tag-badge tag-${b.type.includes('BULL') ? 'green' : 'red'}">${b.type}</span>
                  <span class="item-text">$${b.price.toFixed(4)}</span>
                  <small class="item-desc">${b.desc}</small>
                </div>
              `).join('')}

              ${(mStructure.chochEvents || []).map(c => `
                <div class="structure-item item-choch">
                  <span class="tag-badge tag-amber">${c.type}</span>
                  <span class="item-text">$${c.price.toFixed(4)}</span>
                  <small class="item-desc">${c.desc}</small>
                </div>
              `).join('')}

              ${(mStructure.fvgGaps || []).map(g => `
                <div class="structure-item item-fvg">
                  <span class="tag-badge tag-purple">${g.type}</span>
                  <span class="item-text">$${g.low.toFixed(4)} - $${g.high.toFixed(4)}</span>
                  <small class="item-desc">${g.desc}</small>
                </div>
              `).join('')}

              ${(mStructure.orderBlocks || []).map(ob => `
                <div class="structure-item item-ob">
                  <span class="tag-badge tag-blue">${ob.type}</span>
                  <span class="item-text">$${ob.low.toFixed(4)} - $${ob.high.toFixed(4)}</span>
                </div>
              `).join('')}

              ${((mStructure.bosEvents?.length || 0) + (mStructure.chochEvents?.length || 0) + (mStructure.fvgGaps?.length || 0)) === 0 ? `
                <p class="section-empty">No active BOS, CHoCH, or FVG imbalances in recent swing window.</p>
              ` : ''}
            </div>
          </div>

          <!-- Section C: Indicators & Fib Golden Pocket -->
          <div class="pattern-section">
            <h5 class="section-subtitle">📊 Indicators & Fib Golden Pocket</h5>
            <div class="indicators-summary-grid">
              <div class="ind-card">
                <span class="ind-lbl">RSI (14)</span>
                <span class="ind-val ${indicators.rsi >= 70 ? 'text-red' : (indicators.rsi <= 30 ? 'text-green' : '')}">${indicators.rsi || 50}</span>
                <small class="ind-sub">${indicators.rsiStatus || 'NEUTRAL'}</small>
              </div>

              <div class="ind-card">
                <span class="ind-lbl">VWAP</span>
                <span class="ind-val">$${indicators.vwap || 0}</span>
                <small class="ind-sub">${currentPrice > indicators.vwap ? 'Above VWAP (Bullish)' : 'Below VWAP (Bearish)'}</small>
              </div>

              <div class="ind-card">
                <span class="ind-lbl">MACD Signal</span>
                <span class="ind-val ${indicators.macd?.isBullishCross ? 'text-green' : (indicators.macd?.isBearishCross ? 'text-red' : '')}">
                  ${indicators.macd?.isBullishCross ? 'Bull Cross' : (indicators.macd?.isBearishCross ? 'Bear Cross' : 'Neutral')}
                </span>
                <small class="ind-sub">Hist: ${indicators.macd?.latest?.hist ? indicators.macd.latest.hist.toFixed(4) : '0'}</small>
              </div>

              <div class="ind-card ${fibonacci?.goldenPocket?.isActive ? 'ind-active-gold' : ''}">
                <span class="ind-lbl">Fib Golden Pocket</span>
                <span class="ind-val">$${fibonacci?.goldenPocket?.top || 0}</span>
                <small class="ind-sub">${fibonacci?.goldenPocket?.isActive ? '🎯 INSIDE GOLDEN POCKET (0.618 - 0.65)' : 'Range 0.618 - 0.65'}</small>
              </div>
            </div>

            ${divergences.map(d => `
              <div class="divergence-alert-box ${d.type.includes('BULL') ? 'alert-bullish' : 'alert-bearish'}">
                <strong>⚡ ${d.type} DETECTED!</strong>
                <p>${d.desc}</p>
              </div>
            `).join('')}

            ${chartPats.map(cp => `
              <div class="divergence-alert-box alert-chart-pattern">
                <strong>📐 ${cp.name}</strong>
                <p>${cp.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    this.attachEvents(allLines);
  }

  attachEvents(allLines) {
    const closeBtn = this.container.querySelector('#close-analytics-btn');
    closeBtn?.addEventListener('click', () => this.togglePanel());

    const tabSR = this.container.querySelector('#tab-btn-sr');
    const tabPatterns = this.container.querySelector('#tab-btn-patterns');

    tabSR?.addEventListener('click', () => {
      this.activeTab = 'sr';
      this.render();
    });

    tabPatterns?.addEventListener('click', () => {
      this.activeTab = 'patterns';
      this.render();
    });

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
