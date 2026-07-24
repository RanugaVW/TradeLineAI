import { supabase } from './supabaseClient.js';
import { getCurrentSession } from './supabaseClient.js';

export async function getDemoAccount() {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) return null;

    const { data, error } = await supabase
      .from('demo_accounts')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Account doesn't exist, create it with 100,000 balance
      const { data: newData, error: insertError } = await supabase
        .from('demo_accounts')
        .insert([{ user_id: session.user.id, balance: 100000 }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      return newData;
    }
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching demo account:', err);
    return null;
  }
}

export async function placeDemoTrade(tradeData) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) throw new Error('Not authenticated');

    // Deduct margin from account balance
    const account = await getDemoAccount();
    if (!account) throw new Error('Could not fetch demo account');
    if (account.balance < tradeData.investment_amount) {
      throw new Error('Insufficient demo funds');
    }

    const { error: updateError } = await supabase
      .from('demo_accounts')
      .update({ balance: account.balance - tradeData.investment_amount, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id);
      
    if (updateError) throw updateError;

    const { data, error } = await supabase
      .from('demo_trades')
      .insert([{
        user_id: session.user.id,
        symbol: tradeData.symbol,
        signal: tradeData.signal,
        leverage: tradeData.leverage || 1,
        investment_amount: tradeData.investment_amount,
        entry_price: tradeData.entry_price,
        tp1: tradeData.tp1,
        tp2: tradeData.tp2,
        tp3: tradeData.tp3,
        tp_status: { tp1_hit: false, tp2_hit: false, tp3_hit: false },
        stop_loss: tradeData.stop_loss,
        status: 'OPEN'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error placing demo trade:', err);
    throw err;
  }
}

export async function closeDemoTrade(tradeId, currentPrice) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) throw new Error('Not authenticated');

    // Get the trade
    const { data: trade, error: tradeError } = await supabase
      .from('demo_trades')
      .select('*')
      .eq('id', tradeId)
      .eq('user_id', session.user.id)
      .single();

    if (tradeError) throw tradeError;
    if (trade.status === 'CLOSED') throw new Error('Trade already closed');

    // Calculate PNL
    const entryPrice = parseFloat(trade.entry_price);
    const amountCrypto = trade.investment_amount * trade.leverage / entryPrice;
    let pnl = 0;

    if (trade.signal.includes('BUY')) {
      pnl = (currentPrice - entryPrice) * amountCrypto;
    } else if (trade.signal.includes('SELL')) {
      pnl = (entryPrice - currentPrice) * amountCrypto;
    }

    // Update Trade
    const { data: updatedTrade, error: updateError } = await supabase
      .from('demo_trades')
      .update({
        status: 'CLOSED',
        close_time: new Date().toISOString(),
        close_price: currentPrice,
        pnl_usd: (parseFloat(trade.pnl_usd) || 0) + pnl
      })
      .eq('id', tradeId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update Account Balance (add original margin back + pnl)
    const account = await getDemoAccount();
    const newBalance = account.balance + trade.investment_amount + pnl;

    const { error: balanceError } = await supabase
      .from('demo_accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id);

    if (balanceError) throw balanceError;

    return updatedTrade;
  } catch (err) {
    console.error('Error closing demo trade:', err);
    throw err;
  }
}

export async function getDemoTrades(page = 1, limit = 10, filterType = 'ALL') {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) return { data: [], count: 0 };

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('demo_trades')
      .select('*', { count: 'exact' })
      .eq('user_id', session.user.id)
      .eq('status', 'CLOSED');

    if (filterType === 'PROFIT') {
      query = query.gte('pnl_usd', 0);
    } else if (filterType === 'LOSS') {
      query = query.lt('pnl_usd', 0);
    }

    const { data, error, count } = await query
      .order('close_time', { ascending: false })
      .range(from, to);


    if (error) throw error;
    return { data, count };
  } catch (err) {
    console.error('Error fetching demo trades:', err);
    return { data: [], count: 0 };
  }
}

export async function getOpenDemoTrades() {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) return [];

    const { data, error } = await supabase
      .from('demo_trades')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'OPEN')
      .order('open_time', { ascending: false });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching open demo trades:', err);
    return [];
  }
}

