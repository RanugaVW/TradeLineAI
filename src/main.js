import { getMarketCandles } from './api/cryptoApi.js';
import { detectSupportResistance } from './analysis/srDetector.js';
import { detectAllPatterns } from './analysis/patternEngine.js';
import { ChartViewer } from './components/ChartViewer.js';
import { ControlsBar } from './components/ControlsBar.js';
import { AnalyticsPanel } from './components/AnalyticsPanel.js';
import { AuthModal } from './components/AuthModal.js';
import { DrawingToolbar } from './components/DrawingToolbar.js';
import { AdminPanel } from './components/AdminPanel.js';
import { AITradePanel } from './components/AITradePanel.js';
import { supabase, getCurrentSession, fetchUserProfile, saveUserAnnotations, loadUserAnnotations, subscribeToProfileChanges, subscribeToAnnotationChanges } from './api/supabaseClient.js';

class App {
  constructor() {
    this.chartViewer = null;
    this.controlsBar = null;
    this.analyticsPanel = null;
    this.authModal = null;
    this.drawingToolbar = null;
    this.adminPanel = null;
    this.aiTradePanel = null;

    this.currentUser = null;
    this.userProfile = { role: 'free' };
    this.currentData = [];
    this.currentAnalysis = null;

    this.init();
  }

