/**
 * Crypto Data API Service - Enterprise Edition with Dynamic Timeframe Aggregation
 * Features:
 * 1. Supports Preset Timeframes (5m, 15m, 1H, 4H, 1D) AND Custom Dynamic Timeframes (Minutes, Hours, Days, Months, Years).
 * 2. Automatic OHLCV Candle Aggregator for non-standard custom timeframes (e.g. 2H, 3D, 1M, 1Y).
 * 3. Client-side In-Memory Cache & In-flight Deduplication.
 * 4. Multi-Tier Exchange Failover (OKX -> Binance -> CryptoCompare -> Synthetic Fallback).
 */

export const POPULAR_PAIRS = [
  { symbol: 'PI-USDT', name: 'Pi Network (PI/USDT)', provider: 'okx', defaultPrice: 1.85 },
  { symbol: 'BTC-USDT', name: 'Bitcoin (BTC/USDT)', provider: 'binance', defaultPrice: 65000 },
  { symbol: 'ETH-USDT', name: 'Ethereum (ETH/USDT)', provider: 'binance', defaultPrice: 3450 },
  { symbol: 'SOL-USDT', name: 'Solana (SOL/USDT)', provider: 'binance', defaultPrice: 145 },
  { symbol: 'XRP-USDT', name: 'Ripple (XRP/USDT)', provider: 'binance', defaultPrice: 0.58 },
  { symbol: 'DOGE-USDT', name: 'Dogecoin (DOGE/USDT)', provider: 'binance', defaultPrice: 0.12 }
];

export const TIMEFRAMES = [
  { label: '5m', okx: '5m', binance: '5m', cryptocompare: 'minute', aggregate: 5, seconds: 300 },
  { label: '15m', okx: '15m', binance: '15m', cryptocompare: 'minute', aggregate: 15, seconds: 900 },
  { label: '1H', okx: '1H', binance: '1h', cryptocompare: 'hour', aggregate: 1, seconds: 3600 },
  { label: '4H', okx: '4H', binance: '4h', cryptocompare: 'hour', aggregate: 4, seconds: 14400 },
  { label: '1D', okx: '1D', binance: '1d', cryptocompare: 'day', aggregate: 1, seconds: 86400 }
];

/**
 * Parse any preset or custom dynamic timeframe label (e.g., "30m", "2H", "3D", "1M", "1Y")
 */
export function parseTimeframe(label = '1H') {
  const preset = TIMEFRAMES.find(t => t.label.toLowerCase() === label.toLowerCase());
  if (preset) return preset;

  const match = label.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (match) {
    const val = parseInt(match[1], 10) || 1;
    const unit = match[2].toLowerCase();

    let seconds = 3600;
    let okx = '1H';
    let binance = '1h';
    let cryptocompare = 'hour';
    let aggregate = val;
    let groupSize = 1;

    if (unit.startsWith('m') && !unit.includes('month') && !unit.includes('mth')) {
      seconds = val * 60;
      okx = val <= 15 ? `${val}m` : '15m';
      binance = `${val}m`;
      cryptocompare = 'minute';
    } else if (unit.startsWith('h')) {
      seconds = val * 3600;
      okx = val <= 4 ? `${val}H` : '4H';
      binance = val === 2 || val === 4 || val === 6 || val === 8 || val === 12 ? `${val}h` : '1h';
      if (val > 1) groupSize = val;
      cryptocompare = 'hour';
    } else if (unit.startsWith('d')) {
      seconds = val * 86400;
      okx = '1D';
      binance = '1d';
      if (val > 1) groupSize = val;
      cryptocompare = 'day';
    } else if (unit.startsWith('w')) {
      seconds = val * 604800;
      okx = '1D';
      binance = '1w';
      groupSize = val * 7;
      cryptocompare = 'day';
    } else if (unit.includes('mth') || unit.includes('month') || unit === 'mth') {
      seconds = val * 2592000;
      okx = '1D';
      binance = '1M';
      groupSize = val * 30;
      cryptocompare = 'day';
    } else if (unit.startsWith('y')) {
      seconds = val * 31536000;
      okx = '1D';
      binance = '1M';
      groupSize = val * 365;
      cryptocompare = 'day';
    }

    return {
      label,
      okx,
      binance,
      cryptocompare,
      aggregate,
      seconds,
      groupSize
    };
  }

  return TIMEFRAMES[2]; // Default 1H
}

/**
 * Dynamically aggregate base OHLCV candles into custom multi-period candle blocks
 */
function aggregateCandles(baseCandles, groupSize = 1) {
  if (!baseCandles || baseCandles.length === 0 || groupSize <= 1) {
    return baseCandles;
  }

  const aggregated = [];
  for (let i = 0; i < baseCandles.length; i += groupSize) {
    const chunk = baseCandles.slice(i, i + groupSize);
    if (chunk.length === 0) continue;

    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    const high = Math.max(...chunk.map(c => c.high));
    const low = Math.min(...chunk.map(c => c.low));
    const volume = chunk.reduce((sum, c) => sum + (c.volume || 0), 0);

    aggregated.push({
      time: chunk[0].time,
      open,
      high,
      low,
      close,
      volume
    });
  }
  return aggregated;
}

// In-Memory Cache (TTL: 10,000 ms)
const apiCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL_MS = 10000;

async function fetchOKXCandles(instId, bar = '1H', limit = 300) {
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OKX API HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json.code !== '0' || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error(`OKX API response error: ${json.msg || 'Empty data'}`);
  }

  return json.data.map(item => ({
    time: Math.floor(parseInt(item[0], 10) / 1000),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5] || 0)
  })).reverse();
}

