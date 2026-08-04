import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fngcjkclxxodjaiqkfkm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZ2Nqa2NseHhvZGphaXFrZmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTE4NzUsImV4cCI6MjA5MjU2Nzg3NX0.dpoNP8EO7iZCFP7dzjD33mCdiJ0gxl5lTl6-hPY0HH4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
