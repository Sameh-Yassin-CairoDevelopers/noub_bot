/*
 * Filename: js/auth.js
 * Version: 20.7 (FINAL AUTH FIX - Complete)
 * Description: Authentication Module. FIXED: Added safety checks to event listeners.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import * as api from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Make these functions globally available for onclick attributes in the auth overlay
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
 * Refreshes the player's profile and inventory from the database
 */
export async function refreshPlayerState() {
    if (!state.currentUser) return;
    
    // Fetch fresh profile and inventory data simultaneously
    const [profileResult, inventoryResult] = await Promise.all([
        api.fetchProfile(state.currentUser.id),
        api.fetchPlayerInventory(state.currentUser.id)
    ]);

    // Update Profile State and UI
    if (!profileResult.error && profileResult.data) {
        state.playerProfile = profileResult.data;
        updateHeaderUI(state.playerProfile);
    } else {
        console.error("Error refreshing profile data.");
    }
    
    // Update Inventory State
    if (!inventoryResult.error && inventoryResult.data) {
        state.inventory.clear();
        inventoryResult.data.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }
}


async function initializeApp(user) {
    state.currentUser = user;
    
    await refreshPlayerState();

    if (!state.playerProfile) {
        alert("Critical error loading your profile data.");
        await logout();
        return;
    }
    
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
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
    // Fetching elements locally and applying safety checks
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
            const { error } = await signUp(email, password, username);
            if (error) {
                errorDiv.textContent = 'Signup Error: ' + error.message;
            } else {
                alert('Account created successfully! Please check your email for confirmation, then log in.');
                window.showLoginForm();
            }
            e.target.disabled = false;
        });
    }

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
