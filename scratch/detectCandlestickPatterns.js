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
