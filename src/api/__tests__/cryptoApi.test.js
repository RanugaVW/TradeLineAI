import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseTimeframe, getMarketCandles, POPULAR_PAIRS } from '../cryptoApi.js';

describe('cryptoApi', () => {
  describe('parseTimeframe', () => {
    it('should parse standard presets correctly', () => {
      const result = parseTimeframe('1H');
      expect(result.binance).toBe('1h');
      expect(result.seconds).toBe(3600);
    });

    it('should parse custom dynamic timeframes (e.g. 2H, 3D)', () => {
      const result2h = parseTimeframe('2H');
      expect(result2h.seconds).toBe(7200);
      
      const result3d = parseTimeframe('3D');
      expect(result3d.seconds).toBe(86400 * 3);
    });
  });

  describe('getMarketCandles', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should fetch from binance and return formatted candles', async () => {
      const mockBinanceResponse = [
        [1620000000000, "100.0", "110.0", "90.0", "105.0", "1000"]
      ];
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBinanceResponse
      });

      const pair = POPULAR_PAIRS.find(p => p.symbol === 'BTC-USDT');
      const result = await getMarketCandles(pair.symbol, '1H');
      
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('api.binance.com'));
      expect(result.data.length).toBe(1);
      expect(result.data[0].open).toBe(100.0);
      expect(result.data[0].close).toBe(105.0);
      expect(result.data[0].volume).toBe(1000);
    });
  });
});
