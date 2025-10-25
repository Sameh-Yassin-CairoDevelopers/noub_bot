/*
 * Filename: js/config.js
 * Version: NOUB 0.0.1 Eve Edition (Core Config - Complete)
 * Description: Contains application configuration and Supabase initialization.
*/

// NOTE: Please replace these placeholders with your actual Supabase URL and ANON KEY
const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllaWphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQzNTQ2NzIsImV4cCI6MjAxOTkzMDY3Mn0.Rj5H9S9P4qf1qKq1tN3nE0YqA5g5A5g5g5A5g5A5g5A5g'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabaseClient };
