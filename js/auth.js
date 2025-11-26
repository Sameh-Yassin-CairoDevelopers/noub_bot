/*
 * Filename: js/auth.js
 * Version: NOUB v3.0.0 (Pure JS Seeding)
 * Description: 
 * Manages User Authentication and Initialization.
 * CRITICAL: Handles "Seeding" (Starter Pack) via explicit API calls 
 * to ensure the player has factories and currency upon first login.
 */

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI, showToast } from './ui.js';

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- GAME CONFIGURATION: STARTER PACK ---
const STARTER_CONFIG = {
    NOUB: 2000,
    PRESTIGE: 10,
    TICKETS: 5,
    FACTORIES: [1, 2, 3] // IDs for Limestone, Papyrus, Clay
};

// --- UI Toggles ---
export function showRegisterForm() {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
}
export function showLoginForm() {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
}
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;

/**
 * SEEDING PROTOCOL:
 * Grants initial assets to a new player using direct API calls.
 * This replaces SQL Triggers for better control and debugging.
 */
async function seedNewPlayer(userId) {
    console.log(`🌱 Seeding new player: ${userId}`);
    
    // 1. Grant Currency & Status
    const { error: profileError } = await api.updatePlayerProfile(userId, {
        noub_score: STARTER_CONFIG.NOUB,
        prestige: STARTER_CONFIG.PRESTIGE,
        spin_tickets: STARTER_CONFIG.TICKETS,
        level: 1,
        is_new_player: false // Mark as seeded
    });
    
    if (profileError) {
        console.error("Seeding Profile Error:", profileError);
        return false;
    }
    
    // 2. Construct Initial Factories
    // execute sequentially to ensure stability
    for (const factoryId of STARTER_CONFIG.FACTORIES) {
        await api.buildFactory(userId, factoryId);
    }
    
    await api.logActivity(userId, 'STARTER_PACK', `Kingdom established. Welcome, Scribe.`);
    return true;
}

/**
 * SYNC: Refreshes all local state from the database.
 */
export async function refreshPlayerState() {
    if (!state.currentUser) return;
    
    // Parallel Fetching for Performance
    const [profileResult, inventoryResult, consumablesResult, ucpResult, specializationsResult] = await Promise.all([
        api.fetchProfile(state.currentUser.id),
        api.fetchPlayerInventory(state.currentUser.id),
        api.fetchKVGameConsumables(state.currentUser.id),
        api.fetchUCPProtocol(state.currentUser.id),
        api.fetchPlayerSpecializations(state.currentUser.id) 
    ]);

    // Update State Objects
    if (profileResult.data) {
        state.playerProfile = profileResult.data;
        updateHeaderUI(state.playerProfile);
    }
    
    if (inventoryResult.data) {
        state.inventory.clear();
        inventoryResult.data.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }

    if (consumablesResult.data) {
        state.consumables.clear();
        consumablesResult.data.forEach(item => {
            state.consumables.set(item.item_key, item.quantity);
        });
    }

    if (ucpResult.data) {
        state.ucp.clear();
        ucpResult.data.forEach(entry => {
            state.ucp.set(entry.section_key, entry.section_data);
        });
    }
    
    if (specializationsResult.data) {
        state.specializations = new Map();
        specializationsResult.data.forEach(spec => {
            state.specializations.set(spec.specialization_path_id, spec);
        });
    }
}

/**
 * MAIN INIT: Handles the logic after a user is authenticated.
 */
async function initializeApp(user) {
    state.currentUser = user;
    
    // Check if profile exists (basic check)
    const { data: profile } = await api.fetchProfile(user.id);

    // Determine if Seeding is needed
    // Either profile is missing, or 'is_new_player' flag is true
    if (!profile || profile.is_new_player) {
        showToast("Initializing your legacy...", 'info');
        const success = await seedNewPlayer(user.id);
        if (!success) {
            showToast("Initialization failed. Please refresh.", 'error');
            return;
        }
    }

    // Load Game Data
    await refreshPlayerState();

    if (!state.playerProfile) {
        showToast("Network Error: Could not load profile.", 'error'); 
        return;
    }
    
    // Launch UI
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    navigateTo('home-screen');
}

// --- Auth Actions ---

async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) await initializeApp(data.user);
    return { data };
}

async function signUp(email, password, username) {
    // Only creates the Auth User. The Profile Trigger (SQL) handles the basic row creation,
    // and 'seedNewPlayer' (JS) handles the game data.
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });

    if (error) return { error };

    if (data.user) {
        showToast('Account created! Logging in...', 'success');
        // Auto-login after signup
        await initializeApp(data.user); 
        return { message: 'Success' };
    }
    
    return { error: { message: "Signup failed." } };
}

export async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload(); // Hard reset to clear all state
}

// --- Event Listeners ---

export function setupAuthEventListeners() {
    document.getElementById('login-button')?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.target.disabled = true;
        e.target.innerText = "Loading...";
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const { error } = await login(email, password);
        if (error) {
            document.getElementById('login-error').textContent = error.message;
            e.target.disabled = false;
            e.target.innerText = "Login";
        }
    });

    document.getElementById('register-button')?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.target.disabled = true;
        e.target.innerText = "Creating...";
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const username = document.getElementById('register-username').value;
        
        const { error } = await signUp(email, password, username);
        if (error) {
            document.getElementById('register-error').textContent = error.message;
            e.target.disabled = false;
            e.target.innerText = "Sign Up";
        }
    });
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
