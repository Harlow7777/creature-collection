import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

export const supabase = createClient(
  'REDACTED_SUPABASE_URL',
  'REDACTED_SUPABASE_ANON_KEY'
)