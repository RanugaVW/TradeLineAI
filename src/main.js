import { getMarketCandles } from './api/cryptoApi.js';
import { detectSupportResistance } from './analysis/srDetector.js';
import { detectAllPatterns, calculateVolumeProfile } from './analysis/patternEngine.js';
import { ChartViewer } from './components/ChartViewer.js';
import { ControlsBar } from './components/ControlsBar.js';
import { AnalyticsPanel } from './components/AnalyticsPanel.js';
import { AuthModal } from './components/AuthModal.js';
import { DrawingToolbar } from './components/DrawingToolbar.js';
import { FavoritesToolbar } from './components/FavoritesToolbar.js';
import { AdminPanel } from './components/AdminPanel.js';
import { AITradePanel } from './components/AITradePanel.js';
import { supabase, getCurrentSession, fetchUserProfile, saveUserAnnotations, loadUserAnnotations, subscribeToProfileChanges, subscribeToAnnotationChanges, acceptTermsOfService, signOutUser } from './api/supabaseClient.js';
import { alertEngine } from './analysis/alertEngine.js';
import { BacktestModal } from './components/BacktestModal.js';
import { PredictionHistory } from './components/PredictionHistory.js';
import { DemoTradingPanel } from './components/DemoTradingPanel.js';
import { ManualTradePanel } from './components/ManualTradePanel.js';
import { processTradeTriggers } from './api/demoTradeApi.js';

class App {
  constructor() {
    this.chartViewer = null;
    this.controlsBar = null;
    this.analyticsPanel = null;
    this.authModal = null;
    this.drawingToolbar = null;
    this.favoritesToolbar = null;
    this.adminPanel = null;
    this.aiTradePanel = null;
    this.demoTradingPanel = null;
    this.manualTradePanel = null;

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
      onPatternClick: (pat) => this.chartViewer.focusPattern(pat),
      onTogglePanel: (isCollapsed) => {
        // JS fallback: directly set grid columns so chart fills full width
        const dashboard = document.getElementById('main-dashboard');
        if (dashboard) {
          dashboard.style.gridTemplateColumns = isCollapsed
            ? '1fr 0px'
            : '1fr 360px';
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
      onBeforeOpen: () => {
        if (this.userProfile && this.userProfile.role === 'free') {
          const paywallModal = document.getElementById('paywall-modal');
          if (paywallModal) {
            paywallModal.classList.remove('hidden');
          }
          return false; // Prevent opening
        }
        return true; // Allow opening for Pro/Admin
      },
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

    // Close Paywall Button listener
    const closePaywallBtn = document.getElementById('close-paywall-btn');
    if (closePaywallBtn) {
      closePaywallBtn.addEventListener('click', () => {
        document.getElementById('paywall-modal').classList.add('hidden');
      });
    }

    // Initialize Backtest Modal
    this.backtestModal = new BacktestModal(document.body);
    const btBtn = document.getElementById('run-backtest-btn');
    if (btBtn) {
      btBtn.addEventListener('click', () => {
        this.backtestModal.open();
      });
    }

    // Initialize Prediction History Modal
    const historyContainer = document.getElementById('ai-history-container');
    if (historyContainer) {
      this.predictionHistory = new PredictionHistory(historyContainer);
      
      document.addEventListener('open-prediction-history', () => {
        this.predictionHistory.init();
      });

      const closeHistoryBtn = document.getElementById('close-history-modal-btn');
      if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
          const overlay = document.getElementById('ai-history-modal-overlay');
          if (overlay) overlay.style.display = 'none';
        });
      }
    }

    // Initialize Demo Trading Panel
    const demoContainer = document.getElementById('demo-trading-container');
    if (demoContainer) {
      this.demoTradingPanel = new DemoTradingPanel(demoContainer);
      const demoBtn = document.getElementById('demo-trading-btn');
      if (demoBtn) {
        demoBtn.addEventListener('click', () => {
          if (!this.currentUser) {
            alert('Please log in to use Demo Trading.');
            return;
          }
          this.demoTradingPanel.open();
        });
      }
    }

