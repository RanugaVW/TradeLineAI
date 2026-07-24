import { getDemoAccount, getDemoTrades, getOpenDemoTrades, closeDemoTrade } from '../api/demoTradeApi.js';
import { getLivePrice } from '../api/cryptoApi.js';

export class DemoTradingPanel {
  constructor(containerElement) {
    this.container = containerElement;
    this.isOpen = false;
    this.account = null;
    this.openTrades = [];
    this.closedTrades = [];
    this.livePrices = {}; // Cache of current prices for open symbols
    this.pollingInterval = null;
    
    // State
    this.activeTab = 'OPEN'; // 'OPEN' or 'HISTORY'
    this.historyFilter = 'ALL'; // 'ALL', 'PROFIT', 'LOSS'
    this.currentPage = 1;
    this.limit = 10;
    this.totalPages = 1;

    this.render();
    this.attachEvents();
  }

  async open() {
    this.isOpen = true;
    this.container.style.display = 'block';
    
    this.account = await getDemoAccount();
    
    if (this.activeTab === 'OPEN') {
      this.openTrades = await getOpenDemoTrades();
    } else {
      await this.loadHistoryPage();
    }
    
    this.renderContent();
    this.startLivePolling();
  }

  async loadHistoryPage() {
    const { data, count } = await getDemoTrades(this.currentPage, this.limit, this.historyFilter);
    this.closedTrades = data;
    this.totalPages = Math.ceil(count / this.limit) || 1;
  }

  close() {
    this.isOpen = false;
    this.container.style.display = 'none';
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  startLivePolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);

    // Initial poll
    this.updateLivePrices();

