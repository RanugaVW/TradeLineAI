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

export class AITradePanel {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.isOpen = false;
    this.isClosed = false;
    this.lkrBudget = 100000;
    this.liveRate = 305.0;
    this.tradeDuration = 'Day Trade (1 - 24h)';
    this.marketContext = null;
    this.aiData = null;
    this.isLoading = false;
    this.errorMsg = null;

    const modalOverlay = document.getElementById('ai-modal-overlay');
    this.modal = modalOverlay ? new AITradeModal(modalOverlay) : null;

    this.onApplyAIOverlay = options.onApplyAIOverlay || (() => { });
    this.onResetAIOverlay = options.onResetAIOverlay || (() => { });
    this.onTogglePanel = options.onTogglePanel || (() => { });

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
    this.isOpen = !this.isOpen;
    this.render();
    if (this.onTogglePanel) {
      this.onTogglePanel();
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
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
      floatBtn.innerHTML = '🤖 Open AI Advisor ▼';
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
            <span class="ai-sparkle-icon">🤖</span>
            <span class="trigger-title">TradeLine AI Market Trade Advisor & LKR Optimizer</span>
            <span class="trigger-badge">${this.aiData ? `${this.aiData.signal} (${this.aiData.confidence}%)` : 'Interactive AI Tool'}</span>
          </div>

          <div class="trigger-right">
            <span class="trigger-sub">${this.isOpen ? 'Click to Close Panel' : 'Click to Open AI Trade Calculator & Signals'}</span>
            <span class="drawer-arrow">${this.isOpen ? '▲' : '▼'}</span>
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
                  <option value="Scalp (15m - 1h)" ${this.tradeDuration.includes('Scalp') ? 'selected' : ''}>⚡ Scalp (15m - 1h)</option>
                  <option value="Day Trade (1 - 24h)" ${this.tradeDuration.includes('Day Trade') ? 'selected' : ''}>📈 Day Trade (1 - 24h)</option>
                  <option value="Swing Trade (1 - 7d)" ${this.tradeDuration.includes('Swing') ? 'selected' : ''}>📊 Swing Trade (1 - 7d)</option>
                  <option value="Position Trade (1w+)" ${this.tradeDuration.includes('Position') ? 'selected' : ''}>🚀 Position Trade (1w+)</option>
                </select>
                <small class="field-hint">Adjusts Gemini AI reasoning and S/R bounce timeframe focus</small>
              </div>

              <button type="button" id="generate-ai-btn" class="generate-ai-btn ${this.isLoading ? 'loading' : ''}">
                ${this.isLoading ? '<span class="spinner"></span> Analyzing Market...' : 'Generate AI Trade Plan'}
              </button>
            </div>

            <!-- Right Results Display Card -->
            <div class="ai-results-card">
              <h4 class="card-section-title">📊 TradeLine AI Output & Allocation</h4>

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
                        <small class="alloc-sub">($${this.aiData.usdBudget} USD)</small>
                      </div>

                      <div class="alloc-card alloc-primary">
                        <span class="alloc-label">Optimized Coins to Buy</span>
                        <span class="alloc-val">${this.aiData.coinsToBuy} ${this.marketContext?.symbol?.split('-')[0] || ''}</span>
                        <small class="alloc-sub">Entry @ $${this.aiData.entryPrice}</small>
                      </div>

                      <div class="alloc-card alloc-profit">
                        <span class="alloc-label">Target Take Profit</span>
                        <span class="alloc-val">+$${this.aiData.potentialProfitUsd}</span>
                        <small class="alloc-sub">+LKR ${this.aiData.potentialProfitLkr.toLocaleString()} (@ $${this.aiData.takeProfitPrice})</small>
                      </div>

                      <div class="alloc-card alloc-loss">
                        <span class="alloc-label">Max Risk (Stop Loss)</span>
                        <span class="alloc-val">-$${(this.aiData.usdBudget - (this.aiData.stopLossPrice * this.aiData.coinsToBuy)).toFixed(2)}</span>
                        <small class="alloc-sub">-LKR ${this.aiData.potentialLossLkr.toLocaleString()} (@ $${this.aiData.stopLossPrice})</small>
                      </div>
                    </div>

                    <!-- AI Diagram Action Bar -->
                    <div class="ai-action-bar-stacked">
                      <div class="ai-action-bar-top-row">
                        <button type="button" id="apply-ai-overlay-btn" class="ai-overlay-btn apply-btn" title="Apply AI trade plan arrows, WE ARE HERE pointer, and target TP lines directly to your main TradingView chart">
                          📌 Apply AI Diagram to Main Chart
                        </button>

                        <button type="button" id="reset-ai-overlay-btn" class="ai-overlay-btn reset-btn" title="Clear AI arrows, target lines, and markers from the main chart">
                          ↺ Reset AI
                        </button>
                      </div>

                      <button type="button" id="open-ai-modal-btn" class="open-ai-modal-btn" title="Open AI Focused Deep Analysis Modal">
                        🔍 Open AI Focused Chart & Deep Analysis Modal
                      </button>
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

    const generateBtn = this.container.querySelector('#generate-ai-btn');
    generateBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!this.marketContext || !this.marketContext.currentPrice) {
        alert('Market data is loading. Please wait a moment and try again.');
        return;
      }

      this.isLoading = true;
      this.errorMsg = null;
      this.render();

      try {
        const result = await fetchGeminiTradeSuggestion(this.marketContext, this.lkrBudget, this.tradeDuration);
        this.aiData = result;
        this.errorMsg = null;

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
      if (this.aiData && this.modal) {
        this.modal.open(this.aiData, this.marketContext);
      }
    });
  }
}
