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

  const candlestickPatterns = detectCandlestickPatterns(candles, options);
  const marketStructure = detectMarketStructure(candles);
  const indicators = calculateTechnicalIndicators(candles);
  const divergences = detectDivergences(candles, indicators.rsiHistory, indicators.macdHistory);
  const fibonacci = calculateFibonacciLevels(candles, marketStructure.pivots);
  const chartPatterns = detectChartPatterns(candles, marketStructure.pivots);

  const prediction = predictNextMove({
    candlestickPatterns,
    marketStructure,
    indicators,
    chartPatterns,
    divergences
  });

  return {
    candlestickPatterns,
    marketStructure,
    indicators,
    divergences,
    fibonacci,
    chartPatterns,
    prediction
  };
}

/**
 * AI Next Move Predictor (Aggregator)
 */
function predictNextMove(analysisData) {
  let score = 0;
  const reasons = [];

  const ms = analysisData.marketStructure;
  const ind = analysisData.indicators;
  const candles = analysisData.candlestickPatterns || [];
  const cp = analysisData.chartPatterns || [];

  // Trend
  if (ms.current_trend === 'UPTREND') {
    score += 10;
    reasons.push("Uptrend intact (+10)");
  } else if (ms.current_trend === 'DOWNTREND') {
    score -= 10;
    reasons.push("Downtrend intact (-10)");
  }

  // CHoCH (very strong signal if recent)
  if (ms.chochEvents && ms.chochEvents.length > 0) {
    const lastChoch = ms.chochEvents[ms.chochEvents.length - 1];
    if (lastChoch.type === 'BULLISH_CHOCH') {
      score += 15;
      reasons.push("Recent Bullish CHoCH (+15)");
    } else {
      score -= 15;
      reasons.push("Recent Bearish CHoCH (-15)");
    }
  }

  // Candlesticks (last 2 patterns found)
  const recentCandles = candles.slice(-2);
  for (const c of recentCandles) {
    if (c.type === 'BULLISH') {
      score += 8;
      reasons.push(`Bullish ${c.name} (+8)`);
    } else if (c.type === 'BEARISH') {
      score -= 8;
      reasons.push(`Bearish ${c.name} (-8)`);
    }
  }

  // Active Chart Patterns
  const recentCp = cp.slice(-1);
  for (const p of recentCp) {
      if (p.type === 'BULLISH') {
          score += 20;
          reasons.push(`Bullish ${p.name} (+20)`);
      } else {
          score -= 20;
          reasons.push(`Bearish ${p.name} (-20)`);
      }
  }

  // RSI Momentum
  if (ind && ind.rsi) {
    if (ind.rsi < 30) {
      score += 5;
      reasons.push(`RSI Oversold (${ind.rsi}) (+5)`);
    } else if (ind.rsi > 70) {
      score -= 5;
      reasons.push(`RSI Overbought (${ind.rsi}) (-5)`);
    }
  }

  // RSI Divergences (Strong Signal)
  const divs = analysisData.divergences || [];
  for (const d of divs) {
    if (d.type === 'BULLISH_DIVERGENCE') {
      score += 15;
      reasons.push(`Bullish RSI Divergence (+15)`);
    } else if (d.type === 'BEARISH_DIVERGENCE') {
      score -= 15;
      reasons.push(`Bearish RSI Divergence (-15)`);
    } else if (d.type === 'HIDDEN_BULLISH_DIVERGENCE') {
      score += 12;
      reasons.push(`Hidden Bullish RSI Divergence (+12)`);
    } else if (d.type === 'HIDDEN_BEARISH_DIVERGENCE') {
      score -= 12;
      reasons.push(`Hidden Bearish RSI Divergence (-12)`);
    }
  }

  // Probability Calculation
  const absScore = Math.abs(score);
  let probability = 50;
  if (absScore <= 10) {
    probability = 50;
  } else if (absScore <= 25) {
    probability = 55 + (absScore - 10) * (10 / 15);
  } else if (absScore <= 45) {
    probability = 65 + (absScore - 25) * (15 / 20);
  } else {
    probability = 80 + (absScore - 45);
    if (probability > 95) probability = 95; // Capped at 95% max
  }
  
  probability = Math.round(probability);

  let direction = 'NEUTRAL';
  if (score > 10) direction = 'UP';
  else if (score < -10) direction = 'DOWN';

  return {
    direction,
    score,
    probability,
    reasons
  };
}

/**
 * 1. CANDLESTICK PATTERN DETECTOR (Single, Two-candle, Three-candle)
 * Derived from Steve Nison's "Japanese Candlestick Charting Techniques"
 */
