/**
 * Supabase Client & Auth Service
 * Project URL: https://sucurpxaeojyawgherrf.supabase.co
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 'https://sucurpxaeojyawgherrf.supabase.co';

// Public Anon / Publishable API Key
const SUPABASE_ANON_KEY = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY && !import.meta.env.VITE_SUPABASE_ANON_KEY.includes('placeholder'))
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : 'sb_publishable_aVSKZKqWpmq6aUNdQ13Ifw_caJ1d-VQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'crypto_portal_session_7d'
  }
});

/**
 * Realtime Database Subscriptions (Instant Frontend Updates on DB Changes)
 */
export function subscribeToProfileChanges(userId, onProfileUpdate) {
  if (!userId) return null;

  const channel = supabase
    .channel(`profile_changes_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`
      },
      (payload) => {
        if (payload.new && onProfileUpdate) {
          onProfileUpdate(payload.new);
        }
      }
    )
    .subscribe();

  return channel;
}

export function subscribeToAnnotationChanges(userId, symbol, onAnnotationUpdate) {
  if (!userId) return null;

  const channel = supabase
    .channel(`annotation_changes_${userId}_${symbol}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chart_annotations',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (payload.new && payload.new.symbol === symbol && onAnnotationUpdate) {
          onAnnotationUpdate(payload.new.annotation_data || []);
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * Auth Methods
 */
export async function signUpUser(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: window.location.origin
    }
  });
  if (error) throw error;

  // Ensure profile row created with metadata
  if (data.user) {
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        role: 'free',
        country_code: metadata.country_code || '',
        country_name: metadata.country_name || '',
        phone_number: metadata.phone_number || '',
        postal_code: metadata.postal_code || '',
        region: metadata.region || '',
        age: metadata.age || 18,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('Profile upsert note:', e.message);
    }
  }
  return data;
}

export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Signout note:', err.message);
  }
  try {
    localStorage.removeItem('crypto_portal_session_7d');
  } catch (e) {}
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function fetchUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Profile fetch note:', error.message);
      // Fallback default profile if schema not yet run
      return { id: userId, role: 'free' };
    }
    return data;
  } catch (err) {
    return { id: userId, role: 'free' };
  }
}

/**
 * Chart Annotation Methods (Save / Load user drawings per symbol)
 */
export async function saveUserAnnotations(userId, symbol, annotations) {
  if (!userId) throw new Error('User must be signed in to save annotations.');

  const { data, error } = await supabase
    .from('chart_annotations')
    .upsert({
      user_id: userId,
      symbol,
      annotation_data: annotations,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,symbol' });

  if (error) throw error;
  return data;
}

export async function loadUserAnnotations(userId, symbol) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('chart_annotations')
    .select('annotation_data')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.warn('Load annotations warning:', error.message);
    return [];
  }

  return data?.annotation_data || [];
}

/**
 * Admin Panel Methods (Role Management)
 */
export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId, newRole) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
  return data;
}
