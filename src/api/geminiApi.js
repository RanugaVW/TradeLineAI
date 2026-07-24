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

export async function fetchGeminiTradeSuggestion(marketContext, lkrBudget = 100000, tradeDuration = 'Day Trade (1 - 24h)', userContext = '', imageBase64 = null, leverage = 1) {
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
  
  // AI Predictor Confluence
  const aiPrediction = patterns?.prediction
    ? `Predicted Direction: ${patterns.prediction.direction} | Probability: ${patterns.prediction.probability}%\n  Confluence Score: ${patterns.prediction.score}\n  Driving Factors: ${patterns.prediction.reasons.join(', ')}`
    : 'No clear prediction generated';

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
  
  const srsi = patterns?.indicators?.srsi;
  const srsiText = srsi 
    ? `Stochastic RSI (14,3,3) — %K: ${srsi.k} | %D: ${srsi.d} | Status: ${srsi.status} | Cross: ${srsi.cross}`
    : 'N/A';
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
      `Golden Pocket Status: ${gp?.isActive ? `[ACTIVE] — Price $${currentPrice} is inside GP zone ($${gp.bottom}–$${gp.top})` : `[NOT IN GOLDEN POCKET]`}`
    ].join('\n  ');
  }

  // Chart Reversal Patterns
  const detectedChartPats = patterns?.chartPatterns?.length > 0
    ? patterns.chartPatterns.map(cp => `${cp.name} [${cp.type}]: ${cp.desc}`).join(' | ')
    : 'None detected';
    
  // New Quantitative Indicators
  const ema = patterns?.indicators?.ema || { ema20: currentPrice, ema50: currentPrice, ema200: currentPrice };
  const atr = patterns?.indicators?.atr || 0;
  const bb = patterns?.indicators?.bollingerBands || { upper: currentPrice, middle: currentPrice, lower: currentPrice };
  const volatilityState = (bb.upper - bb.lower) / currentPrice < 0.02 ? 'SQUEEZE (Low Volatility)' : 'EXPANDING (High Volatility)';

  const userContextSection = userContext && userContext.trim() !== ''
    ? `\n=== [CRITICAL] USER PROVIDED FUNDAMENTALS & NEWS ===\n${userContext.trim()}\n\n(CRITICAL INSTRUCTION: The user has manually provided this fundamental context. You MUST heavily weigh these fundamental factors alongside the technical data below to form your final analysis!)\n`
    : '';

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
${userContextSection}
=== MARKET OVERVIEW ===
Symbol: ${symbol}
Current Price: $${currentPrice} USD
Trader Budget: LKR ${lkrBudget.toLocaleString()} ≈ $${usdBudget.toFixed(2)} USD (1 USD = ${usdToLkr.toFixed(2)} LKR)
Leverage (Risk Multiplier): ${leverage}x
Trading Horizon: ${tradeDuration}

=== AUTOMATED AI CONFLUENCE ENGINE ===
▸ AI Next Move Predictor Result:
  ${aiPrediction}

=== SUPPORT & RESISTANCE LEVELS ===
Key Support Floors:    ${supportLines.slice(0, 5).map(s => `$${s.price.toFixed(4)} (${s.bounces}x bounces)`).join(', ') || 'None'}
Key Resistance Ceilings: ${resistanceLines.slice(0, 5).map(r => `$${r.price.toFixed(4)} (${r.bounces}x bounces)`).join(', ') || 'None'}

=== AUTOMATED PATTERN ENGINE READOUT ===
▸ Candlestick Patterns (recent 10):
  ${detectedCandles}

▸ Smart Money Concepts (SMC) — Break of Structure (BOS):
  ${detectedBos}

▸ Smart Money Concepts (SMC) — Change of Character (CHoCH):
  ${detectedChoch}

▸ Smart Money Concepts (SMC) — Fair Value Gaps (FVG) / Imbalances:
  ${detectedFvg}

▸ Smart Money Concepts (SMC) — Order Blocks (Institutional Demand/Supply):
  ${detectedOB}

▸ Chart Reversal Patterns (Double Top/Bottom):
  ${detectedChartPats}

=== ADVANCED QUANTITATIVE INDICATORS ===
▸ EMAs: EMA20: $${ema.ema20.toFixed(4)} | EMA50: $${ema.ema50.toFixed(4)} | EMA200: $${ema.ema200.toFixed(4)}
▸ Average True Range (ATR 14): $${atr.toFixed(4)} (Use this to calculate a safe Stop Loss buffer!)
▸ Bollinger Bands (20,2): Upper $${bb.upper.toFixed(4)} | Middle $${bb.middle.toFixed(4)} | Lower $${bb.lower.toFixed(4)} (Status: ${volatilityState})
▸ RSI (14): ${rsiVal} — Status: ${rsiStatus}
▸ Stochastic RSI (SRSI): ${srsiText}
▸ MACD Signal: ${macdCross}
▸ VWAP: $${vwap} — Price is ${vwapRelation}
▸ Volume Spike: ${volumeSpike}