function detectCandlestickPatterns(candles, options = {}) {
  const patterns = [];
  const len = candles.length;
  if (len < 20) return []; // Need at least 20 for averages

  // Pre-calculate rolling averages (n = 14) for relative body/range classification
  const avgBodies = new Array(len).fill(0);
  const avgRanges = new Array(len).fill(0);
  const n = 14;

  let bodySum = 0;
  let rangeSum = 0;
  for (let i = 0; i < len; i++) {
    const c = candles[i];
    const b = Math.abs(c.close - c.open);
    const r = c.high - c.low;
    bodySum += b;
    rangeSum += r;
    if (i >= n) {
      const prev = candles[i - n];
      bodySum -= Math.abs(prev.close - prev.open);
      rangeSum -= (prev.high - prev.low);
      avgBodies[i] = bodySum / n;
      avgRanges[i] = rangeSum / n;
    } else {
      avgBodies[i] = bodySum / (i + 1);
      avgRanges[i] = rangeSum / (i + 1);
    }
  }

  // Pre-calculate 20-candle average volume for scoring
  const avgVolumes = new Array(len).fill(0);
  let volSum = 0;
  for (let i = 0; i < len; i++) {
    volSum += (candles[i].volume || 0);
    if (i >= 20) {
      volSum -= (candles[i - 20].volume || 0);
      avgVolumes[i] = volSum / 20;
    } else {
      avgVolumes[i] = volSum / (i + 1);
    }
  }

  // Trend context helper (Swing highs/lows or EMA approximation)
  // We'll use simple price action comparison over a lookback window
  function getTrendContext(idx, lookback = 7) {
    if (idx < lookback) return 'SIDEWAYS';
    let upCount = 0;
    let downCount = 0;
    for (let k = idx - lookback; k < idx; k++) {
      if (candles[k + 1].close > candles[k].close) upCount++;
      else if (candles[k + 1].close < candles[k].close) downCount++;
    }
    if (upCount > downCount + 1) return 'UP';
    if (downCount > upCount + 1) return 'DOWN';
    return 'SIDEWAYS';
  }

  // Core scan loop (we need to scan from 4 to len to access past candles)
  for (let i = 4; i < len; i++) {
    const c0 = candles[i - 4];
    const c1 = candles[i - 3];
    const c2 = candles[i - 2];
    const c3 = candles[i - 1];
    const c4 = candles[i]; // Current candle

    // Helper variables for the current candle (c4)
    const range = c4.high - c4.low;
    if (range <= 0) continue;

    const body = Math.abs(c4.close - c4.open);
    const bodyTop = Math.max(c4.open, c4.close);
    const bodyBottom = Math.min(c4.open, c4.close);
    const upperShadow = c4.high - bodyTop;
    const lowerShadow = bodyBottom - c4.low;
    const isBullishCandle = c4.close > c4.open;
    const isBearishCandle = c4.close < c4.open;

    const avgB = avgBodies[i];
    const avgR = avgRanges[i];

    // Relative body size rules
    const isLongBody = body >= 1.5 * avgB;
    const isShortBody = body <= 0.5 * avgB;
    const isDoji = body <= 0.05 * avgR;
    const isSmallBody = body > 0.05 * avgR && body < 0.5 * avgB;

    const tc = getTrendContext(i);

    // Volume overlay setup
    const isHighVolume = (c4.volume || 0) > 1.5 * avgVolumes[i];
    const volumeBonus = isHighVolume ? 12 : 0;

    // S/R Confluence checklist setup
    let confluenceBonus = 0;
    const confluences = [];
    const srLevels = [...(options.supportLines || []), ...(options.resistanceLines || [])];
    srLevels.forEach(sr => {
      const diffPct = (Math.abs(c4.close - sr.price) / sr.price) * 100;
      if (diffPct <= 1.2) {
        confluenceBonus += 10; // Accumulate confluence up to a cap
        confluences.push(`${sr.type} Area`);
      }
    });
    confluenceBonus = Math.min(confluenceBonus, 20); // Cap at 20

    // Helper to calculate final confidence
    function getConfidence(base, tcStrength = 0, depth = 0, rarityPen = 0) {
      return Math.min(95, base + tcStrength + depth + volumeBonus + confluenceBonus - rarityPen);
    }
    
    const trendBonus = (tc !== 'SIDEWAYS') ? 10 : 0;

    // --- 1. SINGLE CANDLE PATTERNS ---

    // Hammer
    if (tc === 'DOWN' && lowerShadow >= 2 * body && upperShadow <= 0.1 * range && bodyBottom >= c4.low + 0.6 * range) {
      const isConfirmed = i < len - 1 && candles[i + 1].close > c4.close;
      const status = isConfirmed ? 'confirmed' : 'pending';
      const bodyColorBonus = isBullishCandle ? 5 : 0; 
      patterns.push({
        name: 'Hammer',
        type: 'BULLISH',
        status,
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(55, trendBonus + bodyColorBonus, isConfirmed ? 15 : 0, 0),
        desc: `Bullish Hammer: Long lower shadow rejected lower prices. ${status === 'confirmed' ? 'Confirmed by follow-through.' : 'Pending confirmation.'}`
      });
    }

    // Hanging Man
    if (tc === 'UP' && lowerShadow >= 2 * body && upperShadow <= 0.1 * range && bodyBottom >= c4.low + 0.6 * range) {
      const isConfirmed = i < len - 1 && candles[i + 1].close < bodyBottom;
      const status = isConfirmed ? 'confirmed' : 'pending';
      patterns.push({
        name: 'Hanging Man',
        type: 'BEARISH',
        status,
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(50, trendBonus, isConfirmed ? 20 : 0, 0),
        desc: `Bearish Hanging Man: Candle at peak warns of reversal. ${status === 'confirmed' ? 'Confirmed by lower close.' : 'MUST BE CONFIRMED by next candle.'}`
      });
    }

    // Shooting Star
    if (tc === 'UP' && upperShadow >= 2 * body && lowerShadow <= 0.1 * range && bodyTop <= c4.low + 0.4 * range) {
      const isConfirmed = i < len - 1 && candles[i + 1].close < bodyBottom;
      const status = isConfirmed ? 'confirmed' : 'pending';
      patterns.push({
        name: 'Shooting Star',
        type: 'BEARISH',
        status,
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(60, trendBonus, isConfirmed ? 15 : 0, 0),
        desc: `Bearish Shooting Star: Long upper wick indicates peak price rejection. ${status === 'pending' ? 'Pending confirmation.' : 'Confirmed.'}`
      });
    }

    // Inverted Hammer
    if (tc === 'DOWN' && upperShadow >= 2 * body && lowerShadow <= 0.1 * range && bodyTop <= c4.low + 0.4 * range) {
      const isConfirmed = i < len - 1 && candles[i + 1].close > c4.close;
      const status = isConfirmed ? 'confirmed' : 'pending';
      patterns.push({
        name: 'Inverted Hammer',
        type: 'BULLISH',
        status,
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(55, trendBonus, isConfirmed ? 20 : 0, 0),
        desc: `Bullish Inverted Hammer: Long upper wick after downtrend. ${status === 'pending' ? 'Requires next candle confirmation.' : 'Confirmed.'}`
      });
    }

    // Belt-hold lines
    if (isBullishCandle && isLongBody && lowerShadow <= 0.05 * range && tc === 'DOWN') {
      patterns.push({
        name: 'Bullish Belt-Hold',
        type: 'BULLISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(65, trendBonus, 0, 0),
        desc: 'Bullish Belt-Hold: Shaven bottom white candle opening on the low and driving up.'
      });
    } else if (isBearishCandle && isLongBody && upperShadow <= 0.05 * range && tc === 'UP') {
      patterns.push({
        name: 'Bearish Belt-Hold',
        type: 'BEARISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(65, trendBonus, 0, 0),
        desc: 'Bearish Belt-Hold: Shaven head black candle opening on the high and driving down.'
      });
    }

    // High-wave candle
    if (upperShadow >= 2 * body && lowerShadow >= 2 * body && isSmallBody && !isDoji) {
      patterns.push({
        name: 'High-Wave Candle',
        type: 'NEUTRAL',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(50, 0, 0, 0),
        desc: 'High-Wave Candle: Long wicks indicating severe directional indecision.'
      });
    }
    
    // Doji Subtypes
    if (isDoji) {
        if (upperShadow >= 2 * avgB && lowerShadow >= 2 * avgB) {
            patterns.push({
                name: 'Long-Legged Doji',
                type: 'NEUTRAL',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(60, 0, 0, 0),
                desc: 'Long-Legged Doji (Rickshaw Man): Extreme indecision.'
            });
        } else if (upperShadow <= 0.1 * range && lowerShadow >= 0.6 * range) {
            patterns.push({
                name: 'Dragonfly Doji',
                type: tc === 'DOWN' ? 'BULLISH' : 'NEUTRAL',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(65, trendBonus, 0, 0),
                desc: 'Dragonfly Doji: Rejection of lower prices.'
            });
        } else if (lowerShadow <= 0.1 * range && upperShadow >= 0.6 * range) {
            patterns.push({
                name: 'Gravestone Doji',
                type: tc === 'UP' ? 'BEARISH' : 'NEUTRAL',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(65, trendBonus, 0, 0),
                desc: 'Gravestone Doji: Rejection of higher prices.'
            });
        } else if (tc === 'UP') {
            patterns.push({
                name: 'Northern Doji',
                type: 'BEARISH',
                status: 'pending',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(60, trendBonus, 0, 0),
                desc: 'Northern Doji: Standard doji appearing in an uptrend, high probability reversal warning.'
            });
        } else if (tc === 'DOWN') {
            patterns.push({
                name: 'Southern Doji',
                type: 'BULLISH',
                status: 'pending',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(55, trendBonus, 0, 0), // Weighted less than Northern Doji
                desc: 'Southern Doji: Standard doji appearing in a downtrend.'
            });
        }
    }


    // --- 2. TWO CANDLE REVERSAL PATTERNS ---
    const c3Body = Math.abs(c3.close - c3.open);
    const c3BodyTop = Math.max(c3.open, c3.close);
    const c3BodyBottom = Math.min(c3.open, c3.close);
    const c3IsRed = c3.close < c3.open;
    const c3IsGreen = c3.close > c3.open;
    const c3IsDoji = c3Body <= 0.05 * avgRanges[i - 1];

    // Engulfing Pattern
    const isEngulfingBody = bodyTop >= c3BodyTop && bodyBottom <= c3BodyBottom;
    if (isEngulfingBody && (isBullishCandle !== c3IsGreen || c3IsDoji)) {
      if (tc === 'DOWN' && isBullishCandle) {
        const bodyBonus = c3Body <= 0.3 * body ? 8 : 0;
        patterns.push({
          name: 'Bullish Engulfing',
          type: 'BULLISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(70, trendBonus, bodyBonus, 0),
          desc: 'Bullish Engulfing: Long white body fully engulfs the previous body.'
        });
      } else if (tc === 'UP' && isBearishCandle) {
        const bodyBonus = c3Body <= 0.3 * body ? 8 : 0;
        patterns.push({
          name: 'Bearish Engulfing',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(70, trendBonus, bodyBonus, 0),
          desc: 'Bearish Engulfing: Long black body fully engulfs the previous body.'
        });
      }
    }

    // Dark Cloud Cover
    if (tc === 'UP' && c3IsGreen && isBearishCandle && c4.open > c3.high && c4.close < c3BodyBottom + 0.5 * c3Body && c4.close >= c3BodyBottom) {
      patterns.push({
        name: 'Dark Cloud Cover',
        type: 'BEARISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(68, trendBonus, 10, 0),
        desc: 'Dark Cloud Cover: Bearish reversal opening above previous high and closing deep into its body.'
      });
    }

    // Piercing Pattern
    if (tc === 'DOWN' && c3IsRed && isBullishCandle && c4.open < c3.low && c4.close > c3BodyBottom + 0.5 * c3Body && c4.close <= c3BodyTop) {
      patterns.push({
        name: 'Piercing Pattern',
        type: 'BULLISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(68, trendBonus, 10, 0),
        desc: 'Piercing Pattern: Bullish reversal opening below previous low and closing deep into its body.'
      });
    }

    // Harami / Harami Cross
    const c4InsideC3 = bodyTop <= c3BodyTop && bodyBottom >= c3BodyBottom;
    const c3IsLong = c3Body >= 1.5 * avgBodies[i - 1];
    if (c4InsideC3 && c3IsLong && c4.body < c3Body) {
      const isCross = isDoji;
      if (tc !== 'SIDEWAYS') {
          patterns.push({
            name: isCross ? 'Harami Cross' : 'Harami',
            type: c3IsRed ? 'BULLISH' : 'BEARISH',
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(isCross ? 75 : 60, trendBonus, 0, 0),
            desc: isCross 
              ? 'Harami Cross: Small Doji inside previous long body. Exceptional reversal warning.'
              : 'Harami Reversal: Small body nested inside previous long body.'
          });
      }
    }

    // Tweezers
    if (tc === 'UP' && Math.abs(c3.high - c4.high) <= 0.001 * c3.high) {
      patterns.push({
        name: 'Tweezers Top',
        type: 'BEARISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(58, trendBonus, 0, 0),
        desc: 'Tweezers Top: Matches high resistance peak with previous candle.'
      });
    }
    if (tc === 'DOWN' && Math.abs(c3.low - c4.low) <= 0.001 * c3.low) {
      patterns.push({
        name: 'Tweezers Bottom',
        type: 'BULLISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(58, trendBonus, 0, 0),
        desc: 'Tweezers Bottom: Matches low support floor with previous candle.'
      });
    }

    // necklines & continuation
    if (tc === 'DOWN' && c3IsRed && c3IsLong && isBullishCandle && c4.open < c3.low) {
      const closeDiff = Math.abs(c4.close - c3.low);
      if (closeDiff <= 0.1 * avgR) {
        patterns.push({
          name: 'On-Neck Line',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(55, trendBonus, 0, 0),
          desc: 'Bearish On-Neck Line: White candle fails to close above previous low.'
        });
      } else if (c4.close > c3.low && c4.close < c3.close + 0.15 * c3Body) {
        patterns.push({
          name: 'In-Neck Line',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(58, trendBonus, 0, 0),
          desc: 'Bearish In-Neck Line: White candle closes only slightly above previous low.'
        });
      } else if (c4.close >= c3.close + 0.15 * c3Body && c4.close < c3.close + 0.5 * c3Body) {
        patterns.push({
          name: 'Thrusting Line',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(60, trendBonus, 0, 0),
          desc: 'Bearish Thrusting Line: White candle closes deep but stays below body midpoint.'
        });
      }
    }
    
    // Counterattack Lines
    if (c3IsGreen !== isBullishCandle && Math.abs(c4.close - c3.close) <= 0.002 * c4.close) {
        if (tc === 'UP' && isBearishCandle && c4.open > c3.close) {
             patterns.push({
                name: 'Bearish Counterattack Line',
                type: 'BEARISH',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(60, trendBonus, 0, 0),
                desc: 'Bearish Counterattack Line: Stalemate weakens prevailing uptrend.'
            });
        } else if (tc === 'DOWN' && isBullishCandle && c4.open < c3.close) {
             patterns.push({
                name: 'Bullish Counterattack Line',
                type: 'BULLISH',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(60, trendBonus, 0, 0),
                desc: 'Bullish Counterattack Line: Stalemate weakens prevailing downtrend.'
            });
        }
    }
    
    // Separating Lines
    if (c3IsGreen !== isBullishCandle && Math.abs(c4.open - c3.open) <= 0.002 * c4.open) {
        if (tc === 'UP' && isBullishCandle) {
             patterns.push({
                name: 'Bullish Separating Lines',
                type: 'BULLISH',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(65, trendBonus, 0, 0),
                desc: 'Bullish Separating Lines: Uptrend continuation signal.'
            });
        } else if (tc === 'DOWN' && isBearishCandle) {
             patterns.push({
                name: 'Bearish Separating Lines',
                type: 'BEARISH',
                status: 'confirmed',
                candleIndex: i,
                time: c4.time,
                price: c4.close,
                confidence: getConfidence(65, trendBonus, 0, 0),
                desc: 'Bearish Separating Lines: Downtrend continuation signal.'
            });
        }
    }


    // --- 3. THREE CANDLE REVERSAL PATTERNS ---
    const c2Body = Math.abs(c2.close - c2.open);
    const c2BodyTop = Math.max(c2.open, c2.close);
    const c2BodyBottom = Math.min(c2.open, c2.close);
    const c2IsRed = c2.close < c2.open;
    const c2IsGreen = c2.close > c2.open;
    const c2IsLong = c2Body >= 1.5 * avgBodies[i - 2];

    // Morning Star
    const tc2 = getTrendContext(i - 2);
    if (tc2 === 'DOWN' && c2IsRed && c2IsLong && isBullishCandle) {
      const c3GapsDown = Math.max(c3.open, c3.close) < c2.close; // Gap using real bodies
      const c4Recovers = c4.close >= c2.close + 0.5 * c2Body;
      const c3IsSmall = c3Body <= 0.5 * avgBodies[i - 1];

      if (c3GapsDown && c4Recovers && c3IsSmall) {
        const isDojiStar = c3IsDoji;
        let isAbandoned = false;
        if (isDojiStar && c3.high < c2.low && c3.high < c4.low) {
            isAbandoned = true;
        }
        
        if (isAbandoned) {
            patterns.push({
              name: 'Abandoned Baby Bottom',
              type: 'BULLISH',
              status: 'confirmed',
              candleIndex: i,
              time: c4.time,
              price: c4.close,
              confidence: getConfidence(93, trendBonus, 0, 5),
              desc: 'Abandoned Baby Bottom: Morning star with a complete island gap. Strongest reversal.'
            });
        } else {
            patterns.push({
              name: isDojiStar ? 'Morning Doji Star' : 'Morning Star',
              type: 'BULLISH',
              status: 'confirmed',
              candleIndex: i,
              time: c4.time,
              price: c4.close,
              confidence: getConfidence(isDojiStar ? 85 : 78, trendBonus, 0, 0),
              desc: isDojiStar
                ? 'Morning Doji Star: Red → Doji gap down → Strong Green recovery. Strong reversal confluence.'
                : 'Morning Star: 3-candle bottom reversal: Red → Small Body → Strong Green recovery.'
            });
        }
      }
    }

    // Evening Star
    if (tc2 === 'UP' && c2IsGreen && c2IsLong && isBearishCandle) {
      const c3GapsUp = Math.min(c3.open, c3.close) > c2.close;
      const c4Recovers = c4.close <= c2.close - 0.5 * c2Body;
      const c3IsSmall = c3Body <= 0.5 * avgBodies[i - 1];

      if (c3GapsUp && c4Recovers && c3IsSmall) {
        const isDojiStar = c3IsDoji;
        let isAbandoned = false;
        if (isDojiStar && c3.low > c2.high && c3.low > c4.high) {
            isAbandoned = true;
        }

        if (isAbandoned) {
            patterns.push({
              name: 'Abandoned Baby Top',
              type: 'BEARISH',
              status: 'confirmed',
              candleIndex: i,
              time: c4.time,
              price: c4.close,
              confidence: getConfidence(93, trendBonus, 0, 5),
              desc: 'Abandoned Baby Top: Evening star with a complete island gap. Strongest peak reversal.'
            });
        } else {
            patterns.push({
              name: isDojiStar ? 'Evening Doji Star' : 'Evening Star',
              type: 'BEARISH',
              status: 'confirmed',
              candleIndex: i,
              time: c4.time,
              price: c4.close,
              confidence: getConfidence(isDojiStar ? 85 : 78, trendBonus, 0, 0),
              desc: isDojiStar
                ? 'Evening Doji Star: Green → Doji gap up → Strong Red selloff. Strong peak reversal confluence.'
                : 'Evening Star: 3-candle top reversal: Green → Small Body → Strong Red selloff.'
            });
        }
      }
    }

    // Tri-Star
    if (isDoji && c3IsDoji && c2Body <= 0.05 * avgRanges[i - 2]) {
      if (tc2 === 'DOWN' && Math.max(c3.open, c3.close) < c2.close && Math.min(c4.open, c4.close) > c3.close) {
        patterns.push({
          name: 'Tri-Star Bottom',
          type: 'BULLISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(90, trendBonus, 0, 10), // Rare penalty
          desc: 'Tri-Star Bottom: Three consecutive Dojis forming an island structure. Rare reversal.'
        });
      } else if (tc2 === 'UP' && Math.min(c3.open, c3.close) > c2.close && Math.max(c4.open, c4.close) < c3.close) {
        patterns.push({
          name: 'Tri-Star Top',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(90, trendBonus, 0, 10), // Rare penalty
          desc: 'Tri-Star Top: Three consecutive Dojis forming an island structure. Rare reversal warning.'
        });
      }
    }

    // Three White Soldiers & Degraded variants
    if (isBullishCandle && c3IsGreen && c2IsGreen) {
      const closesIncreasing = c4.close > c3.close && c3.close > c2.close;
      const opensInBody = c4.open >= c3.open && c4.open <= c3.close && c3.open >= c2.open && c3.open <= c2.close;
      if (closesIncreasing && opensInBody) {
        const isAdvanceBlock = body < c3Body && c3Body < c2Body || upperShadow > body || c3.high - c3BodyTop > c3Body;
        const isStalled = c2Body >= 1.2 * avgB && c3Body >= 1.2 * avgB && body <= 0.4 * avgB;

        if (isAdvanceBlock) {
          patterns.push({
            name: 'Advance Block',
            type: 'BEARISH', // Weakening bullish trend is a warning
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(65, 0, 0, 0),
            desc: 'Advance Block: Three white soldiers with shrinking body sizes or growing wicks. Caution.'
          });
        } else if (isStalled) {
          patterns.push({
            name: 'Stalled Pattern',
            type: 'BEARISH',
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(70, 0, 0, 0),
            desc: 'Stalled Pattern: Deliberation shows strong candles followed by a tiny spinning top body.'
          });
        } else {
          patterns.push({
            name: 'Three White Soldiers',
            type: 'BULLISH',
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(82, 0, 0, 0),
            desc: 'Three White Soldiers: Three strong white candles indicating clean bullish breakout.'
          });
        }
      }
    }

    // Three Black Crows
    if (isBearishCandle && c3IsRed && c2IsRed) {
      const closesDecreasing = c4.close < c3.close && c3.close < c2.close;
      const opensInBody = c4.open <= c3.open && c4.open >= c3.close && c3.open <= c2.open && c3.open >= c2.close;
      if (closesDecreasing && opensInBody) {
        patterns.push({
          name: 'Three Black Crows',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(82, 0, 0, 0),
          desc: 'Three Black Crows: Three strong black candles driving down. Bearish continuation/launch.'
        });
      }
    }

    // Upside Gap Two Crows
    if (tc2 === 'UP' && c2IsGreen && c2IsLong && c3IsRed && isBearishCandle) {
      const c3GapsUp = c3.close > c2.close && c3.open > c2.close;
      const c4EngulfsC3InGap = c4.open > c3.open && c4.close < c3.close && c4.close > c2.close;
      if (c3GapsUp && c4EngulfsC3InGap) {
        patterns.push({
          name: 'Upside Gap Two Crows',
          type: 'BEARISH',
          status: 'confirmed',
          candleIndex: i,
          time: c4.time,
          price: c4.close,
          confidence: getConfidence(76, trendBonus, 0, 10), // Rare penalty
          desc: 'Upside Gap Two Crows: Rare bearish pattern where black bodies engulf above green peak.'
        });
      }
    }


    // --- 4. CONTINUATION WINDOWS ---
    if (c4.low > c3.high) {
      patterns.push({
        name: 'Rising Window',
        type: 'BULLISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(75, 0, 0, 0),
        desc: 'Rising Window: Bullish breakout gap. Provides dynamic support on pullbacks.'
      });
    } else if (c4.high < c3.low) {
      patterns.push({
        name: 'Falling Window',
        type: 'BEARISH',
        status: 'confirmed',
        candleIndex: i,
        time: c4.time,
        price: c4.close,
        confidence: getConfidence(75, 0, 0, 0),
        desc: 'Falling Window: Bearish breakout gap. Provides dynamic resistance on rallies.'
      });
    }

    // Rising/Falling Three Methods
    const c0IsGreen = c0.close > c0.open;
    const c0IsRed = c0.close < c0.open;

    if (c0IsGreen && Math.abs(c0.close - c0.open) >= 1.5 * avgBodies[i - 4] && isBullishCandle && c4.close > c0.high) {
        const m1Inside = c1.high <= c0.high && c1.low >= c0.low;
        const m2Inside = c2.high <= c0.high && c2.low >= c0.low;
        const m3Inside = c3.high <= c0.high && c3.low >= c0.low;
        if (m1Inside && m2Inside && m3Inside) {
          patterns.push({
            name: 'Rising Three Methods',
            type: 'BULLISH',
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(85, trendBonus, 0, 0),
            desc: 'Rising Three Methods: Strong green candle followed by 3 consolidating bars and a new breakout.'
          });
        }
    }

    if (c0IsRed && Math.abs(c0.close - c0.open) >= 1.5 * avgBodies[i - 4] && isBearishCandle && c4.close < c0.low) {
        const m1Inside = c1.high <= c0.high && c1.low >= c0.low;
        const m2Inside = c2.high <= c0.high && c2.low >= c0.low;
        const m3Inside = c3.high <= c0.high && c3.low >= c0.low;
        if (m1Inside && m2Inside && m3Inside) {
          patterns.push({
            name: 'Falling Three Methods',
            type: 'BEARISH',
            status: 'confirmed',
            candleIndex: i,
            time: c4.time,
            price: c4.close,
            confidence: getConfidence(85, trendBonus, 0, 0),
            desc: 'Falling Three Methods: Strong red candle followed by 3 consolidating bars and a new breakdown.'
          });
        }
    }
  }

  // Deduplicate and return recent 20 patterns
  return patterns.slice(-20);
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

  // Label Pivots: HH, HL, LH, LL
  let lastHigh = null;
  let lastLow = null;
  for (let p of pivots) {
    if (p.type === 'HIGH') {
      p.label = (lastHigh && p.price > lastHigh.price) ? 'HH' : 'LH';
      lastHigh = p;
    } else {
      p.label = (lastLow && p.price > lastLow.price) ? 'HL' : 'LL';
      lastLow = p;
    }
  }

  // Detect BOS and CHoCH strictly by candle closes beyond the pivot level
  let currentTrend = 'UPTREND'; // Default starting assumption
  let lastBos = null;
  let lastChoch = null;
  let structureIntact = true;
  
  let currentSwingHigh = null;
  let currentSwingLow = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    
    // Check if the current candle forms a new pivot
    const pivotAtCandle = pivots.find(p => p.index === i);
    if (pivotAtCandle) {
        if (pivotAtCandle.type === 'HIGH') currentSwingHigh = pivotAtCandle;
        if (pivotAtCandle.type === 'LOW') currentSwingLow = pivotAtCandle;
    }

    // BOS / CHoCH checks
    if (currentTrend === 'UPTREND') {
      // BOS = close above most recent High
      if (currentSwingHigh && c.close > currentSwingHigh.price && (!lastBos || c.time > currentSwingHigh.time)) {
        const isNew = !bosEvents.find(e => e.level === currentSwingHigh.price);
        if (isNew) {
           lastBos = { type: 'BULLISH_BOS', level: currentSwingHigh.price, price: currentSwingHigh.price, time: c.time, desc: `BOS: $${currentSwingHigh.price.toFixed(4)}` };
           bosEvents.push(lastBos);
           structureIntact = true;
        }
      }
      // CHoCH = close below most recent Low
      if (currentSwingLow && c.close < currentSwingLow.price && (!lastChoch || c.time > currentSwingLow.time)) {
        const isNew = !chochEvents.find(e => e.level === currentSwingLow.price);
        if (isNew) {
           lastChoch = { type: 'BEARISH_CHOCH', level: currentSwingLow.price, price: currentSwingLow.price, time: c.time, desc: `CHoCH: $${currentSwingLow.price.toFixed(4)}` };
           chochEvents.push(lastChoch);
           currentTrend = 'DOWNTREND';
           structureIntact = false;
        }
      }
    } else {
      // DOWNTREND
      // BOS = close below most recent Low
      if (currentSwingLow && c.close < currentSwingLow.price && (!lastBos || c.time > currentSwingLow.time)) {
        const isNew = !bosEvents.find(e => e.level === currentSwingLow.price);
        if (isNew) {
           lastBos = { type: 'BEARISH_BOS', level: currentSwingLow.price, price: currentSwingLow.price, time: c.time, desc: `BOS: $${currentSwingLow.price.toFixed(4)}` };
           bosEvents.push(lastBos);
           structureIntact = true;
        }
      }
      // CHoCH = close above most recent High
      if (currentSwingHigh && c.close > currentSwingHigh.price && (!lastChoch || c.time > currentSwingHigh.time)) {
        const isNew = !chochEvents.find(e => e.level === currentSwingHigh.price);
        if (isNew) {
           lastChoch = { type: 'BULLISH_CHOCH', level: currentSwingHigh.price, price: currentSwingHigh.price, time: c.time, desc: `CHoCH: $${currentSwingHigh.price.toFixed(4)}` };
           chochEvents.push(lastChoch);
           currentTrend = 'UPTREND';
           structureIntact = false;
        }
      }
    }
  }

  // Active trendline projection
  let activeTrendline = null;
  const recentHighs = pivots.filter(p => p.type === 'HIGH').slice(-3);
  const recentLows = pivots.filter(p => p.type === 'LOW').slice(-3);
  
  function linearFit(points) {
    if (points.length < 2) return null;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += points[i].index;
      sumY += points[i].price;
      sumXY += points[i].index * points[i].price;
      sumXX += points[i].index * points[i].index;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  if (currentTrend === 'UPTREND' && recentLows.length >= 2) {
     const fit = linearFit(recentLows);
     if (fit && fit.slope > 0) {
       activeTrendline = {
         type: 'SUPPORT',
         touches: recentLows.length,
         ...fit,
         lastIndex: recentLows[recentLows.length-1].index,
         points: recentLows
       };
     }
  } else if (currentTrend === 'DOWNTREND' && recentHighs.length >= 2) {
     const fit = linearFit(recentHighs);
     if (fit && fit.slope < 0) {
       activeTrendline = {
         type: 'RESISTANCE',
         touches: recentHighs.length,
         ...fit,
         lastIndex: recentHighs[recentHighs.length-1].index,
         points: recentHighs
       };
     }
  }

  // Detect Fair Value Gaps (FVG) / Imbalances (3-candle gap)
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    if (c3.low > c1.high) {
      const gapSizePct = ((c3.low - c1.high) / c1.high) * 100;
      if (gapSizePct >= 0.2) {
        fvgGaps.push({ type: 'BULLISH_FVG', high: c3.low, low: c1.high, time: c3.time, gapSizePct: gapSizePct.toFixed(2), desc: `Bullish FVG Imbalance: $${c1.high.toFixed(4)} - $${c3.low.toFixed(4)} (${gapSizePct.toFixed(2)}%)` });
      }
    }
    else if (c3.high < c1.low) {
      const gapSizePct = ((c1.low - c3.high) / c3.high) * 100;
      if (gapSizePct >= 0.2) {
        fvgGaps.push({ type: 'BEARISH_FVG', high: c1.low, low: c3.high, time: c3.time, gapSizePct: gapSizePct.toFixed(2), desc: `Bearish FVG Imbalance: $${c3.high.toFixed(4)} - $${c1.low.toFixed(4)} (${gapSizePct.toFixed(2)}%)` });
      }
    }
  }

  // Detect Order Blocks (OB)
  for (let i = 3; i < candles.length; i++) {
    const c0 = candles[i - 3];
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    if (c0.close < c0.open && c1.close > c1.open && c2.close > c2.open && c3.close > c3.open) {
      orderBlocks.push({ type: 'BULLISH_OB', high: c0.high, low: c0.low, time: c0.time, desc: `Bullish Order Block demand zone at $${c0.low.toFixed(4)} - $${c0.high.toFixed(4)}` });
    }
    else if (c0.close > c0.open && c1.close < c1.open && c2.close < c2.open && c3.close < c3.open) {
      orderBlocks.push({ type: 'BEARISH_OB', high: c0.high, low: c0.low, time: c0.time, desc: `Bearish Order Block supply zone at $${c0.low.toFixed(4)} - $${c0.high.toFixed(4)}` });
    }
  }

  return {
    pivots,
    bosEvents: bosEvents.slice(-10),
    chochEvents: chochEvents.slice(-10),
    current_trend: currentTrend,
    last_bos: lastBos,
    last_choch: lastChoch,
    structure_intact: structureIntact,
    active_trendline: activeTrendline,
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

  // Calculate Stochastic RSI (14, 3, 3)
  const srsiHistory = [];
  const lookback = 14;
  for (let i = lookback - 1; i < rsiHistory.length; i++) {
    const window = rsiHistory.slice(i - lookback + 1, i + 1).map(r => r.rsi);
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);
    
    let stochRsi = 0;
    if (maxRsi !== minRsi) {
      stochRsi = (rsiHistory[i].rsi - minRsi) / (maxRsi - minRsi) * 100;
    }
    srsiHistory.push(stochRsi);
  }

  // Calculate %K (3-period SMA of StochRSI) and %D (3-period SMA of %K)
  const kLine = [];
  for (let i = 2; i < srsiHistory.length; i++) {
    const k = (srsiHistory[i] + srsiHistory[i-1] + srsiHistory[i-2]) / 3;
    kLine.push(k);
  }
  
  const dLine = [];
  for (let i = 2; i < kLine.length; i++) {
    const d = (kLine[i] + kLine[i-1] + kLine[i-2]) / 3;
    dLine.push(d);
  }

  const currentK = kLine.length > 0 ? parseFloat(kLine[kLine.length - 1].toFixed(2)) : 50;
  const currentD = dLine.length > 0 ? parseFloat(dLine[dLine.length - 1].toFixed(2)) : 50;
  
  const srsiStatus = currentK >= 80 ? 'OVERBOUGHT' : (currentK <= 20 ? 'OVERSOLD' : 'NEUTRAL');
  const srsiCross = (kLine.length > 1 && kLine[kLine.length - 2] <= dLine[dLine.length - 2] && currentK > currentD) ? 'BULLISH_CROSS' 
                  : (kLine.length > 1 && kLine[kLine.length - 2] >= dLine[dLine.length - 2] && currentK < currentD) ? 'BEARISH_CROSS' 
                  : 'NONE';

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

  // Calculate EMAs
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const currentEma20 = ema20.length > 0 ? parseFloat(ema20[ema20.length - 1].toFixed(4)) : closes[closes.length - 1];
  const currentEma50 = ema50.length > 0 ? parseFloat(ema50[ema50.length - 1].toFixed(4)) : closes[closes.length - 1];
  const currentEma200 = ema200.length > 0 ? parseFloat(ema200[ema200.length - 1].toFixed(4)) : closes[closes.length - 1];

  // Calculate ATR (14)
  const trList = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const hl = c.high - c.low;
    const hc = Math.abs(c.high - prevC.close);
    const lc = Math.abs(c.low - prevC.close);
    trList.push(Math.max(hl, hc, lc));
  }
  let atr = 0;
  if (trList.length >= 14) {
    let trSum = 0;
    for (let i = 0; i < 14; i++) trSum += trList[i];
    atr = trSum / 14;
    for (let i = 14; i < trList.length; i++) {
      atr = (atr * 13 + trList[i]) / 14;
    }
  }

  // Calculate Bollinger Bands (20, 2)
  const sma20 = [];
  const upperBand = [];
  const lowerBand = [];
  for (let i = 19; i < closes.length; i++) {
    const window = closes.slice(i - 19, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / 20;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    sma20.push(mean);
    upperBand.push(mean + (2 * stdDev));
    lowerBand.push(mean - (2 * stdDev));
  }
  const currentUpperBand = upperBand.length > 0 ? parseFloat(upperBand[upperBand.length - 1].toFixed(4)) : 0;
  const currentLowerBand = lowerBand.length > 0 ? parseFloat(lowerBand[lowerBand.length - 1].toFixed(4)) : 0;
  const currentSma20 = sma20.length > 0 ? parseFloat(sma20[sma20.length - 1].toFixed(4)) : 0;

  return {
    rsi: currentRsi,
    rsiStatus: currentRsi >= 70 ? 'OVERBOUGHT' : (currentRsi <= 30 ? 'OVERSOLD' : 'NEUTRAL'),
    rsiHistory,
    srsi: {
      k: currentK,
      d: currentD,
      status: srsiStatus,
      cross: srsiCross
    },
    macd: {
      latest: latestMacd,
      isBullishCross: isMacdBullishCross,
      isBearishCross: isMacdBearishCross
    },
    macdHistory,
    vwap: parseFloat(vwap.toFixed(4)),
    volumeSpike: isVolumeSpike,
    currentVol,
    avgVol,
    ema: {
      ema20: currentEma20,
      ema50: currentEma50,
      ema200: currentEma200
    },
    atr: parseFloat(atr.toFixed(4)),
    bollingerBands: {
      upper: currentUpperBand,
      middle: currentSma20,
      lower: currentLowerBand
    }
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

  // Hidden Bullish Divergence: Higher Low in Price, Lower Low in RSI (Trend Continuation)
  if (p2.low > p1.low && r2.rsi < r1.rsi) {
    divergences.push({
      type: 'HIDDEN_BULLISH_DIVERGENCE',
      indicator: 'RSI',
      desc: `Hidden Bullish RSI Divergence: Price made Higher Low ($${p2.low.toFixed(4)}) while RSI made Lower Low (${r2.rsi} vs ${r1.rsi}).`
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

  // Hidden Bearish Divergence: Lower High in Price, Higher High in RSI (Trend Continuation)
  if (p2.high < p1.high && r2.rsi > r1.rsi) {
    divergences.push({
      type: 'HIDDEN_BEARISH_DIVERGENCE',
      indicator: 'RSI',
      desc: `Hidden Bearish RSI Divergence: Price made Lower High ($${p2.high.toFixed(4)}) while RSI made Higher High (${r2.rsi} vs ${r1.rsi}).`
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
 * 6. Automated Chart Pattern Detection & Drawing System (A-Z Implementation)
 * Covers Reversal, Continuation, and Bilateral chart patterns with
 * entry, stop loss, take profit targets, and confidence scoring.
 */
function detectChartPatterns(candles, pivots = []) {
  const patterns = [];
  const len = candles.length;
  if (len < 15 || pivots.length < 3) return [];

  const highs = pivots.filter(p => p.type === 'HIGH').sort((a, b) => a.index - b.index);
  const lows = pivots.filter(p => p.type === 'LOW').sort((a, b) => a.index - b.index);

  const tolerance = 0.02; // 2% tolerance for horizontal flat levels

  // Prior Trend context helper: uptrend if higher highs, downtrend if lower lows
  let priorTrend = 'NEUTRAL';
  if (highs.length >= 2 && lows.length >= 2) {
    const lastH1 = highs[highs.length - 2].price;
    const lastH2 = highs[highs.length - 1].price;
    const lastL1 = lows[lows.length - 2].price;
    const lastL2 = lows[lows.length - 1].price;
    if (lastH2 > lastH1 && lastL2 > lastL1) priorTrend = 'UPTREND';
    else if (lastH2 < lastH1 && lastL2 < lastL1) priorTrend = 'DOWNTREND';
  }

  // Helper for linear regression slope estimation
  function getSlope(points) {
    if (points.length < 2) return 0;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += points[i].price;
      sumXY += i * points[i].price;
      sumXX += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  // A. REVERSAL PATTERNS
  // 1. Double Top
  if (highs.length >= 2) {
    const p1 = highs[highs.length - 2];
    const p2 = highs[highs.length - 1];
    const diffPct = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPct <= tolerance) {
      // Find neckline (lowest point between the two peaks)
      const intermediateLows = lows.filter(l => l.index > p1.index && l.index < p2.index);
      if (intermediateLows.length > 0) {
        const neckline = Math.min(...intermediateLows.map(l => l.price));
        const height = Math.max(p1.price, p2.price) - neckline;
        patterns.push({
          name: 'Double Top Reversal',
          type: 'BEARISH',
          points: [p1, p2],
          neckline,
          entry: neckline,
          stop: Math.max(p1.price, p2.price) * 1.01,
          profit: neckline - height,
          confidence: 0.85,
          desc: `Bearish Double Top at $${p2.price.toFixed(4)}. Neckline: $${neckline.toFixed(4)}. Height: $${height.toFixed(4)}.`
        });
      }
    }
  }

  // 2. Double Bottom
  if (lows.length >= 2) {
    const p1 = lows[lows.length - 2];
    const p2 = lows[lows.length - 1];
    const diffPct = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPct <= tolerance) {
      // Find neckline (highest point between the two troughs)
      const intermediateHighs = highs.filter(h => h.index > p1.index && h.index < p2.index);
      if (intermediateHighs.length > 0) {
        const neckline = Math.max(...intermediateHighs.map(h => h.price));
        const height = neckline - Math.min(p1.price, p2.price);
        patterns.push({
          name: 'Double Bottom Reversal',
          type: 'BULLISH',
          points: [p1, p2],
          neckline,
          entry: neckline,
          stop: Math.min(p1.price, p2.price) * 0.99,
          profit: neckline + height,
          confidence: 0.85,
          desc: `Bullish Double Bottom at $${p2.price.toFixed(4)}. Neckline: $${neckline.toFixed(4)}. Height: $${height.toFixed(4)}.`
        });
      }
    }
  }

  // 3. Head & Shoulders
  if (highs.length >= 3) {
    const ls = highs[highs.length - 3];
    const h = highs[highs.length - 2];
    const rs = highs[highs.length - 1];
    if (h.price > ls.price && h.price > rs.price) {
      const shoulderDiff = Math.abs(ls.price - rs.price) / ls.price;
      if (shoulderDiff <= 0.05) {
        const intermediateLows = lows.filter(l => l.index > ls.index && l.index < rs.index);
        if (intermediateLows.length >= 2) {
          const neckline = Math.min(...intermediateLows.map(l => l.price));
          const height = h.price - neckline;
          patterns.push({
            name: 'Head & Shoulders Reversal',
            type: 'BEARISH',
            points: [ls, h, rs],
            neckline,
            entry: neckline,
            stop: rs.price * 1.015,
            profit: neckline - height,
            confidence: 0.88,
            desc: `Bearish Head & Shoulders. Head: $${h.price.toFixed(4)}, Shoulders: $${ls.price.toFixed(4)} / $${rs.price.toFixed(4)}.`
          });
        }
      }
    }
  }

  // 4. Inverse Head & Shoulders
  if (lows.length >= 3) {
    const ls = lows[lows.length - 3];
    const h = lows[lows.length - 2];
    const rs = lows[lows.length - 1];
    if (h.price < ls.price && h.price < rs.price) {
      const shoulderDiff = Math.abs(ls.price - rs.price) / ls.price;
      if (shoulderDiff <= 0.05) {
        const intermediateHighs = highs.filter(hi => hi.index > ls.index && hi.index < rs.index);
        if (intermediateHighs.length >= 2) {
          const neckline = Math.max(...intermediateHighs.map(hi => hi.price));
          const height = neckline - h.price;
          patterns.push({
            name: 'Inverse Head & Shoulders',
            type: 'BULLISH',
            points: [ls, h, rs],
            neckline,
            entry: neckline,
            stop: rs.price * 0.985,
            profit: neckline + height,
            confidence: 0.88,
            desc: `Bullish Inverse Head & Shoulders. Head: $${h.price.toFixed(4)}, Shoulders: $${ls.price.toFixed(4)} / $${rs.price.toFixed(4)}.`
          });
        }
      }
    }
  }

  // B. CONTINUATION & BILATERAL PATTERNS
  // 5. Wedges (Rising and Falling)
  if (highs.length >= 3 && lows.length >= 3) {
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);
    const highSlope = getSlope(recentHighs);
    const lowSlope = getSlope(recentLows);

    // Rising Wedge: both slopes positive, high slope < low slope (converging upward)
    if (highSlope > 0 && lowSlope > 0 && highSlope < lowSlope) {
      const isReversal = priorTrend === 'UPTREND';
      const lastHigh = recentHighs[2].price;
      const lastLow = recentLows[2].price;
      const height = lastHigh - lastLow;
      patterns.push({
        name: isReversal ? 'Rising Wedge (Reversal)' : 'Rising Wedge (Continuation)',
        type: 'BEARISH',
        points: [...recentHighs, ...recentLows],
        entry: lastLow,
        stop: lastHigh,
        profit: lastLow - height,
        confidence: 0.75,
        desc: `Bearish Rising Wedge (${isReversal ? 'Reversal' : 'Continuation'}). Converging upward.`
      });
    }
    // Falling Wedge: both slopes negative, high slope > low slope (converging downward)
    else if (highSlope < 0 && lowSlope < 0 && highSlope > lowSlope) {
      const isReversal = priorTrend === 'DOWNTREND';
      const lastHigh = recentHighs[2].price;
      const lastLow = recentLows[2].price;
      const height = lastHigh - lastLow;
      patterns.push({
        name: isReversal ? 'Falling Wedge (Reversal)' : 'Falling Wedge (Continuation)',
        type: 'BULLISH',
        points: [...recentHighs, ...recentLows],
        entry: lastHigh,
        stop: lastLow,
        profit: lastHigh + height,
        confidence: 0.75,
        desc: `Bullish Falling Wedge (${isReversal ? 'Reversal' : 'Continuation'}). Converging downward.`
      });
    }
  }

  // 6. Bullish / Bearish Rectangle (Range)
  if (highs.length >= 2 && lows.length >= 2) {
    const recentHighs = highs.slice(-2);
    const recentLows = lows.slice(-2);
    const topDiff = Math.abs(recentHighs[0].price - recentHighs[1].price) / recentHighs[0].price;
    const bottomDiff = Math.abs(recentLows[0].price - recentLows[1].price) / recentLows[0].price;

    if (topDiff <= tolerance && bottomDiff <= tolerance) {
      const topLevel = (recentHighs[0].price + recentHighs[1].price) / 2;
      const bottomLevel = (recentLows[0].price + recentLows[1].price) / 2;
      const height = topLevel - bottomLevel;
      const direction = priorTrend === 'UPTREND' ? 'BULLISH' : 'BEARISH';

      patterns.push({
        name: `${direction === 'BULLISH' ? 'Bullish' : 'Bearish'} Rectangle`,
        type: direction,
        points: [...recentHighs, ...recentLows],
        entry: direction === 'BULLISH' ? topLevel : bottomLevel,
        stop: direction === 'BULLISH' ? bottomLevel : topLevel,
        profit: direction === 'BULLISH' ? topLevel + height : bottomLevel - height,
        confidence: 0.80,
        desc: `Horizontal Consolidation Range (Rectangle). Height: $${height.toFixed(4)}.`
      });
    }
  }

  // 7. Pennants
  if (candles.length >= 25 && highs.length >= 2 && lows.length >= 2) {
    const poleStart = candles[candles.length - 20];
    const poleEnd = candles[candles.length - 8];
    if (poleStart && poleEnd) {
      const poleHeight = poleEnd.close - poleStart.close;
      const recentHighs = highs.slice(-2);
      const recentLows = lows.slice(-2);
      const highSlope = getSlope(recentHighs);
      const lowSlope = getSlope(recentLows);

      // Symmetrical pennant converging: high slope negative, low slope positive
      if (highSlope < 0 && lowSlope > 0) {
        const direction = poleHeight > 0 ? 'BULLISH' : 'BEARISH';
        const entryPrice = direction === 'BULLISH' ? recentHighs[1].price : recentLows[1].price;
        patterns.push({
          name: `${direction === 'BULLISH' ? 'Bullish' : 'Bearish'} Pennant`,
          type: direction,
          points: [...recentHighs, ...recentLows],
          entry: entryPrice,
          stop: direction === 'BULLISH' ? recentLows[1].price : recentHighs[1].price,
          profit: entryPrice + poleHeight,
          confidence: 0.82,
          desc: `Continuation ${direction} Pennant. Flagpole height: $${Math.abs(poleHeight).toFixed(4)}.`
        });
      }
    }
  }

  // 8. Triangles (Ascending, Descending, Symmetrical)
  if (highs.length >= 3 && lows.length >= 3) {
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);
    const topSlope = getSlope(recentHighs);
    const bottomSlope = getSlope(recentLows);

    const topFlat = Math.abs(recentHighs[0].price - recentHighs[2].price) / recentHighs[0].price <= tolerance;
    const bottomFlat = Math.abs(recentLows[0].price - recentLows[2].price) / recentLows[0].price <= tolerance;

    const widestPoint = recentHighs[0].price - recentLows[0].price;

    // Ascending Triangle (Flat Top + Rising Bottom)
    if (topFlat && bottomSlope > 0) {
      patterns.push({
        name: 'Ascending Triangle (Bilateral)',
        type: 'BULLISH',
        points: [...recentHighs, ...recentLows],
        entry: recentHighs[2].price,
        stop: recentLows[2].price,
        profit: recentHighs[2].price + widestPoint,
        confidence: 0.78,
        desc: `Bilateral Ascending Triangle. flat resistance at $${recentHighs[2].price.toFixed(4)}.`
      });
    }
    // Descending Triangle (Flat Bottom + Falling Top)
    else if (bottomFlat && topSlope < 0) {
      patterns.push({
        name: 'Descending Triangle (Bilateral)',
        type: 'BEARISH',
        points: [...recentHighs, ...recentLows],
        entry: recentLows[2].price,
        stop: recentHighs[2].price,
        profit: recentLows[2].price - widestPoint,
        confidence: 0.78,
        desc: `Bilateral Descending Triangle. flat support at $${recentLows[2].price.toFixed(4)}.`
      });
    }
    // Symmetrical Triangle (Converging Slopes)
    else if (topSlope < 0 && bottomSlope > 0) {
      const avgTop = recentHighs[2].price;
      const avgBottom = recentLows[2].price;
      patterns.push({
        name: 'Symmetrical Triangle (Bilateral)',
        type: 'BULLISH', // Standard breakout target
        points: [...recentHighs, ...recentLows],
        entry: avgTop,
        stop: avgBottom,
        profit: avgTop + widestPoint,
        confidence: 0.70,
        desc: `Bilateral Symmetrical Triangle. converging trendlines. Entry unconfirmed until breakout.`
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
