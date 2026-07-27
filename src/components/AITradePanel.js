/**
 * Top Gemini AI Trade Advisor & LKR Budget Optimizer Panel Component (TradeLine AI)
 * Features:
 * 1. Collapsible top glassmorphic drawer bar with zero height impact when collapsed.
 * 2. LKR Trading Budget input with live USD rate calculation.
 * 3. Time duration target horizon selector (Scalp, Day Trade, Swing Trade, Position Trade).
 * 4. Gemini AI Trade Signal generation + Quantitative Fallback Engine.
 * 5. "📌 Apply AI Diagram to Main Chart" and "↺ Reset AI Markings" buttons.
 * 6. "🔍 Open AI Focused Modal" trigger.
 */
import { fetchGeminiTradeSuggestion, getLiveUsdToLkr } from '../api/geminiApi.js';
import { AITradeModal } from './AITradeModal.js';
import { saveAIPrediction } from '../api/supabaseClient.js';
import { placeDemoTrade } from '../api/demoTradeApi.js';
import { getCurrentSession } from '../api/supabaseClient.js';

export class AITradePanel {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.isOpen = false;
    this.isClosed = true;
    this.errorMsg = null;
    this.lkrBudget = 50000;
    this.leverage = 1;
    this.tradeDuration = 'Day Trade (1 - 24h)';
    this.marketContext = null;
    this.aiData = null;
    this.isLoading = false;
    this.userContext = '';
    this.chartImageBase64 = null; // Store image payload
    
    // Default fallback rate (approximate 2024 value)
    this.liveRate = 305.50;

    let modalOverlay = document.getElementById('ai-modal-overlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'ai-modal-overlay';
      modalOverlay.className = 'ai-modal-overlay';
      document.body.appendChild(modalOverlay);
    }
    this.modal = new AITradeModal(modalOverlay);

    this.onApplyAIOverlay = options.onApplyAIOverlay || (() => { });
    this.onResetAIOverlay = options.onResetAIOverlay || (() => { });
    this.onTogglePanel = options.onTogglePanel || (() => { });
    this.onBeforeOpen = options.onBeforeOpen || (() => true);