▸ RSI Divergences:
  ${detectedDivergences}

▸ Fibonacci Retracement:
  ${fibSection}

=== YOUR TASK ===
Analyze this complete technical picture for the ${tradeDuration} timeframe and generate an optimized, HIGH-ACCURACY trade plan.
${imageBase64 ? 'I have also attached a screenshot of the chart with indicators (like RSI and SRSI) for your visual analysis. Please cross-reference the visual cues (such as divergences or trend continuation patterns) with the mathematical data provided above to confirm the trend direction.' : ''}
Factor in: candlestick bias, BOS/CHoCH structure shifts, institutional order blocks, FVG fill targets, VWAP bias, RSI/MACD momentum, divergences, and Fibonacci confluence.

**CRITICAL ACCURACY RULES (MUST FOLLOW):**
1. **Trade Like a Pro (Accept Risk):** Financial markets ALWAYS have conflicting indicators (e.g. bearish VWAP but bullish RSI). Do NOT default to "HOLD" just because indicators disagree. Weigh the dominant setup (e.g. strong support bounce) over minor conflicts. Actively find the highest probability BUY or SELL setup. Only output "HOLD" in extreme, completely untradable chop.
2. **Volatility-Safe Stop Loss:** Market noise and wicks frequently stop out tight trades. You MUST place the Stop Loss safely behind the furthest Support/Resistance level, Order Block, or FVG, AND add a volatility buffer (using ATR) so the trade has room to breathe.
3. **Risk-to-Reward (R:R):** Ensure the distance to TP2 provides at least a 1:1.5 or 1:2 Risk-to-Reward ratio compared to your safe Stop Loss.

Output a strict JSON object (no markdown, no backticks) with these exact fields:
1. "signal": "BUY" | "STRONG BUY" | "SELL" | "STRONG SELL" | "HOLD"
2. "confidence": integer 50–100 (must be >= 55 for BUY/SELL)
3. "analysis": 3–4 sentence explanation referencing the specific detected patterns above and why they support this trade.
4. "entryPrice": optimal entry price in USD (use S/R, OB, or FVG fill logic)
5. "takeProfitLevels": array of exactly 3 objects: [{"price": TP1, "percentage": profit_pct1}, {"price": TP2, "percentage": profit_pct2}, {"price": TP3, "percentage": profit_pct3}]. Provide progressive targets.
6. "stopLossPrice": stop loss price in USD (must be wide enough to survive market wicks)
7. "stopLossReason": short string explaining why the SL is placed safely here.
8. "expectedDuration": string estimating time to hit TP3 based on timeframe (e.g. "3 to 6 hours", "2 to 4 days").

