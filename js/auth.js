/*
 * Filename: js/auth.js
 * Version: NOUB v1.8.0 (New Player Factory Seeding)
 * Description: Authentication Module. This version enhances the new player experience by
 * automatically seeding the three basic resource factories into a new player's account
 * upon successful registration, ensuring they can start the core gameplay loop immediately.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI, showToast } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- STARTER PACK & FACTORY SEEDING CONSTANTS ---
const STARTER_NOUB_SCORE = 2000;
const STARTER_PRESTIGE = 10;
const STARTER_SPIN_TICKETS = 5;
const STARTER_ANKH_PREMIUM = 0;
// These IDs MUST correspond to the basic resource factory IDs in your 'factories' table.
const INITIAL_FACTORY_IDS = [1, 2, 3]; 

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
 * NEW: This now includes granting the initial three resource factories.
 * @param {string} userId - The ID of the newly created user.
 * @returns {Promise<boolean>} - True if seeding was successful.
 */
async function seedNewPlayer(userId) {
    const profileUpdate = { /* ... */ };
    const { error: profileError } = await api.updatePlayerProfile(userId, profileUpdate);
    if (profileError) { /* ... */ }
    
    // DEFINITIVE FIX: Revert to seeding only the initial three factories.
    const INITIAL_FACTORY_IDS = [1, 2, 3]; 

    const factoryPromises = INITIAL_FACTORY_IDS.map(factoryId => {
        // Use the simple 'insert' now, as we are sure they are new.
        return api.supabaseClient.from('player_factories').insert({
            player_id: userId,
            factory_id: factoryId,
            level: 1
        });
    });
    
    const factoryResults = await Promise.all(factoryPromises);
    const factoryError = factoryResults.some(result => result.error);

    if (factoryError) {
        console.error("Failed to seed initial factories for new player:", factoryResults.map(r => r.error).filter(Boolean));
        // Note: In a production environment, you might want to roll back the profile update here.
        return false;
    }
    
    // 3. Log the starter pack activity
    await api.logActivity(userId, 'STARTER_PACK', `Received Starter Pack and initial factories.`);
    
    return true;
}

/**
 * Refreshes the player's entire state (profile, inventory, specializations, etc.)
 * from the database and updates the UI header.
 */
export async function refreshPlayerState() {
    if (!state.currentUser) return;
    
    const [profileResult, inventoryResult, consumablesResult, ucpResult, specializationsResult] = await Promise.all([
        api.fetchProfile(state.currentUser.id),
        api.fetchPlayerInventory(state.currentUser.id),
        api.fetchKVGameConsumables(state.currentUser.id),
        api.fetchUCPProtocol(state.currentUser.id),
        api.fetchPlayerSpecializations(state.currentUser.id) 
    ]);

    if (!profileResult.error && profileResult.data) {
        state.playerProfile = profileResult.data;
        updateHeaderUI(state.playerProfile);
    } else {
        console.error("Error refreshing profile data.");
    }
    
    if (!inventoryResult.error && inventoryResult.data) {
        state.inventory.clear();
        inventoryResult.data.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }

    if (!consumablesResult.error && consumablesResult.data) {
        state.consumables.clear();
        consumablesResult.data.forEach(item => {
            state.consumables.set(item.item_key, item.quantity);
        });
    }

    if (!ucpResult.error && ucpResult.data) {
        state.ucp.clear();
        ucpResult.data.forEach(entry => {
            state.ucp.set(entry.section_key, entry.section_data);
        });
    }
    
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
        // Seed the new player with starter items and factories
        const seedSuccess = await seedNewPlayer(data.user.id);
        
        if (seedSuccess) {
            showToast('Account created! Check your email to confirm, then log in.', 'success');
            return { message: 'Account created successfully!' };
        } else {
            return { error: { message: "Account created, but failed to grant starter items. Please contact support." } };
        }
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
    if (state.specializations) {
        state.specializations.clear();
    }
    appContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    showLoginForm();
}

export function setupAuthEventListeners() {
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    
    if (loginButton) {
        loginButton.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevent form submission
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
            e.preventDefault(); // Prevent form submission
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
                showLoginForm();
            }
            e.target.disabled = false;
        });
    }
}

export async function handleInitialSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        authOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
}