async function fetchBinanceCandles(symbol, interval = '1h', limit = 300) {
  const cleanSymbol = symbol.replace('-', '');
  const url = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Binance returned empty candle array');
  }

  return data.map(item => ({
    time: Math.floor(item[0] / 1000),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5] || 0)
  }));
}

async function fetchCryptoCompareCandles(symbol, tfObj, limit = 300) {
  const coin = symbol.split('-')[0];
  const endpoint = tfObj.cryptocompare === 'day' ? 'histoday' : (tfObj.cryptocompare === 'hour' ? 'histohour' : 'histominute');
  const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${coin}&tsym=USDT&limit=${limit}&aggregate=${tfObj.aggregate || 1}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CryptoCompare HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json.Response === 'Error' || !json.Data || !Array.isArray(json.Data.Data)) {
    throw new Error(`CryptoCompare error: ${json.Message || 'No data'}`);
  }

  return json.Data.Data.map(item => ({
    time: item.time,
    open: parseFloat(item.open),
    high: parseFloat(item.high),
    low: parseFloat(item.low),
    close: parseFloat(item.close),
    volume: parseFloat(item.volumeto || item.volumefrom || 0)
  }));
}

export function generateSyntheticCandles(symbol = 'PI-USDT', timeframeSeconds = 3600, count = 300) {
  const pairConfig = POPULAR_PAIRS.find(p => p.symbol === symbol) || { defaultPrice: 2.5 };
  let basePrice = pairConfig.defaultPrice;
  
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let curTime = now - (count * timeframeSeconds);

  const supportLevel1 = basePrice * 0.92;
  const supportLevel2 = basePrice * 0.85;
  const resistanceLevel1 = basePrice * 1.08;
  const resistanceLevel2 = basePrice * 1.15;

  let currentClose = basePrice;

  for (let i = 0; i < count; i++) {
    let delta = (Math.random() - 0.495) * (basePrice * 0.012);

    if (Math.abs(currentClose - supportLevel1) < basePrice * 0.015) {
      if (Math.random() > 0.25) delta = Math.abs(delta) + (basePrice * 0.003);
    }
    if (Math.abs(currentClose - supportLevel2) < basePrice * 0.015) {
      if (Math.random() > 0.2) delta = Math.abs(delta) + (basePrice * 0.004);
    }
    if (Math.abs(currentClose - resistanceLevel1) < basePrice * 0.015) {
      if (Math.random() > 0.25) delta = -Math.abs(delta) - (basePrice * 0.003);
    }
    if (Math.abs(currentClose - resistanceLevel2) < basePrice * 0.015) {
      if (Math.random() > 0.2) delta = -Math.abs(delta) - (basePrice * 0.004);
    }

    const open = currentClose;
    let close = open + delta;
    if (close <= 0.0001) close = 0.01;

    let high = Math.max(open, close) + Math.random() * (basePrice * 0.006);
    let low = Math.min(open, close) - Math.random() * (basePrice * 0.006);

    if (i % 45 === 10 || i % 45 === 25 || i % 45 === 40) {
      low = Math.min(low, supportLevel1 * (1 + (Math.random() * 0.002 - 0.001)));
    }
    if (i % 55 === 12 || i % 55 === 30 || i % 55 === 48) {
      high = Math.max(high, resistanceLevel1 * (1 + (Math.random() * 0.002 - 0.001)));
    }

    const volume = Math.floor(Math.random() * 50000 + 10000);

    candles.push({
      time: curTime,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume
    });

    currentClose = close;
    curTime += timeframeSeconds;
  }

  return candles;
}

export async function getMarketCandles(symbol = 'PI-USDT', timeframeLabel = '1H', limit = 300) {
  const cacheKey = `${symbol}_${timeframeLabel}_${limit}`;
  const now = Date.now();

  // 1. Check TTL Cache
  if (apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 2. Check In-flight deduplication
  if (inFlightRequests.has(cacheKey)) {
    return await inFlightRequests.get(cacheKey);
  }

  // 3. Initiate fetch task
  const fetchPromise = (async () => {
    const tfObj = parseTimeframe(timeframeLabel);
    const fetchLimit = tfObj.groupSize ? limit * tfObj.groupSize : limit;
    let rawCandles = null;
    let source = '';

    // Try OKX
    if (symbol === 'PI-USDT' || symbol.startsWith('OKX')) {
      try {
        const candles = await fetchOKXCandles(symbol, tfObj.okx, Math.min(300, fetchLimit));
        rawCandles = candles;
        source = 'OKX Live REST API';
      } catch (e1) {
        console.warn('OKX API error:', e1.message);
      }
    }

    // Try Binance
    if (!rawCandles) {
      try {
        const candles = await fetchBinanceCandles(symbol, tfObj.binance, Math.min(500, fetchLimit));
        rawCandles = candles;
        source = 'Binance Live Public API';
      } catch (e2) {
        console.warn('Binance API error:', e2.message);
      }
    }

    // Try CryptoCompare
    if (!rawCandles) {
      try {
        const candles = await fetchCryptoCompareCandles(symbol, tfObj, Math.min(500, fetchLimit));
        rawCandles = candles;
        source = 'CryptoCompare Global Market API';
      } catch (e3) {
        console.warn('CryptoCompare API error:', e3.message);
      }
    }

    // Fallback
    if (!rawCandles) {
      rawCandles = generateSyntheticCandles(symbol, tfObj.seconds, limit);
      source = 'Simulated Market Feed (Fallback)';
    }

    // Apply Dynamic Candle Aggregation if custom multi-period specified
    const finalCandles = tfObj.groupSize ? aggregateCandles(rawCandles, tfObj.groupSize) : rawCandles;
    const result = { data: finalCandles, source: `${source} (${tfObj.label})` };

    // Save to Cache
    apiCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    const res = await fetchPromise;
    return res;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