Respond ONLY with valid raw JSON.
`;
  let aiResult = null;

  if (apiKey && !apiKey.includes('placeholder')) {
    const candidateModels = [
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash',
      'gemini-1.5-flash'
    ];

    for (const modelName of candidateModels) {
      try {
        const parts = [{ text: promptText }];
        if (imageBase64) {
          const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
          const mimeTypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: parts }]
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
        } else {
          console.warn(`Gemini API Error (${modelName}): ${res.status} ${res.statusText}`, await res.text().catch(() => ''));
        }
      } catch (err) {
        console.warn(`Gemini API Fetch Error (${modelName}):`, err);
      }
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
    let candleHint = 'mixed candlestick signals';
    if (candlePats.length > 0) {
      const topPats = candlePats.slice(-2).map(p => p.name).join(' and ');
      candleHint = `recent patterns including ${topPats}`;
    } else if (bullishScore > bearishScore) {
      candleHint = 'bullish structural momentum';
    } else if (bearishScore > bullishScore) {
      candleHint = 'bearish structural pressure';
    }

    if (bullPct >= 70) {
      signal = bullPct >= 85 ? 'STRONG BUY' : 'BUY';
      confidence = Math.min(92, 60 + Math.round(bullPct * 0.35));
      analysisText = `Pattern engine scored ${bullishScore} bullish vs ${bearishScore} bearish signals. Price supported by ${candleHint} near support $${nearestSupport.toFixed(4)}. ${rsi <= 30 ? 'Oversold RSI (' + rsi + ') adds momentum. ' : ''}${patterns?.fibonacci?.goldenPocket?.isActive ? 'Golden Pocket active — high confluence buy zone. ' : ''}Target resistance at $${nearestResistance.toFixed(4)} for ${tradeDuration}.`;
    } else if (bearishScore > bullishScore && (100 - bullPct) >= 70) {
      signal = (100 - bullPct) >= 85 ? 'STRONG SELL' : 'SELL';
      confidence = Math.min(90, 60 + Math.round((100 - bullPct) * 0.32));
      analysisText = `Pattern engine scored ${bearishScore} bearish vs ${bullishScore} bullish signals. Price pressured by ${candleHint} approaching resistance $${nearestResistance.toFixed(4)}. ${rsi >= 70 ? 'RSI overbought (' + rsi + ') adds downside pressure. ' : ''}Risk of rejection for ${tradeDuration}.`;
    } else {
      signal = 'BUY'; // Neutral-ish buy bias
      confidence = 72;
      analysisText = `Balanced pattern engine readout (Bullish: ${bullishScore}, Bearish: ${bearishScore}). Price consolidating between support $${nearestSupport.toFixed(4)} and resistance $${nearestResistance.toFixed(4)} with ${candleHint}. Slight upside bias for ${tradeDuration}.`;
    }

    const isBull = bullishScore >= bearishScore;
    const entryPriceFallback = isBull ? nearestSupport * 1.005 : nearestResistance * 0.995;
    const takeProfitPriceFallback = isBull ? nearestSupport * tpMult : nearestResistance * (2 - tpMult);
    const stopLossPriceFallback = isBull ? nearestSupport * slMult : nearestResistance * (2 - slMult);

    const profitDiff = Math.abs(takeProfitPriceFallback - entryPriceFallback);
    const tp1Price = isBull ? entryPriceFallback + (profitDiff * 0.33) : entryPriceFallback - (profitDiff * 0.33);
    const tp2Price = isBull ? entryPriceFallback + (profitDiff * 0.66) : entryPriceFallback - (profitDiff * 0.66);
    const tp3Price = takeProfitPriceFallback;
    
    const tp1Pct = Math.abs(((tp1Price - entryPriceFallback) / entryPriceFallback) * 100);
    const tp2Pct = Math.abs(((tp2Price - entryPriceFallback) / entryPriceFallback) * 100);
    const tp3Pct = Math.abs(((tp3Price - entryPriceFallback) / entryPriceFallback) * 100);

    let fallbackDuration = '2 to 4 hours';
    if (tradeDuration.includes('Scalp')) fallbackDuration = '30 to 90 minutes';
    else if (tradeDuration.includes('Swing')) fallbackDuration = '1 to 3 days';
    else if (tradeDuration.includes('Hold')) fallbackDuration = '1 to 4 weeks';

    aiResult = {
      signal,
      confidence,
      analysis: analysisText,
      entryPrice: entryPriceFallback,
      takeProfitLevels: [
        { price: tp1Price, percentage: tp1Pct },
        { price: tp2Price, percentage: tp2Pct },
        { price: tp3Price, percentage: tp3Pct }
      ],
      stopLossPrice: stopLossPriceFallback,
      stopLossReason: isBull ? `Placed safely below the key support floor at $${nearestSupport.toFixed(4)}.` : `Placed safely above the key resistance ceiling at $${nearestResistance.toFixed(4)}.`,
      expectedDuration: fallbackDuration,
      engineType: 'Quantitative Pattern Engine (Pattern-Scored)'
    };
  }

  // Ensure Take Profit is ALWAYS above Entry Price and Stop Loss is ALWAYS below Entry Price
  let entryPrice = aiResult.entryPrice || currentPrice;
  let takeProfitLevels = aiResult.takeProfitLevels;
  let stopLossPrice = aiResult.stopLossPrice;
  let stopLossReason = aiResult.stopLossReason || 'Calculated dynamic stop loss based on market structure.';

  const isBullSignal = aiResult.signal.includes('BUY') || (!aiResult.signal.includes('BUY') && !aiResult.signal.includes('SELL')); // Default to buy logic if HOLD

  if (!takeProfitLevels || takeProfitLevels.length !== 3) {
      // Create default 3 TPs
      const baseDiff = entryPrice * 0.08; // 8% move
      takeProfitLevels = [
          { price: isBullSignal ? entryPrice + (baseDiff * 0.33) : entryPrice - (baseDiff * 0.33), percentage: 2.64 },
          { price: isBullSignal ? entryPrice + (baseDiff * 0.66) : entryPrice - (baseDiff * 0.66), percentage: 5.28 },
          { price: isBullSignal ? entryPrice + baseDiff : entryPrice - baseDiff, percentage: 8.0 }
      ];
  }
  if (!stopLossPrice || (isBullSignal && stopLossPrice >= entryPrice) || (!isBullSignal && stopLossPrice <= entryPrice)) {
    stopLossPrice = isBullSignal ? entryPrice * 0.95 : entryPrice * 1.05;
  }

  const tp3Price = takeProfitLevels[2].price;
  const coinsToBuy = (usdBudget * leverage) / entryPrice;
  const potentialProfitUsd = Math.abs(tp3Price - entryPrice) * coinsToBuy;
  const potentialProfitLkr = potentialProfitUsd * usdToLkr;
  const potentialLossUsd = Math.abs(entryPrice - stopLossPrice) * coinsToBuy;
  const potentialLossLkr = potentialLossUsd * usdToLkr;
  const riskRewardRatio = potentialLossUsd > 0 ? (potentialProfitUsd / potentialLossUsd).toFixed(2) : '2.5';

  return {
    signal: aiResult.signal || 'BUY',
    confidence: aiResult.confidence || 82,
    analysis: aiResult.analysis,
    engineType: aiResult.engineType || 'Gemini AI',
    tradeDuration,
    entryPrice: Number(entryPrice.toFixed(4)),
    takeProfitLevels: takeProfitLevels.map(tp => ({ price: Number(tp.price.toFixed(4)), percentage: Number(tp.percentage.toFixed(2)) })),
    stopLossPrice: Number(stopLossPrice.toFixed(4)),
    stopLossReason,
    expectedDuration: aiResult.expectedDuration || '2 to 4 hours',
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

/**
 * Automatically evaluates a past trade prediction using historical market data and Gemini AI.
 */
export async function evaluateTradeOutcome(prediction, historicalCandles) {
  const apiKey = (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || localStorage.getItem('gemini_api_key');
  if (!apiKey || apiKey.includes('placeholder')) {
    throw new Error('Valid Gemini API key required for evaluation.');
  }

  const tpLevels = typeof prediction.take_profit_levels === 'string' ? JSON.parse(prediction.take_profit_levels) : (prediction.take_profit_levels || []);
  const tp1 = tpLevels[0]?.price || 'N/A';
  const tp2 = tpLevels[1]?.price || 'N/A';
  const tp3 = tpLevels[2]?.price || 'N/A';

  const promptText = `You are an expert quantitative trading auditor. Your job is to evaluate a past trade setup against the actual historical price action that occurred.

