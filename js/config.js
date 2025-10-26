/*
 * Filename: js/config.js
 * Version: NOUB 0.0.1 Eve Edition (Core Config - Complete)
 * Description: Contains application configuration and Supabase initialization.
*/

// NOTE: Please replace these placeholders with your actual Supabase URL and ANON KEY
const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI0Mzk4N30.4AwNsECeQnRRJtnoDldYjQuPoD6OfhkCtgTJ_VJSVc4'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabaseClient };

