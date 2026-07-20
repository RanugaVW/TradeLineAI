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

  // --- Build rich pattern context strings ---

  // Candlestick Patterns (last 10, with prices and bias)
  const detectedCandles = patterns?.candlestickPatterns?.length > 0
    ? patterns.candlestickPatterns.map(p => `${p.name} [${p.type}] at $${p.price?.toFixed(4) || 'N/A'}`).join(' | ')
    : 'None detected';

  // Market Structure — BOS
  const detectedBos = patterns?.marketStructure?.bosEvents?.length > 0
    ? patterns.marketStructure.bosEvents.map(b => `${b.type} at $${b.price?.toFixed(4)}`).join(' | ')
    : 'None';

  // Market Structure — CHoCH
  const detectedChoch = patterns?.marketStructure?.chochEvents?.length > 0
    ? patterns.marketStructure.chochEvents.map(c => `${c.type} at $${c.price?.toFixed(4)}`).join(' | ')
    : 'None';

  // FVG Imbalance Gaps
  const detectedFvg = patterns?.marketStructure?.fvgGaps?.length > 0
    ? patterns.marketStructure.fvgGaps.map(f => `${f.type} zone $${f.low?.toFixed(4)}–$${f.high?.toFixed(4)} (${f.gapSizePct}%)`).join(' | ')
    : 'None';

  // Order Blocks
  const detectedOB = patterns?.marketStructure?.orderBlocks?.length > 0
    ? patterns.marketStructure.orderBlocks.map(ob => `${ob.type} demand/supply zone $${ob.low?.toFixed(4)}–$${ob.high?.toFixed(4)}`).join(' | ')
    : 'None';

  // Indicators
  const rsiVal = patterns?.indicators?.rsi ?? 50;
  const rsiStatus = patterns?.indicators?.rsiStatus || 'NEUTRAL';
  const vwap = patterns?.indicators?.vwap ?? 0;
  const vwapRelation = vwap > 0 ? (currentPrice > vwap ? 'ABOVE VWAP (bullish bias)' : 'BELOW VWAP (bearish bias)') : 'N/A';
  const volumeSpike = patterns?.indicators?.volumeSpike ? 'YES — Abnormal volume spike detected (1.8× avg)' : 'NO — Volume normal';
  const macdCross = patterns?.indicators?.macd?.isBullishCross ? 'BULLISH MACD CROSSOVER (Buy Signal)'
    : patterns?.indicators?.macd?.isBearishCross ? 'BEARISH MACD CROSSOVER (Sell Signal)'
    : 'No crossover — Trend continuation';

  // Divergences
  const detectedDivergences = patterns?.divergences?.length > 0
    ? patterns.divergences.map(d => `${d.type} on ${d.indicator}: ${d.desc}`).join(' | ')
    : 'None detected';

  // Fibonacci Levels & Golden Pocket
  let fibSection = 'N/A';
  if (patterns?.fibonacci) {
    const fib = patterns.fibonacci;
    const gp = fib.goldenPocket;
    fibSection = [
      `Swing High: $${fib.swingHigh} | Swing Low: $${fib.swingLow}`,
      `0.236: $${fib.levels?.fib236} | 0.382: $${fib.levels?.fib382} | 0.500: $${fib.levels?.fib500}`,
      `0.618 (Golden Pocket Top): $${fib.levels?.fib618} | 0.650 (GP Bottom): $${fib.levels?.fib650}`,
      `0.786: $${fib.levels?.fib786}`,
      `Golden Pocket Status: ${gp?.isActive ? `✅ ACTIVE — Price $${currentPrice} is inside GP zone ($${gp.bottom}–$${gp.top})` : `❌ NOT IN GOLDEN POCKET`}`
    ].join('\n  ');
  }

  // Chart Reversal Patterns
  const detectedChartPats = patterns?.chartPatterns?.length > 0
    ? patterns.chartPatterns.map(cp => `${cp.name} [${cp.type}]: ${cp.desc}`).join(' | ')
    : 'None detected';

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
You are an expert quantitative crypto trader and pattern recognition specialist analyzing live automated chart scan results.

=== MARKET OVERVIEW ===
Symbol: ${symbol}
Current Price: $${currentPrice} USD
Trader Budget: LKR ${lkrBudget.toLocaleString()} ≈ $${usdBudget.toFixed(2)} USD (1 USD = ${usdToLkr.toFixed(2)} LKR)
Trading Horizon: ${tradeDuration}

