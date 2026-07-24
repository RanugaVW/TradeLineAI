import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDemoAccount, placeDemoTrade, closeDemoTrade, getDemoTrades } from '../api/demoTradeApi.js';
import { supabase, getCurrentSession } from '../api/supabaseClient.js';

// Mock the supabase client module
vi.mock('../api/supabaseClient.js', () => ({
  supabase: {
    from: vi.fn(),
  },
  getCurrentSession: vi.fn(),
}));

describe('demoTradeApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    getCurrentSession.mockResolvedValue({
      user: { id: 'test-user-id' }
    });
  });

  describe('getDemoAccount', () => {
    it('should return existing demo account', async () => {
      const mockAccount = { id: '1', user_id: 'test-user-id', balance: 100000 };
      
      const singleMock = vi.fn().mockResolvedValue({ data: mockAccount, error: null });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getDemoAccount();
      expect(result).toEqual(mockAccount);
      expect(supabase.from).toHaveBeenCalledWith('demo_accounts');
      expect(selectMock).toHaveBeenCalledWith('*');
      expect(eqMock).toHaveBeenCalledWith('user_id', 'test-user-id');
    });

    it('should create new demo account if PGRST116 (Not Found) occurs', async () => {
      const singleMockFail = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      const eqMock = vi.fn().mockReturnValue({ single: singleMockFail });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      
      const newAccount = { id: '2', user_id: 'test-user-id', balance: 100000 };
      const singleMockSuccess = vi.fn().mockResolvedValue({ data: newAccount, error: null });
      const selectMockSuccess = vi.fn().mockReturnValue({ single: singleMockSuccess });
      const insertMock = vi.fn().mockReturnValue({ select: selectMockSuccess });

      supabase.from.mockImplementation((table) => {
        if (table === 'demo_accounts') {
          // It's called twice, first for select, then for insert
          // We can return an object that handles both depending on what's called
          return {
            select: selectMock,
            insert: insertMock
          };
        }
      });

      const result = await getDemoAccount();
      expect(result).toEqual(newAccount);
      expect(insertMock).toHaveBeenCalledWith([{ user_id: 'test-user-id', balance: 100000 }]);
    });
  });

  describe('placeDemoTrade', () => {
    it('should deduct margin and create a trade', async () => {
      // Mock getDemoAccount by mocking supabase calls it uses
      const mockAccount = { id: '1', user_id: 'test-user-id', balance: 100000 };
      const singleMockSelect = vi.fn().mockResolvedValue({ data: mockAccount, error: null });
      const eqMockSelect = vi.fn().mockReturnValue({ single: singleMockSelect });
      const selectMockSelect = vi.fn().mockReturnValue({ eq: eqMockSelect });
      
      // Mock account update
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      
      // Mock trade insert
      const mockTrade = { id: 't1', symbol: 'BTC/USD', status: 'OPEN' };
      const singleMockInsert = vi.fn().mockResolvedValue({ data: mockTrade, error: null });
      const selectMockInsert = vi.fn().mockReturnValue({ single: singleMockInsert });
      const insertMock = vi.fn().mockReturnValue({ select: selectMockInsert });

      supabase.from.mockImplementation((table) => {
        if (table === 'demo_accounts') {
          return {
            select: selectMockSelect,
            update: updateMock,
          };
        }
        if (table === 'demo_trades') {
          return {
            insert: insertMock
          };
        }
      });

      const tradeData = {
        symbol: 'BTC/USD',
        signal: 'BUY',
        leverage: 10,
        investment_amount: 5000,
        entry_price: 60000
      };

      const result = await placeDemoTrade(tradeData);
      expect(result).toEqual(mockTrade);
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        balance: 95000 // 100000 - 5000
      }));
    });

    it('should throw error if insufficient funds', async () => {
      const mockAccount = { id: '1', user_id: 'test-user-id', balance: 1000 };
      const singleMockSelect = vi.fn().mockResolvedValue({ data: mockAccount, error: null });
      const eqMockSelect = vi.fn().mockReturnValue({ single: singleMockSelect });
      const selectMockSelect = vi.fn().mockReturnValue({ eq: eqMockSelect });
      
      supabase.from.mockImplementation((table) => {
        if (table === 'demo_accounts') return { select: selectMockSelect };
      });

      const tradeData = { investment_amount: 5000 };

      await expect(placeDemoTrade(tradeData)).rejects.toThrow('Insufficient demo funds');
    });
  });

  describe('closeDemoTrade', () => {
    it('should calculate PNL and update trade and account balance', async () => {
      // 1. Get trade
      const mockTrade = { 
        id: 't1', user_id: 'test-user-id', status: 'OPEN', 
        entry_price: 50000, investment_amount: 1000, leverage: 10, signal: 'BUY' 
      };
      
      const singleMockTradeSelect = vi.fn().mockResolvedValue({ data: mockTrade, error: null });
      const eqMockTradeSelect2 = vi.fn().mockReturnValue({ single: singleMockTradeSelect });
      const eqMockTradeSelect1 = vi.fn().mockReturnValue({ eq: eqMockTradeSelect2 });
      const selectMockTradeSelect = vi.fn().mockReturnValue({ eq: eqMockTradeSelect1 });

      // 2. Update trade
      const updatedTrade = { ...mockTrade, status: 'CLOSED', pnl_usd: 1000 }; // (60000-50000) * (1000*10/50000) = 10000 * 0.2 = 2000
      const singleMockTradeUpdate = vi.fn().mockResolvedValue({ data: updatedTrade, error: null });
      const selectMockTradeUpdate = vi.fn().mockReturnValue({ single: singleMockTradeUpdate });
      const eqMockTradeUpdate = vi.fn().mockReturnValue({ select: selectMockTradeUpdate });
      const updateMockTrade = vi.fn().mockReturnValue({ eq: eqMockTradeUpdate });

      // 3. Get account
      const mockAccount = { id: '1', user_id: 'test-user-id', balance: 99000 };
      const singleMockAccountSelect = vi.fn().mockResolvedValue({ data: mockAccount, error: null });
      const eqMockAccountSelect = vi.fn().mockReturnValue({ single: singleMockAccountSelect });
      const selectMockAccountSelect = vi.fn().mockReturnValue({ eq: eqMockAccountSelect });

      // 4. Update account
      const updateMockAccount = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      supabase.from.mockImplementation((table) => {
        if (table === 'demo_trades') {
          return {
            select: selectMockTradeSelect,
            update: updateMockTrade
          };
        }
        if (table === 'demo_accounts') {
          return {
            select: selectMockAccountSelect,
            update: updateMockAccount
          };
        }
      });

      const currentPrice = 60000;
      // amountCrypto = 1000 * 10 / 50000 = 0.2
      // pnl = (60000 - 50000) * 0.2 = 2000
      
      const result = await closeDemoTrade('t1', currentPrice);
      
      expect(result).toEqual(updatedTrade);
      expect(updateMockTrade).toHaveBeenCalledWith(expect.objectContaining({
        status: 'CLOSED',
        close_price: 60000,
        pnl_usd: 2000
      }));
      // New balance = 99000 + 1000 (margin) + 2000 (pnl) = 102000
      expect(updateMockAccount).toHaveBeenCalledWith(expect.objectContaining({
        balance: 102000
      }));
    });
  });
});
