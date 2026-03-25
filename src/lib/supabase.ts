import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase environment variables are missing. Checkout your Vercel/Local environment.')
}

const finalUrl = supabaseUrl && supabaseUrl !== 'undefined' ? supabaseUrl : 'https://dummy.supabase.co';
const finalKey = supabaseAnonKey && supabaseAnonKey !== 'undefined' ? supabaseAnonKey : 'dummy-key-to-prevent-crash';

export const supabase = createClient(finalUrl, finalKey)
