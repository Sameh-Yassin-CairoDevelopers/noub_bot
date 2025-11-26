/*
 * Filename: js/auth.js
 * Version: NOUB v3.1.0 (Client-Side Profile Creation)
 * Description: 
 * Handles Auth & Initialization.
 * KEY CHANGE: explicitly INSERTS the profile row since SQL triggers are removed.
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
    FACTORIES: [1, 2, 3]
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
 * SEEDING PROTOCOL (Pure JS):
 * Creates the profile row AND grants starter assets.
 */
async function seedNewPlayer(user) {
    console.log(`🌱 Creating profile for: ${user.id}`);
    
    // 1. CREATE PROFILE ROW (Upsert handles insertion if missing)
    const { error: profileError } = await supabaseClient
        .from('profiles')
        .upsert({
            id: user.id,
            username: user.user_metadata?.username || 'Explorer',
            noub_score: STARTER_CONFIG.NOUB,
            prestige: STARTER_CONFIG.PRESTIGE,
            spin_tickets: STARTER_CONFIG.TICKETS,
            level: 1,
            created_at: new Date(),
            is_new_player: false // Mark as seeded immediately
        });
    
    if (profileError) {
        console.error("Profile Creation Error:", profileError);
        showToast("فشل إنشاء الملف الشخصي. حاول مجدداً.", 'error');
        return false;
    }
    
    // 2. Grant Initial Factories
    for (const factoryId of STARTER_CONFIG.FACTORIES) {
        await api.buildFactory(user.id, factoryId);
    }
    
    await api.logActivity(user.id, 'STARTER_PACK', `Kingdom established.`);
    return true;
}

/**
 * SYNC: Refreshes all local state.
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
 * MAIN INIT
 */
async function initializeApp(user) {
    state.currentUser = user;
    
    // Check if profile exists
    const { data: profile } = await api.fetchProfile(user.id);

    // If NO profile, creates one (First time login)
    if (!profile) {
        showToast("Initializing Kingdom...", 'info');
        const success = await seedNewPlayer(user);
        if (!success) return; // Stop if failed
    }

    await refreshPlayerState();

    if (!state.playerProfile) {
        // Fallback: If refresh failed but user exists, try seeding one last time
        await seedNewPlayer(user);
        await refreshPlayerState();
    }
    
    if (state.playerProfile) {
        authOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        navigateTo('home-screen');
    }
}

// --- Auth Actions ---

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
        // Force init to ensure profile creation happens NOW
        await initializeApp(data.user);
        return { message: 'Success' };
    }
    
    return { error: { message: "Signup failed." } };
}

export async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
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
