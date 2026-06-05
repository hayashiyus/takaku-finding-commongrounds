import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase が設定済みか（未設定でもアプリは起動し、UIで案内する） */
export const supabaseReady = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseReady
  ? createClient(url as string, anonKey as string, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

if (!supabaseReady && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    '[takaku] Supabase 未設定です。takaku-app/.env.local に ' +
      'VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定して再起動してください。',
  );
}

/** 設定済み前提で client を取得（未設定なら例外） */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase が未設定です（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。');
  }
  return supabase;
}