    // Initialize Manual Trading Panel
    const manualTradeContainer = document.getElementById('manual-trade-container');
    if (manualTradeContainer) {
      this.manualTradePanel = new ManualTradePanel(manualTradeContainer, {
        onTradeSuccess: () => {
          if (this.demoTradingPanel && this.demoTradingPanel.isOpen) {
            this.demoTradingPanel.fetchAccount();
            this.demoTradingPanel.trades = this.demoTradingPanel.fetchTrades ? this.demoTradingPanel.fetchTrades() : []; // it re-fetches inside closeDemoTrade but we can just force update
            this.demoTradingPanel.open(); // re-open to refresh
          }
        }
      });
    }

    // Sidebar Tabs Logic
    const tabAnalytics = document.getElementById('sidebar-tab-analytics');
    const tabTrade = document.getElementById('sidebar-tab-trade');
    const paneAnalytics = document.getElementById('analytics-container');
    const paneTrade = document.getElementById('manual-trade-container');

    if (tabAnalytics && tabTrade && paneAnalytics && paneTrade) {
      tabAnalytics.addEventListener('click', () => {
        tabAnalytics.classList.add('active');
        tabTrade.classList.remove('active');
        paneAnalytics.classList.add('active-pane');
        paneTrade.classList.remove('active-pane');
      });

      tabTrade.addEventListener('click', () => {
        if (!this.currentUser) {
          alert('Please log in to place manual trades.');
          return;
        }
        tabTrade.classList.add('active');
        tabAnalytics.classList.remove('active');
        paneTrade.classList.add('active-pane');
        paneAnalytics.classList.remove('active-pane');
        
        if (this.manualTradePanel) {
        this.manualTradePanel.updateContext({ symbol: this.controlsBar.currentSymbol });
      }
      });
    }

    // Alert Engine Toggle
    const alertToggle = document.getElementById('ai-alert-toggle');
    if (alertToggle) {
      alertToggle.addEventListener('change', (e) => {
        const role = this.userProfile?.role || 'free';
        if (role === 'free') {
          e.preventDefault();
          e.target.checked = false;
          alert('Background AI Market Polling and Alerts are only available for PRO 1 and ADMIN accounts. Please contact an admin to upgrade your tier.');
          return;
        }

        if (e.target.checked) {
          alertEngine.start();
        } else {
          alertEngine.stop();
        }
      });
    }

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

    // 4. Initialize Drawing Toolbar Sidebar & Favorites
    let savedFavorites = [];
    try {
      const favStr = localStorage.getItem('tradeLine_favorites');
      if (favStr) savedFavorites = JSON.parse(favStr);
    } catch (e) { console.warn('Failed to load favorites'); }

    this.drawingToolbar = new DrawingToolbar(drawingElem, {
      favorites: savedFavorites,
      onFavoriteToggle: (tool) => {
        if (savedFavorites.includes(tool)) {
          savedFavorites = savedFavorites.filter(t => t !== tool);
        } else {
          savedFavorites.push(tool);
        }
        localStorage.setItem('tradeLine_favorites', JSON.stringify(savedFavorites));
        this.drawingToolbar.favorites = savedFavorites;
        this.drawingToolbar._refreshActiveState(); // To update star buttons
        
        // Update Floating Panel
        if (this.favoritesToolbar) {
          this.favoritesToolbar.setFavorites(savedFavorites);
        }
      },
      onToolChange: (tool) => {
        this.chartViewer.setDrawingTool(tool);
        if (this.favoritesToolbar) this.favoritesToolbar.setActiveTool(tool);
      },
      onUndo: () => this.chartViewer.undoDrawing(),
      onRedo: () => this.chartViewer.redoDrawing(),
      onClear: () => this.chartViewer.clearDrawings(),
      onColorChange: (c) => this.chartViewer.setDrawingColor(c),
      onWidthChange: (w) => this.chartViewer.setDrawingWidth(w),
      onStyleChange: (s) => this.chartViewer.setDrawingStyle(s),
    });

    // 4.1 Custom Sidebar Resizer
    const resizer = document.createElement('div');
    resizer.className = 'sidebar-resizer';
    drawingElem.appendChild(resizer);

    let isResizing = false;
    