=== SUPPORT & RESISTANCE LEVELS ===
Key Support Floors:    ${supportLines.slice(0, 5).map(s => `$${s.price.toFixed(4)} (${s.bounces}x bounces)`).join(', ') || 'None'}
Key Resistance Ceilings: ${resistanceLines.slice(0, 5).map(r => `$${r.price.toFixed(4)} (${r.bounces}x bounces)`).join(', ') || 'None'}

=== AUTOMATED PATTERN ENGINE READOUT ===
▸ Candlestick Patterns (recent 10):
  ${detectedCandles}

▸ Market Structure — Break of Structure (BOS):
  ${detectedBos}

▸ Market Structure — Change of Character (CHoCH):
  ${detectedChoch}

▸ Fair Value Gaps / Imbalance Zones:
  ${detectedFvg}

▸ Order Blocks (Institutional Demand/Supply Zones):
  ${detectedOB}

▸ Chart Reversal Patterns (Double Top/Bottom):
  ${detectedChartPats}

▸ RSI (14): ${rsiVal} — Status: ${rsiStatus}
▸ MACD Signal: ${macdCross}
▸ VWAP: $${vwap} — Price is ${vwapRelation}
▸ Volume Spike: ${volumeSpike}

▸ RSI Divergences:
  ${detectedDivergences}

▸ Fibonacci Retracement:
  ${fibSection}

=== YOUR TASK ===
Analyze this complete technical picture for the ${tradeDuration} timeframe and generate an optimized trade plan.
Factor in: candlestick bias, BOS/CHoCH structure shifts, institutional order blocks, FVG fill targets, VWAP bias, RSI/MACD momentum, divergences, and Fibonacci confluence.

Output a strict JSON object (no markdown, no backticks) with these exact fields:
1. "signal": "BUY" | "STRONG BUY" | "SELL" | "STRONG SELL" | "HOLD"
2. "confidence": integer 50–95 (factoring in confluence of multiple signals)
3. "analysis": 3–4 sentence explanation referencing the specific detected patterns above and why they support this trade.
4. "entryPrice": optimal entry price in USD (use S/R, OB, or FVG fill logic)
5. "takeProfitPrice": target price in USD optimized for ${tradeDuration}
6. "stopLossPrice": stop loss price in USD (below key support or OB for buys, above resistance for sells)

