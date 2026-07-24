import { getMarketCandles, POPULAR_PAIRS } from '../api/cryptoApi.js';
import { detectAllPatterns } from './patternEngine.js';

export class AlertEngine {
  constructor() {
    this.isActive = false;
    this.intervalId = null;
    this.pollingIntervalMs = 5 * 60 * 1000; // Poll every 5 minutes
    this.lastAlertTime = new Map(); // Keep track of when we last alerted for a pair/timeframe to avoid spam
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notification');
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  sendNotification(title, options) {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/favicon.ico', // Update to your app's icon if available
        ...options
      });
      // Optionally play a sound
      try {
        const audio = new Audio('/alert-sound.mp3'); // We'll assume a file exists or just ignore if it doesn't
        audio.play().catch(() => { }); // Catch autoplay restrictions
      } catch (e) {
        console.error('Audio play failed', e);
      }
      return notification;
    }
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.requestPermission();

    console.log('Alert Engine Started: Polling every 5 minutes...');

    // Initial check immediately
    this.pollMarkets();

    this.intervalId = setInterval(() => {
      this.pollMarkets();
    }, this.pollingIntervalMs);
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🛑 Alert Engine Stopped.');
  }

  async pollMarkets() {
    if (!this.isActive) return;

    // We'll check the top 3 most popular pairs to avoid rate limits
    const pairsToCheck = POPULAR_PAIRS.slice(0, 3);
    const timeframes = ['15m', '1H']; // Check scalp and day trade timeframes

    for (const pair of pairsToCheck) {
      for (const tf of timeframes) {
        try {
          const result = await getMarketCandles(pair.symbol, tf, 200);
          if (result && result.data && result.data.length > 0) {
            const analysis = detectAllPatterns(result.data);
            this.evaluateSignal(pair.symbol, tf, analysis, result.data[result.data.length - 1].close);
          }
        } catch (error) {
          console.error(`Alert Engine Error fetching ${pair.symbol} ${tf}:`, error);
        }
        // Small delay to avoid API throttling
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  evaluateSignal(symbol, timeframe, analysis, currentPrice) {
    const isStrongBuy = analysis.prediction?.direction === 'UP' && analysis.prediction?.score >= 20;
    const isStrongSell = analysis.prediction?.direction === 'DOWN' && analysis.prediction?.score <= -20;

    let signalType = null;
    let title = '';
    let body = '';

    if (isStrongBuy) {
      signalType = 'BUY';
      title = `🟢 STRONG BUY SIGNAL: ${symbol}`;
      body = `Pattern analysis detected a STRONG_BUY setup on ${timeframe} timeframe. Price: $${currentPrice}`;
    } else if (isStrongSell) {
      signalType = 'SELL';
      title = `🔴 STRONG SELL SIGNAL: ${symbol}`;
      body = `Pattern analysis detected a STRONG_SELL setup on ${timeframe} timeframe. Price: $${currentPrice}`;
    }

    if (signalType) {
      const cacheKey = `${symbol}_${timeframe}_${signalType}`;
      const lastTime = this.lastAlertTime.get(cacheKey) || 0;
      const now = Date.now();

      // Only alert once per hour per symbol/timeframe/signal to prevent spam
      if (now - lastTime > 60 * 60 * 1000) {
        this.sendNotification(title, { body });
        this.lastAlertTime.set(cacheKey, now);
        console.log(`[ALERT] Triggered ${signalType} for ${symbol} on ${timeframe}`);
      }
    }
  }
}

// Export a singleton instance
export const alertEngine = new AlertEngine();
