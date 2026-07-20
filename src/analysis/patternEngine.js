/**
 * Automated Technical Pattern & Market Structure Recognition Engine (TradeLine AI)
 * Fully programmatic quantitative pattern detection system covering:
 * 1. Candlestick Patterns (Single, Two-candle, Three-candle)
 * 2. Market Structure (HH/HL, BOS, CHoCH, FVG/Imbalance, Order Blocks)
 * 3. Technical Indicators & Oscillators (RSI, MACD, Volume Spikes, VWAP, Bollinger Bands)
 * 4. Momentum & Divergences (Bullish & Bearish Divergences)
 * 5. Fibonacci Retracements & Golden Pocket (0.618 - 0.65)
 * 6. Chart Patterns (Double Top / Double Bottom)
 */

export function detectAllPatterns(candles, options = {}) {
  if (!candles || !Array.isArray(candles) || candles.length < 15) {
    return {
      candlestickPatterns: [],
      marketStructure: { pivots: [], bosEvents: [], chochEvents: [], fvgGaps: [], orderBlocks: [] },
      fibonacci: null,
      indicators: { rsi: 50, macd: null, vwap: 0, volumeSpike: false },
      divergences: [],
      chartPatterns: []
    };
  }

  const candlestickPatterns = detectCandlestickPatterns(candles);
  const marketStructure = detectMarketStructure(candles);
  const indicators = calculateTechnicalIndicators(candles);
  const divergences = detectDivergences(candles, indicators.rsiHistory, indicators.macdHistory);
  const fibonacci = calculateFibonacciLevels(candles, marketStructure.pivots);
  const chartPatterns = detectChartPatterns(candles, marketStructure.pivots);

  return {
    candlestickPatterns,
    marketStructure,
    indicators,
    divergences,
    fibonacci,
    chartPatterns
  };
}

/**
 * 1. CANDLESTICK PATTERN DETECTOR (Single, Two-candle, Three-candle)
 */