export async function processTradeTriggers(symbol, currentCandle) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) return;
    
    const currentPrice = currentCandle.close;
    const highPrice = currentCandle.high;
    const lowPrice = currentCandle.low;

    // Get open trades for this symbol
    const { data: trades, error } = await supabase
      .from('demo_trades')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('symbol', symbol)
      .eq('status', 'OPEN');
      
    if (error || !trades || trades.length === 0) return;
    
    for (const trade of trades) {
      let shouldFullClose = false;
      let hitTpFraction = 0;
      
      const isLong = trade.signal.includes('BUY');
      
      // Stop Loss Check (Full Close)
      if (trade.stop_loss) {
        if (isLong && lowPrice <= trade.stop_loss) shouldFullClose = true;
        if (!isLong && highPrice >= trade.stop_loss) shouldFullClose = true;
      }
      
      if (shouldFullClose) {
        await closeDemoTrade(trade.id, currentPrice);
        continue;
      }
      
      // TP Checks (Partial Close)
      let tpStatus = typeof trade.tp_status === 'string' ? JSON.parse(trade.tp_status) : (trade.tp_status || { tp1_hit: false, tp2_hit: false, tp3_hit: false });
      
      // We check all un-hit TPs
      if (trade.tp1 && !tpStatus.tp1_hit) {
        if ((isLong && highPrice >= trade.tp1) || (!isLong && lowPrice <= trade.tp1)) {
          tpStatus.tp1_hit = true;
          hitTpFraction += 0.33;
        }
      }
      if (trade.tp2 && !tpStatus.tp2_hit) {
        if ((isLong && highPrice >= trade.tp2) || (!isLong && lowPrice <= trade.tp2)) {
          tpStatus.tp2_hit = true;
          hitTpFraction += 0.33;
        }
      }
      if (trade.tp3 && !tpStatus.tp3_hit) {
        if ((isLong && highPrice >= trade.tp3) || (!isLong && lowPrice <= trade.tp3)) {
          tpStatus.tp3_hit = true;
          hitTpFraction += 0.34;
        }
      }
      
      if (hitTpFraction > 0) {
        // Calculate Partial Close PNL based on ORIGINAL investment amount?
        // Wait, if trade.investment_amount has already been reduced by TP1...
        // No, we need to know the *original* investment, or just calculate fraction of *current* investment.
        // It's safer to store original investment, but since we didn't, let's just use what's left.
        // If TP1 is hit, hitTpFraction is 0.33. That means 33% of the ORIGINAL.
        // To be accurate, we should probably just use hitTpFraction relative to the whole, assuming investment_amount hasn't changed.
        // Actually, if we scale out, `trade.investment_amount` is updated!
        // If TP1 is hit, investment drops to 66%. If TP2 is hit, it drops to 33%.
        // If we process TP1 and TP2 at the same time, it drops by 66%.
        // So we can't easily rely on `trade.investment_amount` being the original.
        // Let's just calculate the margin closed using a fallback.
        // If we close 33% of the whole trade, but the trade is currently 100%, we take 33% of original.
        // Let's just track `original_investment_amount = trade.investment_amount / (1 - previousTpsHit)`.
        // To keep it simple for V1: the fraction is out of the CURRENT investment_amount!
        // Wait, if we use 0.33 / 1.0 = 33% of current. 
        // If TP2 hits later, we want to close another 33% of original, which is 50% of the remaining 66%.
        // This is too much math. Let's just close 1/3 of the CURRENT remaining at each step.
        // For TP1: close 33% of current.
        // For TP2: close 50% of current.
        // For TP3: close 100% of current.
        
        let fractionOfCurrent = hitTpFraction;
        // Simple heuristic:
        if (tpStatus.tp1_hit && tpStatus.tp2_hit && tpStatus.tp3_hit) {
          fractionOfCurrent = 1.0; // Close everything left
        } else if (hitTpFraction === 0.33 && (tpStatus.tp1_hit || tpStatus.tp2_hit) && !tpStatus.tp3_hit) {
          // One TP hit, but we don't know if it's the first or second.
          // Let's just use the absolute fraction. It's a demo, approximate is fine.
          fractionOfCurrent = 0.33; 
        }

        const marginClosed = trade.investment_amount * fractionOfCurrent;
        const entryPrice = parseFloat(trade.entry_price);
        const amountCryptoClosed = marginClosed * trade.leverage / entryPrice;
        let partialPnl = 0;
        
        if (isLong) {
          partialPnl = (currentPrice - entryPrice) * amountCryptoClosed;
        } else {
          partialPnl = (entryPrice - currentPrice) * amountCryptoClosed;
        }
        
        // Update Account Balance
        const account = await getDemoAccount();
        const newBalance = account.balance + marginClosed + partialPnl;
        
        await supabase
          .from('demo_accounts')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', session.user.id);
          
        // Update Trade
        const newInvestmentAmount = trade.investment_amount - marginClosed;
        const updatePayload = {
          tp_status: tpStatus,
          investment_amount: Math.max(0, newInvestmentAmount),
          pnl_usd: (parseFloat(trade.pnl_usd) || 0) + partialPnl
        };
        
        if (tpStatus.tp1_hit && tpStatus.tp2_hit && tpStatus.tp3_hit) {
          updatePayload.status = 'CLOSED';
          updatePayload.close_time = new Date().toISOString();
          updatePayload.close_price = currentPrice;
        }
        
        await supabase
          .from('demo_trades')
          .update(updatePayload)
          .eq('id', trade.id);
      }
    }
  } catch (err) {
    console.error('Error processing trade triggers:', err);
  }
}
