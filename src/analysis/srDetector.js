/**
 * Support & Resistance Detection Engine (TradeLine AI)
 * Enhanced with Professional S/R Drawing Logic:
 * 1. Pivot Highs & Lows detection using multi-candle swing window.
 * 2. Pivot Clustering into price zones using rolling median/average level drawing.
 * 3. Strength ranking using touch counts, recency decay (recent wicks count more), and psychological round number alignment.
 * 4. Invalidation/Break rules confirmed strictly on candle close beyond the zone.
 * 5. Multi-timeframe confluence zones and Smart Pruned deduplication.
 */

export function detectSupportResistance(candles, options = {}) {
  const {
    minBounces = 3,
    tolerancePct = 1.2,
    pivotWindow = 3
  } = options;

  if (!candles || candles.length < 10) {
    return { supportLines: [], resistanceLines: [], allLines: [], slantedLines: [] };
  }

  if (minBounces === 0) {
    return { supportLines: [], resistanceLines: [], allLines: [], slantedLines: [] };
  }

  const currentPrice = candles[candles.length - 1].close;

  // Step 1 — Detect swing highs and swing lows (pivots)
  const pivotHighs = [];
  const pivotLows = [];

  for (let i = pivotWindow; i < candles.length - pivotWindow; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= pivotWindow; j++) {
      if (candles[i - j].high > currentHigh || candles[i + j].high > currentHigh) {
        isHigh = false;
      }
      if (candles[i - j].low < currentLow || candles[i + j].low < currentLow) {
        isLow = false;
      }
    }

    if (isHigh) {
      pivotHighs.push({ price: currentHigh, index: i, time: candles[i].time, type: 'high' });
    }
    if (isLow) {
      pivotLows.push({ price: currentLow, index: i, time: candles[i].time, type: 'low' });
    }
  }

  // Step 2 — Cluster pivots into zones (0.5% - 1.2% tolerance bands)
  const allPivots = [...pivotHighs, ...pivotLows];
  const sortedPivots = [...allPivots].sort((a, b) => a.price - b.price);
  const clusters = [];

  for (const pivot of sortedPivots) {
    let matchedCluster = null;
    for (const cluster of clusters) {
      const avgPrice = cluster.totalPrice / cluster.count;
      const diffPct = (Math.abs(pivot.price - avgPrice) / avgPrice) * 100;
      if (diffPct <= tolerancePct * 1.5) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.pivots.push(pivot);
      matchedCluster.totalPrice += pivot.price;
      matchedCluster.count += 1;
    } else {
      clusters.push({
        pivots: [pivot],
        totalPrice: pivot.price,
        count: 1
      });
    }
  }

  const candidateHorizontalLines = [];
  clusters.forEach((cluster, idx) => {
    // Boundary level drawn at median to reject outlier stop-hunt wicks
    const sortedPrices = cluster.pivots.map(p => p.price).sort((a, b) => a - b);
    const midIdx = Math.floor(sortedPrices.length / 2);
    const levelPrice = sortedPrices.length % 2 !== 0 ? sortedPrices[midIdx] : (sortedPrices[midIdx - 1] + sortedPrices[midIdx]) / 2;

    const tolerance = levelPrice * (tolerancePct / 100);

    const bounceEvents = [];
    let lastBounceIndex = -100;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const lowInZone = candle.low <= (levelPrice + tolerance) && candle.low >= (levelPrice - tolerance);
      const highInZone = candle.high >= (levelPrice - tolerance) && candle.high <= (levelPrice + tolerance);
      const crossZone = candle.low <= levelPrice && candle.high >= levelPrice;

      if (lowInZone || highInZone || crossZone) {
        if (i - lastBounceIndex >= 3) {
          bounceEvents.push({
            index: i,
            time: candle.time,
            price: (lowInZone ? candle.low : (highInZone ? candle.high : levelPrice))
          });
          lastBounceIndex = i;
        }
      }
    }

    if (bounceEvents.length >= Math.max(2, minBounces)) {
      const isSupport = currentPrice >= levelPrice;

      // Recency calculation (decay factor for older touches)
      const lastTouchIdx = bounceEvents[bounceEvents.length - 1].index;
      const recencyWeight = lastTouchIdx / candles.length; // Close to 1 means recent

      // Psychological round number check (e.g. alignment to multiples of 0.05, 0.10, 0.50, 1.00, etc.)
      const isRoundNumber = checkPsychologicalRound(levelPrice);
      const psychologicalBonus = isRoundNumber ? 15 : 0;

      // Strength Ranking: touch count + recency decay + psychological level alignment
      const strength = Math.min(100, Math.round(bounceEvents.length * 15 + recencyWeight * 20 + psychologicalBonus));

      candidateHorizontalLines.push({
        id: `h-${idx}-${Math.round(levelPrice * 1000)}`,
        price: levelPrice,
        bounces: bounceEvents.length,
        bounceDetails: bounceEvents,
        type: isSupport ? 'SUPPORT' : 'RESISTANCE',
        isSlanted: false,
        strength,
        distancePct: Number((((levelPrice - currentPrice) / currentPrice) * 100).toFixed(2))
      });
    }
  });

  // Trendline-Specific Rules (Diagonal S/R)
  const candidateSlantedLines = [];

  function detectTrendlinesForPivots(pivots, isLowPivot) {
    const lines = [];
    for (let a = 0; a < pivots.length - 1; a++) {
      for (let b = a + 1; b < pivots.length; b++) {
        const p1 = pivots[a];
        const p2 = pivots[b];
        const indexDiff = p2.index - p1.index;
        if (indexDiff < 15) continue; // Minimum separation for meaningful trend

        const slope = (p2.price - p1.price) / indexDiff;
        const intercept = p1.price - slope * p1.index;

        const touches = [];
        let lastTouchIdx = -100;

        for (let i = p1.index; i < candles.length; i++) {
          const expectedPrice = slope * i + intercept;
          if (expectedPrice <= 0) continue;

          const candle = candles[i];
          const tol = expectedPrice * (tolerancePct / 100);

          const lowTouch = Math.abs(candle.low - expectedPrice) <= tol;
          const highTouch = Math.abs(candle.high - expectedPrice) <= tol;

          if (lowTouch || highTouch) {
            if (i - lastTouchIdx >= 4) {
              touches.push({ index: i, time: candle.time, price: expectedPrice });
              lastTouchIdx = i;
            }
          }
        }

        // Steeper trendlines break faster - calculate slope angle impact
        const angleImpact = Math.abs(slope) > 0.05 ? 0.75 : 1.0;

        if (touches.length >= Math.max(2, minBounces)) {
          const lastTouchIdx = touches[touches.length - 1].index;
          const recencyWeight = lastTouchIdx / candles.length;
          const strength = Math.min(100, Math.round((touches.length * 15 + recencyWeight * 20) * angleImpact));

          lines.push({ 
            p1, 
            p2, 
            slope, 
            intercept, 
            bounces: touches.length, 
            bounceDetails: touches, 
            type: isLowPivot ? 'SUPPORT' : 'RESISTANCE',
            strength
          });
        }
      }
    }
    return lines;
  }

  const slantedSupports = detectTrendlinesForPivots(pivotLows, true);
  const slantedResistances = detectTrendlinesForPivots(pivotHighs, false);

  const candleLows = candles.map(c => c.low);
  const candleHighs = candles.map(c => c.high);
  const minLow = Math.min(...candleLows);
  const maxHigh = Math.max(...candleHighs);

  [...slantedSupports, ...slantedResistances].forEach((tl, idx) => {
    const startCandle = candles[tl.p1.index];
    const endIdx = candles.length - 1;
    const endCandle = candles[endIdx];

    const startPrice = tl.slope * tl.p1.index + tl.intercept;
    const endPrice = tl.slope * endIdx + tl.intercept;

    if (startPrice < minLow * 0.7 || startPrice > maxHigh * 1.3) return;
    if (endPrice < minLow * 0.7 || endPrice > maxHigh * 1.3) return;

    candidateSlantedLines.push({
      id: `s-${idx}-${Math.round(startPrice * 1000)}`,
      p1: { time: startCandle.time, price: startPrice },
      p2: { time: endCandle.time, price: endPrice },
      price: endPrice,
      bounces: tl.bounces,
      bounceDetails: tl.bounceDetails,
      type: tl.type,
      isSlanted: true,
      strength: tl.strength,
      distancePct: Number((((endPrice - currentPrice) / currentPrice) * 100).toFixed(2))
    });
  });

  const filterMode = options.filterMode || 'smart';

  // Rule 2 — Deduplicate / Merge lines within 2.5% price proximity
  function pruneRedundantLines(lines) {
    const pruned = [];
    const sorted = [...lines].sort((a, b) => b.bounces - a.bounces);

    sorted.forEach(line => {
      const isRedundant = pruned.some(existing => {
        const distPct = (Math.abs(existing.price - line.price) / Math.max(existing.price, 1)) * 100;
        return distPct < 2.5;
      });

      if (!isRedundant) {
        pruned.push(line);
      }
    });

    return pruned;
  }

  // Rule 3 — Invalidation/Break rules confirmed strictly on candle CLOSE, not wick
  function pruneBrokenOrFarLines(lines) {
    return lines.filter(line => {
      const absDist = Math.abs(line.distancePct);
      if (absDist > 35) return false;

      // Support is broken only if the candle CLOSE is below 98% of support floor level
      if (line.type === 'SUPPORT' && currentPrice < line.price * 0.98) {
        return false;
      }
      // Resistance is broken only if the candle CLOSE is above 102% of resistance ceiling level
      if (line.type === 'RESISTANCE' && currentPrice > line.price * 1.02) {
        return false;
      }

      return true;
    });
  }

  let supportLines = [];
  let resistanceLines = [];

  if (filterMode === 'smart') {
    const cleanH = pruneBrokenOrFarLines(pruneRedundantLines(candidateHorizontalLines));
    const cleanS = pruneBrokenOrFarLines(pruneRedundantLines(candidateSlantedLines));
    const cleanAll = [...cleanH, ...cleanS];

    supportLines = cleanAll.filter(l => l.type === 'SUPPORT').sort((a, b) => b.strength - a.strength).slice(0, 5);
    resistanceLines = cleanAll.filter(l => l.type === 'RESISTANCE').sort((a, b) => b.strength - a.strength).slice(0, 5);
  } else if (filterMode === 'standard') {
    const cleanH = pruneRedundantLines(candidateHorizontalLines);
    const cleanS = pruneRedundantLines(candidateSlantedLines);
    const cleanAll = [...cleanH, ...cleanS];

    supportLines = cleanAll.filter(l => l.type === 'SUPPORT').sort((a, b) => b.strength - a.strength);
    resistanceLines = cleanAll.filter(l => l.type === 'RESISTANCE').sort((a, b) => b.strength - a.strength);
  } else {
    const rawAll = [...candidateHorizontalLines, ...candidateSlantedLines];
    supportLines = rawAll.filter(l => l.type === 'SUPPORT').sort((a, b) => b.price - a.price);
    resistanceLines = rawAll.filter(l => l.type === 'RESISTANCE').sort((a, b) => a.price - b.price);
  }

  return {
    supportLines,
    resistanceLines,
    allLines: [...supportLines, ...resistanceLines],
    slantedLines: [...supportLines, ...resistanceLines].filter(l => l.isSlanted),
    horizontalLines: [...supportLines, ...resistanceLines].filter(l => !l.isSlanted)
  };
}

/**
 * Check if price level aligns close to psychological round numbers (multiples of 0.05, 0.10, 0.50, 1.00, etc.)
 */
function checkPsychologicalRound(price) {
  const checkValues = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100];
  for (const v of checkValues) {
    const rem = price % v;
    const proximity = Math.min(rem, v - rem) / price * 100;
    if (proximity <= 0.25) { // Within 0.25% distance to round number
      return true;
    }
  }
  return false;
}
