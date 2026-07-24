import { getDemoAccount, placeDemoTrade } from '../api/demoTradeApi.js';
import { getLivePrice } from '../api/cryptoApi.js';
import { getCurrentSession } from '../api/supabaseClient.js';

export class ManualTradePanel {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.marketContext = options.marketContext || { symbol: 'PI-USDT' };
    this.onTradeSuccess = options.onTradeSuccess || (() => {});
    
    this.currentPrice = 0;
    this.pollingInterval = null;
    this.accountBalance = 0;
    
    this.render();
    this.startPolling();
    this.fetchAccount();
  }

  async fetchAccount() {
    try {
      const session = await getCurrentSession();
      if (session) {
        const acc = await getDemoAccount();
        if (acc) {
          this.accountBalance = acc.balance;
          this.updateBalanceDisplay();
        }
      }
    } catch (e) {
      console.warn('Could not fetch demo account for manual trade panel', e);
    }
  }

  updateContext(marketContext) {
    if (this.marketContext.symbol !== marketContext.symbol) {
      this.marketContext = { ...this.marketContext, ...marketContext };
      this.render();
      this.fetchAccount();
    }
  }

  startPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    
    const updatePrice = async () => {
      try {
        const price = await getLivePrice(this.marketContext.symbol);
        if (price) {
          this.currentPrice = price;
          const tickerEl = this.container.querySelector('#trade-live-price');
          if (tickerEl) {
            tickerEl.textContent = `$${price.toFixed(4)}`;
          }
        }
      } catch (e) {
        // ignore
      }
    };
    
    updatePrice();
    this.pollingInterval = setInterval(updatePrice, 3000);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="trade-ticker">
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">${this.marketContext.symbol} Live Price</div>
        <div id="trade-live-price" style="color: #fff;">$0.0000</div>
      </div>
      
      <div style="margin-top: 20px;">
        <div class="trade-form-group">
          <label>Order Type</label>
          <select class="custom-select" disabled>
            <option>Market (Instant)</option>
          </select>
        </div>

        <div class="trade-form-group" style="margin-top: 15px;">
          <div style="display: flex; justify-content: space-between;">
            <label>Leverage</label>
            <label id="leverage-val-label">1x</label>
          </div>
          <input type="range" id="trade-leverage" class="custom-range" style="width: 100%;" min="1" max="100" value="1">
        </div>

        <div class="trade-form-group" style="margin-top: 15px;">
          <div style="display: flex; justify-content: space-between;">
            <label>Margin (USD)</label>
            <label id="avail-balance-label" style="font-size: 0.7rem;">Avail: $${this.accountBalance.toFixed(2)}</label>
          </div>
          <input type="number" id="trade-margin" placeholder="0.00" min="1">
          <div class="trade-percent-btns">
            <button type="button" class="trade-pct-btn" data-pct="0.25">25%</button>
            <button type="button" class="trade-pct-btn" data-pct="0.50">50%</button>
            <button type="button" class="trade-pct-btn" data-pct="0.75">75%</button>
            <button type="button" class="trade-pct-btn" data-pct="1.00">100%</button>
          </div>
        </div>

        <div class="trade-form-group" style="margin-top: 15px;">
          <label>Take Profit 1 (Optional)</label>
          <input type="number" id="trade-tp1" placeholder="Price">
        </div>
        
        <div class="trade-form-group" style="margin-top: 10px;">
          <label>Take Profit 2 (Optional)</label>
          <input type="number" id="trade-tp2" placeholder="Price">
        </div>
        
        <div class="trade-form-group" style="margin-top: 10px;">
          <label>Take Profit 3 (Optional)</label>
          <input type="number" id="trade-tp3" placeholder="Price">
        </div>

        <div class="trade-form-group" style="margin-top: 15px;">
          <label>Stop Loss (Optional)</label>
          <input type="number" id="trade-sl" placeholder="Price">
        </div>

        <div class="trade-action-btns">
          <button type="button" id="btn-buy-long" class="trade-action-btn buy">BUY / LONG</button>
          <button type="button" id="btn-sell-short" class="trade-action-btn sell">SELL / SHORT</button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  updateBalanceDisplay() {
    const lbl = this.container.querySelector('#avail-balance-label');
    if (lbl) {
      lbl.textContent = `Avail: $${this.accountBalance.toFixed(2)}`;
    }
  }

  attachEvents() {
    const levInput = this.container.querySelector('#trade-leverage');
    const levLabel = this.container.querySelector('#leverage-val-label');
    if (levInput && levLabel) {
      levInput.addEventListener('input', (e) => {
        levLabel.textContent = `${e.target.value}x`;
      });
    }

    const pctBtns = this.container.querySelectorAll('.trade-pct-btn');
    const marginInput = this.container.querySelector('#trade-margin');
    
    pctBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.getAttribute('data-pct'));
        const val = this.accountBalance * pct;
        if (marginInput) {
          marginInput.value = val.toFixed(2);
        }
      });
    });

    const buyBtn = this.container.querySelector('#btn-buy-long');
    const sellBtn = this.container.querySelector('#btn-sell-short');

    const execute = async (signal) => {
      const marginStr = marginInput?.value;
      const margin = parseFloat(marginStr || 0);
      if (!margin || margin <= 0) {
        alert('Please enter a valid Margin (USD)');
        return;
      }
      
      if (margin > this.accountBalance) {
        alert('Insufficient demo funds.');
        return;
      }

      if (!this.currentPrice) {
        alert('Waiting for live price data. Please try again in a second.');
        return;
      }

      const lev = parseFloat(levInput?.value || 1);
      const tp1 = parseFloat(this.container.querySelector('#trade-tp1')?.value) || null;
      const tp2 = parseFloat(this.container.querySelector('#trade-tp2')?.value) || null;
      const tp3 = parseFloat(this.container.querySelector('#trade-tp3')?.value) || null;
      const sl = parseFloat(this.container.querySelector('#trade-sl')?.value) || null;

      try {
        const tradeData = {
          symbol: this.marketContext.symbol,
          signal: signal,
          leverage: lev,
          investment_amount: margin,
          entry_price: this.currentPrice,
          tp1: tp1,
          tp2: tp2,
          tp3: tp3,
          stop_loss: sl
        };

        const result = await placeDemoTrade(tradeData);
        if (result) {
          alert('Trade executed successfully!');
          this.fetchAccount(); // Update balance
          marginInput.value = '';
          this.onTradeSuccess();
        }
      } catch (err) {
        alert('Error placing trade: ' + err.message);
      }
    };

    buyBtn?.addEventListener('click', () => execute('BUY'));
    sellBtn?.addEventListener('click', () => execute('SELL'));
  }
}
