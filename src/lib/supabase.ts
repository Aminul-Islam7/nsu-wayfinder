import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnon);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnon) : null;

export const supabaseConfigError = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' + 'Set them in Vercel and local .env.local to load map data.';
