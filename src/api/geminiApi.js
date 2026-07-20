/**
 * Gemini AI Market Trade Advisor & Quantitative LKR Trade Optimizer
 * Features:
 * 1. Live USD/LKR Exchange Rate Fetcher (Open Exchange Rates API + ExchangeRate-API).
 * 2. Dynamic LKR Coin Allocation & Duration-based Payout Calculator.
 * 3. Hybrid Engine: Gemini AI primary with Quantitative Technical Analysis fallback.
 */

let cachedLkrRate = 305.0;
let lastLkrFetchTime = 0;
const RATE_TTL_MS = 60000; // 60-second cache

/**
 * Fetch live USD to LKR exchange rate dynamically
 */
export async function getLiveUsdToLkr() {
  const now = Date.now();
  if (now - lastLkrFetchTime < RATE_TTL_MS && cachedLkrRate > 0) {
    return cachedLkrRate;
  }

  // Try Primary Free API (open.er-api.com)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const json = await res.json();
      if (json.rates && json.rates.LKR) {
        cachedLkrRate = parseFloat(json.rates.LKR);
        lastLkrFetchTime = now;
        return cachedLkrRate;
      }
    }
  } catch (e1) {
    console.warn('Primary exchange rate API note:', e1.message);
  }

  // Try Secondary Free API (api.exchangerate-api.com)
  try {
    const res2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res2.ok) {
      const json2 = await res2.json();
      if (json2.rates && json2.rates.LKR) {
        cachedLkrRate = parseFloat(json2.rates.LKR);
        lastLkrFetchTime = now;
        return cachedLkrRate;
      }
    }
  } catch (e2) {
    console.warn('Secondary exchange rate API note:', e2.message);
  }

  return cachedLkrRate; // Safe fallback
}

