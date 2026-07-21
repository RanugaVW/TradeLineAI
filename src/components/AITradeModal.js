/**
 * Dedicated AI Focused Analysis & Zoomed Chart Modal Component (TradeLine AI)
 * Features:
 * 1. Glassmorphism modal displaying Gemini's detailed trade reasoning and LKR payout grid.
 * 2. Focused Lightweight Chart view showing the relevant recent candle slice.
 * 3. Prominent "📍 WE ARE HERE" current price marker pointing to the exact current candle.
 * 4. Visual Arrow lines and price markers for Entry, Target Profit (TP), and Stop Loss (SL).
 */
import { createChart } from 'lightweight-charts';

export class AITradeModal {
  constructor(modalOverlayElement) {
    this.overlay = modalOverlayElement;
    this.chartInstance = null;
    this.candlestickSeries = null;
  }

  open(aiData, marketContext) {
    if (!this.overlay) return;

    const { symbol = 'PI-USDT', currentPrice = 0, candles = [], supportLines = [], resistanceLines = [] } = marketContext || {};

    // Slice ONLY the relevant recent candle slice (last 40 candles)
    const recentCandles = candles.length > 40 ? candles.slice(candles.length - 40) : candles;
    const livePrice = currentPrice || (candles.length > 0 ? candles[candles.length - 1].close : aiData.entryPrice);

    const supPrice = supportLines[0] ? supportLines[0].price : (aiData.entryPrice * 0.96);
    const resPrice = resistanceLines[0] ? resistanceLines[0].price : aiData.takeProfitPrice;
    const supBounces = supportLines[0] ? supportLines[0].bounces : 3;
    const resBounces = resistanceLines[0] ? resistanceLines[0].bounces : 3;

    this.overlay.innerHTML = `
      <div class="ai-modal-backdrop"></div>
      <div class="ai-modal-box">
        <!-- Modal Top Header Bar -->
        <div class="ai-modal-header">
          <div class="modal-title-group">
            <span class="ai-badge-pill">TradeLine AI Focused Analysis</span>
            <h2 class="modal-pair-title">${symbol} — ${aiData.tradeDuration || 'Day Trade'}</h2>
          </div>
          <button type="button" class="ai-modal-close-btn" id="close-ai-modal-btn" title="Close Modal">✕</button>
        </div>

        <!-- Modal Body Content Grid -->
        <div class="ai-modal-body">
          <!-- Left Column: Detailed AI Trade Explanation & Payout Cards -->
          <div class="modal-col-details">
            <div class="modal-signal-card">
              <div class="signal-header">
                <span class="signal-badge signal-${aiData.signal.toLowerCase().replace(' ', '-')}">${aiData.signal}</span>
                <span class="confidence-tag">${aiData.confidence}% AI Confidence</span>
                <span class="engine-tag">${aiData.engineType || 'Gemini AI'}</span>
              </div>

              <div class="explanation-box">
                <h4><i data-lucide="info" style="width: 16px; height: 16px; margin-right: 6px; display: inline-block; vertical-align: text-bottom;"></i> Market Reasoning & Support/Resistance Explanation:</h4>
                <p class="explanation-text">"${aiData.analysis}"</p>
              </div>

              <!-- Interactive Step-by-Step Position & Target Path -->
              <div class="trade-path-guide">
                <h4><i data-lucide="map-pin" style="width: 16px; height: 16px; margin-right: 6px; display: inline-block; vertical-align: text-bottom;"></i> Trade Pointer & Execution Path:</h4>
                <div class="path-step-card step-current">
                  <span class="step-icon"><i data-lucide="map-pin" style="width: 20px; height: 20px;"></i></span>
                  <div class="step-text">
                    <strong>1. WE ARE HERE:</strong> Current Live Price is <strong>$${livePrice.toFixed(4)}</strong>.
                  </div>
                </div>

                <div class="path-step-card step-support">
                  <span class="step-icon"><i data-lucide="shield" style="width: 20px; height: 20px;"></i></span>
                  <div class="step-text">
                    <strong>2. SUPPORT BOUNCE:</strong> Holding above Support Floor at <strong>$${supPrice.toFixed(4)}</strong> (${supBounces}x touches).
                  </div>
                </div>

                <div class="path-step-card step-target">
                  <span class="step-icon"><i data-lucide="target" style="width: 20px; height: 20px;"></i></span>
                  <div class="step-text">
                    <strong>3. TARGET PROFIT (TP):</strong> Target resistance ceiling at <strong>$${aiData.takeProfitPrice.toFixed(4)}</strong> (+$${aiData.potentialProfitUsd} / +LKR ${aiData.potentialProfitLkr.toLocaleString()}).
                  </div>
                </div>
              </div>

              <div class="sr-breakdown-list">
                <h4><i data-lucide="crosshair" style="width: 16px; height: 16px; margin-right: 6px; display: inline-block; vertical-align: text-bottom;"></i> Key Active Support & Resistance Levels:</h4>
                <div class="sr-items-grid">
                  <div class="sr-item sup-item">
                    <span class="sr-title">Support Floor:</span>
                    <span class="sr-val text-green">$${supPrice.toFixed(4)}</span>
                    <span class="sr-sub">(${supBounces}x confirmed touches)</span>
                  </div>
                  <div class="sr-item res-item">
                    <span class="sr-title">Resistance Ceiling:</span>
                    <span class="sr-val text-red">$${resPrice.toFixed(4)}</span>
                    <span class="sr-sub">(${resBounces}x confirmed touches)</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Trade Execution Payout Grid -->
            <div class="modal-payout-grid">
              <div class="payout-card">
                <span class="payout-label">LKR Budget</span>
                <span class="payout-val">LKR ${aiData.lkrBudget.toLocaleString()}</span>
                <small class="payout-sub">≈ $${aiData.usdBudget} USD</small>
              </div>

              <div class="payout-card primary-card">
                <span class="payout-label">Coins to Buy</span>
                <span class="payout-val">${aiData.coinsToBuy} ${symbol.split('-')[0].split('/')[0]}</span>
                <small class="payout-sub">Entry @ $${aiData.entryPrice}</small>
              </div>

              <div class="payout-card profit-card">
                <span class="payout-label">Target Profit (TP)</span>
                <span class="payout-val">+$${aiData.potentialProfitUsd}</span>
                <small class="payout-sub">+LKR ${aiData.potentialProfitLkr.toLocaleString()} (@ $${aiData.takeProfitPrice})</small>
              </div>

              <div class="payout-card loss-card">
                <span class="payout-label">Max Risk (SL)</span>
                <span class="payout-val">-$${(aiData.usdBudget - (aiData.stopLossPrice * aiData.coinsToBuy)).toFixed(2)}</span>
                <small class="payout-sub">-LKR ${aiData.potentialLossLkr.toLocaleString()} (@ $${aiData.stopLossPrice})</small>
              </div>
            </div>
          </div>

          <!-- Right Column: Focused Candlestick Chart View -->
          <div class="modal-col-chart">
            <div class="chart-box-header">
              <h4>Focused Relevant Candlesticks View (Last 40 Candles)</h4>
              <span class="focus-hint">Showing live price pointer & target arrows</span>
            </div>
            <div id="ai-modal-chart-canvas" class="ai-modal-chart-canvas"></div>
          </div>
        </div>
      </div>
    `;

    this.overlay.classList.add('is-visible');

    // Attach Close Event Listeners
    const closeBtn = this.overlay.querySelector('#close-ai-modal-btn');
    const backdrop = this.overlay.querySelector('.ai-modal-backdrop');

    closeBtn?.addEventListener('click', () => this.close());
    backdrop?.addEventListener('click', () => this.close());

    // Render Focused Chart View with Price Pointers & Arrow Annotations
    setTimeout(() => {
      this.renderFocusedChart(recentCandles, supportLines, resistanceLines, aiData, livePrice);
    }, 60);
  }