    this.initRate();
    this.render();
  }

  async initRate() {
    try {
      this.liveRate = await getLiveUsdToLkr();
      this.render();
    } catch (e) {
      console.warn('Live rate fallback:', e);
    }
  }

  setMarketContext(context) {
    this.marketContext = context;
    if (this.isOpen && !this.aiData && !this.isLoading) {
      this.render();
    }
  }

  toggleDrawer() {
    if (this.isOpen) {
      this.closePanel();
    } else {
      if (this.onBeforeOpen && this.onBeforeOpen() === false) {
        return;
      }
      this.openPanel();
    }
  }

  closePanel() {
    this.isClosed = true;
    this.render();
    if (this.onTogglePanel) {
      this.onTogglePanel();
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
  }

  openPanel() {
    if (this.onBeforeOpen && this.onBeforeOpen() === false) {
      return; // Paywall or logic prevented opening
    }
    this.isClosed = false;
    this.isOpen = true;
    this.render();
    if (this.onTogglePanel) {
      this.onTogglePanel();
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
  }

  render() {
    if (!this.container) return;

    // Remove existing floating reopen button if any
    const existingFloat = document.getElementById('reopen-ai-floating-btn');
    if (existingFloat) existingFloat.remove();

    if (this.isClosed) {
      this.container.style.display = 'none';
      
      // Render floating badge to reopen centered below header
      const floatBtn = document.createElement('button');
      floatBtn.type = 'button';
      floatBtn.id = 'reopen-ai-floating-btn';
      floatBtn.className = 'reopen-ai-floating-btn';
      floatBtn.title = 'Re-open AI Trade Advisor';
      floatBtn.innerHTML = '<i data-lucide="bot"></i> Open AI Advisor <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>';
      floatBtn.addEventListener('click', () => this.openPanel());
      
      document.getElementById('app').appendChild(floatBtn);
      return;
    }

    this.container.style.display = 'block';

    const usdEquiv = (this.lkrBudget / this.liveRate).toFixed(2);

    this.container.innerHTML = `
      <div class="ai-drawer-wrapper ${this.isOpen ? 'is-open' : 'is-collapsed'}">
        <!-- Trigger Header Bar -->
        <div class="ai-drawer-trigger-bar" id="ai-drawer-trigger">
          <div class="trigger-left">
            <span class="ai-sparkle-icon"><i data-lucide="sparkles"></i></span>
            <span class="trigger-title">TradeLine AI Market Trade Advisor & LKR Optimizer</span>
            <span class="trigger-badge">${this.aiData ? `${this.aiData.signal} (${this.aiData.confidence}%)` : 'Interactive AI Tool'}</span>
            <button type="button" id="open-history-modal-btn" style="margin-left: 10px; background: #3b82f6; color: #fff; font-weight: bold; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">View History</button>
          </div>

          <div class="trigger-right">
            <span class="trigger-sub">${this.isOpen ? 'Click to Close Panel' : 'Click to Open AI Trade Calculator & Signals'}</span>
            <span class="drawer-arrow">${this.isOpen ? '<i data-lucide="chevron-up"></i>' : '<i data-lucide="chevron-down"></i>'}</span>
            <button type="button" class="close-ai-panel-btn" id="close-ai-panel-btn" title="Hide AI Trade Advisor completely">✕</button>
          </div>
        </div>

        <!-- Collapsible Content Drawer -->
        <div class="ai-drawer-content" id="ai-drawer-content">
          <div class="ai-panel-grid">
            <!-- Left Controls Form -->
            <div class="ai-inputs-card">
              <h4 class="card-section-title">Trade Setup & Optimization Parameters</h4>
              
              <div class="input-field-group">
                <label for="lkr-budget-input" class="field-label">
                  Your Trading Budget (LKR):
                  <span class="live-usd-tag" id="usd-equiv-badge">≈ $${usdEquiv} USD</span>
                </label>
                <div class="input-with-symbol">
                  <span class="currency-prefix">LKR</span>
                  <input 
                    type="number" 
                    id="lkr-budget-input" 
                    class="custom-num-input" 
                    value="${this.lkrBudget}" 
                    min="1000" 
                    step="1000"
                    placeholder="Enter budget in LKR (e.g. 50000)" 
                  />
                </div>
                <small class="field-hint">Live USD/LKR Exchange Rate: <strong>1 USD = ${this.liveRate.toFixed(2)} LKR</strong> (Auto-updated)</small>
              </div>

              <div class="input-field-group">
                <label for="trade-duration-select" class="field-label">
                  Trading Time Horizon:
                </label>
                <select id="trade-duration-select" class="custom-select-full">
                  <option value="Scalp (15m - 1h)" ${this.tradeDuration.includes('Scalp') ? 'selected' : ''}>Scalp (15m - 1h)</option>
                  <option value="Day Trade (1 - 24h)" ${this.tradeDuration.includes('Day Trade') ? 'selected' : ''}>Day Trade (1 - 24h)</option>
                  <option value="Swing Trade (1 - 7d)" ${this.tradeDuration.includes('Swing') ? 'selected' : ''}>Swing Trade (1 - 7d)</option>
                  <option value="Position Trade (1w+)" ${this.tradeDuration.includes('Position') ? 'selected' : ''}>Position Trade (1w+)</option>
                </select>
                <small class="field-hint">Adjusts Gemini AI reasoning and S/R bounce timeframe focus</small>
              </div>

              <div class="input-field-group">
                <label for="leverage-select" class="field-label">
                  Leverage (Risk Multiplier):
                </label>
                <select id="leverage-select" class="custom-select-full">
                  <option value="1" ${this.leverage === 1 ? 'selected' : ''}>1x (Spot / No Leverage)</option>
                  <option value="5" ${this.leverage === 5 ? 'selected' : ''}>5x (Low Risk)</option>
                  <option value="10" ${this.leverage === 10 ? 'selected' : ''}>10x (Moderate)</option>
                  <option value="20" ${this.leverage === 20 ? 'selected' : ''}>20x (High Risk)</option>
                  <option value="50" ${this.leverage === 50 ? 'selected' : ''}>50x (Degen)</option>
                  <option value="100" ${this.leverage === 100 ? 'selected' : ''}>100x (Max Degen)</option>
                </select>
                <small class="field-hint">Multiplies potential LKR profits and losses by controlling a larger position size.</small>
              </div>

              <div class="input-field-group">
                <label for="ai-manual-context" class="field-label">
                  Additional Market Context & News (Optional):
                </label>
                <textarea 
                  id="ai-manual-context" 
                  class="custom-textarea" 
                  rows="3" 
                  placeholder="e.g., 'Fed announced rate cuts today', 'Bitcoin ETF approved'"
                  style="width: 100%; background: var(--bg-tertiary); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); padding: 8px; border-radius: 6px; resize: vertical; font-family: inherit; font-size: 13px; margin-top: 5px;"
                >${this.userContext || ''}</textarea>
                <small class="field-hint">Gemini AI will combine this fundamental context with the quantitative chart patterns.</small>
              </div>

              <div class="input-field-group">
                <label for="ai-chart-image" class="field-label">
                  Attach Chart Screenshot (Optional):
                </label>
                <input type="file" id="ai-chart-image" accept="image/*" class="custom-file-input" style="width: 100%; margin-top: 5px; color: var(--text-secondary); font-size: 12px; border: 1px dashed rgba(255,255,255,0.2); padding: 5px; border-radius: 6px;" />
                <img id="ai-chart-preview" src="${this.chartImageBase64 || ''}" style="max-width: 100%; margin-top: 10px; border-radius: 6px; display: ${this.chartImageBase64 ? 'block' : 'none'};" />
                <small class="field-hint">Upload a screenshot of the chart with indicators for visual analysis.</small>
              </div>

              <button type="button" id="generate-ai-btn" class="generate-ai-btn ${this.isLoading ? 'loading' : ''}">
                ${this.isLoading ? '<span class="spinner"></span> Analyzing Market...' : 'Generate AI Trade Plan'}
              </button>
            </div>

            <!-- Right Results Display Card -->
            <div class="ai-results-card">
              <h4 class="card-section-title"><i data-lucide="bar-chart-2"></i> TradeLine AI Output & Allocation</h4>

              <div id="ai-output-container" class="ai-output-container">
                ${this.isLoading ? `
                  <div class="ai-loading-state">
                    <div class="ai-pulse-orb"></div>
                    <p>Consulting TradeLine AI Engine & Live S/R Bounce Calculator...</p>
                  </div>
                ` : (this.errorMsg ? `
                  <div class="ai-error-box">
                    <p>⚠️ ${this.errorMsg}</p>
                    <small>Please verify your Gemini API key in .env or try again.</small>
                  </div>
                ` : (this.aiData ? `
                  <div class="ai-success-content">
                    <div class="signal-banner">
                      <div class="banner-left">
                        <span class="signal-badge signal-${this.aiData.signal.toLowerCase().replace(' ', '-')}">
                          ${this.aiData.signal}
                        </span>
                        <span class="confidence-tag">${this.aiData.confidence}% AI Confidence</span>
                        <span class="duration-badge">${this.aiData.tradeDuration}</span>
                      </div>
                      <div class="ratio-tag">R:R Ratio ${this.aiData.riskRewardRatio}</div>
                    </div>

                    <p class="ai-analysis-text">"${this.aiData.analysis}"</p>

                    <div class="lkr-allocation-grid">
                      <div class="alloc-card">
                        <span class="alloc-label">LKR Budget</span>
                        <span class="alloc-val">LKR ${this.aiData.lkrBudget.toLocaleString()}</span>
                        <small class="alloc-sub">($${this.aiData.marginUsdt || this.aiData.usdBudget} USD) <strong>(used as margin)</strong></small>
                      </div>

                      <div class="alloc-card alloc-primary">
                        <span class="alloc-label">Optimized Coins to Buy</span>
                        <span class="alloc-val">${this.aiData.signal.toUpperCase() === 'HOLD' ? '0' : this.aiData.coinsToBuy} ${this.marketContext?.symbol?.split('-')[0] || ''}</span>
                        <small class="alloc-sub">Entry @ $${this.aiData.entryPrice}</small>
                      </div>
                      
                      <div class="alloc-card" style="grid-column: span 2; background: rgba(33, 150, 243, 0.05); border: 1px solid rgba(33, 150, 243, 0.2);">
                        <span class="alloc-label" style="display: flex; justify-content: space-between;">
                          <span>Notional Position Size (Margin × Leverage)</span>
                        </span>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                          <span class="alloc-val" style="color: #90caf9;">$${this.aiData.positionSizeUsdt || (this.aiData.usdBudget * (this.aiData.leverageUsed || 1)).toFixed(2)} USDT</span>
                          <span style="font-size: 13px; color: #b0bec5;">${this.aiData.leverageUsed || 1}x on $${this.aiData.marginUsdt || this.aiData.usdBudget} margin</span>
                        </div>
                        <small class="alloc-sub" style="color: #ff9800; display: block; margin-top: 5px;">Est. fees & funding: -$${this.aiData.estimatedFeesUsd || '0.00'} USDT</small>
                      </div>

                      <div class="alloc-card alloc-profit" style="grid-column: span 2; ${this.aiData.signal.toUpperCase() === 'HOLD' ? 'opacity: 0.5;' : ''}">
                        <span class="alloc-label" style="display: flex; justify-content: space-between;">
                          <span>Take Profit Targets (TP1, TP2, TP3)</span>
                          ${this.aiData.expectedDuration ? `<span style="text-transform: none; color: #64b5f6; font-size: 11px; letter-spacing: 0;">Expected Duration: ${this.aiData.expectedDuration} (Target: ${this.aiData.colomboTargetText || ''} Colombo Time)</span>` : ''}
                        </span>
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 5px;">
                          ${this.aiData.signal.toUpperCase() === 'HOLD' ? '<div style="color: var(--text-secondary); font-size: 13px; font-style: italic;">No active targets during HOLD condition.</div>' : (this.aiData.takeProfitLevels?.map((tp, idx) => {
                            const direction = (this.aiData.signal.includes('BUY') || !this.aiData.signal.includes('SELL')) ? 'long' : 'short';
                            const priceMovePct = direction === 'short' ? (this.aiData.entryPrice - tp.price) / this.aiData.entryPrice : (tp.price - this.aiData.entryPrice) / this.aiData.entryPrice;
                            const grossPnl = (this.aiData.positionSizeUsdt || (this.aiData.usdBudget * (this.aiData.leverageUsed || 1))) * priceMovePct;
                            const netPnlLkr = (grossPnl - (this.aiData.estimatedFeesUsd || 0)) * this.aiData.usdToLkr;
                            return `
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                              <span><strong>TP${idx + 1}</strong> @ $${tp.price.toFixed(4)}</span>
                              <span style="color: #00e676;">+${tp.percentage.toFixed(2)}% (+LKR ${Math.max(0, netPnlLkr).toLocaleString(undefined, {maximumFractionDigits: 0})})</span>
                            </div>
                            `;
                          }).join('') || '')}
                        </div>
                      </div>

                      <div class="alloc-card alloc-loss" style="grid-column: span 2; ${this.aiData.signal.toUpperCase() === 'HOLD' ? 'opacity: 0.5;' : ''}">
                        <span class="alloc-label">Max Risk (Stop Loss)</span>
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-top: 5px;">
                          <span><strong>SL</strong> ${this.aiData.signal.toUpperCase() === 'HOLD' ? 'N/A' : `@ $${this.aiData.stopLossPrice}`}</span>
                          <span style="color: #ff1744;">${this.aiData.signal.toUpperCase() === 'HOLD' ? 'N/A' : `-LKR ${this.aiData.potentialLossLkr.toLocaleString()}`}</span>
                        </div>
                        <small class="alloc-sub" style="margin-top: 5px; display: block;">Reason: ${this.aiData.stopLossReason}</small>
                      </div>
                    </div>

                    <!-- AI Diagram Action Bar -->
                    <div class="ai-action-bar-stacked">
                      <div class="ai-action-bar-top-row">
                        <button type="button" id="apply-ai-overlay-btn" class="ai-overlay-btn apply-btn" title="Apply AI trade plan arrows, WE ARE HERE pointer, and target TP lines directly to your main TradingView chart">
                          <i data-lucide="pin"></i> Apply AI Diagram to Main Chart
                        </button>

                        <button type="button" id="reset-ai-overlay-btn" class="ai-overlay-btn reset-btn" title="Clear AI arrows, target lines, and markers from the main chart">
                          <i data-lucide="rotate-ccw"></i> Reset AI
                        </button>
                      </div>
                      
                      <div style="text-align: center; margin-top: 10px;">
                        <span style="font-size: 11px; color: #ffb74d; background: rgba(255,183,77,0.1); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,183,77,0.2);">
                          <i data-lucide="shield-alert" style="width:12px; height:12px; display:inline-block; vertical-align:text-bottom;"></i> Trade will execute in <strong>ISOLATED MARGIN</strong> mode to strictly cap maximum risk.
                        </span>
                      </div>

                      <button type="button" id="open-ai-modal-btn" class="open-ai-modal-btn" title="Open AI Focused Deep Analysis Modal">
                        <i data-lucide="search"></i> Open AI Focused Chart & Deep Analysis Modal
                      </button>

                      <div class="ai-demo-trade-row" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px;">
                        <input type="number" id="demo-trade-amount" class="custom-num-input" style="width: 120px;" placeholder="Amount (USD)" value="${this.aiData.usdBudget > 0 ? (this.aiData.usdBudget).toFixed(2) : '1000'}" />
                        <button type="button" id="execute-demo-trade-btn" class="ai-overlay-btn" style="background: #f59e0b; color: #fff; flex: 1;" ${this.aiData.signal.toUpperCase() === 'HOLD' ? 'disabled' : ''}>
                          <i data-lucide="wallet"></i> Execute Demo Trade
                        </button>
                      </div>

                      <!-- Manual Profit/Loss Calculator -->
                      <div class="pnl-calculator-container" style="margin-top: 15px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.2);">
                        <button type="button" id="toggle-pnl-calc-btn" style="width: 100%; padding: 12px; background: none; border: none; color: #90caf9; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 13px;">
                          <span style="display: flex; align-items: center; gap: 8px;"><i data-lucide="calculator"></i> Manual Profit/Loss Calculator</span>
                          <i data-lucide="chevron-down" id="pnl-calc-chevron"></i>
                        </button>
                        <div id="pnl-calc-form" style="display: none; padding: 15px; border-top: 1px solid rgba(255,255,255,0.05); gap: 10px; flex-direction: column;">
                          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Margin (USDT)</label>
                              <input type="number" id="pnl-calc-margin" class="custom-num-input" style="width: 100%;" value="${this.aiData.marginUsdt || 100}" />
                            </div>
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Leverage</label>
                              <input type="number" id="pnl-calc-leverage" class="custom-num-input" style="width: 100%;" value="${this.aiData.leverageUsed || 10}" />
                            </div>
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Entry Price</label>
                              <input type="number" id="pnl-calc-entry" class="custom-num-input" style="width: 100%;" value="${this.aiData.entryPrice || 0}" />
                            </div>
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Direction</label>
                              <select id="pnl-calc-direction" class="custom-select" style="width: 100%;">
                                <option value="long" ${this.aiData.signal.includes('BUY') ? 'selected' : ''}>Long (Buy)</option>
                                <option value="short" ${this.aiData.signal.includes('SELL') ? 'selected' : ''}>Short (Sell)</option>
                              </select>
                            </div>
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Take Profit (TP)</label>
                              <input type="number" id="pnl-calc-tp" class="custom-num-input" style="width: 100%;" value="${this.aiData.takeProfitLevels?.[0]?.price || 0}" />
                            </div>
                            <div>
                              <label style="font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block;">Stop Loss (SL)</label>
                              <input type="number" id="pnl-calc-sl" class="custom-num-input" style="width: 100%;" value="${this.aiData.stopLossPrice || 0}" />
                            </div>
                          </div>
                          
                          <div style="background: rgba(33, 150, 243, 0.05); padding: 10px; border-radius: 6px; border: 1px solid rgba(33, 150, 243, 0.2); margin-top: 5px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                              <span style="color: #9ca3af;">Position Size:</span>
                              <strong id="pnl-calc-size" style="color: #e5e7eb;">$0.00</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                              <span style="color: #9ca3af;">Est. Fees & Funding:</span>
                              <strong id="pnl-calc-fees" style="color: #ff9800;">-$0.00</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                              <span style="color: #9ca3af;">Net Profit @ TP:</span>
                              <strong id="pnl-calc-net-tp" style="color: #00e676;">+$0.00</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                              <span style="color: #9ca3af;">Net Loss @ SL:</span>
                              <strong id="pnl-calc-net-sl" style="color: #ff1744;">-$0.00</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 10px;">
                              <span style="color: #9ca3af;">ROI @ TP:</span>
                              <strong id="pnl-calc-roi" style="color: #64b5f6;">0.00%</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                ` : `
                  <div class="ai-placeholder-box">
                    <p class="placeholder-text">Enter your LKR trading budget, select your target duration, and click "Generate AI Trade Plan" to analyze key S/R bounces and receive optimal coin buying targets.</p>
                  </div>
                `))}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  openFocusedModal() {
    if (this.aiData && this.modal) {
      this.modal.open(this.aiData, this.marketContext);
    }
  }

  attachEvents() {
    const triggerBar = this.container.querySelector('#ai-drawer-trigger');
    triggerBar?.addEventListener('click', (e) => {
      if (e.target.closest('#close-ai-panel-btn')) return;
      this.toggleDrawer();
    });

    const closeBtn = this.container.querySelector('#close-ai-panel-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
    });

    const budgetInput = this.container.querySelector('#lkr-budget-input');
    const usdBadge = this.container.querySelector('#usd-equiv-badge');

    budgetInput?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      this.lkrBudget = val;
      if (usdBadge) {
        usdBadge.textContent = `≈ $${(val / this.liveRate).toFixed(2)} USD`;
      }
    });

    const durationSelect = this.container.querySelector('#trade-duration-select');
    durationSelect?.addEventListener('change', (e) => {
      this.tradeDuration = e.target.value;
    });

    const leverageSelectInput = this.container.querySelector('#leverage-select');
    leverageSelectInput?.addEventListener('change', (e) => {
      this.leverage = parseInt(e.target.value, 10);
    });

    const contextInput = this.container.querySelector('#ai-manual-context');
    contextInput?.addEventListener('input', (e) => {
      this.userContext = e.target.value;
    });

    const fileInput = this.container.querySelector('#ai-chart-image');
    const previewImg = this.container.querySelector('#ai-chart-preview');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.chartImageBase64 = event.target.result;
          if (previewImg) {
            previewImg.src = this.chartImageBase64;
            previewImg.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      } else {
        this.chartImageBase64 = null;
        if (previewImg) previewImg.style.display = 'none';
      }
    });

    const generateBtn = this.container.querySelector('#generate-ai-btn');
    generateBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!this.marketContext || !this.marketContext.currentPrice) {
        alert('Market data is loading. Please wait a moment and try again.');
        return;
      }

      const leverageSelect = this.container.querySelector('#leverage-select');
      if (leverageSelect) {
        this.leverage = parseInt(leverageSelect.value, 10);
      }

      this.isLoading = true;
      this.errorMsg = null;
      this.render();

      try {
        const result = await fetchGeminiTradeSuggestion(this.marketContext, this.lkrBudget, this.tradeDuration, this.userContext, this.chartImageBase64, this.leverage);
        this.aiData = result;
        this.errorMsg = null;
        
        // Clear image from memory immediately after generation
        this.chartImageBase64 = null;
        if (fileInput) fileInput.value = '';

        // Parse expected duration and calculate target resolution time
        let addMs = 2 * 60 * 60 * 1000; // default 2 hours
        if (result.expectedDuration) {
          const match = result.expectedDuration.match(/(\d+)\s*(minute|hour|day|week)/i);
          if (match) {
            let maxVal = parseInt(match[1], 10);
            // check if there's a second number like "3 to 6 hours"
            const matchTo = result.expectedDuration.match(/to\s*(\d+)/i);
            if (matchTo) maxVal = parseInt(matchTo[1], 10);
            
            const unit = match[2].toLowerCase();
            if (unit.includes('minute')) addMs = maxVal * 60 * 1000;
            else if (unit.includes('hour')) addMs = maxVal * 60 * 60 * 1000;
            else if (unit.includes('day')) addMs = maxVal * 24 * 60 * 60 * 1000;
            else if (unit.includes('week')) addMs = maxVal * 7 * 24 * 60 * 60 * 1000;
          }
        }
        const targetDate = new Date(Date.now() + addMs);
        const targetResolutionTime = targetDate.toISOString();
        this.aiData.colomboTargetText = targetDate.toLocaleString('en-US', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });

        // Save to Supabase DB
        try {
          const session = await getCurrentSession();
          if (session?.user?.id) {
            await saveAIPrediction({
              user_id: session.user.id,
              symbol: this.marketContext.symbol || 'UNKNOWN',
              timeframe: this.tradeDuration,
              signal: result.signal,
              entry_price: result.entryPrice,
              stop_loss_price: result.stopLossPrice,
              take_profit_levels: result.takeProfitLevels,
              expected_duration_text: result.expectedDuration || 'Unknown',
              target_resolution_time: targetResolutionTime,
              target_colombo_time_text: this.aiData.colomboTargetText
            });
            console.log('Saved prediction to DB with target time:', targetResolutionTime);
          }
        } catch (dbErr) {
          console.warn('Failed to save AI prediction to history:', dbErr);
        }

        // Automatically apply AI Diagram overlay to main chart when generated!
        this.onApplyAIOverlay(this.aiData);
      } catch (err) {
        console.error('Gemini AI Call Error:', err);
        this.aiData = null;
        this.errorMsg = err.message || 'Gemini API call failed to connect.';
      } finally {
        this.isLoading = false;
        this.render();
      }
    });

    // Apply AI Diagram to Main Chart Listener
    const applyOverlayBtn = this.container.querySelector('#apply-ai-overlay-btn');
    applyOverlayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.aiData) {
        this.onApplyAIOverlay(this.aiData);
      }
    });

    // Reset AI Markings Listener
    const resetOverlayBtn = this.container.querySelector('#reset-ai-overlay-btn');
    resetOverlayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onResetAIOverlay();
    });

    // Open Modal Listener
    const openModalBtn = this.container.querySelector('#open-ai-modal-btn');
    openModalBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFocusedModal();
    });

    const execDemoBtn = this.container.querySelector('#execute-demo-trade-btn');
    execDemoBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      const amountInput = this.container.querySelector('#demo-trade-amount');
      const amount = parseFloat(amountInput?.value || 0);
      
      if (!amount || amount <= 0) {
        alert('Please enter a valid investment amount in USD.');
        return;
      }

      const session = await getCurrentSession();
      if (!session) {
        alert('Please log in to use Demo Trading.');
        return;
      }

      try {
        const tradeData = {
          symbol: this.marketContext.symbol,
          signal: this.aiData.signal,
          leverage: this.leverage,
          investment_amount: amount, // This is the Margin
          quantity: this.aiData.coinsToBuy,
          margin_type: 'ISOLATED',
          entry_price: parseFloat(this.aiData.entryPrice),
          take_profit: this.aiData.takeProfitLevels?.length > 0 ? parseFloat(this.aiData.takeProfitLevels[0].price) : null,
          stop_loss: parseFloat(this.aiData.stopLossPrice) || null
        };
        
        await placeDemoTrade(tradeData);
        alert('Demo trade placed successfully! Open the Demo Trading panel to view it.');
      } catch (err) {
        alert('Failed to place demo trade: ' + err.message);
      }
    });

    // Manual PnL Calculator Logic
    const togglePnlBtn = this.container.querySelector('#toggle-pnl-calc-btn');
    const pnlForm = this.container.querySelector('#pnl-calc-form');
    const pnlChevron = this.container.querySelector('#pnl-calc-chevron');
    
    if (togglePnlBtn && pnlForm) {
      togglePnlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = pnlForm.style.display === 'none';
        pnlForm.style.display = isHidden ? 'flex' : 'none';
        if (pnlChevron) {
          pnlChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
          pnlChevron.style.transition = 'transform 0.2s';
        }
        if (isHidden) calculatePnl();
      });

      const calcInputs = [
        '#pnl-calc-margin', '#pnl-calc-leverage', '#pnl-calc-entry', 
        '#pnl-calc-direction', '#pnl-calc-tp', '#pnl-calc-sl'
      ];
      
      const calculatePnl = () => {
        const margin = parseFloat(this.container.querySelector('#pnl-calc-margin').value) || 0;
        const lev = parseFloat(this.container.querySelector('#pnl-calc-leverage').value) || 1;
        const entry = parseFloat(this.container.querySelector('#pnl-calc-entry').value) || 0;
        const dir = this.container.querySelector('#pnl-calc-direction').value;
        const tp = parseFloat(this.container.querySelector('#pnl-calc-tp').value) || 0;
        const sl = parseFloat(this.container.querySelector('#pnl-calc-sl').value) || 0;

        if (!entry || !margin) return;

        const posSize = margin * lev;
        const feeRate = 0.0005; // 0.05% taker
        const estFees = posSize * feeRate * 2; // entry + exit
        
        let tpNet = 0;
        let slNet = 0;

        if (dir === 'short') {
          if (tp) tpNet = (posSize * ((entry - tp) / entry)) - estFees;
          if (sl) slNet = (posSize * ((entry - sl) / entry)) - estFees;
        } else {
          if (tp) tpNet = (posSize * ((tp - entry) / entry)) - estFees;
          if (sl) slNet = (posSize * ((sl - entry) / entry)) - estFees;
        }

        const roi = (tpNet / margin) * 100;

        this.container.querySelector('#pnl-calc-size').textContent = `$${posSize.toFixed(2)}`;
        this.container.querySelector('#pnl-calc-fees').textContent = `-$${estFees.toFixed(2)}`;
        
        const tpEl = this.container.querySelector('#pnl-calc-net-tp');
        tpEl.textContent = tpNet >= 0 ? `+$${tpNet.toFixed(2)}` : `-$${Math.abs(tpNet).toFixed(2)}`;
        tpEl.style.color = tpNet >= 0 ? '#00e676' : '#ff1744';

        const slEl = this.container.querySelector('#pnl-calc-net-sl');
        slEl.textContent = slNet >= 0 ? `+$${slNet.toFixed(2)}` : `-$${Math.abs(slNet).toFixed(2)}`;
        slEl.style.color = slNet >= 0 ? '#00e676' : '#ff1744';

        const roiEl = this.container.querySelector('#pnl-calc-roi');
        roiEl.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
        roiEl.style.color = roi >= 0 ? '#64b5f6' : '#ff1744';
      };

      calcInputs.forEach(selector => {
        this.container.querySelector(selector)?.addEventListener('input', calculatePnl);
      });
    }

    // Open History Modal Listener
    const openHistoryBtn = this.container.querySelector('#open-history-modal-btn');
    openHistoryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const modalOverlay = document.getElementById('ai-history-modal-overlay');
      if (modalOverlay) {
        modalOverlay.style.display = 'flex';
        // The PredictionHistory component will load its data. We need to dispatch an event or instantiate it here.
        document.dispatchEvent(new CustomEvent('open-prediction-history'));
      }
    });
  }
}
