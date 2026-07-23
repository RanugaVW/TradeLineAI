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

  it('should calculate SRSI and its %K and %D lines', () => {
    // Need at least 28 candles to calculate RSI(14) and then SRSI(14)
    const candles = Array.from({ length: 40 }, (_, i) => ({
      time: i,
      // Creating some price movement to ensure RSI doesn't just stay at 50 flat
      open: 100,
      high: 100 + (i % 5),
      low: 100 - (i % 5),
      close: 100 + Math.sin(i) * 10,
      volume: 1000
    }));
    
    const result = detectAllPatterns(candles);
    expect(result.indicators).toBeDefined();
    expect(result.indicators.srsi).toBeDefined();
    expect(result.indicators.srsi).toHaveProperty('k');
    expect(result.indicators.srsi).toHaveProperty('d');
    expect(result.indicators.srsi).toHaveProperty('status');
    expect(result.indicators.srsi).toHaveProperty('cross');
    expect(typeof result.indicators.srsi.k).toBe('number');
    expect(typeof result.indicators.srsi.d).toBe('number');
  });
});