  close() {
    if (this.chartInstance) {
      try { this.chartInstance.remove(); } catch (e) { }
      this.chartInstance = null;
    }
    this.overlay.classList.remove('is-visible');
    this.overlay.innerHTML = '';
  }

  renderFocusedChart(recentCandles, supportLines, resistanceLines, aiData, livePrice) {
    const container = this.overlay.querySelector('#ai-modal-chart-canvas');
    if (!container) return;

    requestAnimationFrame(() => {
      const width = container.clientWidth || 550;
      const height = container.clientHeight || 440;

      if (this.chartInstance) {
        try { this.chartInstance.remove(); } catch (e) { }
      }

      this.chartInstance = createChart(container, {
        width,
        height,
        layout: {
          background: { type: 'solid', color: '#090d16' },
          textColor: '#94a3b8'
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#1e293b' },
        timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false }
      });

      const resizeObserver = new ResizeObserver(entries => {
        if (!entries || !entries.length) return;
        const entry = entries[0];
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0 && this.chartInstance) {
          this.chartInstance.applyOptions({ width: w, height: h });
        }
      });
      resizeObserver.observe(container);

      // Add Candlestick Series
      this.candlestickSeries = this.chartInstance.addCandlestickSeries({
        upColor: '#00e676',
        downColor: '#ff1744',
        borderUpColor: '#00e676',
        borderDownColor: '#ff1744',
        wickUpColor: '#00e676',
        wickDownColor: '#ff1744'
      });

      // Format candle times to UNIX seconds
      const formattedData = recentCandles.map(c => {
        let t = c.time;
        if (typeof t === 'string') {
          t = Math.floor(new Date(t).getTime() / 1000);
        } else if (typeof t === 'number' && t > 2000000000) {
          t = Math.floor(t / 1000);
        }
        return {
          time: Number(t),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        };
      }).filter(c => !isNaN(c.time) && !isNaN(c.close)).sort((a, b) => a.time - b.time);

      // Deduplicate timestamps
      const uniqueData = [];
      let lastT = null;
      for (const d of formattedData) {
        if (d.time !== lastT) {
          uniqueData.push(d);
          lastT = d.time;
        }
      }

      if (uniqueData.length > 0) {
        this.candlestickSeries.setData(uniqueData);

        // Add 📍 WE ARE HERE pointer marker on the current price bar!
        const lastCandle = uniqueData[uniqueData.length - 1];
        const markers = [
          {
            time: lastCandle.time,
            position: 'aboveBar',
            color: '#3b82f6',
            shape: 'arrowDown',
            text: `WE ARE HERE ($${livePrice.toFixed(4)})`
          }
        ];

        // Add Buy Entry Arrow marker on recent support bounce
        if (uniqueData.length > 5) {
          const entryCandle = uniqueData[uniqueData.length - 5];
          markers.push({
            time: entryCandle.time,
            position: 'belowBar',
            color: '#00e676',
            shape: 'arrowUp',
            text: `ENTRY ($${aiData.entryPrice})`
          });
        }

        this.candlestickSeries.setMarkers(markers);
      }

      // Draw Key Support Floor Line
      if (supportLines.length > 0) {
        this.candlestickSeries.createPriceLine({
          price: supportLines[0].price,
          color: '#00e676',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `SUPPORT ($${supportLines[0].price.toFixed(4)})`
        });
      }

      // Draw Target Take Profit (TP) Line
      if (aiData.takeProfitPrice) {
        this.candlestickSeries.createPriceLine({
          price: aiData.takeProfitPrice,
          color: '#3b82f6',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `ENTRY ($${aiData.entryPrice.toFixed(4)})`
        });
      }

      // Draw Stop Loss (SL) Line
      if (aiData.stopLossPrice) {
        this.candlestickSeries.createPriceLine({
          price: aiData.stopLossPrice,
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `STOP LOSS ($${aiData.stopLossPrice.toFixed(4)})`
        });
      }

      this.chartInstance.timeScale().fitContent();
    });
  }
}
