import { describe, it, expect, vi } from 'vitest';
import { runBacktest } from './backtester.js';
import * as cryptoApi from '../api/cryptoApi.js';
import * as patternEngine from './patternEngine.js';

// Mock the dependencies
vi.mock('../api/cryptoApi.js', () => ({
  getMarketCandles: vi.fn()
}));

vi.mock('./patternEngine.js', () => ({
  detectAllPatterns: vi.fn()
}));

describe('Backtester Engine', () => {
  it('should throw an error if not enough historical data is available', async () => {
    cryptoApi.getMarketCandles.mockResolvedValueOnce({ data: new Array(50) });

    await expect(runBacktest('PI-USDT', '1H')).rejects.toThrow('Not enough historical data to run backtest.');
  });

  it('should execute a profitable trade when STRONG_BUY is triggered and price hits TP1', async () => {
    // Generate 300 mock candles where price goes up after candle 100
    const candles = Array.from({ length: 300 }, (_, i) => ({
      time: 100000 + i * 3600,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 1000
    }));

    cryptoApi.getMarketCandles.mockResolvedValueOnce({ data: candles });

    // Mock pattern engine: Trigger STRONG_BUY at index 100, neutral elsewhere
    patternEngine.detectAllPatterns.mockImplementation((windowCandles) => {
      // The backtest uses window length of 51 (contextWindow 50 + current candle)
      if (windowCandles[windowCandles.length - 1].time === 100000 + 100 * 3600) {
        return { prediction: { direction: 'UP', score: 25 } };
      }
      return { prediction: { direction: 'FLAT', score: 0 } };
    });

    const report = await runBacktest('BTC-USDT', '1H', 1000);

    expect(report.totalTrades).toBe(1);
    expect(report.wins).toBe(1);
    expect(report.winRate).toBe(100);
    expect(report.totalProfitPercent).toBeGreaterThan(0);
    
    const trade = report.trades[0];
    expect(trade.direction).toBe('BUY');
    expect(trade.result).toBe('WIN');
  });

  it('should execute a loss trade when STRONG_SELL is triggered and price hits Stop Loss', async () => {
    // Generate 300 mock candles where price goes UP continuously, 
    // meaning a SELL trade will get stopped out.
    const candles = Array.from({ length: 300 }, (_, i) => ({
      time: 100000 + i * 3600,
      open: 100 + i * 10,
      high: 110 + i * 10,
      low: 90 + i * 10,
      close: 105 + i * 10,
      volume: 1000
    }));

    cryptoApi.getMarketCandles.mockResolvedValueOnce({ data: candles });

    patternEngine.detectAllPatterns.mockImplementation((windowCandles) => {
      if (windowCandles[windowCandles.length - 1].time === 100000 + 100 * 3600) {
        return { prediction: { direction: 'DOWN', score: -25 } };
      }
      return { prediction: { direction: 'FLAT', score: 0 } };
    });

    const report = await runBacktest('BTC-USDT', '1H', 1000);

    expect(report.totalTrades).toBe(1);
    expect(report.wins).toBe(0);
    expect(report.winRate).toBe(0);
    expect(report.totalProfitPercent).toBeLessThan(0);
    
    const trade = report.trades[0];
    expect(trade.direction).toBe('SELL');
    expect(trade.result).toBe('LOSS');
  });
});
