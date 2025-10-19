// This file contains the core configuration for connecting to Supabase.
// All other modules will import the supabaseClient from here.

const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI2Mzk4N30.i-C9kLSS_Y_sLg0z9lYjQuPoD6OfhkCtgTJ_VJSVc4'; // This key seems to have a slight difference from the one I had, using your latest.

const { createClient } = supabase;
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
