/*
 * Filename: js/auth.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2
 * Description: Authentication Module. Manages login, signup, and player state refreshing.
 * CRITICAL FIX: refreshPlayerState now fetches player specializations to correctly display specialized factories.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- STARTER PACK & FACTORY SEEDING CONSTANTS ---
const STARTER_NOUB_SCORE = 2000;
const STARTER_PRESTIGE = 10;
const STARTER_SPIN_TICKETS = 5;
const STARTER_ANKH_PREMIUM = 0;
// NOTE: These IDs must correspond to the IDs in your 'factories' table
const INITIAL_FACTORY_IDS = [1, 2, 3, 4, 5, 6]; 


// Make these functions globally available for onclick attributes in index.html
export function showRegisterForm() {
    if (loginForm && registerForm) {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}
export function showLoginForm() {
    if (loginForm && registerForm) {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
}
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;


/**
 * Seeds the necessary initial data for a brand new player.
 * Called immediately after profile creation.
 */
async function seedNewPlayer(userId) {
    // 1. Grant Starter Currencies
    const profileUpdate = {
        noub_score: STARTER_NOUB_SCORE,
        prestige: STARTER_PRESTIGE,
        spin_tickets: STARTER_SPIN_TICKETS,
        ankh_premium: STARTER_ANKH_PREMIUM,
        last_daily_spin: new Date().toISOString(), 
    };
    
    const { error: profileError } = await api.updatePlayerProfile(userId, profileUpdate);
    if (profileError) {
        console.error("Failed to update profile with starter pack:", profileError);
        return false;
    }
    
    // 2. Seed Initial Factories
    const factoryPromises = INITIAL_FACTORY_IDS.map(factoryId => {
        return supabaseClient.from('player_factories').insert({
            player_id: userId,
            factory_id: factoryId,
            level: 1
        });
    });
    
    await Promise.all(factoryPromises);
    
    // 3. Log the starter pack action
    await api.logActivity(userId, 'STARTER_PACK', `Received Starter Pack: ${STARTER_NOUB_SCORE} NOUB, ${STARTER_PRESTIGE} Prestige, ${STARTER_SPIN_TICKETS} Spin Tickets.`);
    
    return true;
}

/**
 * Refreshes the player's entire state (profile, inventory, specializations, etc.)
 * from the database and updates the UI header.
 */
export async function refreshPlayerState() {
    if (!state.currentUser) return;
    
    // Fetch all critical data simultaneously for maximum speed
    const [profileResult, inventoryResult, consumablesResult, ucpResult, specializationsResult] = await Promise.all([
        api.fetchProfile(state.currentUser.id),
        api.fetchPlayerInventory(state.currentUser.id),
        api.fetchKVGameConsumables(state.currentUser.id),
        api.fetchUCPProtocol(state.currentUser.id),
        // CRITICAL: Fetch player's unlocked specializations
        api.fetchPlayerSpecializations(state.currentUser.id) 
    ]);

    // Profile Data
    if (!profileResult.error && profileResult.data) {
        state.playerProfile = profileResult.data;
        updateHeaderUI(state.playerProfile);
    } else {
        console.error("Error refreshing profile data.");
    }
    
    // Inventory Data
    if (!inventoryResult.error && inventoryResult.data) {
        state.inventory.clear();
        inventoryResult.data.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }

    // Consumables Data
    if (!consumablesResult.error && consumablesResult.data) {
        state.consumables.clear();
        consumablesResult.data.forEach(item => {
            state.consumables.set(item.item_key, item.quantity);
        });
    }

    // UCP Protocol Data
    if (!ucpResult.error && ucpResult.data) {
        state.ucp.clear();
        ucpResult.data.forEach(entry => {
            state.ucp.set(entry.section_key, entry.section_data);
        });
    }
    
    // Specializations Data
    if (!specializationsResult.error && specializationsResult.data) {
        state.specializations = new Map();
        specializationsResult.data.forEach(spec => {
            state.specializations.set(spec.specialization_path_id, spec);
        });
    }
}


async function initializeApp(user) {
    state.currentUser = user;
    
    await refreshPlayerState();

    if (!state.playerProfile) {
        // SECURITY FIX: Using showToast instead of alert
        showToast("Critical error loading your profile data.", 'error'); 
        await logout();
        return;
    }
    
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    navigateTo('home-screen');
}

async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) await initializeApp(data.user);
    return { data };
}

async function signUp(email, password, username) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });

    if (error) return { error };

    if (data.user) {
        // The new user row is created by a DB trigger.
        // We just need to seed it with starter data.
        await seedNewPlayer(data.user.id);
        
        // SECURITY FIX: Using showToast instead of alert
        showToast('Account created! Check your email to confirm, then log in.', 'success');
        return { message: 'Account created successfully!' };
    }
    
    return { error: { message: "Sign up successful, but could not retrieve user data." } };
}

export async function logout() {
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    state.playerProfile = null;
    state.inventory.clear();
    state.consumables.clear();
    state.ucp.clear();
    state.specializations.clear();
    appContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
}

export function setupAuthEventListeners() {
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    const logoutButton = document.getElementById('logout-btn');
    
    if (loginButton) {
        loginButton.addEventListener('click', async (e) => {
            e.target.disabled = true;
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            errorDiv.textContent = '';
            const { error } = await login(email, password);
            if (error) errorDiv.textContent = 'Login Error: ' + error.message;
            e.target.disabled = false;
        });
    }

    if (registerButton) {
        registerButton.addEventListener('click', async (e) => {
            e.target.disabled = true;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const username = document.getElementById('register-username').value;
            const errorDiv = document.getElementById('register-error');
            errorDiv.textContent = '';
            
            const result = await signUp(email, password, username);
            
            if (result.error) {
                errorDiv.textContent = 'Signup Error: ' + result.error.message;
            } else {
                // On success, switch to login form
                showLoginForm();
            }
            e.target.disabled = false;
        });
    }

    // Logout button is now on the profile screen, its event is attached there.
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
}

export async function handleInitialSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        authOverlay.classList.remove('hidden');
    }
}
