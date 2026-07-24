import { fetchUserPredictions, updatePredictionResult, getCurrentSession } from '../api/supabaseClient.js';
import { evaluateTradeOutcome } from '../api/geminiApi.js';

import { getMarketCandles } from '../api/cryptoApi.js';

export class PredictionHistory {
  constructor(containerElement) {
    this.container = containerElement;
    this.predictions = [];
    this.isLoading = false;
    this.activeTab = 'pending';
    this.currentPage = 1;
    this.itemsPerPage = 10;
  }

  async init() {
    this.render();
    await this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    this.render();
    
    try {
      const session = await getCurrentSession();
      if (!session || !session.user || !session.user.id) {
        this.container.innerHTML = '<div style="padding:20px;">Please login to view AI History.</div>';
        return;
      }

      this.predictions = await fetchUserPredictions(session.user.id);
      
      // Check for pending predictions that have expired
      const now = new Date();
      let needsReRender = false;
      
      for (const pred of this.predictions) {
        if (pred.status === 'pending') {
          const targetTime = new Date(pred.target_resolution_time);
          if (now > targetTime) {
            try {
              console.log('Evaluating expired prediction:', pred.id);
              // Fetch real historical candles
              const marketData = await getMarketCandles(pred.symbol, pred.timeframe, 300);
              const allCandles = marketData.data || [];
              
              const createdTimeSec = new Date(pred.created_at).getTime() / 1000;
              const historicalCandles = allCandles.filter(c => c.time >= createdTimeSec);
              
              if (historicalCandles.length === 0) {
                 // Fallback if no candles found in that range (or API issue)
                 historicalCandles.push({ high: Number(pred.entry_price), low: Number(pred.entry_price) });
              }

              const result = await evaluateTradeOutcome(pred, historicalCandles);
              const updated = await updatePredictionResult(pred.id, result, 'resolved');
              
              if (updated) {
                Object.assign(pred, updated);
                needsReRender = true;
              }
            } catch (evalErr) {
              console.error('Failed to evaluate prediction:', evalErr);
              alert('Evaluation error: ' + evalErr.message);
            }
          }
        }
      }

      this.isLoading = false;
      this.render();

    } catch (err) {
      console.error(err);
      this.isLoading = false;
      this.container.innerHTML = '<div style="padding:20px;">Error loading history.</div>';
    }
  }