  async init() {
    // 1. Initialize DOM Containers
    const chartElem = document.getElementById('chart-container');
    const controlsElem = document.getElementById('controls-container');
    const analyticsElem = document.getElementById('analytics-container');
    const authHeaderElem = document.getElementById('user-auth-container');
    const drawingElem = document.getElementById('drawing-toolbar-container');
    const aiTradeElem = document.getElementById('ai-trade-container');

    this.chartViewer = new ChartViewer(chartElem, {
      onAnnotationAdded: () => this.autoSaveAnnotations()
    });

    this.analyticsPanel = new AnalyticsPanel(analyticsElem, {
      onLineClick: (line) => this.chartViewer.focusLine(line),
      onTogglePanel: (isCollapsed) => {
        // JS fallback: directly set grid columns so chart fills full width
        const dashboard = document.getElementById('main-dashboard');
        if (dashboard) {
          dashboard.style.gridTemplateColumns = isCollapsed
            ? '50px 1fr'
            : '50px 1fr 360px';
        }
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
          if (this.chartViewer && this.chartViewer.chart) {
            const container = document.querySelector('.chart-container');
            if (container) {
              this.chartViewer.chart.resize(
                container.clientWidth,
                container.clientHeight
              );
            }
          }
        }, 80);
      }
    });
    
    // Initialize AI Trade Advisor Panel
    this.aiTradePanel = new AITradePanel(aiTradeElem, {
      onApplyAIOverlay: (aiData) => this.chartViewer.renderAITradeOverlay(aiData),
      onResetAIOverlay: () => this.chartViewer.clearAITradeOverlay(),
      onTogglePanel: () => {
        // Give the DOM time to update then ask the chart to resize to fill new space
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
          if (this.chartViewer && this.chartViewer.chart) {
            const container = document.querySelector('.chart-container');
            if (container) {
              this.chartViewer.chart.resize(
                container.clientWidth,
                container.clientHeight
              );
            }
          }
        }, 80);
      }
    });

    // 2. Initialize Admin Panel Modal
    this.adminPanel = new AdminPanel({
      onRoleUpdated: async (userId, newRole) => {
        if (this.currentUser && this.currentUser.id === userId) {
          this.userProfile.role = newRole;
          this.authModal.updateUser(this.currentUser, this.userProfile);
          this.drawingToolbar.setRole(newRole);
        }
      }
    });

    // 3. Initialize Auth Header & Modal
    this.authModal = new AuthModal(authHeaderElem, {
      user: this.currentUser,
      profile: this.userProfile,
      onAuthChange: (user, profile) => this.handleAuthChanged(user, profile),
      onOpenAdmin: () => this.adminPanel.open()
    });

    // 4. Initialize Drawing Toolbar Sidebar
    this.drawingToolbar = new DrawingToolbar(drawingElem, {
      userRole: this.userProfile.role,
      onToolChange: (tool) => {
        this.chartViewer.setActiveTool(tool);
      },
      onSaveAnnotations: () => this.saveAnnotations(),
      onClearAnnotations: () => {
        this.chartViewer.clearUserAnnotations();
        this.saveAnnotations();
      }
    });

    // 5. Initialize Controls Bar
    this.controlsBar = new ControlsBar(controlsElem, {
      initialState: {
        symbol: 'PI-USDT',
        timeframe: '1H',
        minBounces: 3,
        tolerancePct: 1.0,
        showSupport: false, // Default: Clean TradingView chart without lines on launch
        showResistance: false, // Default: Clean TradingView chart without lines on launch
        zoomPct: 100
      },
      onChange: (newState) => this.handleControlsChange(newState),
      onZoomChange: (type, val) => {
        if (type === 'in') this.chartViewer.zoomIn();
        else if (type === 'out') this.chartViewer.zoomOut();
        else if (type === 'reset') this.chartViewer.resetZoom();
        else if (type === 'set') this.chartViewer.setZoomPercent(val);
      },
      onToggleExtend: () => this.chartViewer.toggleExtendAll()
    });

    // 6. Attach Lock Screen Button event
    const lockSigninBtn = document.getElementById('lock-screen-signin-btn');
    lockSigninBtn?.addEventListener('click', () => {
      this.authModal.openModal();
    });

    // 7. Check Supabase Auth Session & Lock Screen State
    await this.checkAuthSession();

    // 8. Load initial market data (Default: PI-USDT, 1H)
    await this.loadAndAnalyze();

    // 9. Background price refresh every 15s
    setInterval(() => {
      this.loadAndAnalyze(false);
    }, 15000);
  }

  updateLockScreenState() {
    const lockOverlay = document.getElementById('auth-lock-overlay');
    const appElem = document.getElementById('app');

    // Never block page refresh or hide charts for guest users
    appElem?.classList.remove('logged-out-mode');
    lockOverlay?.classList.add('hidden');
  }

  async checkAuthSession() {
    try {
      const session = await getCurrentSession();
      if (session?.user) {
        this.currentUser = session.user;
        this.userProfile = await fetchUserProfile(session.user.id);
        this.setupRealtimeSubscriptions();
      } else {
        this.currentUser = null;
        this.userProfile = { role: 'free' };
        this.cleanupRealtimeSubscriptions();
      }
    } catch (err) {
      console.warn('Auth session check note:', err.message);
    }

    this.authModal.updateUser(this.currentUser, this.userProfile);
    this.drawingToolbar.setRole(this.userProfile.role);
    this.updateLockScreenState();

    // Auth State Listener (Auto Token Refresh & 1-Week Session Persistence)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        this.currentUser = session.user;
        this.userProfile = await fetchUserProfile(session.user.id);
        this.setupRealtimeSubscriptions();
      } else {
        this.currentUser = null;
        this.userProfile = { role: 'free' };
        this.cleanupRealtimeSubscriptions();
      }
      this.authModal.updateUser(this.currentUser, this.userProfile);
      this.drawingToolbar.setRole(this.userProfile.role);
      this.updateLockScreenState();
      await this.loadSavedAnnotations();
    });
  }

  setupRealtimeSubscriptions() {
    if (!this.currentUser) return;
    this.cleanupRealtimeSubscriptions();

    // Listen to profile updates (e.g. Admin changes user role in database)
    this.profileChannel = subscribeToProfileChanges(this.currentUser.id, (updatedProfile) => {
      this.userProfile = updatedProfile;
      this.authModal.updateUser(this.currentUser, this.userProfile);
      this.drawingToolbar.setRole(this.userProfile.role);
    });

    // Listen to annotation updates
    const symbol = this.controlsBar?.state?.symbol || 'PI-USDT';
    this.annotationChannel = subscribeToAnnotationChanges(this.currentUser.id, symbol, (updatedAnnotations) => {
      this.chartViewer.setUserAnnotations(updatedAnnotations);
    });
  }

  cleanupRealtimeSubscriptions() {
    if (this.profileChannel) {
      supabase.removeChannel(this.profileChannel);
      this.profileChannel = null;
    }
    if (this.annotationChannel) {
      supabase.removeChannel(this.annotationChannel);
      this.annotationChannel = null;
    }
  }

  async handleAuthChanged(user, profile) {
    this.currentUser = user;
    this.userProfile = profile || { role: 'free' };
    if (user && !profile) {
      this.userProfile = await fetchUserProfile(user.id);
    }
    this.authModal.updateUser(this.currentUser, this.userProfile);
    this.drawingToolbar.setRole(this.userProfile.role);
    await this.loadSavedAnnotations();
  }

  async handleControlsChange(state) {
    const symbolChanged = this.lastSymbol !== state.symbol;
    const tfChanged = this.lastTf !== state.timeframe;
    this.lastSymbol = state.symbol;
    this.lastTf = state.timeframe;

    await this.loadAndAnalyze(symbolChanged || tfChanged);
  }

  async loadSavedAnnotations() {
    if (this.currentUser && this.userProfile.role !== 'free') {
      const symbol = this.controlsBar.state.symbol;
      const savedDrawings = await loadUserAnnotations(this.currentUser.id, symbol);
      this.chartViewer.setUserAnnotations(savedDrawings);
    }
  }

  async autoSaveAnnotations() {
    if (this.currentUser && this.userProfile.role !== 'free') {
      await this.saveAnnotations(false);
    }
  }

  async saveAnnotations(showAlert = true) {
    if (!this.currentUser) {
      alert('Please Sign In to save custom drawings to your account!');
      this.authModal.openModal();
      return;
    }

    if (this.userProfile.role === 'free') {
      alert('Drawing Persistence requires a PRO1 or ADMIN account tier plan. Contact an Admin to upgrade your profile!');
      return;
    }

    try {
      const symbol = this.controlsBar.state.symbol;
      const annotations = this.chartViewer.getUserAnnotations();
      await saveUserAnnotations(this.currentUser.id, symbol, annotations);
      if (showAlert) alert(`Successfully saved annotations for ${symbol} to your cloud account!`);
    } catch (err) {
      alert(`Save annotations failed: ${err.message}`);
    }
  }

  async loadAndAnalyze(resetView = false) {
    const { symbol, timeframe, minBounces, tolerancePct, filterMode, startDate, endDate, showSupport, showResistance } = this.controlsBar.state;

    try {
      // Fetch OHLCV candles
      const { data: candles, source } = await getMarketCandles(symbol, timeframe, 350);
      this.currentData = candles;

      if (!candles || candles.length === 0) return;

      const currentPrice = candles[candles.length - 1].close;

      // Filter candles strictly within user-selected Date-Time Range if specified
      let periodCandles = candles;
      let startSec = 0;
      let endSec = Infinity;

      if (startDate || endDate) {
        startSec = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : 0;
        endSec = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Infinity;

        const filtered = candles.filter(c => c.time >= startSec && c.time <= endSec);
        if (filtered.length >= 3) {
          periodCandles = filtered;
        }
      }

      // Detect Support & Resistance levels strictly matching minBounces and filterMode within date-time range
      const analysis = detectSupportResistance(periodCandles, {
        minBounces,
        tolerancePct,
        filterMode
      });
      this.currentAnalysis = analysis;

      // Run Automated Technical Pattern Recognition Engine A-Z
      const patterns = detectAllPatterns(periodCandles, {
        supportLines: analysis.supportLines,
        resistanceLines: analysis.resistanceLines
      });

      // Update Chart View preserving user zoom/scroll position unless explicitly reset
      this.chartViewer.setData(candles, resetView);
      this.chartViewer.renderSRLines({
        supportLines: analysis.supportLines,
        resistanceLines: analysis.resistanceLines,
        showSupport,
        showResistance,
        rangeStartSec: startSec > 0 ? startSec : null,
        rangeEndSec: endSec !== Infinity ? endSec : null
      });

      // Render Candlestick patterns, BOS, and Golden Pocket lines
      this.chartViewer.renderPatternOverlays(patterns);

      // Load user cloud drawings for this symbol
      await this.loadSavedAnnotations();

      // Update Analytics Panel
      this.analyticsPanel.update({
        symbol,
        currentPrice,
        source,
        supportLines: analysis.supportLines,
        resistanceLines: analysis.resistanceLines,
        candleCount: candles.length,
        patterns
      });

      // Pass live market context & candles to AI Trade Advisor Panel
      this.aiTradePanel?.setMarketContext({
        symbol,
        currentPrice,
        candles,
        supportLines: analysis.supportLines,
        resistanceLines: analysis.resistanceLines,
        patterns
      });

    } catch (error) {
      console.error('Error during market analysis:', error);
    }
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