Respond ONLY with valid raw JSON.
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

  // Quantitative Technical Analysis Fallback Engine (Pattern-Aware)
  if (!aiResult) {
    const nearestSupport = supportLines.length > 0 ? supportLines[0].price : currentPrice * 0.94;
    const nearestResistance = resistanceLines.length > 0 ? resistanceLines[0].price : currentPrice * 1.08;

    const supDistPct = ((currentPrice - nearestSupport) / currentPrice) * 100;
    const resDistPct = ((nearestResistance - currentPrice) / currentPrice) * 100;

    // --- Pattern-based scoring system ---
    let bullishScore = 0;
    let bearishScore = 0;

    // Candlestick bias
    const candlePats = patterns?.candlestickPatterns || [];
    candlePats.forEach(p => {
      if (p.type === 'BULLISH') bullishScore += 2;
      else if (p.type === 'BEARISH') bearishScore += 2;
    });

    // BOS / CHoCH structure
    const bosEvents = patterns?.marketStructure?.bosEvents || [];
    bosEvents.slice(-3).forEach(b => {
      if (b.type === 'BULLISH_BOS') bullishScore += 3;
      else if (b.type === 'BEARISH_BOS') bearishScore += 3;
    });
    const chochEvents = patterns?.marketStructure?.chochEvents || [];
    chochEvents.slice(-2).forEach(c => {
      if (c.type === 'BULLISH_CHOCH') bullishScore += 4;
      else if (c.type === 'BEARISH_CHOCH') bearishScore += 4;
    });

    // RSI
    const rsi = patterns?.indicators?.rsi ?? 50;
    if (rsi <= 30) bullishScore += 3; // Oversold → buy signal
    else if (rsi >= 70) bearishScore += 3; // Overbought → sell signal

    // MACD
    if (patterns?.indicators?.macd?.isBullishCross) bullishScore += 3;
    if (patterns?.indicators?.macd?.isBearishCross) bearishScore += 3;

    // VWAP
    if (vwap > 0 && currentPrice > vwap) bullishScore += 1;
    else if (vwap > 0 && currentPrice < vwap) bearishScore += 1;

    // Volume spike (adds to whichever direction is dominant)
    if (patterns?.indicators?.volumeSpike) {
      if (bullishScore >= bearishScore) bullishScore += 2;
      else bearishScore += 2;
    }

    // RSI Divergences
    const divergences = patterns?.divergences || [];
    divergences.forEach(d => {
      if (d.type === 'BULLISH_DIVERGENCE') bullishScore += 3;
      else if (d.type === 'BEARISH_DIVERGENCE') bearishScore += 3;
    });

    // Fibonacci Golden Pocket
    if (patterns?.fibonacci?.goldenPocket?.isActive) bullishScore += 3;

    // Chart Patterns
    const chartPats = patterns?.chartPatterns || [];
    chartPats.forEach(cp => {
      if (cp.type === 'BULLISH') bullishScore += 3;
      else if (cp.type === 'BEARISH') bearishScore += 3;
    });

    // S/R proximity scoring
    if (supDistPct <= 3.0) bullishScore += 5;
    if (resDistPct <= 2.5) bearishScore += 5;

    // Determine signal from pattern scores
    let signal, confidence, analysisText;
    const totalScore = bullishScore + bearishScore;
    const bullPct = totalScore > 0 ? (bullishScore / totalScore) * 100 : 50;

    // Duration multipliers
    let tpMult = 1.08;
    let slMult = 0.96;
    if (tradeDuration.includes('Scalp')) { tpMult = 1.03; slMult = 0.985; }
    else if (tradeDuration.includes('Swing')) { tpMult = 1.15; slMult = 0.93; }
    else if (tradeDuration.includes('Hold')) { tpMult = 1.25; slMult = 0.88; }

    // Signal logic
    const dominantCandleTypes = candlePats.map(p => p.type);
    const hasBullishCandle = dominantCandleTypes.includes('BULLISH');
    const hasBearishCandle = dominantCandleTypes.includes('BEARISH');
    const candleHint = hasBullishCandle && !hasBearishCandle ? 'bullish candlestick confluence'
      : hasBearishCandle && !hasBullishCandle ? 'bearish candlestick pressure'
      : 'mixed candlestick signals';

    if (bullPct >= 70) {
      signal = bullPct >= 85 ? 'STRONG BUY' : 'BUY';
      confidence = Math.min(92, 60 + Math.round(bullPct * 0.35));
      analysisText = `Pattern engine scored ${bullishScore} bullish vs ${bearishScore} bearish signals. ${candleHint.charAt(0).toUpperCase() + candleHint.slice(1)} near support $${nearestSupport.toFixed(4)} with ${rsi <= 30 ? 'oversold RSI (' + rsi + ')' : 'RSI at ' + rsi}. ${patterns?.fibonacci?.goldenPocket?.isActive ? 'Golden Pocket active — high confluence buy zone. ' : ''}Target resistance at $${nearestResistance.toFixed(4)} for ${tradeDuration}.`;
    } else if (bearishScore > bullishScore && (100 - bullPct) >= 70) {
      signal = (100 - bullPct) >= 85 ? 'STRONG SELL' : 'SELL';
      confidence = Math.min(90, 60 + Math.round((100 - bullPct) * 0.32));
      analysisText = `Pattern engine scored ${bearishScore} bearish vs ${bullishScore} bullish signals. ${candleHint.charAt(0).toUpperCase() + candleHint.slice(1)} approaching resistance $${nearestResistance.toFixed(4)}. ${rsi >= 70 ? 'RSI overbought (' + rsi + ') adds downside pressure. ' : ''}Risk of rejection for ${tradeDuration}.`;
    } else {
      signal = 'BUY';
      confidence = 72;
      analysisText = `Balanced pattern engine readout (Bullish: ${bullishScore}, Bearish: ${bearishScore}). Price consolidating between support $${nearestSupport.toFixed(4)} and resistance $${nearestResistance.toFixed(4)} with ${candleHint}. Slight upside bias for ${tradeDuration}.`;
    }

    aiResult = {
      signal,
      confidence,
      analysis: analysisText,
      entryPrice: bullishScore >= bearishScore ? nearestSupport * 1.005 : nearestResistance * 0.995,
      takeProfitPrice: bullishScore >= bearishScore ? nearestSupport * tpMult : nearestResistance * (2 - tpMult),
      stopLossPrice: bullishScore >= bearishScore ? nearestSupport * slMult : nearestResistance * (2 - slMult),
      engineType: 'Quantitative Pattern Engine (Pattern-Scored)'
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