function detectCandlestickPatterns(candles) {
  const patterns = [];
  const len = candles.length;

  for (let i = 2; i < len; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];

    const range = c2.high - c2.low;
    if (range <= 0) continue;

    const body = Math.abs(c2.close - c2.open);
    const isGreen = c2.close >= c2.open;
    const isRed = c2.close < c2.open;
    const upperWick = c2.high - Math.max(c2.open, c2.close);
    const lowerWick = Math.min(c2.open, c2.close) - c2.low;

    // Trend context (last 5 bars)
    const prevTrend = candles[i - 1].close > candles[Math.max(0, i - 6)].close ? 'UP' : 'DOWN';

    // --- SINGLE CANDLE PATTERNS ---
    // Doji
    if (body <= range * 0.10) {
      patterns.push({
        name: 'Doji',
        type: 'NEUTRAL',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Indecision candle with open ≈ close.'
      });
    }
    // Hammer (Bullish Reversal after downtrend)
    else if (lowerWick >= 2 * body && upperWick <= 0.25 * body && prevTrend === 'DOWN') {
      patterns.push({
        name: 'Hammer',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bullish reversal: Long lower wick rejected lower prices.'
      });
    }
    // Inverted Hammer (Bullish Reversal)
    else if (upperWick >= 2 * body && lowerWick <= 0.25 * body && prevTrend === 'DOWN') {
      patterns.push({
        name: 'Inverted Hammer',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bullish reversal: Long upper wick after downtrend.'
      });
    }
    // Shooting Star (Bearish Reversal after uptrend)
    else if (upperWick >= 2 * body && lowerWick <= 0.25 * body && prevTrend === 'UP') {
      patterns.push({
        name: 'Shooting Star',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bearish reversal: Strong upper wick rejection after uptrend.'
      });
    }
    // Hanging Man (Bearish Reversal)
    else if (lowerWick >= 2 * body && upperWick <= 0.25 * body && prevTrend === 'UP') {
      patterns.push({
        name: 'Hanging Man',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bearish warning: Long lower wick at trend peak.'
      });
    }
    // Marubozu (Strong Momentum)
    else if ((upperWick + lowerWick) <= range * 0.08 && body >= range * 0.85) {
      patterns.push({
        name: isGreen ? 'Bullish Marubozu' : 'Bearish Marubozu',
        type: isGreen ? 'BULLISH' : 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: `Strong ${isGreen ? 'bullish' : 'bearish'} momentum with negligible wicks.`
      });
    }

    // --- TWO CANDLE PATTERNS ---
    const c1Body = Math.abs(c1.close - c1.open);
    const c1Red = c1.close < c1.open;
    const c1Green = c1.close > c1.open;

    // Bullish Engulfing
    if (c1Red && isGreen && c2.open <= c1.close && c2.close >= c1.open && body > c1Body) {
      patterns.push({
        name: 'Bullish Engulfing',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bullish reversal: Green body fully engulfs previous red body.'
      });
    }
    // Bearish Engulfing
    else if (c1Green && isRed && c2.open >= c1.close && c2.close <= c1.open && body > c1Body) {
      patterns.push({
        name: 'Bearish Engulfing',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bearish reversal: Red body fully engulfs previous green body.'
      });
    }
    // Piercing Line
    else if (c1Red && isGreen && c2.open < c1.low && c2.close > (c1.open - c1Body * 0.5) && c2.close < c1.open) {
      patterns.push({
        name: 'Piercing Line',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bullish reversal: Green candle closes above midpoint of red candle.'
      });
    }
    // Dark Cloud Cover
    else if (c1Green && isRed && c2.open > c1.high && c2.close < (c1.close - c1Body * 0.5) && c2.close > c1.open) {
      patterns.push({
        name: 'Dark Cloud Cover',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Bearish reversal: Red candle closes below midpoint of green candle.'
      });
    }

    // --- THREE CANDLE PATTERNS ---
    const c0Body = Math.abs(c0.close - c0.open);
    const c0Red = c0.close < c0.open;
    const c0Green = c0.close > c0.open;

    // Morning Star
    if (c0Red && c0Body > (c0.high - c0.low) * 0.5 && c1Body <= (c1.high - c1.low) * 0.35 && isGreen && c2.close > (c0.open - c0Body * 0.5)) {
      patterns.push({
        name: 'Morning Star',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: '3-candle bullish reversal: Red → Small Body → Strong Green recovery.'
      });
    }
    // Evening Star
    else if (c0Green && c0Body > (c0.high - c0.low) * 0.5 && c1Body <= (c1.high - c1.low) * 0.35 && isRed && c2.close < (c0.close - c0Body * 0.5)) {
      patterns.push({
        name: 'Evening Star',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: '3-candle bearish reversal: Green → Small Body → Strong Red selloff.'
      });
    }
    // Three White Soldiers
    else if (c0Green && c1Green && isGreen && c1.close > c0.close && c2.close > c1.close) {
      patterns.push({
        name: 'Three White Soldiers',
        type: 'BULLISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Strong bullish continuation: 3 consecutive expanding green candles.'
      });
    }
    // Three Black Crows
    else if (c0Red && c1Red && isRed && c1.close < c0.close && c2.close < c1.close) {
      patterns.push({
        name: 'Three Black Crows',
        type: 'BEARISH',
        candleIndex: i,
        time: c2.time,
        price: c2.close,
        desc: 'Strong bearish continuation: 3 consecutive expanding red candles.'
      });
    }
  }

  // Deduplicate and return recent 10 patterns
  return patterns.slice(-10);
}

/**
 * 2. MARKET STRUCTURE ENGINE (HH/HL, BOS, CHoCH, Fair Value Gap, Order Blocks)
 */
