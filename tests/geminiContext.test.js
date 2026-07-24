import { describe, it, expect, vi } from 'vitest';
import { fetchGeminiTradeSuggestion } from '../src/api/geminiApi.js';
import * as geminiApi from '../src/api/geminiApi.js';

describe('Gemini AI Context Pipeline', () => {
  it('should serialize SMC data correctly into the prompt', async () => {
    // Mock the external fetch call to avoid hitting the actual Gemini API
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({ signal: 'BUY', confidence: 80, reasoning: 'Test' }) }] }
          }]
        })
      })
    );
    
    // Mock getLiveUsdToLkr
    vi.spyOn(geminiApi, 'getLiveUsdToLkr').mockResolvedValue(300);

    const marketContext = {
      symbol: 'BTC-USD',
      currentPrice: 90000,
      patterns: {
        marketStructure: {
          fvgGaps: [
            { type: 'BULLISH_FVG', low: 88000, high: 89000, gapSizePct: 1.1 }
          ],
          bosEvents: [
            { type: 'BULLISH BOS', price: 87500 }
          ]
        }
      }
    };

    await fetchGeminiTradeSuggestion(marketContext);
    
    // Check that fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    const fetchArgs = global.fetch.mock.calls.find(call => call[0].includes('generativelanguage'));
    expect(fetchArgs).toBeDefined();
    const requestBody = JSON.parse(fetchArgs[1].body);
    const promptText = requestBody.contents[0].parts[0].text;
    
    // Verify that the prompt text includes the serialized SMC data
    expect(promptText).toContain('BULLISH_FVG zone $88000.0000–$89000.0000 (1.1%)');
    expect(promptText).toContain('BULLISH BOS at $87500.0000');
  });
});
