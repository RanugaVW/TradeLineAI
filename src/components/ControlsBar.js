/**
 * Controls Bar Component (TradeLine AI)
 * Features:
 * 1. Mode Tabs: "📊 Pure TradingView Chart" (Clean chart by default) vs "📐 Support & Resistance Auto-Detector".
 * 2. Symbol picker & Custom Dynamic Timeframe Selector (Minutes, Hours, Days, Months, Years).
 * 3. Custom Date & Clock Time Period Range Picker (Year/Month/Day & Hour/Minute).
 * 4. S/R Filter Mode Selector & Min Bounce Controls.
 */
import { POPULAR_PAIRS, TIMEFRAMES } from '../api/cryptoApi.js';

const TIMEZONES = [
  { value: 'local', label: 'System Local Time' },
  { value: 'UTC', label: '(UTC) Standard Time' },
  { value: 'Asia/Colombo', label: '(UTC+5:30) Colombo' },
  { value: 'Asia/Kolkata', label: '(UTC+5:30) Kolkata' },
  { value: 'Asia/Kathmandu', label: '(UTC+5:45) Kathmandu' },
  { value: 'Asia/Dhaka', label: '(UTC+6:00) Dhaka' },
  { value: 'Asia/Yangon', label: '(UTC+6:30) Yangon' },
  { value: 'Asia/Bangkok', label: '(UTC+7:00) Bangkok' },
  { value: 'Asia/Ho_Chi_Minh', label: '(UTC+7:00) Ho Chi Minh' },
  { value: 'Asia/Jakarta', label: '(UTC+7:00) Jakarta' },
  { value: 'Asia/Hong_Kong', label: '(UTC+8:00) Hong Kong' },
  { value: 'Asia/Tokyo', label: '(UTC+9:00) Tokyo' },
  { value: 'Europe/London', label: '(UTC+0:00) London' },
  { value: 'Europe/Paris', label: '(UTC+1:00) Paris' },
  { value: 'America/New_York', label: '(UTC-5:00) New York' }
];