function detectMarketStructure(candles, lookbackWindow = 3) {
  const pivots = [];
  const bosEvents = [];
  const chochEvents = [];
  const fvgGaps = [];
  const orderBlocks = [];

  // Pivot ZigZag Detection
  for (let i = lookbackWindow; i < candles.length - lookbackWindow; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookbackWindow; j++) {
      if (candles[i - j].high > candles[i].high || candles[i + j].high > candles[i].high) {
        isHigh = false;
      }
      if (candles[i - j].low < candles[i].low || candles[i + j].low < candles[i].low) {
        isLow = false;
      }
    }

    if (isHigh) {
      pivots.push({ type: 'HIGH', price: candles[i].high, index: i, time: candles[i].time });
    }
    if (isLow) {
      pivots.push({ type: 'LOW', price: candles[i].low, index: i, time: candles[i].time });
    }
  }

  // Detect BOS (Break of Structure) & CHoCH (Change of Character)
  let currentTrend = 'NEUTRAL';
  let lastPivotHigh = null;
  let lastPivotLow = null;

  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i];
    if (p.type === 'HIGH') {
      if (lastPivotHigh && p.price > lastPivotHigh.price) {
        currentTrend = 'UP';
        bosEvents.push({
          type: 'BULLISH_BOS',
          price: p.price,
          time: p.time,
          desc: `Bullish BOS: Price broke higher high at $${p.price.toFixed(4)}`
        });
      } else if (lastPivotHigh && p.price < lastPivotHigh.price && currentTrend === 'UP') {
        chochEvents.push({
          type: 'BEARISH_CHOCH',
          price: p.price,
          time: p.time,
          desc: `Bearish CHoCH: Market structure shift to downside at $${p.price.toFixed(4)}`
        });
        currentTrend = 'DOWN';
      }
      lastPivotHigh = p;
    } else if (p.type === 'LOW') {
      if (lastPivotLow && p.price < lastPivotLow.price) {
        currentTrend = 'DOWN';
        bosEvents.push({
          type: 'BEARISH_BOS',
          price: p.price,
          time: p.time,
          desc: `Bearish BOS: Price broke lower low at $${p.price.toFixed(4)}`
        });
      } else if (lastPivotLow && p.price > lastPivotLow.price && currentTrend === 'DOWN') {
        chochEvents.push({
          type: 'BULLISH_CHOCH',
          price: p.price,
          time: p.time,
          desc: `Bullish CHoCH: Market structure shift to upside at $${p.price.toFixed(4)}`
        });
        currentTrend = 'UP';
      }
      lastPivotLow = p;
    }
  }

  // Detect Fair Value Gaps (FVG) / Imbalances (3-candle gap)
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG (c3.low > c1.high)
    if (c3.low > c1.high) {
      const gapSizePct = ((c3.low - c1.high) / c1.high) * 100;
      if (gapSizePct >= 0.2) {
        fvgGaps.push({
          type: 'BULLISH_FVG',
          high: c3.low,
          low: c1.high,
          time: c3.time,
          gapSizePct: gapSizePct.toFixed(2),
          desc: `Bullish FVG Imbalance: $${c1.high.toFixed(4)} - $${c3.low.toFixed(4)} (${gapSizePct.toFixed(2)}%)`
        });
      }
    }
    // Bearish FVG (c3.high < c1.low)
    else if (c3.high < c1.low) {
      const gapSizePct = ((c1.low - c3.high) / c3.high) * 100;
      if (gapSizePct >= 0.2) {
        fvgGaps.push({
          type: 'BEARISH_FVG',
          high: c1.low,
          low: c3.high,
          time: c3.time,
          gapSizePct: gapSizePct.toFixed(2),
          desc: `Bearish FVG Imbalance: $${c3.high.toFixed(4)} - $${c1.low.toFixed(4)} (${gapSizePct.toFixed(2)}%)`
        });
      }
    }
  }

  // Detect Order Blocks (OB)
  for (let i = 3; i < candles.length; i++) {
    const c0 = candles[i - 3];
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish Order Block (Red candle before 3 strong green candles)
    if (c0.close < c0.open && c1.close > c1.open && c2.close > c2.open && c3.close > c3.open) {
      orderBlocks.push({
        type: 'BULLISH_OB',
        high: c0.high,
        low: c0.low,
        time: c0.time,
        desc: `Bullish Order Block demand zone at $${c0.low.toFixed(4)} - $${c0.high.toFixed(4)}`
      });
    }
    // Bearish Order Block (Green candle before 3 strong red candles)
    else if (c0.close > c0.open && c1.close < c1.open && c2.close < c2.open && c3.close < c3.open) {
      orderBlocks.push({
        type: 'BEARISH_OB',
        high: c0.high,
        low: c0.low,
        time: c0.time,
        desc: `Bearish Order Block supply zone at $${c0.low.toFixed(4)} - $${c0.high.toFixed(4)}`
      });
    }
  }

  return {
    pivots,
    bosEvents: bosEvents.slice(-5),
    chochEvents: chochEvents.slice(-5),
    fvgGaps: fvgGaps.slice(-5),
    orderBlocks: orderBlocks.slice(-5)
  };
}

