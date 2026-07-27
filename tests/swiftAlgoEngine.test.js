import { describe, it, expect } from 'vitest';
import { runSwiftAlgo, calculateEMA, calculateATR } from '../src/analysis/swiftAlgoEngine.js';

describe('Swift Algo Engine Math Helpers', () => {
  it('should calculate EMA correctly', () => {
    const data = [10, 11, 12, 13, 14];
    const ema = calculateEMA(data, 3);
    expect(ema).toHaveLength(5);
    expect(ema[0]).toBe(10);
    expect(ema[4]).toBeGreaterThan(12); // Should trend upwards
  });

  it('should calculate ATR correctly', () => {
    const candles = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9, close: 11 },
      { high: 15, low: 10, close: 14 }
    ];
    const atr = calculateATR(candles, 2);
    expect(atr).toHaveLength(3);
    expect(atr[2]).toBeGreaterThan(0);
  });
});

describe('Swift Algo Engine Pipeline', () => {
  it('should return empty if not enough candles', () => {
    const candles = Array.from({ length: 10 }, (_, i) => ({
      time: i, open: 10, high: 12, low: 8, close: 11, volume: 100
    }));
    const signals = runSwiftAlgo(candles, { trendEmaPeriod: 20 });
    expect(signals).toHaveLength(0);
  });

  it('should generate signals with trailing bands', () => {
    // Generate 250 candles to satisfy all EMAs (trend is 200)
    const candles = Array.from({ length: 250 }, (_, i) => {
      let price = 100;
      if (i > 150) price = 120; // Sudden breakout to cross ATR bands
      return {
        time: Date.now() + i * 60000,
        open: price - 1,
        high: price + 2,
        low: price - 2,
        close: price + 1,
        volume: 1000 + Math.random() * 500
      };
    });

    const signals = runSwiftAlgo(candles, { trendEmaPeriod: 200, useTrendFilter: false });
    
    expect(signals).toHaveLength(249); // N-1 because of index 1 start
    
    // Check that we have valid trailing bands
    expect(signals[200].trailingSupport).toBeGreaterThan(0);
    expect(signals[200].trailingResistance).toBeGreaterThan(0);
    
    // Should have generated some BUY signal in the uptrend
    const hasBuy = signals.some(s => s.type === 'BUY');
    expect(hasBuy).toBe(true);
  });
});
