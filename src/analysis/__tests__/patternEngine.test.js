import { describe, it, expect } from 'vitest';
import { detectAllPatterns } from '../patternEngine.js';

describe('patternEngine', () => {
  it('should return empty/default structures when given fewer than 15 candles', () => {
    const candles = Array.from({ length: 10 }, (_, i) => ({
      time: i, open: 10, high: 12, low: 8, close: 11, volume: 100
    }));
    
    const result = detectAllPatterns(candles);
    expect(result.candlestickPatterns).toEqual([]);
    expect(result.marketStructure.pivots).toEqual([]);
    expect(result.chartPatterns).toEqual([]);
  });

  it('should detect a basic Doji candlestick pattern', () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 100
    }));
    
    // The last candle is exactly a Doji (open == close)
    const result = detectAllPatterns(candles);
    
    const dojiPattern = result.candlestickPatterns.find(p => p.name.includes('Doji'));
    expect(dojiPattern).toBeDefined();
  });

  it('should provide a market prediction aggregate', () => {
    const candles = Array.from({ length: 50 }, (_, i) => ({
      // Creating a simple uptrend
      time: i, 
      open: 100 + i, 
      high: 110 + i, 
      low: 90 + i, 
      close: 105 + i, 
      volume: 1000
    }));
    
    const result = detectAllPatterns(candles);
    expect(result.prediction).toBeDefined();
    expect(result.prediction).toHaveProperty('direction');
    expect(result.prediction).toHaveProperty('probability');
    expect(result.prediction).toHaveProperty('reasons');
  });
});
