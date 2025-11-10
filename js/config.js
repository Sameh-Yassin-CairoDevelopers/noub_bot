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
    // Your equation: 1 NOUB = 10000 Ankh, 1 NOUB = 20 Prestige, 1 NOUB = 200 Tickets.
    //
    EXCHANGE_RATES: {
        // Prestige (Khenfesha / Scarab)
        'PRESTIGE': {
            buy_from_noub_rate: 20,       // 1 NOUB buys 20 Prestige.
            sell_to_noub_rate: 20 / 0.8   // To get 0.8 NOUB, you need to sell 20 Prestige.
                                          // This means 25 Prestige = 1 NOUB (sell price)
        },
        // Ankh Premium
        'ANKH': {
            buy_from_noub_rate: 10000,    // 1 NOUB buys 10000 Ankh.
            sell_to_noub_rate: 10000 / 0.8 // To get 0.8 NOUB, you need to sell 10000 Ankh.
                                          // This means 12500 Ankh = 1 NOUB (sell price)
        },
        // Spin Ticket
        'TICKET': {
            buy_from_noub_rate: 200,      // 1 NOUB buys 200 Tickets.
            sell_to_noub_rate: 200 / 0.8  // To get 0.8 NOUB, you need to sell 200 Tickets.
                                          // This means 250 Tickets = 1 NOUB (sell price)
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
