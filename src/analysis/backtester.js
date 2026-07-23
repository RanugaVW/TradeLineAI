import { getMarketCandles } from '../api/cryptoApi.js';
import { detectAllPatterns } from './patternEngine.js';

/**
 * Runs a simulated backtest over historical candles to test AI accuracy.
 * Yields periodically to prevent freezing the main UI thread.
 */
export async function runBacktest(symbol, timeframe, initialBalance = 1000) {
  // 1. Fetch maximum historical data (1000 candles)
  const result = await getMarketCandles(symbol, timeframe, 1000);
  const candles = result.data || [];
  
  if (candles.length < 200) {
    throw new Error('Not enough historical data to run backtest.');
  }

  const trades = [];
  let currentBalance = initialBalance;
  
  // We need at least 50 candles as context for the first analysis
  const contextWindow = 50; 
  let inTrade = false;
  let activeTrade = null;
  let maxDrawdown = 0;
  let peakBalance = initialBalance;

  for (let i = contextWindow; i < candles.length - 1; i++) {
    // Yield to browser every 50 iterations to keep UI responsive
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const currentCandle = candles[i];
    
    // Check if we hit SL or TP while in trade
    if (inTrade && activeTrade) {
      // Simplistic backtest logic: check if low breached SL or high breached TP1
      if (activeTrade.direction === 'BUY') {
        if (currentCandle.low <= activeTrade.stopLoss) {
          // Stopped out
          activeTrade.exitPrice = activeTrade.stopLoss;
          activeTrade.profitPercent = ((activeTrade.stopLoss - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
          activeTrade.result = 'LOSS';
          closeTrade(activeTrade);
        } else if (currentCandle.high >= activeTrade.tp1) {
          // Hit TP1 (for simplicity, we assume we exit all at TP1 in this backtest)
          activeTrade.exitPrice = activeTrade.tp1;
          activeTrade.profitPercent = ((activeTrade.tp1 - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
          activeTrade.result = 'WIN';
          closeTrade(activeTrade);
        }
      } else {
        // SELL / SHORT logic
        if (currentCandle.high >= activeTrade.stopLoss) {
          activeTrade.exitPrice = activeTrade.stopLoss;
          activeTrade.profitPercent = ((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice) * 100;
          activeTrade.result = 'LOSS';
          closeTrade(activeTrade);
        } else if (currentCandle.low <= activeTrade.tp1) {
          activeTrade.exitPrice = activeTrade.tp1;
          activeTrade.profitPercent = ((activeTrade.entryPrice - activeTrade.tp1) / activeTrade.entryPrice) * 100;
          activeTrade.result = 'WIN';
          closeTrade(activeTrade);
        }
      }
    }

    // If not in a trade, look for setups
    if (!inTrade) {
      const windowCandles = candles.slice(i - contextWindow, i + 1);
      const analysis = detectAllPatterns(windowCandles);
      
      const isStrongBuy = analysis.prediction?.direction === 'UP' && analysis.prediction?.score >= 20;
      const isStrongSell = analysis.prediction?.direction === 'DOWN' && analysis.prediction?.score <= -20;

      if (isStrongBuy || isStrongSell) {
        const entryPrice = currentCandle.close;
        const atr = calculateATR(windowCandles);
        
        let tp1, stopLoss;
        if (isStrongBuy) {
          tp1 = entryPrice + (atr * 2);
          stopLoss = entryPrice - (atr * 1.5);
        } else {
          tp1 = entryPrice - (atr * 2);
          stopLoss = entryPrice + (atr * 1.5);
        }

        activeTrade = {
          direction: isStrongBuy ? 'BUY' : 'SELL',
          entryTime: currentCandle.time,
          entryPrice,
          tp1,
          stopLoss,
          amountRisked: currentBalance * 0.05 // Risk 5% per trade
        };
        inTrade = true;
      }
    }
  }

  function closeTrade(trade) {
    const profitAmount = (trade.amountRisked * trade.profitPercent) / 100; // Simplified
    
    // Adjust balance based on profit/loss % of the capital risked
    const rawProfit = (trade.profitPercent / 100);
    // Assuming 5x leverage for realistic crypto simulation
    const leveragedProfit = rawProfit * 5;
    
    const tradePnl = trade.amountRisked * leveragedProfit;
    currentBalance += tradePnl;
    
    if (currentBalance > peakBalance) peakBalance = currentBalance;
    const drawdown = ((peakBalance - currentBalance) / peakBalance) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    trade.pnl = tradePnl;
    trades.push(trade);
    
    inTrade = false;
    activeTrade = null;
  }

  // Force close any open trade at the end of data
  if (inTrade && activeTrade) {
    const lastCandle = candles[candles.length - 1];
    activeTrade.exitPrice = lastCandle.close;
    activeTrade.profitPercent = activeTrade.direction === 'BUY' 
      ? ((lastCandle.close - activeTrade.entryPrice) / activeTrade.entryPrice) * 100
      : ((activeTrade.entryPrice - lastCandle.close) / activeTrade.entryPrice) * 100;
    activeTrade.result = activeTrade.profitPercent >= 0 ? 'WIN' : 'LOSS';
    closeTrade(activeTrade);
  }

  const wins = trades.filter(t => t.result === 'WIN').length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const totalProfitPercent = ((currentBalance - initialBalance) / initialBalance) * 100;

  return {
    initialBalance,
    finalBalance: currentBalance,
    totalProfitPercent,
    maxDrawdown,
    totalTrades: trades.length,
    wins,
    winRate,
    trades
  };
}

// Simple Average True Range (ATR) calculation for dynamic TP/SL
function calculateATR(candles, period = 14) {
  if (candles.length < period) return 0;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1]?.close || candles[i].open;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trSum += tr;
  }
  return trSum / period;
}