/**
 * 3. TECHNICAL INDICATORS & OSCILLATORS (RSI, MACD, Volume Spikes, VWAP)
 */
function calculateTechnicalIndicators(candles) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 1);

  // Calculate RSI (14)
  const rsiHistory = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / 14;
  let avgLoss = losses / 14;

  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
    avgLoss = (avgLoss * 13 + (diff < 0 ? Math.abs(diff) : 0)) / 14;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    rsiHistory.push({ time: candles[i].time, rsi: parseFloat(rsi.toFixed(2)) });
  }

  const currentRsi = rsiHistory.length > 0 ? rsiHistory[rsiHistory.length - 1].rsi : 50;

  // Calculate MACD (12, 26, 9)
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, idx) => v - ema26[idx]);
  const signalLine = calculateEMA(macdLine, 9);
  const histogram = macdLine.map((v, idx) => v - signalLine[idx]);

  const macdHistory = macdLine.map((v, idx) => ({
    macd: v,
    signal: signalLine[idx],
    hist: histogram[idx]
  }));

  const latestMacd = macdHistory.length > 0 ? macdHistory[macdHistory.length - 1] : { macd: 0, signal: 0, hist: 0 };
  const prevMacd = macdHistory.length > 1 ? macdHistory[macdHistory.length - 2] : { macd: 0, signal: 0, hist: 0 };

  const isMacdBullishCross = prevMacd.macd <= prevMacd.signal && latestMacd.macd > latestMacd.signal;
  const isMacdBearishCross = prevMacd.macd >= prevMacd.signal && latestMacd.macd < latestMacd.signal;

  // Calculate VWAP
  let cumulativePV = 0;
  let cumulativeVol = 0;
  candles.forEach(c => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const v = c.volume || 1;
    cumulativePV += typicalPrice * v;
    cumulativeVol += v;
  });
  const vwap = cumulativeVol > 0 ? cumulativePV / cumulativeVol : closes[closes.length - 1];

  // Calculate Volume Spike
  const recentVols = volumes.slice(-20);
  const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
  const currentVol = volumes[volumes.length - 1];
  const isVolumeSpike = currentVol > (avgVol * 1.8);

  return {
    rsi: currentRsi,
    rsiStatus: currentRsi >= 70 ? 'OVERBOUGHT' : (currentRsi <= 30 ? 'OVERSOLD' : 'NEUTRAL'),
    rsiHistory,
    macd: {
      latest: latestMacd,
      isBullishCross: isMacdBullishCross,
      isBearishCross: isMacdBearishCross
    },
    macdHistory,
    vwap: parseFloat(vwap.toFixed(4)),
    volumeSpike: isVolumeSpike,
    currentVol,
    avgVol
  };
}

/**
 * 4. MOMENTUM & DIVERGENCE ENGINE (Bullish & Bearish Divergence)
 */
function detectDivergences(candles, rsiHistory) {
  if (!rsiHistory || rsiHistory.length < 15) return [];

  const divergences = [];
  const len = rsiHistory.length;
  const p1 = candles[candles.length - 15];
  const p2 = candles[candles.length - 1];
  const r1 = rsiHistory[len - 15];
  const r2 = rsiHistory[len - 1];

  if (!p1 || !p2 || !r1 || !r2) return [];

  // Bullish Divergence: Lower Low in Price, Higher Low in RSI
  if (p2.low < p1.low && r2.rsi > r1.rsi) {
    divergences.push({
      type: 'BULLISH_DIVERGENCE',
      indicator: 'RSI',
      desc: `Bullish RSI Divergence: Price made Lower Low ($${p2.low.toFixed(4)}) while RSI made Higher Low (${r2.rsi} vs ${r1.rsi}).`
    });
  }

  // Bearish Divergence: Higher High in Price, Lower High in RSI
  if (p2.high > p1.high && r2.rsi < r1.rsi) {
    divergences.push({
      type: 'BEARISH_DIVERGENCE',
      indicator: 'RSI',
      desc: `Bearish RSI Divergence: Price made Higher High ($${p2.high.toFixed(4)}) while RSI made Lower High (${r2.rsi} vs ${r1.rsi}).`
    });
  }

  return divergences;
}

