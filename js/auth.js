/*
 * Filename: js/auth.js
 * Version: NOUB v1.9.1 (Post-Login Seeding Fix)
 * Description: Authentication Module. This version provides the definitive fix for the
 * new player seeding issue by moving the seeding logic (granting starter items/factories)
 * to the login process, ensuring it only runs after a user is fully authenticated.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI, showToast } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const STARTER_NOUB_SCORE = 2000;
const STARTER_PRESTIGE = 10;
const STARTER_SPIN_TICKETS = 5;
const INITIAL_FACTORY_IDS = [1, 2, 3]; 

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
 * This is now called ONLY after the first successful login.
 * @param {string} userId - The ID of the newly created user.
 * @returns {Promise<boolean>} - True if seeding was successful.
 */
async function seedNewPlayer(userId) {
    console.log(`Seeding new player: ${userId}`);
    // Update profile to grant starter currencies and set the is_new_player flag to false
    const profileUpdate = {
        noub_score: STARTER_NOUB_SCORE,
        prestige: STARTER_PRESTIGE,
        spin_tickets: STARTER_SPIN_TICKETS,
        is_new_player: false 
    };
    
    const { error: profileError } = await api.updatePlayerProfile(userId, profileUpdate);
    if (profileError) {
        console.error("Failed to update profile with starter pack:", profileError);
        return false;
    }
    
    // Grant the initial three factories
    const factoryPromises = INITIAL_FACTORY_IDS.map(factoryId => {
        return api.buildFactory(userId, factoryId);
    });
    
    const factoryResults = await Promise.all(factoryPromises);
    const factoryError = factoryResults.some(result => result.error);

    if (factoryError) {
        console.error("Failed to seed initial factories for new player:", factoryResults.map(r => r.error).filter(Boolean));
        return false;
    }
    
    await api.logActivity(userId, 'STARTER_PACK', `Received Starter Pack and initial factories.`);
    console.log(`Seeding successful for player: ${userId}`);
    return true;
}

/**
 * Refreshes the player's entire state from the database.
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

/**
 * Initializes the app for a logged-in user and handles new player seeding.
 */
async function initializeApp(user) {
    state.currentUser = user;
    
    const { data: profile } = await api.fetchProfile(user.id);

    if (profile && profile.is_new_player) {
        showToast("Welcome! Preparing your kingdom...", 'info');
        const seedSuccess = await seedNewPlayer(user.id);
        if (!seedSuccess) {
            showToast("Error setting up your account. Please contact support.", 'error');
            await logout();
            return;
        }
    }

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
    if (data.user) {
        await initializeApp(data.user);
    }
    return { data };
}

/**
 * Sign up function is simplified. It only creates the auth user.
 */
async function signUp(email, password, username) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });

    if (error) return { error };

    if (data.user) {
        showToast('Account created! Please check your email to confirm, then log in.', 'success');
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
            e.preventDefault();
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
            e.preventDefault();
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
