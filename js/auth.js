
/*
 * Filename: js/auth.js
 * Version: 15.0 (Crafting Update & Complete)
 * Description: Authentication Module.
 * Now fetches and populates the player's inventory into the shared state upon login.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import { fetchProfile, fetchPlayerInventory } from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');

async function initializeApp(user) {
    state.currentUser = user;
    
    // Step 1: Fetch profile and handle potential trigger delay
    let { data: profile, error } = await fetchProfile(user.id);

    if (error && error.code === 'PGRST116') {
        console.log('Profile not found, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        const retryResult = await fetchProfile(user.id);
        profile = retryResult.data;
        error = retryResult.error;
    }

    if (error) {
        console.error("Critical error fetching profile:", error);
        alert("Critical error loading your profile data. Please try logging in again.");
        await logout();
        return;
    }
    state.playerProfile = profile;

    // Step 2: Fetch inventory and populate the state
    const { data: inventoryData, error: inventoryError } = await fetchPlayerInventory(user.id);
    if (inventoryError) {
        console.error("Error fetching inventory:", inventoryError);
    } else {
        state.inventory.clear();
        inventoryData.forEach(item => {
            state.inventory.set(item.item_id, item.quantity);
        });
    }
    
    // Step 3: Show the app and navigate to the home screen
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    updateHeaderUI();
    navigateTo('collection-screen');
}

async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) await initializeApp(data.user);
    return { data };
}

async function signUp(email, password, username) {
    return await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });
}

export async function logout() {
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    state.playerProfile = {};
    state.inventory.clear();
    appContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
}

export function setupAuthEventListeners() {
    document.getElementById('login-button').addEventListener('click', async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        const { error } = await login(email, password);
        if (error) errorDiv.textContent = 'Login Error: ' + error.message;
    });

    document.getElementById('register-button').addEventListener('click', async () => {
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const username = document.getElementById('register-username').value;
        const errorDiv = document.getElementById('register-error');
        errorDiv.textContent = '';
        const { error } = await signUp(email, password, username);
        if (error) {
            errorDiv.textContent = 'Signup Error: ' + error.message;
        } else {
            alert('Account created successfully! Please check your email for confirmation, then log in.');
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
}

export async function handleInitialSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        authOverlay.classList.remove('hidden');
    }
}
