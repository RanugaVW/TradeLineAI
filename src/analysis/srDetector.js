/**
 * Support & Resistance Detection Engine (TradeLine AI)
 * Features Smart Unusable & Redundant Line Pruning:
 * 1. Merges duplicate/clustered lines within 2.5% price proximity.
 * 2. Filters out broken/invalidated lines where price closed past the level.
 * 3. Filters out far out-of-range lines (>35% distance).
 * 4. Caps output to Top 5 strongest, most relevant Support & Resistance lines.
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

  // Handle minBounces = 0 (Disabled state)
  if (minBounces === 0) {
    return { supportLines: [], resistanceLines: [], allLines: [], slantedLines: [] };
  }

  const currentPrice = candles[candles.length - 1].close;

  // Step 1: Detect Major Pivot Highs and Pivot Lows with window size
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

  // --- PART A: Horizontal Support & Resistance Lines ---
  const allPivots = [...pivotHighs, ...pivotLows];
  const sortedPivots = [...allPivots].sort((a, b) => a.price - b.price);
  const clusters = [];

  // Group pivots into price clusters
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
    const levelPrice = cluster.totalPrice / cluster.count;
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

    if (bounceEvents.length >= minBounces) {
      const isSupport = currentPrice >= levelPrice;
      candidateHorizontalLines.push({
        id: `h-${idx}-${Math.round(levelPrice * 1000)}`,
        price: levelPrice,
        bounces: bounceEvents.length,
        bounceDetails: bounceEvents,
        type: isSupport ? 'SUPPORT' : 'RESISTANCE',
        isSlanted: false,
        strength: Math.min(100, Math.round(bounceEvents.length * 20 + 20)),
        distancePct: Number((((levelPrice - currentPrice) / currentPrice) * 100).toFixed(2))
      });
    }
  });

  // --- PART B: Slanted Trendline Detection ---
  const candidateSlantedLines = [];

  function detectTrendlinesForPivots(pivots, isLowPivot) {
    const lines = [];
    // Only compare major pivots separated by at least 15 bars
    for (let a = 0; a < pivots.length - 1; a++) {
      for (let b = a + 1; b < pivots.length; b++) {
        const p1 = pivots[a];
        const p2 = pivots[b];
        const indexDiff = p2.index - p1.index;
        if (indexDiff < 15) continue;

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

        if (touches.length >= minBounces) {
          lines.push({ p1, p2, slope, intercept, bounces: touches.length, bounceDetails: touches, type: isLowPivot ? 'SUPPORT' : 'RESISTANCE' });
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
      strength: Math.min(100, Math.round(tl.bounces * 20 + 20)),
      distancePct: Number((((endPrice - currentPrice) / currentPrice) * 100).toFixed(2))
    });
  });

  // --- PART C: FILTER MODE SELECTION ---
  const filterMode = options.filterMode || 'smart';

  // Rule 1: Deduplicate / Merge lines that are within 2.5% of each other (keep highest bounce count)
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

  // Rule 2: Filter out lines that are broken or far out-of-range (>35% away)
  function pruneBrokenOrFarLines(lines) {
    return lines.filter(line => {
      const absDist = Math.abs(line.distancePct);
      if (absDist > 35) return false;

      if (line.type === 'SUPPORT' && currentPrice < line.price * 0.96) {
        return false;
      }
      if (line.type === 'RESISTANCE' && currentPrice > line.price * 1.04) {
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

    supportLines = cleanAll.filter(l => l.type === 'SUPPORT').sort((a, b) => b.bounces - a.bounces).slice(0, 5);
    resistanceLines = cleanAll.filter(l => l.type === 'RESISTANCE').sort((a, b) => b.bounces - a.bounces).slice(0, 5);
  } else if (filterMode === 'standard') {
    const cleanH = pruneRedundantLines(candidateHorizontalLines);
    const cleanS = pruneRedundantLines(candidateSlantedLines);
    const cleanAll = [...cleanH, ...cleanS];

    supportLines = cleanAll.filter(l => l.type === 'SUPPORT').sort((a, b) => b.bounces - a.bounces);
    resistanceLines = cleanAll.filter(l => l.type === 'RESISTANCE').sort((a, b) => b.bounces - a.bounces);
  } else {
    // filterMode === 'all' (Show All Raw Lines)
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
