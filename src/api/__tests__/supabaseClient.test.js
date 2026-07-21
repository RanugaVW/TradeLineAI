import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signOutUser, supabase } from '../supabaseClient.js';

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } })
      }
    })
  };
});

describe('Supabase Client - signOutUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup fake localStorage
    const store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      removeItem: (key) => { delete store[key]; },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i]
    });
  });

  it('should call supabase auth signOut', async () => {
    await signOutUser();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('should clear all auth-related keys from localStorage', async () => {
    // Inject mock keys
    localStorage.setItem('crypto_portal_session_7d', 'mock_session');
    localStorage.setItem('sb-test-auth-token', 'mock_token');
    localStorage.setItem('tradeLine_sidebar_width', '150px'); // should be kept
    
    await signOutUser();
    
    expect(localStorage.getItem('crypto_portal_session_7d')).toBeNull();
    expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(localStorage.getItem('tradeLine_sidebar_width')).toBe('150px');
  });

  it('should not throw if supabase auth fails but still clear localStorage', async () => {
    supabase.auth.signOut.mockRejectedValueOnce(new Error('Network error'));
    
    localStorage.setItem('crypto_portal_session_7d', 'mock_session');
    
    // Should not throw
    await expect(signOutUser()).resolves.not.toThrow();
    
    // LocalStorage should still be cleared
    expect(localStorage.getItem('crypto_portal_session_7d')).toBeNull();
  });
});
