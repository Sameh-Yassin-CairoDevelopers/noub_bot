
/*
 * Filename: js/config.js
 * Version: NOUB 0.0.4 (CORE CONFIG & TOKENOMICS)
 * Description: Contains application configuration, Supabase initialization, and core economic constants.
 * All internal exchange rates and costs are centralized here.
*/

// --- SUPABASE CONFIGURATION (You MUST replace these with your actual keys) ---
const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI0Mzk4N30.4AwNsECeQnRRJtnoDldYjQuPoD6OfhkCtgTJ_VJSVc4'; 

// --- ECONOMIC CONSTANTS (TOKENOMICS) ---
const TOKEN_RATES = {
    // Conversion Costs (Amount of ANKH required to BUY 1 unit of the other currency)
    ANKH_PER_PRESTIGE: 1000, // 1 Prestige (🐞) = 1000 Ankh (☥)
    ANKH_PER_TICKET: 100,    // 1 Spin Ticket (🎟️) = 100 Ankh (☥)
    ANKH_PER_BLESSING: 500,  // 1 Blessing (🗡️) = 500 Ankh (☥)
    
    // BASE LOOTBOX COSTS (Can be used as multipliers)
    PACK_PAPYRUS_COST: 250,
    PACK_CANOPIC_COST: 1000,
    
    // CONTRACTS & REWARDS
    CONTRACT_MAX_LEVEL: 10,
    CONTRACT_COMPLETION_BONUS_COUNT: 10, // Max 10 contracts for a bonus
};

// --- GAME ASSETS PATHS ---
const ASSET_PATHS = {
    DEFAULT_CARD: 'images/default_card.png',
    DEFAULT_ITEM: 'images/default_item.png',
    DEFAULT_BUILDING: 'images/default_building.png',
    
    // VISUAL BACKGROUNDS (To be finalized by you)
    BG_HOME: 'images/bgs/home_bg.jpg',
    BG_KVGAME: 'images/bgs/kvgame_bg.jpg',
    BG_ECONOMY: 'images/bgs/economy_bg.jpg',
};


const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export all constants and the client
export { supabaseClient, TOKEN_RATES, ASSET_PATHS, SUPABASE_URL };