export class ControlsBar {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    
    // Attempt to load saved state from localStorage
    let savedState = {};
    try {
      const stored = localStorage.getItem('tradeline_controls_state');
      if (stored) {
        savedState = JSON.parse(stored);
      }
    } catch(e) {
      console.warn('Could not load controls state from localStorage', e);
    }

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
      showHeatmap: false,
      showBB: false,
      showRSI: false,
      showMACD: false,
      showLabels: false, // Default to NOT showing labels
      showSMC: true,
      sniperMode: false,
      timezone: 'local',
      zoomPct: 100,
      ...options.initialState,
      ...savedState
    };
    
    const originalOnChange = options.onChange || (() => { });
    this.onChange = (state) => {
      this.saveState();
      originalOnChange(state);
    };
    
    this.onZoomChange = options.onZoomChange || (() => { });
    this.onToggleExtend = options.onToggleExtend || (() => { });
    this.render();
  }

  saveState() {
    try {
      localStorage.setItem('tradeline_controls_state', JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not save controls state to localStorage', e);
    }
  }

  setState(newState, triggerChange = false) {
    this.state = { ...this.state, ...newState };
    this.saveState();
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
              <input type="text" list="coin-list" id="symbol-select" class="custom-select" value="${this.state.symbol}" style="text-transform: uppercase;" title="Type any coin pair e.g. BTC-USDT" autocomplete="off" placeholder="Type pair..." />
              <datalist id="coin-list">
                ${POPULAR_PAIRS.map(p => `
                  <option value="${p.symbol}">${p.name}</option>
                `).join('')}
              </datalist>
            </div>
          </div>

          <!-- Custom Timeframe Dropdown -->
          <div class="control-group timeframe-group dropdown-group" title="Select custom timeframe interval">
            <label class="control-label">
              Timeframe:
              <i class="info-icon" data-lucide="info" title="Select custom timeframe interval"></i>
            </label>
            <div class="custom-dropdown-container">
              <button type="button" class="dropdown-trigger" id="tf-dropdown-trigger">
                <span id="current-tf-badge">${this.state.timeframe}</span>
                <i data-lucide="chevron-down"></i>
              </button>
              <div class="dropdown-menu" id="tf-dropdown-menu">
                <div class="dropdown-header" style="display: flex; gap: 5px; align-items: center; padding: 10px; border-bottom: 1px solid #2a2e39;">
                  <i data-lucide="plus" style="width: 16px; height: 16px; color: #a3a6af;"></i>
                  <input type="text" id="custom-tf-input" class="custom-tf-input" placeholder="Add custom interval..." style="background: transparent; border: none; color: #fff; font-size: 13px; outline: none; width: 100%;" />
                  <button type="button" id="apply-custom-tf-btn" style="background: none; border: none; color: #3b82f6; cursor: pointer; display: none;">Add</button>
                </div>
                
                <div class="dropdown-section">
                  <div class="dropdown-section-title">SECONDS</div>
                  <div class="dropdown-items">
                    ${['1s', '5s', '10s', '15s', '30s', '45s'].map(tf => `
                      <button type="button" class="dropdown-item ${tf === this.state.timeframe ? 'active' : ''}" data-tf="${tf}">${tf.replace('s', ' second')}${tf !== '1s' ? 's' : ''}</button>
                    `).join('')}
                  </div>
                </div>

                <div class="dropdown-section">
                  <div class="dropdown-section-title">MINUTES</div>
                  <div class="dropdown-items">
                    ${['1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m'].map(tf => `
                      <button type="button" class="dropdown-item ${tf === this.state.timeframe ? 'active' : ''}" data-tf="${tf}">${tf.replace('m', ' minute')}${tf !== '1m' ? 's' : ''}</button>
                    `).join('')}
                  </div>
                </div>

                <div class="dropdown-section">
                  <div class="dropdown-section-title">HOURS / DAYS</div>
                  <div class="dropdown-items">
                    ${['1H', '2H', '3H', '4H', '1D'].map(tf => `
                      <button type="button" class="dropdown-item ${tf === this.state.timeframe ? 'active' : ''}" data-tf="${tf}">
                        ${tf.includes('H') ? tf.replace('H', ' hour') + (tf !== '1H' ? 's' : '') : tf.replace('D', ' day') + (tf !== '1D' ? 's' : '')}
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Timezone & Visibility Controls Group -->
          <div class="control-group zoom-group" title="Timezone & Visibility">
            <div class="zoom-controls" style="gap: 10px; display: flex; align-items: center;">
              <select id="timezone-select" class="custom-select" style="min-width: 140px; padding: 4px 8px; font-size: 11px;">
                ${TIMEZONES.map(tz => `
                  <option value="${tz.value}" ${tz.value === this.state.timezone ? 'selected' : ''}>${tz.label}</option>
                `).join('')}
              </select>
              <button type="button" id="toggle-labels-btn" class="pill-btn ${this.state.showLabels ? 'active' : ''}" title="Toggle visibility of chart markers and labels" style="padding: 4px 8px; font-size: 11px;">
                <i data-lucide="${this.state.showLabels ? 'eye' : 'eye-off'}"></i> ${this.state.showLabels ? 'Labels On' : 'Labels Off'}
              </button>
              <button type="button" id="sniper-mode-btn" class="pill-btn ${this.state.sniperMode ? 'active' : ''}" title="Sniper Mode: Only issue A+ Setup signals capable of hitting all 3 TPs. Weak signals will be ignored." style="padding: 4px 8px; font-size: 11px; margin-left: 5px;">
                <i data-lucide="crosshair"></i> Sniper Mode
              </button>
              <button type="button" id="toggle-heatmap-btn" class="pill-btn ${this.state.showHeatmap ? 'active' : ''}" title="Toggle Price Heatmap (Volume Profile) to see Point of Control and High Volume Nodes" style="padding: 4px 8px; font-size: 11px; margin-left: 5px;">
                <i data-lucide="bar-chart-2"></i> Heatmap
              </button>
              <button type="button" id="toggle-smc-btn" class="pill-btn ${this.state.showSMC ? 'active' : ''}" title="Toggle Smart Money Concepts (SMC) Indicator" style="padding: 4px 8px; font-size: 11px; margin-left: 5px;">
                <i data-lucide="activity"></i> SMC Indicator
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

            <!-- Visual Indicators Toggles -->
            <div class="control-group toggles-group" style="margin-left: 15px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 15px;">
              <label class="control-label" style="display: block; margin-bottom: 5px;">Indicators:</label>
              <label class="toggle-pill ${this.state.showBB ? 'active' : ''}" style="border-color: ${this.state.showBB ? '#3b82f6' : 'rgba(255,255,255,0.2)'};">
                <input type="checkbox" id="toggle-bb" ${this.state.showBB ? 'checked' : ''} />
                <span class="dot" style="background-color: #3b82f6;"></span> BB
              </label>
              <label class="toggle-pill ${this.state.showRSI ? 'active' : ''}" style="border-color: ${this.state.showRSI ? '#a855f7' : 'rgba(255,255,255,0.2)'};">
                <input type="checkbox" id="toggle-rsi" ${this.state.showRSI ? 'checked' : ''} />
                <span class="dot" style="background-color: #a855f7;"></span> RSI
              </label>
              <label class="toggle-pill ${this.state.showMACD ? 'active' : ''}" style="border-color: ${this.state.showMACD ? '#f59e0b' : 'rgba(255,255,255,0.2)'};">
                <input type="checkbox" id="toggle-macd" ${this.state.showMACD ? 'checked' : ''} />
                <span class="dot" style="background-color: #f59e0b;"></span> MACD
              </label>
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
    const tabClean = this.container.querySelector('#tab-chart');
    const tabSR = this.container.querySelector('#tab-sr-detector');

    tabClean?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showSupport = false;
      this.state.showResistance = false;
      this.state.showLabels = false; // Turn off labels for pure chart
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

    // Timeframe Dropdown Logic
    const tfDropdownTrigger = this.container.querySelector('#tf-dropdown-trigger');
    const tfDropdownMenu = this.container.querySelector('#tf-dropdown-menu');
    const tfDropdownContainer = this.container.querySelector('.custom-dropdown-container');

    tfDropdownTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      tfDropdownMenu?.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (tfDropdownContainer && !tfDropdownContainer.contains(e.target)) {
        tfDropdownMenu?.classList.remove('show');
      }
    });

    const tfItems = this.container.querySelectorAll('.dropdown-item');
    tfItems.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.state.timeframe = btn.getAttribute('data-tf');
        tfItems.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const currentTfBadge = this.container.querySelector('#current-tf-badge');
        if (currentTfBadge) currentTfBadge.textContent = this.state.timeframe;
        tfDropdownMenu?.classList.remove('show');
        this.onChange(this.state);
      });
    });

    const customTfInput = this.container.querySelector('#custom-tf-input');
    const applyCustomTfBtn = this.container.querySelector('#apply-custom-tf-btn');

    const applyCustomTimeframe = () => {
      const val = customTfInput.value.trim();
      if (val) {
        this.state.timeframe = val;
        const currentTfBadge = this.container.querySelector('#current-tf-badge');
        if (currentTfBadge) currentTfBadge.textContent = this.state.timeframe;
        tfDropdownMenu?.classList.remove('show');
        this.onChange(this.state);
      }
    };

    customTfInput?.addEventListener('input', (e) => {
      if (e.target.value.trim().length > 0) {
        applyCustomTfBtn.style.display = 'block';
      } else {
        applyCustomTfBtn.style.display = 'none';
      }
    });

    customTfInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') applyCustomTimeframe();
    });

    applyCustomTfBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      applyCustomTimeframe();
    });

    // Toggle labels button
    const toggleLabelsBtn = this.container.querySelector('#toggle-labels-btn');
    toggleLabelsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showLabels = !this.state.showLabels;
      this.render();
      this.onChange(this.state);
    });

    const sniperModeBtn = this.container.querySelector('#sniper-mode-btn');
    sniperModeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.sniperMode = !this.state.sniperMode;
      this.render();
      this.onChange(this.state);
    });

    const toggleHeatmapBtn = this.container.querySelector('#toggle-heatmap-btn');
    toggleHeatmapBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showHeatmap = !this.state.showHeatmap;
      this.render();
      this.onChange(this.state);
    });

    const toggleSmcBtn = this.container.querySelector('#toggle-smc-btn');
    toggleSmcBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.state.showSMC = !this.state.showSMC;
      this.render();
      this.onChange(this.state);
    });

    // Timezone Select
    const tzSelect = this.container.querySelector('#timezone-select');
    tzSelect?.addEventListener('change', (e) => {
      this.state.timezone = e.target.value;
      this.onChange(this.state);
      this.render();
    });    // Min bounces select
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
      this.render(); // re-render to update toggle styles
    });

    const toggleResistance = this.container.querySelector('#toggle-resistance');
    toggleResistance?.addEventListener('change', (e) => {
      this.state.showResistance = e.target.checked;
      this.onChange(this.state);
      this.render();
    });

    const toggleBB = this.container.querySelector('#toggle-bb');
    toggleBB?.addEventListener('change', (e) => {
      this.state.showBB = e.target.checked;
      this.onChange(this.state);
      this.render();
    });

    const toggleRSI = this.container.querySelector('#toggle-rsi');
    toggleRSI?.addEventListener('change', (e) => {
      this.state.showRSI = e.target.checked;
      this.onChange(this.state);
      this.render();
    });

    const toggleMACD = this.container.querySelector('#toggle-macd');
    toggleMACD?.addEventListener('change', (e) => {
      this.state.showMACD = e.target.checked;
      this.onChange(this.state);
      this.render();
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