    // Poll every 10 seconds
    this.pollingInterval = setInterval(() => {
      this.updateLivePrices();
    }, 10000);
  }

  async updateLivePrices() {
    if (!this.isOpen || this.activeTab !== 'OPEN') return; // Only poll if viewing open positions

    if (this.openTrades.length === 0) {
      this.renderContent();
      return;
    }

    const uniqueSymbols = [...new Set(this.openTrades.map(t => t.symbol))];
    
    for (const symbol of uniqueSymbols) {
      try {
        const price = await getLivePrice(symbol);
        if (price) {
          this.livePrices[symbol] = price;
        }
      } catch (e) {
        console.error('Error fetching live price for demo trade:', e);
      }
    }

    this.renderContent();
  }

  async handleCloseTrade(tradeId) {
    try {
      const trade = this.openTrades.find(t => t.id === tradeId);
      if (!trade) return;
      
      const currentPrice = this.livePrices[trade.symbol];
      if (!currentPrice) {
        alert('Wait for live price to load before closing.');
        return;
      }

      await closeDemoTrade(tradeId, currentPrice);
      
      // Refresh
      this.account = await getDemoAccount();
      this.openTrades = await getOpenDemoTrades();
      this.renderContent();
    } catch (e) {
      alert('Error closing trade: ' + e.message);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="demo-modal-overlay"></div>
      <div class="demo-modal-content">
        <div class="demo-header">
          <h2><i data-lucide="wallet"></i> Live Demo Portfolio</h2>
          <button class="close-demo-btn"><i data-lucide="x"></i></button>
        </div>
        <div class="demo-body" id="demo-body-content">
          Loading...
        </div>
      </div>
    `;
    // Re-initialize icons
    if (window.lucide) window.lucide.createIcons();
  }

  attachEvents() {
    const closeBtn = this.container.querySelector('.close-demo-btn');
    const overlay = this.container.querySelector('.demo-modal-overlay');

    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', () => this.close());
    
    this.container.addEventListener('click', async (e) => {
      // Delegate close trade clicks
      if (e.target.closest('.close-trade-btn')) {
        const btn = e.target.closest('.close-trade-btn');
        const tradeId = btn.getAttribute('data-id');
        this.handleCloseTrade(tradeId);
      }

      // Delegate tab clicks
      if (e.target.closest('.demo-tab-btn')) {
        const btn = e.target.closest('.demo-tab-btn');
        const tab = btn.getAttribute('data-tab');
        if (this.activeTab !== tab) {
          this.activeTab = tab;
          
          const body = this.container.querySelector('#demo-body-content');
          if (body) body.innerHTML = 'Loading...';

          if (this.activeTab === 'HISTORY') {
            this.currentPage = 1;
            this.historyFilter = 'ALL';
            await this.loadHistoryPage();
          } else {
            this.openTrades = await getOpenDemoTrades();
            this.updateLivePrices(); // trigger a poll immediately
          }
          this.renderContent();
        }
      }

      // Delegate history filter clicks
      if (e.target.closest('.demo-history-filter-btn')) {
        const btn = e.target.closest('.demo-history-filter-btn');
        const filter = btn.getAttribute('data-filter');
        if (this.historyFilter !== filter) {
          this.historyFilter = filter;
          this.currentPage = 1;
          
          const body = this.container.querySelector('#demo-body-content');
          if (body) body.innerHTML = 'Loading...';
          await this.loadHistoryPage();
          this.renderContent();
        }
      }

      // Delegate pagination clicks
      if (e.target.closest('#demo-prev-btn')) {
        if (this.currentPage > 1) {
          this.currentPage--;
          const body = this.container.querySelector('#demo-body-content');
          if (body) body.innerHTML = 'Loading...';
          await this.loadHistoryPage();
          this.renderContent();
        }
      }

      if (e.target.closest('#demo-next-btn')) {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          const body = this.container.querySelector('#demo-body-content');
          if (body) body.innerHTML = 'Loading...';
          await this.loadHistoryPage();
          this.renderContent();
        }
      }
    });
  }

  renderContent() {
    const body = this.container.querySelector('#demo-body-content');
    if (!body) return;

    if (!this.account) {
      body.innerHTML = `<p>Error loading account or please log in.</p>`;
      return;
    }

    let floatingPnl = 0;

    const openRows = this.openTrades.map(t => {
      const livePrice = this.livePrices[t.symbol] || 0;
      const entryPrice = parseFloat(t.entry_price);
      let pnl = 0;
      
      if (livePrice > 0) {
        const amountCrypto = t.investment_amount * t.leverage / entryPrice;
        if (t.signal.includes('BUY')) {
          pnl = (livePrice - entryPrice) * amountCrypto;
        } else if (t.signal.includes('SELL')) {
          pnl = (entryPrice - livePrice) * amountCrypto;
        }
        floatingPnl += pnl;
      }

      const pnlClass = pnl >= 0 ? 'text-green' : 'text-red';
      const sign = pnl >= 0 ? '+' : '';

      return `
        <tr>
          <td>${t.symbol}</td>
          <td><span class="${t.signal.includes('BUY') ? 'badge-bull' : 'badge-bear'}">${t.signal}</span> (${t.leverage}x)</td>
          <td>$${t.investment_amount.toLocaleString()}</td>
          <td>$${entryPrice.toFixed(4)}</td>
          <td>${livePrice > 0 ? '$' + livePrice.toFixed(4) : 'Loading...'}</td>
          <td class="${pnlClass}">${sign}$${pnl.toFixed(2)}</td>
          <td><button class="pill-btn close-trade-btn" data-id="${t.id}">Close</button></td>
        </tr>
      `;
    }).join('');

    const closedRows = this.closedTrades.map(t => {
      const pnl = parseFloat(t.pnl_usd || 0);
      const pnlClass = pnl >= 0 ? 'text-green' : 'text-red';
      const sign = pnl >= 0 ? '+' : '';
      
      return `
        <tr>
          <td>${t.symbol}</td>
          <td><span class="${t.signal.includes('BUY') ? 'badge-bull' : 'badge-bear'}">${t.signal}</span> (${t.leverage}x)</td>
          <td>$${parseFloat(t.entry_price).toFixed(4)}</td>
          <td>$${parseFloat(t.close_price || 0).toFixed(4)}</td>
          <td class="${pnlClass}">${sign}$${pnl.toFixed(2)}</td>
          <td>${new Date(t.close_time).toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    const totalEquity = this.account.balance + floatingPnl;
    const balanceColor = floatingPnl >= 0 ? 'text-green' : 'text-red';

    const renderTabs = () => `
      <div class="demo-tabs-header">
        <button class="demo-tab-btn ${this.activeTab === 'OPEN' ? 'active' : ''}" data-tab="OPEN">
          Open Positions
        </button>
        <button class="demo-tab-btn ${this.activeTab === 'HISTORY' ? 'active' : ''}" data-tab="HISTORY">
          Trade History
        </button>
      </div>
    `;

    const renderOpenPositions = () => `
      ${this.openTrades.length > 0 ? `
        <table class="demo-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Margin</th>
              <th>Entry</th>
              <th>Live Price</th>
              <th>
                <div class="demo-tooltip-wrapper" style="text-decoration: underline dotted; cursor: help;">
                  Floating PNL
                  <span class="demo-tooltip">The unrealized profit or loss for this specific trade based on the live price.</span>
                </div>
              </th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${openRows}</tbody>
        </table>
      ` : `<p class="muted-text" style="padding: 20px 0;">No active positions.</p>`}
    `;

    const renderTradeHistory = () => `
      <div style="display: flex; gap: 8px; margin-bottom: 15px; margin-top: 10px;">
        <button class="demo-page-btn demo-history-filter-btn" data-filter="ALL" style="${this.historyFilter === 'ALL' ? 'background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.4); color: #fff;' : ''}">All Trades</button>
        <button class="demo-page-btn demo-history-filter-btn" data-filter="PROFIT" style="${this.historyFilter === 'PROFIT' ? 'background: rgba(0, 230, 118, 0.2); border-color: #00e676; color: #fff;' : ''}">Profited</button>
        <button class="demo-page-btn demo-history-filter-btn" data-filter="LOSS" style="${this.historyFilter === 'LOSS' ? 'background: rgba(255, 23, 68, 0.2); border-color: #ff1744; color: #fff;' : ''}">Loss</button>
      </div>
      ${this.closedTrades.length > 0 ? `
        <div class="table-container" style="max-height: 350px; overflow-y: auto;">
          <table class="demo-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Close</th>
                <th>PNL</th>
                <th>Closed At</th>
              </tr>
            </thead>
            <tbody>${closedRows}</tbody>
          </table>
        </div>
        <div class="demo-pagination-container">
          <button class="demo-page-btn" id="demo-prev-btn" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span class="demo-page-text">Page ${this.currentPage} of ${this.totalPages}</span>
          <button class="demo-page-btn" id="demo-next-btn" ${this.currentPage >= this.totalPages ? 'disabled' : ''}>Next</button>
        </div>
      ` : `<p class="muted-text" style="padding: 20px 0;">No closed trades yet.</p>`}
    `;

    body.innerHTML = `
      <div class="demo-metrics">
        <div class="metric-card">
          <div class="metric-label demo-tooltip-wrapper" style="text-decoration: underline dotted; cursor: help;">
            Available Balance
            <span class="demo-tooltip">Your currently available cash balance to place new trades.</span>
          </div>
          <div class="metric-value">$${this.account.balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label demo-tooltip-wrapper" style="text-decoration: underline dotted; cursor: help;">
            Floating PNL
            <span class="demo-tooltip">The current unrealized profit or loss of all your open positions based on live market prices.</span>
          </div>
          <div class="metric-value ${balanceColor}">${floatingPnl >= 0 ? '+' : ''}$${floatingPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label demo-tooltip-wrapper" style="text-decoration: underline dotted; cursor: help;">
            Total Equity
            <span class="demo-tooltip">Your Total Equity (Available Balance + Floating PNL). This is what your balance would be if you closed all open trades right now.</span>
          </div>
          <div class="metric-value">$${totalEquity.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
      </div>

      ${renderTabs()}
      
      <div class="demo-tab-content">
        ${this.activeTab === 'OPEN' ? renderOpenPositions() : renderTradeHistory()}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
}

