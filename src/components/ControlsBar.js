/**
 * Controls Bar Component (TradeLine AI)
 * Features:
 * 1. Mode Tabs: "📊 Pure TradingView Chart" (Clean chart by default) vs "📐 Support & Resistance Auto-Detector".
 * 2. Symbol picker & Custom Dynamic Timeframe Selector (Minutes, Hours, Days, Months, Years).
 * 3. Custom Date & Clock Time Period Range Picker (Year/Month/Day & Hour/Minute).
 * 4. S/R Filter Mode Selector & Min Bounce Controls.
 */
import { POPULAR_PAIRS, TIMEFRAMES } from '../api/cryptoApi.js';

export class ControlsBar {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.state = {
      symbol: 'PI-USDT',
      timeframe: '1H',
      minBounces: 3,
      tolerancePct: 1.0,
      filterMode: 'smart',
      startDate: '',
      endDate: '',
      showSupport: false,
      showResistance: false,
      showLabels: true, // Default to showing labels
      zoomPct: 100,
      ...options.initialState
    };
    this.onChange = options.onChange || (() => { });
    this.onZoomChange = options.onZoomChange || (() => { });
    this.onToggleExtend = options.onToggleExtend || (() => { });
    this.render();
  }

  setState(newState, triggerChange = false) {
    this.state = { ...this.state, ...newState };
    this.render();
    if (triggerChange) {
      this.onChange(this.state);
    }
  }

  render() {
    const isSRActive = this.state.showSupport || this.state.showResistance;

    this.container.innerHTML = `
      <div class="controls-wrapper">
        <!-- Main Mode Tabs: Pure Chart vs Support & Resistance Detector -->
        <div class="mode-tabs-row">
          <button type="button" class="mode-tab-btn ${!isSRActive ? 'active' : ''}" id="tab-chart" title="Standard TradingView Chart View with AI Signals">
            <i data-lucide="line-chart"></i> Pure TradingView Chart
          </button>
          <button type="button" class="mode-tab-btn ${isSRActive ? 'active' : ''}" id="tab-sr-detector" title="Enable automated Support & Resistance detection and custom time period range filtering">
            <i data-lucide="ruler"></i> Support & Resistance Auto-Detector
          </button>
        </div>

        <!-- Row 1: Symbol & Dynamic Timeframe Controls -->
        <div class="controls-main-row">
          <!-- Symbol Picker -->
          <div class="control-group pair-group" title="Select cryptocurrency pair">
            <label class="control-label">
              Symbol <i class="info-icon" data-lucide="info" title="Select cryptocurrency pair"></i>
            </label>
            <div class="select-container">
              <select id="symbol-select" class="custom-select" title="Select cryptocurrency pair">
                ${POPULAR_PAIRS.map(p => `
                  <option value="${p.symbol}" ${p.symbol === this.state.symbol ? 'selected' : ''}>
                    ${p.name}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Dynamic Timeframe Selector -->
          <div class="control-group timeframe-group" title="Select preset timeframe or enter custom dynamic interval (Minutes, Hours, Days, Months, Years)">
            <label class="control-label">
              Timeframe: <span class="accent-badge" id="current-tf-badge">${this.state.timeframe}</span>
              <i class="info-icon" data-lucide="info" title="Select preset timeframe or enter custom dynamic interval"></i>
            </label>

            <div class="pill-buttons">
              ${TIMEFRAMES.map(tf => `
                <button 
                  type="button"
                  class="pill-btn ${tf.label === this.state.timeframe ? 'active' : ''}" 
                  data-tf="${tf.label}">
                  ${tf.label}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Visibility Controls Group -->
          <div class="control-group zoom-group" title="Interactive chart controls">
            <div class="zoom-controls">
              <button type="button" id="toggle-labels-btn" class="pill-btn ${this.state.showLabels ? 'active' : ''}" title="Toggle visibility of chart markers and labels" style="margin-right: 10px; padding: 4px 8px; font-size: 11px;">
                <i data-lucide="${this.state.showLabels ? 'eye' : 'eye-off'}"></i> ${this.state.showLabels ? 'Labels On' : 'Labels Off'}
              </button>
            </div>
          </div>
        </div>

        <!-- Row 2: Support & Resistance Controls (Only visible when S/R Detector tab is active) -->
        ${isSRActive ? `
          <div class="controls-subpanel">
            <!-- Date-Time Period Range Picker (Year/Month/Day & Hour/Minute) -->
            <div class="control-group datetime-range-group" title="Select custom historical date & clock time range (Year/Month/Day/Hour/Minute). Support & Resistance lines will be calculated strictly within this time period only!">
              <label class="control-label">
                S/R Time Period Range: <span class="accent-badge" id="range-status-badge">${(this.state.startDate && this.state.endDate) ? 'Filtered Period' : 'Full Chart Range'}</span>
                <i class="info-icon" data-lucide="info" title="Select custom historical date & clock time range. Support & Resistance lines will be drawn strictly within this time range!"></i>
              </label>

              <div class="datetime-inputs-row">
                <div class="datetime-field" title="Select Start Date (Year, Month, Day) & Clock Time (Hour, Minute)">
                  <span class="field-lbl">Start:</span>
                  <input type="datetime-local" id="start-datetime-input" class="custom-datetime-picker" value="${this.state.startDate || ''}" />
                </div>

                <div class="datetime-field" title="Select End Date (Year, Month, Day) & Clock Time (Hour, Minute)">
                  <span class="field-lbl">End:</span>
                  <input type="datetime-local" id="end-datetime-input" class="custom-datetime-picker" value="${this.state.endDate || ''}" />
                </div>

                <button type="button" id="apply-range-btn" class="apply-range-btn" title="Calculate Support & Resistance lines strictly within selected date/time range">
                  <i data-lucide="target"></i> Apply Range
                </button>

                ${(this.state.startDate || this.state.endDate) ? `
                  <button type="button" id="reset-range-btn" class="reset-range-btn" title="Reset date-time range filter">
                    <i data-lucide="rotate-ccw"></i> Reset Range
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="control-divider"></div>

            <!-- Min Bounce Filter -->
            <div class="control-group">
              <label class="control-label">
                Min Bounces: <span class="accent-badge" id="bounce-val">${this.state.minBounces}x</span>
              </label>
              <select id="min-bounces-select" class="custom-select mini-select">
                <option value="2" ${this.state.minBounces === 2 ? 'selected' : ''}>≥ 2 Bounces</option>
                <option value="3" ${this.state.minBounces === 3 ? 'selected' : ''}>≥ 3 Bounces (Default)</option>
                <option value="4" ${this.state.minBounces === 4 ? 'selected' : ''}>≥ 4 Bounces</option>
                <option value="5" ${this.state.minBounces === 5 ? 'selected' : ''}>≥ 5 Bounces</option>
              </select>
            </div>

            <!-- Line Filter Mode Selector -->
            <div class="control-group">
              <label class="control-label">
                Line Filter:
                <button type="button" id="open-usability-guide-btn" class="guide-link-btn"><i data-lucide="info" style="width:12px;height:12px;"></i> Rules</button>
              </label>
              <select id="filter-mode-select" class="custom-select mini-select">
                <option value="smart" ${(this.state.filterMode || 'smart') === 'smart' ? 'selected' : ''}>✨ Smart Pruned (Clean Top 5)</option>
                <option value="standard" ${this.state.filterMode === 'standard' ? 'selected' : ''}>Standard (All 3+ Bounces)</option>
                <option value="all" ${this.state.filterMode === 'all' ? 'selected' : ''}>Show All Raw Lines</option>
              </select>
            </div>

            <!-- Individual Support & Resistance Toggles -->
            <div class="control-group toggles-group">
              <label class="toggle-pill support-pill ${this.state.showSupport ? 'active' : ''}">
                <input type="checkbox" id="toggle-support" ${this.state.showSupport ? 'checked' : ''} />
                <span class="dot green-dot"></span> Support
              </label>
              <label class="toggle-pill resistance-pill ${this.state.showResistance ? 'active' : ''}">
                <input type="checkbox" id="toggle-resistance" ${this.state.showResistance ? 'checked' : ''} />
                <span class="dot red-dot"></span> Resistance
              </label>

              <!-- Master Line Extender Button -->
              <button type="button" id="toggle-extend-all-btn" class="toggle-extend-btn" title="Click to extend all S/R lines to the future forecast zone or fold them back to date period bounds">
                ↔ Extend / Fold Lines
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.attachEvents();
    if (window.lucide) {
      window.lucide.createIcons({ root: this.container });
    }
  }

  attachEvents() {
    // Tab Listeners
    const tabClean = this.container.querySelector('#tab-clean-chart');
    const tabSR = this.container.querySelector('#tab-sr-detector');

    tabClean?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showSupport = false;
      this.state.showResistance = false;
      this.render();
      this.onChange(this.state);
    });

    tabSR?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showSupport = true;
      this.state.showResistance = true;
      this.render();
      this.onChange(this.state);
    });

    // Symbol select
    const symbolSelect = this.container.querySelector('#symbol-select');
    symbolSelect?.addEventListener('change', (e) => {
      this.state.symbol = e.target.value;
      this.onChange(this.state);
    });

    // Timeframe buttons
    const tfButtons = this.container.querySelectorAll('.pill-btn:not(#toggle-labels-btn)');
    tfButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.state.timeframe = btn.getAttribute('data-tf');
        tfButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const currentTfBadge = this.container.querySelector('#current-tf-badge');
        if (currentTfBadge) currentTfBadge.textContent = this.state.timeframe;
        this.onChange(this.state);
      });
    });

    // Toggle labels button
    const toggleLabelsBtn = this.container.querySelector('#toggle-labels-btn');
    toggleLabelsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showLabels = !this.state.showLabels;
      this.render();
      this.onChange(this.state);
    });



    // Min bounces select
    const bounceSelect = this.container.querySelector('#min-bounces-select');
    bounceSelect?.addEventListener('change', (e) => {
      this.state.minBounces = parseInt(e.target.value, 10);
      const bounceVal = this.container.querySelector('#bounce-val');
      if (bounceVal) bounceVal.textContent = `${this.state.minBounces}x`;
      this.onChange(this.state);
    });

    // Filter mode select
    const filterSelect = this.container.querySelector('#filter-mode-select');
    filterSelect?.addEventListener('change', (e) => {
      this.state.filterMode = e.target.value;
      this.onChange(this.state);
    });

    // Support toggle
    const toggleSupport = this.container.querySelector('#toggle-support');
    toggleSupport?.addEventListener('change', (e) => {
      this.state.showSupport = e.target.checked;
      this.onChange(this.state);
    });

    // Resistance toggle
    const toggleResistance = this.container.querySelector('#toggle-resistance');
    toggleResistance?.addEventListener('change', (e) => {
      this.state.showResistance = e.target.checked;
      this.onChange(this.state);
    });

    // Master Line Extender Button
    const extendBtn = this.container.querySelector('#toggle-extend-all-btn');
    extendBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.onToggleExtend();
    });

    // Usability guide trigger
    const guideBtn = this.container.querySelector('#open-usability-guide-btn');
    guideBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      alert(`[GUIDE] TradeLine AI — Support & Resistance Line Usability Guide\n\n1. Broken Levels: Recent candles closing > 3% past a line invalidate it.\n2. Redundant Clusters: Lines within 2.5% distance are merged.\n3. Interactive Extender: Click/Touch any line on the chart to extend it to the future forecast zone or fold it back!`);
    });

    // Apply Date-Time Range Button Listener
    const applyRangeBtn = this.container.querySelector('#apply-range-btn');
    const startInput = this.container.querySelector('#start-datetime-input');
    const endInput = this.container.querySelector('#end-datetime-input');

    applyRangeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const sVal = startInput?.value || '';
      const eVal = endInput?.value || '';

      if (sVal && eVal && new Date(sVal) >= new Date(eVal)) {
        alert('Start Date-Time must be before End Date-Time!');
        return;
      }

      this.state.startDate = sVal;
      this.state.endDate = eVal;
      this.render();
      this.onChange(this.state);
    });

    // Reset Range Button Listener
    const resetRangeBtn = this.container.querySelector('#reset-range-btn');
    resetRangeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.startDate = '';
      this.state.endDate = '';
      this.render();
      this.onChange(this.state);
    });

  }
}