  formatColomboTime(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });
    } catch(e) {
      return isoString;
    }
  }

  render() {
    if (this.isLoading && this.predictions.length === 0) {
      this.container.innerHTML = '<div style="padding:20px;">Loading AI Prediction History...</div>';
      return;
    }

    if (this.predictions.length === 0) {
      this.container.innerHTML = '<div style="padding:20px;">No predictions found. Generate an AI signal first!</div>';
      return;
    }

    if (!this.activeTab) this.activeTab = 'pending';

    let html = '<div style="padding: 20px; display: flex; flex-direction: column; gap: 15px;">';
    html += '<h2>AI Predictions History (Colombo Time)</h2>';
    
    const pendingActive = this.activeTab === 'pending' ? 'border-bottom: 2px solid #fbbf24; color: #fbbf24; cursor: default;' : 'color: #aaa; cursor: pointer;';
    const resolvedActive = this.activeTab === 'resolved' ? 'border-bottom: 2px solid #10b981; color: #10b981; cursor: default;' : 'color: #aaa; cursor: pointer;';

    html += `
      <div style="display: flex; gap: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 5px;">
        <div id="tab-pending" style="padding: 5px 10px; font-weight: bold; transition: color 0.3s; ${pendingActive}">⏳ Pending</div>
        <div id="tab-resolved" style="padding: 5px 10px; font-weight: bold; transition: color 0.3s; ${resolvedActive}">✅ Resolved</div>
      </div>
    `;

    html += '<div class="history-list" style="display: flex; flex-direction: column; gap: 15px; overflow-y: auto; max-height: 70vh; padding-right: 10px;">';

    const pendingPreds = this.predictions.filter(p => p.status === 'pending');
    
    // Sort resolved ones by target time descending (latest target time on top)
    const resolvedPreds = this.predictions
      .filter(p => p.status !== 'pending')
      .sort((a, b) => new Date(b.target_resolution_time) - new Date(a.target_resolution_time));

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;

    const visiblePending = pendingPreds.slice(startIndex, endIndex);
    const visibleResolved = resolvedPreds.slice(startIndex, endIndex);

    const totalPagesPending = Math.ceil(pendingPreds.length / this.itemsPerPage) || 1;
    const totalPagesResolved = Math.ceil(resolvedPreds.length / this.itemsPerPage) || 1;

    const renderCard = (pred) => {
      const isPending = pred.status === 'pending';
      const evalStatus = (pred.evaluation_result && pred.evaluation_result.status) ? pred.evaluation_result.status : '';

      let statusColor = '#fbbf24'; // yellow
      if (!isPending) {
        statusColor = evalStatus.includes('tp') ? '#10b981' : '#ef4444'; // green or red
      }
      const evalText = (pred.evaluation_result && pred.evaluation_result.feedback) 
        ? pred.evaluation_result.feedback 
        : (isPending ? 'Waiting for timeframe to complete...' : 'Evaluation failed.');

      let tpHitsHtml = '';
      if (!isPending) {
        let tp1Hit = '❌', tp2Hit = '❌', tp3Hit = '❌';
        let tpCount = 0;
        
        if (evalStatus === 'hit_tp3') {
          tp1Hit = '✅'; tp2Hit = '✅'; tp3Hit = '✅'; tpCount = 3;
        } else if (evalStatus === 'hit_tp2') {
          tp1Hit = '✅'; tp2Hit = '✅'; tpCount = 2;
        } else if (evalStatus === 'hit_tp1') {
          tp1Hit = '✅'; tpCount = 1;
        }
        
        tpHitsHtml = `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 12px; font-weight: 500;">
            <div style="margin-bottom: 8px; color: #ccc;">Take Profits Reached (${tpCount}/3):</div>
            <div style="display: flex; gap: 8px;">
              <span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px;">${tp1Hit} TP1</span>
              <span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px;">${tp2Hit} TP2</span>
              <span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px;">${tp3Hit} TP3</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="history-card" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 4px solid ${statusColor};">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <strong>${pred.symbol} - ${pred.signal}</strong>
            <span style="color: ${statusColor}; font-weight: 600;">${isPending ? '⏳ Pending' : pred.status.toUpperCase().replace('_', ' ')}</span>
          </div>
          <div style="font-size: 13px; color: #aaa; margin-bottom: 10px;">
            <div>Created: ${this.formatColomboTime(pred.created_at)}</div>
            <div>Target: ${this.formatColomboTime(pred.target_resolution_time)} (Duration: ${pred.expected_duration_text})</div>
          </div>
          <div style="display: flex; gap: 15px; font-size: 13px; margin-bottom: 10px; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="color: #fff;"><strong>Entry:</strong> $${pred.entry_price}</div>
            <div style="color: #ef4444;"><strong>SL:</strong> $${pred.stop_loss_price}</div>
          </div>
          <div style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 6px; font-size: 13px; color: #ddd; line-height: 1.5; border-left: 2px solid ${statusColor};">
            ${evalText}
          </div>
          ${tpHitsHtml}
        </div>
      `;
    };

    if (this.activeTab === 'pending') {
      if (visiblePending.length > 0) {
        visiblePending.forEach(pred => html += renderCard(pred));
      } else {
        html += '<div style="color: #aaa; padding: 20px 0;">No pending predictions at the moment.</div>';
      }
    } else {
      if (visibleResolved.length > 0) {
        visibleResolved.forEach(pred => html += renderCard(pred));
      } else {
        html += '<div style="color: #aaa; padding: 20px 0;">No resolved predictions yet.</div>';
      }
    }

    html += '</div>'; // close history-list

    // Pagination Controls
    const totalPages = this.activeTab === 'pending' ? totalPagesPending : totalPagesResolved;
    if (totalPages > 1) {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.1);">
          <button id="prev-page-btn" style="background: rgba(255,255,255,0.1); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: ${this.currentPage > 1 ? 'pointer' : 'not-allowed'}; opacity: ${this.currentPage > 1 ? 1 : 0.5};" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span style="color: #aaa; font-size: 13px;">Page ${this.currentPage} of ${totalPages}</span>
          <button id="next-page-btn" style="background: rgba(255,255,255,0.1); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: ${this.currentPage < totalPages ? 'pointer' : 'not-allowed'}; opacity: ${this.currentPage < totalPages ? 1 : 0.5};" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button>
        </div>
      `;
    }

    html += '</div>';
    this.container.innerHTML = html;

    const pendingTab = this.container.querySelector('#tab-pending');
    const resolvedTab = this.container.querySelector('#tab-resolved');

    if (pendingTab && this.activeTab !== 'pending') {
      pendingTab.addEventListener('click', () => {
        this.activeTab = 'pending';
        this.currentPage = 1; // Reset to page 1 on tab switch
        this.render();
      });
      // Add simple hover effect
      pendingTab.addEventListener('mouseenter', () => pendingTab.style.color = '#fff');
      pendingTab.addEventListener('mouseleave', () => pendingTab.style.color = '#aaa');
    }
    
    if (resolvedTab && this.activeTab !== 'resolved') {
      resolvedTab.addEventListener('click', () => {
        this.activeTab = 'resolved';
        this.currentPage = 1; // Reset to page 1 on tab switch
        this.render();
      });
      resolvedTab.addEventListener('mouseenter', () => resolvedTab.style.color = '#fff');
      resolvedTab.addEventListener('mouseleave', () => resolvedTab.style.color = '#aaa');
    }

    const prevPageBtn = this.container.querySelector('#prev-page-btn');
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.render();
        }
      });
    }

    const nextPageBtn = this.container.querySelector('#next-page-btn');
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.render();
        }
      });
    }
  }
}