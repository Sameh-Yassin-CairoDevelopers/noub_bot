/*
 * Filename: js/auth.js
 * Version: NOUB v1.5 (New Player Seeding & Leveling System)
 * Description: Authentication Module. Manages login, signup, and player state refreshing.
 * This version updates the new player seeding process to grant initial factories,
 * aligning with the new player progression and economy design.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI, showToast } from './ui.js';

// --- Module-level DOM References ---
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- STARTER PACK & FACTORY SEEDING CONSTANTS ---
const STARTER_NOUB_SCORE = 2000;
const STARTER_PRESTIGE = 10;
const STARTER_SPIN_TICKETS = 5;
const STARTER_ANKH_PREMIUM = 0;
// UPDATED: New players now start with only the three basic resource factories.
// These IDs must correspond to the IDs in your 'factories' table for:
// 1: Limestone Quarry, 2: Papyrus Field, 3: Clay Pit
const INITIAL_FACTORY_IDS = [1, 2, 3]; 


// --- Global Functions for Inline HTML Event Handlers ---

/**
 * Makes the registration form visible and hides the login form.
 * Exposed to the window object for use in 'onclick' attributes.
 */
export function showRegisterForm() {
    if (loginForm && registerForm) {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}
window.showRegisterForm = showRegisterForm;

/**
 * Makes the login form visible and hides the registration form.
 * Exposed to the window object for use in 'onclick' attributes.
 */
export function showLoginForm() {
    if (loginForm && registerForm) {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
}
window.showLoginForm = showLoginForm;


// --- Core Authentication and Seeding Logic ---

/**
 * Seeds the necessary initial data for a brand new player upon registration.
 * This function provides the starter currency pack and the initial set of factories.
 * @param {string} userId - The unique ID of the newly created user.
 * @returns {Promise<boolean>} - True if seeding was successful, false otherwise.
 */
async function seedNewPlayer(userId) {
    // 1. Define the initial currency and settings for the player's profile.
    const profileUpdate = {
        noub_score: STARTER_NOUB_SCORE,
        prestige: STARTER_PRESTIGE,
        spin_tickets: STARTER_SPIN_TICKETS,
        ankh_premium: STARTER_ANKH_PREMIUM,
        last_daily_spin: new Date().toISOString(),
        // Initialize new leveling system columns
        level: 1,
        xp: 0,
        xp_to_next_level: 100
    };
    
    const { error: profileError } = await api.updatePlayerProfile(userId, profileUpdate);
    if (profileError) {
        console.error("Failed to update profile with starter pack:", profileError);
        return false;
    }
    
    // 2. Create promises to insert the initial factories for the new player.
    const factoryPromises = INITIAL_FACTORY_IDS.map(factoryId => {
        return supabaseClient.from('player_factories').insert({
            player_id: userId,
            factory_id: factoryId,
            level: 1
        });
    });
    
    // 3. Execute all factory insertion promises in parallel for efficiency.
    await Promise.all(factoryPromises);
    
    // 4. Log this significant event in the player's activity log.
    await api.logActivity(userId, 'STARTER_PACK', `Received Starter Pack and initial factories.`);
    
    return true;
}

/**
 * Refreshes the player's entire client-side state from the database.
 * This function is critical for ensuring the UI is always in sync with the backend.
 */
export async function refreshPlayerState() {
    if (!state.currentUser) return;
    
    // Fetch all critical data simultaneously for maximum speed using Promise.all.
    const [profileResult, inventoryResult, consumablesResult, ucpResult, specializationsResult] = await Promise.all([
        api.fetchProfile(state.currentUser.id),
        api.fetchPlayerInventory(state.currentUser.id),
        api.fetchKVGameConsumables(state.currentUser.id),
        api.fetchUCPProtocol(state.currentUser.id),
        api.fetchPlayerSpecializations(state.currentUser.id) 
    ]);

    // Populate profile data
    if (!profileResult.error && profileResult.data) {
        state.playerProfile = profileResult.data;
        updateHeaderUI(state.playerProfile);
    } else {
        console.error("Error refreshing profile data:", profileResult.error);
    }
    
    // Populate inventory data
    if (!inventoryResult.error && inventoryResult.data) {
        state.inventory.clear();
        inventoryResult.data.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }

    // Populate consumables data
    if (!consumablesResult.error && consumablesResult.data) {
        state.consumables.clear();
        consumablesResult.data.forEach(item => {
            state.consumables.set(item.item_key, item.quantity);
        });
    }

    // Populate UCP protocol data
    if (!ucpResult.error && ucpResult.data) {
        state.ucp = new Map(); // Ensure ucp is a Map
        ucpResult.data.forEach(entry => {
            state.ucp.set(entry.section_key, entry.section_data);
        });
    }
    
    // Populate specializations data
    if (!specializationsResult.error && specializationsResult.data) {
        state.specializations = new Map();
        specializationsResult.data.forEach(spec => {
            state.specializations.set(spec.specialization_path_id, spec);
        });
    }
}


/**
 * Initializes the application after a successful login or session restoration.
 * @param {object} user - The Supabase user object.
 */
async function initializeApp(user) {
    state.currentUser = user;
    
    await refreshPlayerState();

    if (!state.playerProfile) {
        showToast("Critical error loading your profile data.", 'error'); 
        await logout();
        return;
    }
    
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    navigateTo('home-screen');
}

/**
 * Handles the user login process.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 */
async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) await initializeApp(data.user);
    return { data };
}

/**
 * Handles the new user registration process.
 * @param {string} email - The new user's email.
 * @param {string} password - The new user's password.
 * @param {string} username - The new user's chosen username.
 */
async function signUp(email, password, username) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });

    if (error) return { error };

    if (data.user) {
        // Seed the new player with starter items and factories
        await seedNewPlayer(data.user.id);
        
        showToast('Account created! Check your email to confirm, then log in.', 'success');
        return { message: 'Account created successfully!' };
    }
    
    return { error: { message: "Sign up successful, but could not retrieve user data." } };
}

/**
 * Logs the current user out and resets the application state.
 */
export async function logout() {
    await supabaseClient.auth.signOut();
    // Reset all client-side state
    state.currentUser = null;
    state.playerProfile = null;
    state.inventory.clear();
    state.consumables.clear();
    state.ucp.clear();
    if (state.specializations) {
        state.specializations.clear();
    }
    // Return to the authentication screen
    appContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    showLoginForm();
}

/**
 * Sets up event listeners for the login and registration forms.
 */
export function setupAuthEventListeners() {
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    
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
                // On successful signup, guide the user to the login form
                showLoginForm();
            }
            e.target.disabled = false;
        });
    }
}

/**
 * Checks for an active session when the application first loads.
 * If a session exists, it initializes the app; otherwise, it shows the login screen.
 */
export async function handleInitialSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        authOverlay.classList.remove('hidden');
    }
}