export async function fetchGeminiTradeSuggestion(marketContext, lkrBudget = 100000, tradeDuration = 'Day Trade (1 - 24h)') {
  const { 
    symbol, 
    currentPrice, 
    supportLines = [], 
    resistanceLines = [],
    patterns = null
  } = marketContext;
  
  // Dynamic Live USD/LKR Exchange Rate
  const usdToLkr = await getLiveUsdToLkr();
  const usdBudget = lkrBudget / usdToLkr;

  const detectedCandles = patterns?.candlestickPatterns?.map(p => `${p.name} (${p.type})`).join(', ') || 'None';
  const detectedBos = patterns?.marketStructure?.bosEvents?.map(b => b.type).join(', ') || 'None';
  const detectedFvg = patterns?.marketStructure?.fvgGaps?.map(f => f.type).join(', ') || 'None';
  const rsiVal = patterns?.indicators?.rsi || 50;
  const fibGp = patterns?.fibonacci?.goldenPocket?.isActive ? 'ACTIVE IN GOLDEN POCKET (0.618 - 0.65)' : 'Standard Zone';

  let apiKey = '';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.geminiapi_key || '';
    }
  } catch (e) {}

  if (!apiKey) {
    apiKey = 'AQ.Ab8RN6LjfNubZxgX2PN541fYLbZjNoqgiOzFmHd4hr4aeJNsWg';
  }

  const promptText = `
You are an expert quantitative crypto trader analyzing live market chart data.
Current Crypto Symbol: ${symbol}
Current Price: $${currentPrice} USD
Trader Investment Budget: LKR ${lkrBudget.toLocaleString()} (approx $${usdBudget.toFixed(2)} USD at 1 USD = ${usdToLkr.toFixed(2)} LKR)
Trader Target Time Horizon: ${tradeDuration}

--- AUTOMATED QUANTITATIVE PATTERN ENGINE READOUT ---
Detected Key Support Floors: ${supportLines.map(s => `$${s.price.toFixed(4)} (${s.bounces}x bounces)`).join(', ') || 'None'}
Detected Key Resistance Ceilings: ${resistanceLines.map(r => `$${r.price.toFixed(4)} (${r.bounces}x bounces)`).join(', ') || 'None'}
Detected Active Candlestick Patterns: ${detectedCandles}
Detected Market Structure Shifts (BOS/CHoCH): ${detectedBos}
Detected Fair Value Gap (FVG) Imbalances: ${detectedFvg}
RSI (14) Momentum Level: ${rsiVal}
Fibonacci Retracement Status: ${fibGp}

Analyze the chart setup specifically tailored to the trader's ${tradeDuration} horizon and output a strict JSON object with:
1. "signal": "BUY" or "STRONG BUY" or "SELL" or "STRONG SELL" or "HOLD"
2. "confidence": number from 50 to 95 (percentage)
3. "analysis": detailed 2-3 sentence market reasoning explaining why based on candlestick patterns, BOS/CHoCH structure, S/R levels, and target horizon.
4. "entryPrice": suggested optimal entry price in USD.
5. "takeProfitPrice": suggested target price in USD tailored for ${tradeDuration}.
6. "stopLossPrice": suggested stop loss price in USD tailored for ${tradeDuration}.

Respond ONLY with valid raw JSON (no markdown formatting, no code block backticks).
`;

  // Attempt Google Gemini API Call
  let aiResult = null;

  if (apiKey && !apiKey.includes('placeholder')) {
    const candidateModels = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-pro'
    ];

    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (res.ok) {
          const json = await res.json();
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            aiResult = JSON.parse(cleanText);
            break;
          }
        }
      } catch (err) {}
    }
  }

  // Quantitative Technical Analysis Fallback Engine
  if (!aiResult) {
    const nearestSupport = supportLines.length > 0 ? supportLines[0].price : currentPrice * 0.94;
    const nearestResistance = resistanceLines.length > 0 ? resistanceLines[0].price : currentPrice * 1.08;

    const supDistPct = ((currentPrice - nearestSupport) / currentPrice) * 100;
    const resDistPct = ((nearestResistance - currentPrice) / currentPrice) * 100;

    let signal = 'BUY';
    let confidence = 82;
    let analysisText = '';

    // Duration multipliers
    let tpMult = 1.08;
    let slMult = 0.96;
    if (tradeDuration.includes('Scalp')) { tpMult = 1.03; slMult = 0.985; }
    else if (tradeDuration.includes('Swing')) { tpMult = 1.15; slMult = 0.93; }
    else if (tradeDuration.includes('Hold')) { tpMult = 1.25; slMult = 0.88; }

    if (supDistPct <= 3.0) {
      signal = 'STRONG BUY';
      confidence = 88;
      analysisText = `Price ($${currentPrice.toFixed(4)}) is hovering within ${supDistPct.toFixed(1)}% of key support floor ($${nearestSupport.toFixed(4)}). High historical bounce probability signals an optimal ${tradeDuration} entry.`;
    } else if (resDistPct <= 2.5) {
      signal = 'SELL';
      confidence = 79;
      analysisText = `Price ($${currentPrice.toFixed(4)}) is approaching major resistance ceiling ($${nearestResistance.toFixed(4)}). High risk of rejection near ceiling for ${tradeDuration}.`;
    } else {
      signal = 'BUY';
      confidence = 75;
      analysisText = `Price is consolidating above support ($${nearestSupport.toFixed(4)}) with target resistance at $${nearestResistance.toFixed(4)}. Favorable Risk/Reward setup for ${tradeDuration}.`;
    }

    aiResult = {
      signal,
      confidence,
      analysis: analysisText,
      entryPrice: nearestSupport * 1.005,
      takeProfitPrice: nearestSupport * tpMult,
      stopLossPrice: nearestSupport * slMult,
      engineType: 'Quantitative Technical Engine'
    };
  }

  // Ensure Take Profit is ALWAYS above Entry Price and Stop Loss is ALWAYS below Entry Price
  let entryPrice = aiResult.entryPrice || currentPrice;
  let takeProfitPrice = aiResult.takeProfitPrice;
  let stopLossPrice = aiResult.stopLossPrice;

  if (!takeProfitPrice || takeProfitPrice <= entryPrice) {
    takeProfitPrice = entryPrice * 1.08;
  }
  if (!stopLossPrice || stopLossPrice >= entryPrice) {
    stopLossPrice = entryPrice * 0.95;
  }

  const coinsToBuy = usdBudget / entryPrice;
  const potentialProfitUsd = (takeProfitPrice - entryPrice) * coinsToBuy;
  const potentialProfitLkr = potentialProfitUsd * usdToLkr;
  const potentialLossUsd = (entryPrice - stopLossPrice) * coinsToBuy;
  const potentialLossLkr = potentialLossUsd * usdToLkr;
  const riskRewardRatio = potentialLossUsd > 0 ? (potentialProfitUsd / potentialLossUsd).toFixed(2) : '2.5';

  return {
    signal: aiResult.signal || 'BUY',
    confidence: aiResult.confidence || 82,
    analysis: aiResult.analysis,
    engineType: aiResult.engineType || 'Gemini AI',
    tradeDuration,
    entryPrice: Number(entryPrice.toFixed(4)),
    takeProfitPrice: Number(takeProfitPrice.toFixed(4)),
    stopLossPrice: Number(stopLossPrice.toFixed(4)),
    lkrBudget,
    usdToLkr: Number(usdToLkr.toFixed(2)),
    usdBudget: Number(usdBudget.toFixed(2)),
    coinsToBuy: Number(coinsToBuy.toFixed(4)),
    potentialProfitLkr: Number(potentialProfitLkr.toFixed(2)),
    potentialProfitUsd: Number(potentialProfitUsd.toFixed(2)),
    potentialLossLkr: Number(potentialLossLkr.toFixed(2)),
    riskRewardRatio
  };
}