    // Load saved width
    try {
      const savedWidth = localStorage.getItem('tradeLine_sidebar_width');
      if (savedWidth) {
        drawingElem.style.width = savedWidth;
      }
    } catch (e) {}

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizer.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      e.preventDefault(); // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const rect = drawingElem.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      
      // Enforce min/max widths (matches CSS)
      if (newWidth >= 60 && newWidth <= 250) {
        drawingElem.style.width = `${newWidth}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('is-resizing');
        document.body.style.cursor = '';
        
        // Save width to localStorage
        try {
          localStorage.setItem('tradeLine_sidebar_width', drawingElem.style.width);
        } catch (e) {}
        
        // Trigger chart resize
        window.dispatchEvent(new Event('resize'));
      }
    });

    // Build tools map for favorites toolbar
    const toolsMap = {};
    const allToolIds = [
      'trendline', 'extended-line', 'ray', 'horizontal', 'vertical', 'channel', 'pitchfork',
      'zone', 'triangle', 'ellipse',
      'fib', 'fib-ext', 'fib-fan', 'fib-time',
      'text', 'callout', 'note', 'measure', 'long', 'short'
    ];
    allToolIds.forEach(id => {
      toolsMap[id] = {
        title: this.drawingToolbar.getToolTitle(id),
        svg: this.drawingToolbar.getToolSVG(id)
      };
    });

    this.favoritesToolbar = new FavoritesToolbar({
      favorites: savedFavorites,
      toolsMap: toolsMap,
      onToolChange: (tool) => {
        this.drawingToolbar.setActiveTool(tool);
        this.chartViewer.setDrawingTool(tool);
      }
    });

    // Keep toolbar in sync when tool is changed via keyboard shortcut inside DrawingEngine
    document.addEventListener('drawingToolChange', (e) => {
      this.drawingToolbar?.setActiveTool(e.detail.tool);
      this.favoritesToolbar?.setActiveTool(e.detail.tool);
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
        showSMC: false, // Default: Off until explicitly toggled by a Pro user
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
    
    this.isFullyInitialized = true;

    // 9. Background price refresh every 15s
    setInterval(() => {
      this.loadAndAnalyze(false);
    }, 15000);

    // 10. Initialize Lucide Icons globally and setup a global refresh function
    window.refreshIcons = () => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    };
    
    // Create an observer to automatically inject icons when DOM changes
    const observer = new MutationObserver((mutationsList, obs) => {
      // Disconnect temporarily to avoid infinite loop when createIcons modifies the DOM
      obs.disconnect();
      window.refreshIcons();
      // Reconnect observer
      obs.observe(document.body, { childList: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    window.refreshIcons();
    
    // Set initial timezone
    if (this.controlsBar && this.controlsBar.state) {
      this.chartViewer.setTimezone(this.controlsBar.state.timezone);
      this.lastTimezone = this.controlsBar.state.timezone;
    }
  }

  updateLockScreenState() {
    const lockOverlay = document.getElementById('auth-lock-overlay');
    const appElem = document.getElementById('app');
    const tosModal = document.getElementById('tos-modal');

    if (!this.currentUser) {
      appElem?.classList.add('logged-out-mode');
      lockOverlay?.classList.remove('hidden');
      tosModal?.classList.add('hidden');
    } else {
      // 1. Enforce 3-Day Free Trial Limit
      if (this.userProfile && this.userProfile.role === 'free' && this.userProfile.created_at) {
        const createdTime = new Date(this.userProfile.created_at).getTime();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        
        if (Date.now() - createdTime > threeDaysMs) {
          alert('Your 3-day free trial has expired. Please make a payment and contact an admin to upgrade your account.');
          signOutUser().then(() => {
            window.location.reload();
          });
          return;
        } else {
          this.startTrialCountdown(createdTime, threeDaysMs);
        }
      } else {
        // If not free tier, hide the timer
        const timerContainer = document.getElementById('trial-timer-container');
        if (timerContainer) timerContainer.classList.add('hidden');
        if (this.trialTimerInterval) clearInterval(this.trialTimerInterval);
      }

      // 2. Check if ToS is accepted (null, undefined, or false means not accepted)
      if (this.userProfile && this.userProfile.tos_accepted !== true) {
        appElem?.classList.add('logged-out-mode');
        lockOverlay?.classList.add('hidden'); // Hide login lock
        tosModal?.classList.remove('hidden'); // Show ToS modal
        this.initTosModal();
      } else {
        appElem?.classList.remove('logged-out-mode');
        lockOverlay?.classList.add('hidden');
        tosModal?.classList.add('hidden');
      }
    }
  }

  startTrialCountdown(createdTime, threeDaysMs) {
    const timerContainer = document.getElementById('trial-timer-container');
    const timerText = document.getElementById('trial-timer-text');
    if (!timerContainer || !timerText) return;

    timerContainer.classList.remove('hidden');
    if (this.trialTimerInterval) clearInterval(this.trialTimerInterval);

    const updateTimer = () => {
      const now = Date.now();
      const timeElapsed = now - createdTime;
      const timeLeft = threeDaysMs - timeElapsed;

      if (timeLeft <= 0) {
        clearInterval(this.trialTimerInterval);
        timerText.innerText = "00:00:00:00";
        alert('Your 3-day free trial has expired. Please make a payment and contact an admin to upgrade your account.');
        signOutUser().then(() => {
          window.location.reload();
        });
        return;
      }

      // Calculate days, hours, minutes, seconds
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      const d = String(days).padStart(2, '0');
      const h = String(hours).padStart(2, '0');
      const m = String(minutes).padStart(2, '0');
      const s = String(seconds).padStart(2, '0');

      timerText.innerText = `${d}:${h}:${m}:${s}`;
    };

    updateTimer(); // run immediately once
    this.trialTimerInterval = setInterval(updateTimer, 1000);
  }

  initTosModal() {
    if (this._tosInitialized) return;
    this._tosInitialized = true;
    
    const checkbox = document.getElementById('tos-checkbox');
    const acceptBtn = document.getElementById('tos-accept-btn');
    
    if (checkbox && acceptBtn) {
      checkbox.addEventListener('change', (e) => {
        acceptBtn.disabled = !e.target.checked;
      });
      
      acceptBtn.addEventListener('click', async () => {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Accepting...';
        
        try {
          const res = await acceptTermsOfService(this.currentUser.id);
          if (res.success) {
            this.userProfile.tos_accepted = true;
            this.updateLockScreenState();
          } else {
            alert(`Error accepting terms: ${res.error}. Make sure you have run the schema.sql update in Supabase.`);
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'Accept & Continue';
          }
        } catch(err) {
          console.error(err);
          alert(`Network/Client error: ${err.message}`);
          acceptBtn.disabled = false;
          acceptBtn.textContent = 'Accept & Continue';
        }
      });
    }
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
    await this.loadSavedAnnotations();
  }

  async handleControlsChange(state) {
    const symbolChanged = this.lastSymbol && this.lastSymbol !== state.symbol;
    const tfChanged = this.lastTf && this.lastTf !== state.timeframe;
    this.lastSymbol = state.symbol;
    this.lastTf = state.timeframe;

    if (symbolChanged) {
      alert(`New crypto history (${state.symbol}) is analysing. Please wait until the analysing of the system is done.`);
    }
    
    if (this.chartViewer.showLabels !== state.showLabels) {
      this.chartViewer.showLabels = state.showLabels;
      this.chartViewer.combineAndSetMarkers();
    }
    
    if (this.chartViewer.showSMC !== state.showSMC) {
      if (state.showSMC && this.userProfile && this.userProfile.role === 'free') {
        if (this.isFullyInitialized) {
          const paywallModal = document.getElementById('paywall-modal');
          if (paywallModal) {
            paywallModal.classList.remove('hidden');
          }
        }
        // Revert UI toggle silently
        this.controlsBar.state.showSMC = false;
        this.controlsBar.render();
        state.showSMC = false; // Override state so chartViewer disables it
      }
      this.chartViewer.showSMC = state.showSMC;
      if (!state.showSMC) {
        this.chartViewer.clearSMC();
      } else {
        // Redraw immediately when turned on
        if (this.lastPatterns) {
          this.chartViewer.renderPatternOverlays(this.lastPatterns);
        }
      }
    }

    if (alertEngine && typeof alertEngine.setSniperMode === 'function') {
      alertEngine.setSniperMode(state.sniperMode);
    }

    // Save drawings for old symbol, load for new one
    if (symbolChanged) {
      this.chartViewer.setDrawingSymbol(state.symbol);
    }

    // Update Visual Indicators
    if (this.chartViewer.setVisualIndicators) {
      this.chartViewer.setVisualIndicators({
        bb: state.showBB,
        rsi: state.showRSI,
        macd: state.showMACD
      });
    }

    if (this.lastTimezone !== state.timezone) {
      this.lastTimezone = state.timezone;
      this.chartViewer.setTimezone(state.timezone);
    }

    await this.loadAndAnalyze(symbolChanged || tfChanged);
  }

  async loadSavedAnnotations() {
    if (this.currentUser && this.userProfile.role !== 'free') {
      const symbol = this.controlsBar.state.symbol;
      const cacheKey = `annotations_${this.currentUser.id}_${symbol}`;
      
      // 1. FAST PATH: Load from localStorage instantly
      try {
        const localCache = localStorage.getItem(cacheKey);
        if (localCache) {
          this.chartViewer.setUserAnnotations(JSON.parse(localCache));
        }
      } catch(e) { console.warn('Local cache read failed'); }

      // 2. BACKGROUND FETCH: Get truth from cloud
      const savedDrawings = await loadUserAnnotations(this.currentUser.id, symbol);
      
      // 3. UPDATE: Render cloud truth and save to local cache
      this.chartViewer.setUserAnnotations(savedDrawings);
      localStorage.setItem(cacheKey, JSON.stringify(savedDrawings));
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
      const cacheKey = `annotations_${this.currentUser.id}_${symbol}`;
      
      // INSTANT LOCAL SAVE for snappy UX
      localStorage.setItem(cacheKey, JSON.stringify(annotations));

      // BACKGROUND CLOUD SAVE
      // We don't await this if auto-saving to prevent blocking the UI
      const savePromise = saveUserAnnotations(this.currentUser.id, symbol, annotations);
      
      if (showAlert) {
        await savePromise; // wait only if we need to show an alert
        alert(`Successfully saved annotations for ${symbol} to your cloud account!`);
      }
    } catch (err) {
      if (showAlert) alert(`Save annotations failed: ${err.message}`);
      console.error('Annotation save error:', err);
    }
  }

  async loadAndAnalyze(resetView = false) {
    const { symbol, timeframe, minBounces, tolerancePct, filterMode, startDate, endDate, showSupport, showResistance, sniperMode, showHeatmap } = this.controlsBar.state;

    try {
      // Fetch OHLCV candles
      const { data: candles, source } = await getMarketCandles(symbol, timeframe, 350);
      this.currentData = candles;

      if (!candles || candles.length === 0) return;

      const currentCandle = candles[candles.length - 1];
      const currentPrice = currentCandle.close;
      
      // Auto-Execute Background Trades
      if (this.currentUser) {
        processTradeTriggers(symbol, currentCandle);
      }

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
        resistanceLines: analysis.resistanceLines,
        sniperMode
      });

      // Calculate Volume Profile / Price Heatmap
      const volumeProfile = calculateVolumeProfile(periodCandles);

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
      this.lastPatterns = patterns;

      // Render Price Heatmap (Volume Profile) lines
      this.chartViewer.renderHeatmapLines(volumeProfile, showHeatmap, startSec > 0 ? startSec : null, endSec !== Infinity ? endSec : null);

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
        supportLines: analysis.supportLines,
        resistanceLines: analysis.resistanceLines,
        candles: periodCandles,
        patterns
      });

      // Update Manual Trade Panel context
      if (this.manualTradePanel) {
        this.manualTradePanel.updateContext({ symbol });
      }

      // Check alerts
      if (alertEngine && typeof alertEngine.setSniperMode === 'function') {
        alertEngine.setSniperMode(sniperMode);
      }

    } catch (error) {
      console.error('Error during market analysis:', error);
    }
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();

  // Sidebar Resizer Logic
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.getElementById('sidebar-wrapper');
  let isResizing = false;

  if (resizer && sidebar) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizer.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      // Prevent text selection while dragging
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      // Calculate new width: window width - mouse X
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) {
        sidebar.style.width = `${newWidth}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('is-resizing');
        document.body.style.cursor = '';
      }
    });
  }
});
