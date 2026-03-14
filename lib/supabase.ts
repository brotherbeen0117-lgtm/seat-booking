import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yddhhyfxmhlrgdqbqkgy.supabase.co';
const supabaseKey = 'sb_publishable_88_1hdWbKUq1cKWn-yLktQ_LsZd6x7b';

export const supabase = createClient(supabaseUrl, supabaseKey);