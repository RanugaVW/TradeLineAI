import { describe, it, expect } from 'vitest';
import { detectSupportResistance } from '../srDetector.js';

describe('srDetector', () => {
  it('should return empty arrays when given fewer than 10 candles', () => {
    const candles = Array.from({ length: 5 }, (_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100
    }));
    
    const result = detectSupportResistance(candles);
    expect(result.supportLines).toEqual([]);
    expect(result.resistanceLines).toEqual([]);
    expect(result.allLines).toEqual([]);
  });

  it('should detect a valid resistance line with 3+ bounces', () => {
    // Generate a set of candles where the price bounces off 100 three times
    const candles = [];
    for (let i = 0; i < 50; i++) {
      let high = 50 + Math.random() * 20; // 50-70
      
      // Force 3 distinct bounces at ~100 with enough space between them for pivotWindow (3)
      if (i === 10 || i === 25 || i === 40) {
        high = 100;
      }
      
      candles.push({
        time: i,
        open: 60,
        high,
        low: 40,
        close: i === 49 ? 90 : 60 // Make sure the last candle is close to the 100 resistance level to prevent pruning
      });
    }

    const result = detectSupportResistance(candles, { minBounces: 3, pivotWindow: 3 });
    
    // We expect exactly 1 resistance line around 100
    expect(result.resistanceLines.length).toBeGreaterThanOrEqual(1);
    
    const resLine = result.resistanceLines.find(line => Math.abs(line.price - 100) < 5);
    expect(resLine).toBeDefined();
    expect(resLine.bounces).toBeGreaterThanOrEqual(3);
  });

  it('should respect the minBounces parameter', () => {
    const candles = [];
    for (let i = 0; i < 50; i++) {
      let low = 100 + Math.random() * 20; // 100-120
      
      // Force exactly 2 bounces at ~50
      if (i === 15 || i === 30) {
        low = 50;
      }
      
      candles.push({ time: i, open: 100, high: 120, low, close: 100 });
    }

    // Since we set minBounces to 3, it should NOT detect the 50 level
    const result = detectSupportResistance(candles, { minBounces: 3, pivotWindow: 3 });
    const supLine = result.supportLines.find(line => Math.abs(line.price - 50) < 5);
    expect(supLine).toBeUndefined();
  });
});