=== ORIGINAL PREDICTION ===
Symbol: ${prediction.symbol}
Timeframe: ${prediction.timeframe}
Signal: ${prediction.signal}
Entry Price: $${prediction.entry_price}
Stop Loss Price: $${prediction.stop_loss_price}
Take Profit Targets:
  TP1: $${tp1}
  TP2: $${tp2}
  TP3: $${tp3}

=== ACTUAL HISTORICAL DATA (After entry) ===
We observed the following candle Highs and Lows over the ${prediction.expected_duration_text} duration:
Max High Reached: $${Math.max(...historicalCandles.map(c => c.high))}
Min Low Reached: $${Math.min(...historicalCandles.map(c => c.low))}
=== YOUR TASK ===
Analyze the max high and min low against the Entry, TP, and SL prices.
For a BUY signal:
  - If the Min Low dropped below the Stop Loss Price first, the trade hit the SL.
  - If the Max High reached TP1, TP2, or TP3, note which targets were hit.
For a SELL signal:
  - If the Max High rose above the Stop Loss Price first, the trade hit the SL.
  - If the Min Low dropped to TP1, TP2, or TP3, note which targets were hit.

Output a strict JSON object with these exact fields:
1. "status": string — "hit_tp3", "hit_tp2", "hit_tp1", "stopped_out", or "expired_unresolved" (if neither was hit).
2. "feedback": string — A 2-sentence summary of what happened.
3. "profitLossPct": number — The approximate profit or loss percentage based on the outcome.

Respond ONLY with valid raw JSON.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
  });

  if (res.ok) {
    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) {
      try {
        const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
      } catch (parseErr) {
        throw new Error('Failed to parse Gemini JSON: ' + parseErr.message);
      }
    }
    throw new Error('Gemini returned OK but no text: ' + JSON.stringify(json));
  }
  const errorText = await res.text().catch(() => 'no text');
  throw new Error(`Failed to evaluate trade with Gemini. Status: ${res.status}. Body: ${errorText}`);
}
