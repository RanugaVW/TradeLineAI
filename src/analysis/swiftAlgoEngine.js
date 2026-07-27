export function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  let prevEma = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[0]);
    } else {
      prevEma = (data[i] - prevEma) * k + prevEma;
      ema.push(prevEma);
    }
  }
  return ema;
}

export function calculateStDev(data, period) {
  const stdev = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      stdev.push(0);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    const mean = sum / period;
    let sqSum = 0;
    for (let j = 0; j < period; j++) {
      sqSum += Math.pow(data[i - j] - mean, 2);
    }
    stdev.push(Math.sqrt(sqSum / period));
  }
  return stdev;
}

export function calculateATR(candles, period) {
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }
  
  // RMA (Rolling Moving Average) for ATR
  const atr = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      sum += tr[i];
      if (i === period - 1) {
        atr.push(sum / period);
      } else {
        atr.push(0);
      }
    } else {
      const prevAtr = atr[i - 1];
      atr.push((prevAtr * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

/**
 * Executes the Swift Algo X 6-step Volume-Drift Momentum pipeline.
 */
export function runSwiftAlgo(candles, options = {}) {
  const {
    multiplier = 2.0,
    period = 14,
    fastEmaPeriod = 12,
    slowEmaPeriod = 26,
    trendEmaPeriod = 200,
    riskRewardRatio = 1.5,
    useTrendFilter = true
  } = options;

  if (!candles || candles.length < Math.max(period, slowEmaPeriod, trendEmaPeriod)) {
    return [];
  }

  // Close prices for Trend Filter
  const closes = candles.map(c => c.close);
  const trendEma = calculateEMA(closes, trendEmaPeriod);

  // Step 1: Volume-Weighted Directional Pressure
  const pressureWindow = 5;
  const vwapPressure = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < pressureWindow - 1) {
      vwapPressure.push(0);
      continue;
    }
    let sumW = 0;
    let sumV = 0;
    for (let j = 0; j < pressureWindow; j++) {
      const c = candles[i - j];
      const range = c.high - c.low;
      const sign = c.close >= c.open ? 1 : -1;
      const vol = c.volume || 1;
      sumW += range * sign * vol;
      sumV += vol;
    }
    vwapPressure.push(sumV === 0 ? 0 : sumW / sumV);
  }

  // Step 2: Dual EMA Momentum Spread
  const fastEma = calculateEMA(vwapPressure, fastEmaPeriod);
  const slowEma = calculateEMA(vwapPressure, slowEmaPeriod);
  const momentumSpread = [];
  for (let i = 0; i < candles.length; i++) {
    momentumSpread.push(fastEma[i] - slowEma[i]);
  }

  // Step 3: Volatility Normalization
  const stdev = calculateStDev(momentumSpread, period);
  const atr = calculateATR(candles, period);
  const normalized = [];
  for (let i = 0; i < candles.length; i++) {
    const sd = stdev[i] || 1;
    normalized.push((momentumSpread[i] / sd) * (atr[i] || 0));
  }

  // Step 4 & 5: Dynamic Projection & Adaptive Trailing Band
  const projection = [];
  for (let i = 0; i < candles.length; i++) {
    const isBullish = momentumSpread[i] > 0;
    const proj = isBullish ? candles[i].high + normalized[i] : candles[i].low + normalized[i];
    projection.push(proj || candles[i].close);
  }

  const envCenter = calculateEMA(projection, period);
  
  const trailingSupport = [];
  const trailingResistance = [];
  let currSupport = candles[0].low;
  let currResistance = candles[0].high;

  for (let i = 0; i < candles.length; i++) {
    const bandSize = (atr[i] || 0) * multiplier;
    const upperBand = envCenter[i] + bandSize;
    const lowerBand = envCenter[i] - bandSize;

    const isBullish = momentumSpread[i] > 0;
    
    if (isBullish) {
      // Ratchet support up
      currSupport = Math.max(currSupport, lowerBand);
      currResistance = upperBand; // relax resistance
    } else {
      // Ratchet resistance down
      currResistance = Math.min(currResistance, upperBand);
      currSupport = lowerBand; // relax support
    }
    
    trailingSupport.push(currSupport);
    trailingResistance.push(currResistance);
  }

  // Step 6: Signal Conditions & Trade Management
  const signals = [];
  let activeSignal = null;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    
    // Buy Condition: Price crosses above previous trailing resistance
    const buyCross = c.close > trailingResistance[i - 1] && candles[i - 1].close <= trailingResistance[i - 1];
    const buyTrend = useTrendFilter ? c.close > trendEma[i] : true;
    
    // Sell Condition: Price crosses below previous trailing support
    const sellCross = c.close < trailingSupport[i - 1] && candles[i - 1].close >= trailingSupport[i - 1];
    const sellTrend = useTrendFilter ? c.close < trendEma[i] : true;
    
    let firedType = null;
    let entry = 0;
    let sl = 0;
    let tp = 0;

    if (buyCross && buyTrend && activeSignal !== 'BUY') {
      firedType = 'BUY';
      entry = c.close;
      // SL anchored to recent swing low (simplified as min of last 5 candles)
      let minL = c.low;
      for(let k = 1; k < 5 && i-k >= 0; k++) minL = Math.min(minL, candles[i-k].low);
      sl = minL;
      tp = entry + ((entry - sl) * riskRewardRatio);
      activeSignal = 'BUY';
    } 
    else if (sellCross && sellTrend && activeSignal !== 'SELL') {
      firedType = 'SELL';
      entry = c.close;
      // SL anchored to recent swing high (simplified as max of last 5 candles)
      let maxH = c.high;
      for(let k = 1; k < 5 && i-k >= 0; k++) maxH = Math.max(maxH, candles[i-k].high);
      sl = maxH;
      tp = entry - ((sl - entry) * riskRewardRatio);
      activeSignal = 'SELL';
    }

    signals.push({
      time: c.time,
      index: i,
      trailingSupport: trailingSupport[i],
      trailingResistance: trailingResistance[i],
      type: firedType,
      entry,
      sl,
      tp
    });
  }

  return signals;
}
