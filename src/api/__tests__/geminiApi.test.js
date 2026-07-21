import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGeminiTradeSuggestion } from '../geminiApi.js';

describe('geminiApi', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('er-api.com') || url.includes('exchangerate-api.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ rates: { LKR: 300 } })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ signal: "BUY", confidence: 90 }) }] } }]
        })
      });
    });
  });

  it('should format a valid request to the Gemini endpoint', async () => {
    const marketData = {
      pair: "BTC-USDT",
      timeframe: "1H",
      currentPrice: 65000,
      supportLines: [],
      resistanceLines: [],
      candlestickPatterns: [],
      marketStructure: { pivots: [], bosEvents: [], chochEvents: [], fvgGaps: [], orderBlocks: [], current_trend: 'SIDEWAYS' },
      indicators: { rsi: 50, macd: { histogram: 0 }, vwap: 64000, volumeSpike: false }
    };

    const response = await fetchGeminiTradeSuggestion(marketData);
    
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('generativelanguage.googleapis.com'), expect.any(Object));
    expect(response.signal).toBe("BUY");
    expect(response.confidence).toBe(90);
  });

  it('should handle API errors gracefully by using the fallback engine', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('er-api')) return Promise.resolve({ ok: true, json: async () => ({ rates: { LKR: 300 }}) });
      return Promise.resolve({ ok: false, status: 500, text: async () => "Internal Server Error" });
    });

    const response = await fetchGeminiTradeSuggestion({ currentPrice: 60000 });
    expect(response.engineType).toContain("Quantitative Pattern Engine");
  });
});
