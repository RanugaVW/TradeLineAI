import { describe, it, expect } from 'vitest';
import { detectAllPatterns } from '../src/analysis/patternEngine.js';

// Helper to pad candles to bypass the minimum 15 candle requirement
function padCandles(testCandles) {
  const padding = [];
  const baseCandle = testCandles[0];
  for (let i = 0; i < 15; i++) {
    padding.push({ ...baseCandle, time: baseCandle.time - 15 + i });
  }
  return [...padding, ...testCandles];
}

describe('Smart Money Concepts (SMC) Analyzer', () => {
  it('should detect a single Bullish FVG', () => {
    const candles = padCandles([
      { time: 1, open: 100, high: 105, low: 95, close: 100 },
      { time: 2, open: 100, high: 115, low: 98, close: 110 },
      { time: 3, open: 110, high: 125, low: 112, close: 120 }
    ]);
    
    // Gap is between candle 1 high (105) and candle 3 low (112)
    const result = detectAllPatterns(candles);
    const fvgs = result.marketStructure.fvgGaps;
    
    expect(fvgs).toBeDefined();
    expect(fvgs.length).toBeGreaterThan(0);
    expect(fvgs[0].type).toBe('BULLISH_FVG');
    expect(fvgs[0].low).toBe(105);
    expect(fvgs[0].high).toBe(112);
  });

  it('should detect a single Bearish FVG', () => {
    const candles = padCandles([
      { time: 1, open: 100, high: 105, low: 95, close: 100 },
      { time: 2, open: 100, high: 98, low: 85, close: 90 },
      { time: 3, open: 90, high: 83, low: 75, close: 80 }
    ]);
    
    // Gap is between candle 1 low (95) and candle 3 high (83)
    const result = detectAllPatterns(candles);
    const fvgs = result.marketStructure.fvgGaps;
    
    expect(fvgs).toBeDefined();
    expect(fvgs.length).toBeGreaterThan(0);
    expect(fvgs[0].type).toBe('BEARISH_FVG');
    expect(fvgs[0].high).toBe(95);
    expect(fvgs[0].low).toBe(83);
  });

  it('should detect consecutive overlapping Bearish FVGs', () => {
    const candles = padCandles([
      { time: 1, open: 100, high: 105, low: 95, close: 100 }, // c1
      { time: 2, open: 100, high: 98, low: 85, close: 90 },   // c2
      { time: 3, open: 90, high: 83, low: 75, close: 80 },    // c3
      { time: 4, open: 80, high: 73, low: 65, close: 70 },    // c4
    ]);
    
    // FVG 1: c1 low (95) - c3 high (83)
    // FVG 2: c2 low (85) - c4 high (73)
    const result = detectAllPatterns(candles);
    const fvgs = result.marketStructure.fvgGaps;
    
    expect(fvgs.length).toBe(2);
    expect(fvgs[0].type).toBe('BEARISH_FVG');
    expect(fvgs[0].high).toBe(95);
    expect(fvgs[0].low).toBe(83);
    
    expect(fvgs[1].type).toBe('BEARISH_FVG');
    expect(fvgs[1].high).toBe(85);
    expect(fvgs[1].low).toBe(73);
  });

  it('should not detect FVG when there is no gap', () => {
    const candles = [
      { time: 1, open: 100, high: 105, low: 95, close: 100 },
      { time: 2, open: 100, high: 115, low: 98, close: 110 },
      { time: 3, open: 110, high: 125, low: 104, close: 120 }
    ];
    
    // c3 low is 104. c1 high is 105. No gap!
    const result = detectAllPatterns(candles);
    const fvgs = result.marketStructure.fvgGaps;
    
    expect(fvgs.length).toBe(0);
  });
});
