
/*
 * Filename: js/config.js
 * Version: Pharaoh's Legacy 'NOUB' v0.3 (Economy Overhaul)
 * Description: Contains application configuration, Supabase initialization, and core economic constants.
 * OVERHAUL: Implemented the definitive exchange rate structure with a 20% conversion loss.
 *           Updated TON packages to sell NOUB instead of Ankh Premium.
*/

// --- SUPABASE CONFIGURATION (You MUST replace these with your actual keys) ---
const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI0Mzk4N30.4AwNsECeQnRRJtnoDldYjQuPoD6OfhkCtgTJ_VJSVc4'; 

// --- ECONOMIC CONSTANTS (TOKENOMICS) ---
const TOKEN_RATES = {
    //
    // --- NEW: Definitive Exchange Rate System ---
    // This structure defines the cost in NOUB for buying/selling other currencies.
    // The 20% conversion loss is built into these rates.
    //
    EXCHANGE_RATES: {
        // Prestige (Khenfesha / Scarab)
        'PRESTIGE': {
            buy_for_noub: 1 / 20,       // Cost to buy 1 Prestige = 0.05 NOUB
            sell_for_noub: (1 / 20) * 0.8 // NOUB received for selling 1 Prestige = 0.04 NOUB (20% loss)
        },
        // Ankh Premium
        'ANKH': {
            buy_for_noub: 1 / 10000,    // Cost to buy 1 Ankh = 0.0001 NOUB
            sell_for_noub: (1 / 10000) * 0.8 // NOUB received for selling 1 Ankh = 0.00008 NOUB (20% loss)
        },
        // Spin Ticket
        'TICKET': {
            buy_for_noub: 1 / 200,      // Cost to buy 1 Ticket = 0.005 NOUB
            sell_for_noub: (1 / 200) * 0.8 // NOUB received for selling 1 Ticket = 0.004 NOUB (20% loss)
        }
    },
    
    // CONTRACTS & REWARDS (Legacy constants, can be adjusted)
    CONTRACT_MAX_LEVEL: 10,
    CONTRACT_COMPLETION_BONUS_COUNT: 10, 
    CONTRACT_COMPLETION_BONUS_NOUB: 500,
};

// --- NEW: NOUB Purchase Packages via TON ---
const NOUB_PACKAGES = [
    { name: 'Pharaoh\'s Favor', ton_amount: 1, noub_amount: 100 },
    { name: 'Vizier\'s Treasury', ton_amount: 5, noub_amount: 550 },
    { name: 'Blessing of the Nile', ton_amount: 10, noub_amount: 1200 }
];


// --- GAME ASSETS PATHS ---
const ASSET_PATHS = {
    DEFAULT_CARD: 'images/default_card.png',
    DEFAULT_ITEM: 'images/default_item.png',
    DEFAULT_BUILDING: 'images/default_building.png',
    NOUB_ICON: 'images/noub_gold_coin.png',
    ANKH_PREMIUM_ICON: 'images/ankh_premium_key_of_life.png',
    BG_HOME: 'images/bgs/home_bg.jpg',
    BG_KVGAME: 'images/bgs/kvgame_bg.jpg',
    BG_ECONOMY: 'images/bgs/economy_bg.jpg',
    BG_COLLECTION_ALBUMS: 'images/bgs/cards_bg.jpg',
};

// --- Currency Definitions for Exchange Module ---
export const CURRENCY_MAP = {
    'NOUB': { key: 'noub_score', icon: '🪙', name: 'NOUB' },
    'ANKH': { key: 'ankh_premium', icon: '☥', name: 'Ankh Premium' },
    'PRESTIGE': { key: 'prestige', icon: '🐞', name: 'Prestige' },
    'TICKET': { key: 'spin_tickets', icon: '🎟️', name: 'Spin Ticket' },
};


const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export all constants and the client
export { supabaseClient, TOKEN_RATES, NOUB_PACKAGES, ASSET_PATHS, SUPABASE_URL };
