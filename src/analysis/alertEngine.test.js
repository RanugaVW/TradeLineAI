import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { alertEngine } from './alertEngine.js';
import * as cryptoApi from '../api/cryptoApi.js';
import * as patternEngine from './patternEngine.js';

vi.mock('../api/cryptoApi.js', () => ({
  getMarketCandles: vi.fn(),
  POPULAR_PAIRS: [
    { symbol: 'BTC-USDT' }
  ]
}));

vi.mock('./patternEngine.js', () => ({
  detectAllPatterns: vi.fn()
}));

describe('Alert Engine', () => {
  let notificationSpy;

  beforeEach(() => {
    // Reset state
    alertEngine.isActive = false;
    if (alertEngine.intervalId) clearInterval(alertEngine.intervalId);
    alertEngine.intervalId = null;
    alertEngine.lastAlertTime.clear();

    notificationSpy = vi.spyOn(alertEngine, 'sendNotification').mockImplementation(() => {});
    
    // Mock global Notification
    global.Notification = {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted')
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    alertEngine.stop();
  });

  it('should start and stop correctly', () => {
    expect(alertEngine.isActive).toBe(false);
    alertEngine.start();
    expect(alertEngine.isActive).toBe(true);
    expect(alertEngine.intervalId).not.toBeNull();

    alertEngine.stop();
    expect(alertEngine.isActive).toBe(false);
    expect(alertEngine.intervalId).toBeNull();
  });

  it('should trigger notification on STRONG_BUY and respect spam filter', () => {
    const analysis = { prediction: { direction: 'UP', score: 25 } };
    
    // First signal should trigger alert
    alertEngine.evaluateSignal('BTC-USDT', '15m', analysis, 65000);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
    expect(notificationSpy).toHaveBeenCalledWith(
      '🟢 STRONG BUY SIGNAL: BTC-USDT',
      { body: 'Pattern analysis detected a STRONG_BUY setup on 15m timeframe. Price: $65000' }
    );

    // Second signal immediately after should be ignored by spam filter
    alertEngine.evaluateSignal('BTC-USDT', '15m', analysis, 65000);
    expect(notificationSpy).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should trigger notification on STRONG_SELL', () => {
    const analysis = { prediction: { direction: 'DOWN', score: -25 } };
    
    alertEngine.evaluateSignal('ETH-USDT', '1H', analysis, 3500);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
    expect(notificationSpy).toHaveBeenCalledWith(
      '🔴 STRONG SELL SIGNAL: ETH-USDT',
      { body: 'Pattern analysis detected a STRONG_SELL setup on 1H timeframe. Price: $3500' }
    );
  });
});