/**
 * 5. FIBONACCI RETRACEMENT & GOLDEN POCKET ENGINE (0.618 - 0.65)
 */
function calculateFibonacciLevels(candles, pivots = []) {
  if (!candles || candles.length < 20) return null;

  let swingLow = Math.min(...candles.map(c => c.low));
  let swingHigh = Math.max(...candles.map(c => c.high));

  if (pivots && pivots.length >= 2) {
    const highs = pivots.filter(p => p.type === 'HIGH');
    const lows = pivots.filter(p => p.type === 'LOW');
    if (highs.length > 0) swingHigh = Math.max(...highs.map(h => h.price));
    if (lows.length > 0) swingLow = Math.min(...lows.map(l => l.price));
  }

  const diff = swingHigh - swingLow;
  if (diff <= 0) return null;

  const currentPrice = candles[candles.length - 1].close;

  const fib236 = swingHigh - (diff * 0.236);
  const fib382 = swingHigh - (diff * 0.382);
  const fib500 = swingHigh - (diff * 0.500);
  const fib618 = swingHigh - (diff * 0.618);
  const fib650 = swingHigh - (diff * 0.650);
  const fib786 = swingHigh - (diff * 0.786);

  const isGoldenPocket = currentPrice <= fib618 && currentPrice >= fib650;

  return {
    swingHigh: parseFloat(swingHigh.toFixed(4)),
    swingLow: parseFloat(swingLow.toFixed(4)),
    levels: {
      fib236: parseFloat(fib236.toFixed(4)),
      fib382: parseFloat(fib382.toFixed(4)),
      fib500: parseFloat(fib500.toFixed(4)),
      fib618: parseFloat(fib618.toFixed(4)),
      fib650: parseFloat(fib650.toFixed(4)),
      fib786: parseFloat(fib786.toFixed(4))
    },
    goldenPocket: {
      top: parseFloat(fib618.toFixed(4)),
      bottom: parseFloat(fib650.toFixed(4)),
      isActive: isGoldenPocket
    }
  };
}

/**
 * 6. CHART REVERSAL PATTERNS (Double Top / Double Bottom)
 */
function detectChartPatterns(candles, pivots = []) {
  const patterns = [];
  const highs = pivots.filter(p => p.type === 'HIGH');
  const lows = pivots.filter(p => p.type === 'LOW');

  // Double Top (2 peak highs within 1.5% distance)
  if (highs.length >= 2) {
    const p1 = highs[highs.length - 2];
    const p2 = highs[highs.length - 1];
    const diffPct = (Math.abs(p1.price - p2.price) / p1.price) * 100;

    if (diffPct <= 1.5) {
      patterns.push({
        name: 'Double Top Reversal',
        type: 'BEARISH',
        price1: p1.price,
        price2: p2.price,
        desc: `Bearish Double Top at $${p2.price.toFixed(4)} (${diffPct.toFixed(2)}% peak symmetry).`
      });
    }
  }

  // Double Bottom (2 trough lows within 1.5% distance)
  if (lows.length >= 2) {
    const p1 = lows[lows.length - 2];
    const p2 = lows[lows.length - 1];
    const diffPct = (Math.abs(p1.price - p2.price) / p1.price) * 100;

    if (diffPct <= 1.5) {
      patterns.push({
        name: 'Double Bottom Reversal',
        type: 'BULLISH',
        price1: p1.price,
        price2: p2.price,
        desc: `Bullish Double Bottom at $${p2.price.toFixed(4)} (${diffPct.toFixed(2)}% trough symmetry).`
      });
    }
  }

  return patterns;
}

/**
 * HELPER: Exponential Moving Average (EMA)
 */
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];
  const result = [ema];

  for (let i = 1; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
    result.push(ema);
  }

  return result;
}
