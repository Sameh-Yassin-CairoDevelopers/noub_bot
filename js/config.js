
/*
 * Filename: js/config.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (Exchange Rates Setup)
 * Description: Contains application configuration, Supabase initialization, and core economic constants.
 * FIXED: Added full definition of all currency items for exchange module coherence.
*/

// --- SUPABASE CONFIGURATION (You MUST replace these with your actual keys) ---
const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI0Mzk4N30.4AwNsECeQnRRJtnoDldYjQuPoD6OfhkCtgTJ_VJSVc4'; 

// --- ECONOMIC CONSTANTS (TOKENOMICS) ---
const TOKEN_RATES = {
    // Conversion Costs (Amount of NOUB required to BUY 1 unit of the other currency)
    NOUB_PER_PRESTIGE: 1000, // 1 Prestige (🐞) = 1000 NOUB (🪙)
    NOUB_PER_TICKET: 100,    // 1 Spin Ticket (🎟️) = 100 NOUB (🪙)
    NOUB_PER_ANKH_PREMIUM: 500,  // 1 Ankh Premium (☥) = 500 NOUB (🪙)
    
    // NEW: Conversion Rates for Exchange Module (Exchange rates are set in exchange.js)
    ANKH_TO_PRESTIGE_RATE: 0.5, // Example: 1 Ankh Premium = 0.5 Prestige
    PRESTIGE_TO_ANKH_RATE: 2.0, // Example: 1 Prestige = 2 Ankh Premium

    // BASE LOOTBOX COSTS (Can be used as multipliers)
    PACK_PAPYRUS_COST: 250,
    PACK_CANOPIC_COST: 1000,
    PACK_SARCOPHAGUS_COST: 5000,
    
    // CONTRACTS & REWARDS
    CONTRACT_MAX_LEVEL: 10,
    CONTRACT_COMPLETION_BONUS_COUNT: 10, // Max 10 contracts for a bonus
    CONTRACT_COMPLETION_BONUS_NOUB: 500, // Bonus reward
};

// --- GAME ASSETS PATHS ---
const ASSET_PATHS = {
    DEFAULT_CARD: 'images/default_card.png',
    DEFAULT_ITEM: 'images/default_item.png',
    DEFAULT_BUILDING: 'images/default_building.png',
    NOUB_ICON: 'images/noub_gold_coin.png', // Path to your NOUB image
    ANKH_PREMIUM_ICON: 'images/ankh_premium_key_of_life.png', // Path to your Ankh Premium image
    
    // VISUAL BACKGROUNDS
    BG_HOME: 'images/bgs/home_bg.jpg',
    BG_KVGAME: 'images/bgs/kvgame_bg.jpg',
    BG_ECONOMY: 'images/bgs/economy_bg.jpg',
    BG_COLLECTION_ALBUMS: 'images/bgs/cards_bg.jpg',
};

// --- NEW: Currency Definitions for Exchange Module ---
export const CURRENCY_MAP = {
    'NOUB': { key: 'noub_score', icon: '🪙', name: 'NOUB' },
    'ANKH': { key: 'ankh_premium', icon: '☥', name: 'Ankh Premium' },
    'PRESTIGE': { key: 'prestige', icon: '🐞', name: 'Prestige' },
    'TICKET': { key: 'spin_tickets', icon: '🎟️', name: 'Spin Ticket' },
};


const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export all constants and the client
export { supabaseClient, TOKEN_RATES, ASSET_PATHS, SUPABASE_URL };
