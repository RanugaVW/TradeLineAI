/**
 * Chart Viewer Component (TradeLine AI)
 * Powered by TradingView Lightweight Charts
 * Features:
 * 1. Full uncropped historical candlestick chart view.
 * 2. Period-bound Support & Resistance lines (horizontal and slanted).
 * 3. Interactive Touch/Click Line Extender & Folder: Click/Touch any line on the chart to extend it across the future prediction zone, or retouch to fold it back!
 * 4. Master Extend/Fold All toggle method.
 * 5. Numbered bounce spot markers (#1, #2, #3...).
 * 6. AI Trade Overlay: Renders Entry Arrow, WE ARE HERE pointer, Target TP & Stop Loss lines directly on the main TradingView chart with 1-click Reset!
 * 7. Pattern Engine Overlay: Renders Candlestick Pattern tags, BOS/CHoCH structure markers, and Fib Golden Pocket lines!
 * 8. Aesthetic Tooltip: Moving mouse/crosshair over markers, patterns, or lines displays a description in simple language.
 */
import { createChart, LineStyle } from 'lightweight-charts';
import { DrawingEngine } from './DrawingEngine.js';

export class ChartViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.chart = null;
    this.candlestickSeries = null;
    this.priceLines = [];
    this.trendlineSeriesList = [];
    this.userAnnotationsList = [];
    this.annotationSeriesList = [];
    this.aiOverlayPriceLines = [];
    this.patternPriceLines = [];

    this.showLabels = true;

    this.baseSRMarkers = [];
    this.currentPatternMarkers = [];

    this.extendedPriceKeys = new Set();
    this.allExtended = false;
    this.lastSRData = null;
    this.hasClickSubscription = false;

    this.currentCandles = [];
    this.tooltip = null;
    this.drawingEngine = null;
    this.initChart();
    this.initTooltip();
    this._initDrawingEngine();
  }

  initChart() {
    if (!this.container) return;

    this.chart = createChart(this.container, {
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 500,
      layout: {
        background: { type: 'solid', color: '#090d16' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      crosshair: {
        mode: 1
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1
        }
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 15
      }
    });

    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744'
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || !entries.length) return;
      const entry = entries[0];
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;

      if (width > 0 && height > 0 && this.chart) {
        this.chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(this.container);
  }

  _initDrawingEngine() {
    try {
      this.drawingEngine = new DrawingEngine(this);
    } catch (e) {
      console.warn('DrawingEngine init error:', e);
    }
  }

  setDrawingTool(tool) { this.drawingEngine?.setActiveTool(tool); }
  setDrawingColor(c) { this.drawingEngine?.setActiveColor(c); }
  setDrawingWidth(w) { this.drawingEngine?.setActiveLineWidth(w); }
  setDrawingStyle(s) { this.drawingEngine?.setActiveLineStyle(s); }
  undoDrawing() { this.drawingEngine?.undo(); }
  redoDrawing() { this.drawingEngine?.redo(); }
  clearDrawings() { this.drawingEngine?.clearAll(); }
  setDrawingSymbol(sym) { this.drawingEngine?.setSymbol(sym); }

  initTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'chart-hover-tooltip';
    this.tooltip.style.display = 'none';
    this.tooltip.style.position = 'absolute';
    this.tooltip.style.zIndex = '1000';
    this.tooltip.style.pointerEvents = 'none';
    this.container.style.position = 'relative';
    this.container.appendChild(this.tooltip);

    this.chart.subscribeCrosshairMove((param) => {
      if (!param || !param.point || !param.time) {
        this.tooltip.style.display = 'none';
        return;
      }

      const allMarkers = [...(this.baseSRMarkers || []), ...(this.currentPatternMarkers || [])];
      const hoveredTime = param.time;
      const matched = allMarkers.find(m => m.time === hoveredTime);

      if (matched) {
        const titleText = matched.text || '';
        const description = this.getLabelExplanation(titleText);

        this.tooltip.innerHTML = `
          <div class="tooltip-title">${titleText}</div>
          <div class="tooltip-desc">${description}</div>
        `;
        this.tooltip.style.display = 'block';

        // Adjust position dynamically
        const rect = this.container.getBoundingClientRect();
        const tooltipWidth = 220;
        let leftPos = param.point.x + 15;
        if (leftPos + tooltipWidth > rect.width) {
          leftPos = param.point.x - tooltipWidth - 15;
        }

        this.tooltip.style.left = `${leftPos}px`;
        this.tooltip.style.top = `${param.point.y + 15}px`;
      } else {
        this.tooltip.style.display = 'none';
      }
    });
  }

  getLabelExplanation(text) {
    const cleanText = text.toLowerCase();
    if (cleanText.includes('doji')) {
      return "Doji indicates market indecision where buying and selling pressures are equal. High chance of a trend pause or reversal.";
    }
    if (cleanText.includes('morning star')) {
      return "Morning Star is a powerful 3-candle bottom reversal pattern indicating sellers have exhausted and buyers are taking charge.";
    }
    if (cleanText.includes('evening star')) {
      return "Evening Star is a 3-candle top reversal pattern indicating buyers have exhausted and sellers are driving price down.";
    }
    if (cleanText.includes('three white soldiers')) {
      return "Three White Soldiers indicates strong, steady bullish momentum with successive green candles closing near their highs.";
    }
    if (cleanText.includes('three black crows')) {
      return "Three Black Crows indicates strong bearish momentum with successive red candles closing near their lows.";
    }
    if (cleanText.includes('inverted hammer')) {
      return "Inverted Hammer indicates potential bullish reversal at lows. Buyers pushed price up early, signaling accumulation.";
    }
    if (cleanText.includes('shooting star')) {
      return "Shooting Star indicates a bearish price rejection at highs. Sellers pushed price down from the peak, showing resistance.";
    }
    if (cleanText.includes('hanging man')) {
      return "Hanging Man is a bearish warning pattern at the top of an uptrend, showing early intraday selloffs before a recovery.";
    }
    if (cleanText.includes('hammer')) {
      return "Hammer is a bullish reversal pattern at support levels, showing price rejected lower levels to close near its high.";
    }
    if (cleanText.includes('marubozu')) {
      return "Marubozu indicates absolute trend dominance. A full body candle with almost no wicks showing relentless volume flow.";
    }
    if (cleanText.includes('engulfing')) {
      return "Engulfing indicates a decisive reversal. The current candle body completely covers the previous body, shifting power.";
    }
    if (cleanText.includes('piercing line')) {
      return "Piercing Line is a bullish reversal setup where a green candle closes above the 50% midpoint of the previous red body.";
    }
    if (cleanText.includes('dark cloud')) {
      return "Dark Cloud Cover is a bearish reversal setup where a red candle closes below the 50% midpoint of the previous green body.";
    }
    if (cleanText.includes('bos')) {
      return "Break of Structure (BOS) indicates trend continuation. Price successfully closed past the previous major swing high or low.";
    }
    if (cleanText.includes('choch')) {
      return "Change of Character (CHoCH) indicates early trend reversal. A structure shift where price breaks support or resistance against the trend.";
    }
    if (cleanText.includes('we are here')) {
      return "This is the latest live market price point being analyzed in realtime.";
    }
    if (cleanText.includes('buy entry')) {
      return "This is the optimal purchase entry zone calculated by the TradeLine AI Engine.";
    }
    if (cleanText.includes('focus')) {
      return "Focus Beacon: Clicked historical level pivot point.";
    }
    return "Market pivot, swing point, or confirmation target level tracked by TradeLine AI.";
  }

  setData(candles, resetView = false) {
    if (!candles || !Array.isArray(candles) || candles.length === 0) return;

    this.currentCandles = candles;

    const formattedData = candles.map(c => {
      let t = c.time;
      if (typeof t === 'string') {
        t = Math.floor(new Date(t).getTime() / 1000);
      } else if (typeof t === 'number' && t > 2000000000) {
        t = Math.floor(t / 1000);
      }
      return {
        time: Number(t),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      };
    }).filter(c => !isNaN(c.time) && !isNaN(c.close)).sort((a, b) => a.time - b.time);

    const uniqueData = [];
    let lastT = null;
    for (const d of formattedData) {
      if (d.time !== lastT) {
        uniqueData.push(d);
        lastT = d.time;
      }
    }

    if (uniqueData.length > 0) {
      this.candlestickSeries.setData(uniqueData);
      if (resetView) {
        this.chart.timeScale().fitContent();
      }
    }
  }

  toggleExtendAll() {
    this.allExtended = !this.allExtended;
    if (this.lastSRData) {
      const activeLines = [
        ...(this.lastSRData.showSupport ? this.lastSRData.supportLines || [] : []),
        ...(this.lastSRData.showResistance ? this.lastSRData.resistanceLines || [] : [])
      ];
      activeLines.forEach(l => {
        const key = l.price.toFixed(2);
        if (this.allExtended) {
          this.extendedPriceKeys.add(key);
        } else {
          this.extendedPriceKeys.delete(key);
        }
      });
      this.renderSRLines(this.lastSRData);
    }
    return this.allExtended;
  }

  renderSRLines(srData) {
    if (!srData || !this.candlestickSeries) return;

    this.lastSRData = srData;
    const {
      supportLines = [],
      resistanceLines = [],
      showSupport = false,
      showResistance = false,
      rangeStartSec = null,
      rangeEndSec = null
    } = srData;

    const SolidLineStyle = LineStyle?.Solid ?? 0;
    const DashedLineStyle = LineStyle?.Dashed ?? 2;

    this.priceLines.forEach(line => {
      try { this.candlestickSeries.removePriceLine(line); } catch (e) { }
    });
    this.priceLines = [];

    this.trendlineSeriesList.forEach(series => {
      try { this.chart.removeSeries(series); } catch (e) { }
    });
    this.trendlineSeriesList = [];

    const markers = [];
    const activeLines = [];
    if (showSupport) activeLines.push(...supportLines);
    if (showResistance) activeLines.push(...resistanceLines);

    let futureTime = (this.currentCandles && this.currentCandles.length > 0)
      ? this.currentCandles[this.currentCandles.length - 1].time
      : null;

    if (this.currentCandles && this.currentCandles.length > 5) {
      const lastCandle = this.currentCandles[this.currentCandles.length - 1];
      const firstCandle = this.currentCandles[0];
      const avgStep = Math.max(60, Math.floor((lastCandle.time - firstCandle.time) / (this.currentCandles.length - 1)));
      futureTime = lastCandle.time + (avgStep * 25);
    }

    activeLines.forEach(line => {
      const isSupport = line.type === 'SUPPORT';
      const color = isSupport ? '#00e676' : '#ff1744';
      const priceKey = line.price.toFixed(2);
      const isExtended = this.allExtended || this.extendedPriceKeys.has(priceKey);

      let firstTouchTime = (line.bounceDetails && line.bounceDetails.length > 0)
        ? line.bounceDetails[0].time
        : (this.currentCandles && this.currentCandles.length > 0 ? this.currentCandles[0].time : null);

      let lastTouchTime = (line.bounceDetails && line.bounceDetails.length > 0)
        ? line.bounceDetails[line.bounceDetails.length - 1].time
        : (this.currentCandles && this.currentCandles.length > 0 ? this.currentCandles[this.currentCandles.length - 1].time : null);

      let startTime = firstTouchTime;
      if (rangeStartSec && rangeStartSec > 0) {
        startTime = Math.max(firstTouchTime, rangeStartSec);
      }

      let endTime = lastTouchTime;
      if (rangeEndSec && rangeEndSec > 0 && !isExtended) {
        endTime = Math.min(lastTouchTime, rangeEndSec);
      } else if (isExtended && futureTime) {
        endTime = futureTime;
      }

      if (startTime && endTime && (startTime <= endTime || isExtended)) {
        if (line.isSlanted) {
          const trendlineSeries = this.chart.addLineSeries({
            color,
            lineWidth: isExtended ? 3 : 2,
            lineStyle: DashedLineStyle,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `${isSupport ? 'SUP Trend' : 'RES Trend'} (${line.bounces}x) ${isExtended ? '↔ EXT' : ''}`
          });

          const p1Time = (rangeStartSec && rangeStartSec > line.p1.time) ? rangeStartSec : line.p1.time;
          const endPrice = line.p2 ? line.p2.price : line.price;

          trendlineSeries.setData([
            { time: p1Time, value: line.p1.price },
            { time: endTime || line.p2.time, value: endPrice }
          ]);

          this.trendlineSeriesList.push(trendlineSeries);
        } else {
          const horzSeries = this.chart.addLineSeries({
            color,
            lineWidth: isExtended ? 3 : 2,
            lineStyle: SolidLineStyle,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `${isSupport ? 'SUP' : 'RES'} (${line.bounces}x) ${isExtended ? '↔ EXTENDED' : ''}`
          });

          horzSeries.setData([
            { time: startTime, value: line.price },
            { time: endTime, value: line.price }
          ]);

          this.trendlineSeriesList.push(horzSeries);
        }
      }

      const bounceColor = isSupport ? '#00e5ff' : '#ff007f';

      line.bounceDetails.slice(-5).forEach((bounce, bIdx) => {
        markers.push({
          time: bounce.time,
          position: isSupport ? 'belowBar' : 'aboveBar',
          color: bounceColor,
          shape: 'circle',
          text: `#${bIdx + 1}`
        });
      });
    });

    this.baseSRMarkers = markers;
    this.combineAndSetMarkers();
    this.setupInteractiveLineTouch();
  }

  combineAndSetMarkers() {
    if (this.showLabels === false) {
      this.candlestickSeries.setMarkers([]);
      return;
    }

    const allMarkers = [...(this.baseSRMarkers || []), ...(this.currentPatternMarkers || [])];
    const markerMap = new Map();
    allMarkers.forEach(m => {
      if (!markerMap.has(m.time)) {
        markerMap.set(m.time, m);
      }
    });

    this.candlestickSeries.setMarkers(Array.from(markerMap.values()).sort((a, b) => a.time - b.time));
  }

  renderPatternOverlays(patterns) {
    if (!patterns || !this.candlestickSeries) return;

    this.patternPriceLines.forEach(line => {
      try { this.candlestickSeries.removePriceLine(line); } catch (e) { }
    });
    this.patternPriceLines = [];

    const extraMarkers = [];

    (patterns.candlestickPatterns || []).forEach(p => {
      const isBull = p.type === 'BULLISH';
      extraMarkers.push({
        time: p.time,
        position: isBull ? 'belowBar' : 'aboveBar',
        color: isBull ? '#00e676' : '#ff1744',
        shape: isBull ? 'arrowUp' : 'arrowDown',
        text: `[CANDLE] ${p.name}`
      });
    });

    (patterns.marketStructure?.bosEvents || []).forEach(b => {
      const isBull = b.type.includes('BULL');
      extraMarkers.push({
        time: b.time,
        position: isBull ? 'aboveBar' : 'belowBar',
        color: isBull ? '#3b82f6' : '#f59e0b',
        shape: 'square',
        text: `BOS: $${b.price.toFixed(4)}`
      });
    });

    (patterns.marketStructure?.chochEvents || []).forEach(c => {
      const isBull = c.type.includes('BULL');
      extraMarkers.push({
        time: c.time,
        position: isBull ? 'aboveBar' : 'belowBar',
        color: isBull ? '#8b5cf6' : '#ec4899', // Purple/Pink for CHoCH
        shape: 'square',
        text: `CHoCH: $${c.price.toFixed(4)}`
      });
    });

    (patterns.marketStructure?.pivots || []).forEach(p => {
      if (p.label) {
        extraMarkers.push({
          time: p.time,
          position: p.type === 'HIGH' ? 'aboveBar' : 'belowBar',
          color: p.type === 'HIGH' ? '#f43f5e' : '#10b981', // Rose for highs, Emerald for lows
          shape: 'circle',
          text: p.label
        });
      }
    });

    if (!this.structureExtensionSeries) {
      this.structureExtensionSeries = this.chart.addLineSeries({
        color: 'rgba(148, 163, 184, 0.7)', // Slate-400 with opacity
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false
      });
    }

    if (patterns.marketStructure?.active_trendline && this.currentCandles && this.currentCandles.length > 0) {
      const at = patterns.marketStructure.active_trendline;
      const lineData = [];
      const candles = this.currentCandles;

      if (at.points && at.points.length > 0) {
        const firstIndex = at.points[0].index;
        const lastIndex = candles.length - 1;
        const currentPrice = candles[lastIndex].close;
        const projectTo = lastIndex + 25; // Project 25 candles into the future

        let finalTime = null;
        let finalPrice = null;

        for (let i = firstIndex; i <= projectTo; i++) {
          let time;
          if (i < candles.length) {
            time = candles[i].time;
          } else {
            const lastTime = candles[candles.length - 1].time;
            // Handle timeframe step correctly. Assuming time is unix timestamp in seconds.
            let timeDiff = 3600; // default 1 hour
            if (candles.length > 1) {
              const t1 = candles[candles.length - 1].time;
              const t2 = candles[candles.length - 2].time;
              // if string (date), parse it, but Lightweight Charts uses unix seconds or YYYY-MM-DD
              if (typeof t1 === 'number' && typeof t2 === 'number') {
                timeDiff = t1 - t2;
              }
            }

            const offset = i - lastIndex;
            if (typeof lastTime === 'number') {
              time = lastTime + (timeDiff * offset);
            } else {
              // If it's a string, just approximate it or stop drawing in future
              time = lastTime;
            }
          }

          const price = at.slope * i + at.intercept;
          // Only add if time is a number and valid
          if (typeof time === 'number' && time > 0) {
            lineData.push({ time, value: price });
            if (i === projectTo) {
              finalTime = time;
              finalPrice = price;
            }
          }
        }

        this.structureExtensionSeries.setData(lineData);

        if (finalTime && finalPrice) {
          const diff = finalPrice - currentPrice;
          const pct = ((diff / currentPrice) * 100).toFixed(2);
          const isBull = diff >= 0;

          this.structureExtensionSeries.setMarkers([{
            time: finalTime,
            position: isBull ? 'aboveBar' : 'belowBar',
            color: isBull ? '#10b981' : '#f43f5e',
            shape: isBull ? 'arrowUp' : 'arrowDown',
            text: `Prediction: ${diff >= 0 ? '+' : ''}${pct}%`
          }]);
        } else {
          this.structureExtensionSeries.setMarkers([]);
        }
      } else {
        this.structureExtensionSeries.setData([]);
        this.structureExtensionSeries.setMarkers([]);
      }
    } else if (this.structureExtensionSeries) {
      this.structureExtensionSeries.setData([]);
      this.structureExtensionSeries.setMarkers([]);
    }

    if (patterns.fibonacci?.goldenPocket?.isActive) {
      const gpTop = patterns.fibonacci.goldenPocket.top;
      const gpLine = this.candlestickSeries.createPriceLine({
        price: gpTop,
        color: '#eab308',
        lineWidth: 2,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `FIB GOLDEN POCKET ($${gpTop})`
      });
      this.patternPriceLines.push(gpLine);
    }

    // Render Geometric Chart Patterns (Double Top/Bottom, H&S, Wedges, Triangles, Rectangles, Pennants)
    (patterns.chartPatterns || []).forEach(cp => {
      const isBull = cp.type === 'BULLISH';
      const patColor = isBull ? '#00e676' : '#ff1744';



      // Add a pattern marker on the latest pivot/candle
      const markTime = cp.points && cp.points.length > 0
        ? cp.points[cp.points.length - 1].time
        : (this.currentCandles.length > 0 ? this.currentCandles[this.currentCandles.length - 1].time : null);

      if (markTime) {
        extraMarkers.push({
          time: markTime,
          position: isBull ? 'belowBar' : 'aboveBar',
          color: patColor,
          shape: isBull ? 'arrowUp' : 'arrowDown',
          text: `[PATTERN] ${cp.name}`
        });
      }
    });

    // Render AI Prediction
    if (!this.aiPredictionSeries) {
      this.aiPredictionSeries = this.chart.addLineSeries({
        lineWidth: 3,
        lineStyle: LineStyle.Dashed,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false
      });
    }

    if (patterns.prediction && patterns.prediction.direction !== 'NEUTRAL' && this.currentCandles && this.currentCandles.length > 0) {
      const pred = patterns.prediction;
      const isUp = pred.direction === 'UP';
      const color = isUp ? '#00e676' : '#ff1744';

      this.aiPredictionSeries.applyOptions({ color });

      const lastCandle = this.currentCandles[this.currentCandles.length - 1];
      const lineData = [];
      const startPrice = lastCandle.close;

      let avgBody = 0;
      const lookback = Math.min(14, this.currentCandles.length);
      for (let i = this.currentCandles.length - lookback; i < this.currentCandles.length; i++) {
        avgBody += Math.abs(this.currentCandles[i].close - this.currentCandles[i].open);
      }
      avgBody = avgBody / lookback || (startPrice * 0.001);

      const steepnessFactor = Math.max(0.5, (pred.probability / 50));
      const slope = (isUp ? 1 : -1) * avgBody * steepnessFactor;

      const projectTo = 15; // 15 candles ahead
      const timeDiff = this.currentCandles.length > 1
        ? (typeof lastCandle.time === 'number' && typeof this.currentCandles[this.currentCandles.length - 2].time === 'number'
          ? lastCandle.time - this.currentCandles[this.currentCandles.length - 2].time
          : 3600)
        : 3600;

      for (let i = 0; i <= projectTo; i++) {
        let time = lastCandle.time;
        if (typeof time === 'number') {
          time = time + (timeDiff * i);
          lineData.push({ time, value: startPrice + (slope * i) });
        }
      }

      this.aiPredictionSeries.setData(lineData);

      if (lineData.length > 0) {
        const lastPoint = lineData[lineData.length - 1];
        this.aiPredictionSeries.setMarkers([{
          time: lastPoint.time,
          position: isUp ? 'belowBar' : 'aboveBar',
          color: color,
          shape: isUp ? 'arrowUp' : 'arrowDown',
          text: `PREDICTION: ${pred.direction} (${pred.probability}%)`
        }]);
      } else {
        this.aiPredictionSeries.setMarkers([]);
      }

    } else if (this.aiPredictionSeries) {
      this.aiPredictionSeries.setData([]);
      this.aiPredictionSeries.setMarkers([]);
    }

    this.currentPatternMarkers = extraMarkers;
    this.combineAndSetMarkers();
  }

  focusLine(targetLine) {
    if (!targetLine || !this.chart || !this.candlestickSeries) return;

    const priceKey = targetLine.price.toFixed(2);
    this.extendedPriceKeys.add(priceKey);

    if (this.lastSRData) {
      this.lastSRData.showSupport = true;
      this.lastSRData.showResistance = true;
      this.renderSRLines(this.lastSRData);
    }

    const bounceTime = (targetLine.bounceDetails && targetLine.bounceDetails.length > 0)
      ? targetLine.bounceDetails[targetLine.bounceDetails.length - 1].time
      : (this.currentCandles.length > 0 ? this.currentCandles[this.currentCandles.length - 1].time : null);

    if (bounceTime && this.currentCandles.length > 0) {
      const candleIndex = this.currentCandles.findIndex(c => c.time === bounceTime);
      if (candleIndex !== -1) {
        const fromIdx = Math.max(0, candleIndex - 20);
        const toIdx = Math.min(this.currentCandles.length - 1 + 10, candleIndex + 20);
        try {
          this.chart.timeScale().setVisibleLogicalRange({
            from: fromIdx,
            to: toIdx
          });
        } catch (e) {
          console.warn('TimeScale focus warning:', e);
        }
      }
    }

    const markerTime = bounceTime || (this.currentCandles.length > 0 ? this.currentCandles[this.currentCandles.length - 1].time : null);
    if (markerTime) {
      const isSup = targetLine.type === 'SUPPORT';
      const focusMarker = {
        time: markerTime,
        position: isSup ? 'belowBar' : 'aboveBar',
        color: isSup ? '#00e676' : '#ff1744',
        shape: 'arrowRight',
        text: `FOCUS: ${targetLine.type} ($${targetLine.price.toFixed(4)})`
      };
      this.candlestickSeries.setMarkers([focusMarker]);
    }
  }

  focusPattern(pattern) {
    if (!pattern || !this.chart || !this.candlestickSeries || !this.currentCandles || this.currentCandles.length === 0) return;

    // Use pivot start/end point times, or falling/rising window/candle index times
    let targetTime = null;
    if (pattern.points && pattern.points.length > 0) {
      targetTime = pattern.points[0].time;
    } else if (pattern.time) {
      targetTime = pattern.time;
    }

    if (!targetTime) return;

    const candleIndex = this.currentCandles.findIndex(c => c.time === targetTime);
    if (candleIndex !== -1) {
      const fromIdx = Math.max(0, candleIndex - 12);
      const toIdx = Math.min(this.currentCandles.length - 1 + 10, candleIndex + 30);
      try {
        this.chart.timeScale().setVisibleLogicalRange({
          from: fromIdx,
          to: toIdx
        });

        // Set visual focus marker
        const focusMarker = {
          time: targetTime,
          position: pattern.type === 'BULLISH' ? 'belowBar' : 'aboveBar',
          color: pattern.type === 'BULLISH' ? '#00e676' : '#ff1744',
          shape: 'arrowRight',
          text: `FOCUS: ${pattern.name}`
        };
        this.candlestickSeries.setMarkers([focusMarker]);
      } catch (e) {
        console.warn('TimeScale pattern focus warning:', e);
      }
    }
  }

  renderAITradeOverlay(aiData) {
    this.clearAITradeOverlay();
    if (!aiData || !this.candlestickSeries || !this.currentCandles || this.currentCandles.length === 0) return;

    const livePrice = this.currentCandles[this.currentCandles.length - 1].close;
    const lastCandle = this.currentCandles[this.currentCandles.length - 1];

    const aiMarkers = [
      {
        time: lastCandle.time,
        position: 'aboveBar',
        color: '#00e5ff',
        shape: 'arrowDown',
        text: `📍 WE ARE HERE ($${livePrice.toFixed(4)})`
      }
    ];

    if (this.currentCandles.length > 5) {
      const entryCandle = this.currentCandles[this.currentCandles.length - 5];
      aiMarkers.push({
        time: entryCandle.time,
        position: 'belowBar',
        color: '#00e676',
        shape: 'arrowUp',
        text: `ENTRY ZONE ($${aiData.entryPrice})`
      });
    }

    this.candlestickSeries.setMarkers(aiMarkers);

    if (aiData.takeProfitPrice) {
      const tpLine = this.candlestickSeries.createPriceLine({
        price: aiData.takeProfitPrice,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `TARGET TP ($${aiData.takeProfitPrice.toFixed(4)})`
      });
      this.aiOverlayPriceLines.push(tpLine);
    }

    if (aiData.stopLossPrice) {
      const slLine = this.candlestickSeries.createPriceLine({
        price: aiData.stopLossPrice,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `STOP LOSS ($${aiData.stopLossPrice.toFixed(4)})`
      });
      this.aiOverlayPriceLines.push(slLine);
    }

    if (aiData.entryPrice) {
      const entryLine = this.candlestickSeries.createPriceLine({
        price: aiData.entryPrice,
        color: '#00e676',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `ENTRY ($${aiData.entryPrice.toFixed(4)})`
      });
      this.aiOverlayPriceLines.push(entryLine);
    }
  }

  clearAITradeOverlay() {
    this.aiOverlayPriceLines.forEach(line => {
      try { this.candlestickSeries.removePriceLine(line); } catch (e) { }
    });
    this.aiOverlayPriceLines = [];

    if (this.lastSRData) {
      this.renderSRLines(this.lastSRData);
    } else {
      this.candlestickSeries.setMarkers([]);
    }
  }

  setupInteractiveLineTouch() {
    if (!this.chart || this.hasClickSubscription) return;
    this.hasClickSubscription = true;

    this.chart.subscribeClick((param) => {
      if (!param || !param.point || !this.lastSRData) return;

      const mousePrice = this.candlestickSeries.coordinateToPrice(param.point.y);
      if (!mousePrice) return;

      const activeLines = [
        ...(this.lastSRData.showSupport ? this.lastSRData.supportLines || [] : []),
        ...(this.lastSRData.showResistance ? this.lastSRData.resistanceLines || [] : [])
      ];

      let matchedLine = null;
      for (const l of activeLines) {
        const diffPct = (Math.abs(mousePrice - l.price) / l.price) * 100;
        if (diffPct <= 3.5) {
          matchedLine = l;
          break;
        }
      }

      if (matchedLine) {
        const priceKey = matchedLine.price.toFixed(2);
        if (this.extendedPriceKeys.has(priceKey)) {
          this.extendedPriceKeys.delete(priceKey);
        } else {
          this.extendedPriceKeys.add(priceKey);
        }
        this.renderSRLines(this.lastSRData);
      }
    });
  }

  setZoomPercentage(pct) {
    if (!this.chart || !this.candlestickSeries) return;
    const timeScale = this.chart.timeScale();
    const clampedPct = Math.max(20, Math.min(200, pct));
    const defaultLogicalRange = 60;
    const targetBars = Math.round(defaultLogicalRange * (100 / clampedPct));

    timeScale.setVisibleLogicalRange({
      from: Math.max(0, this.currentCandles.length - targetBars),
      to: this.currentCandles.length + 5
    });
  }

  getUserAnnotations() {
    if (!this.drawingEngine) return [];
    return this.drawingEngine.getDrawings() || [];
  }

  setUserAnnotations(annotations) {
    if (!this.drawingEngine) return;
    try {
      this.drawingEngine.drawings = Array.isArray(annotations) ? annotations : [];
      this.drawingEngine._scheduleRender();
    } catch (e) {
      console.warn("Failed to set user annotations", e);
    }
  }
}
