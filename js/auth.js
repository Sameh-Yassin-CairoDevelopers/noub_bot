/*
 * Filename: js/auth.js
 * Version: 17.0 (Stable & Splash-Screen-Removed)
 * Description: Authentication Module. All logic related to the splash screen
 * has been removed to ensure reliable and direct startup.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import { fetchProfile, fetchPlayerInventory } from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Make these functions globally available for onclick attributes in the auth overlay
window.showRegisterForm = function() {
    if (loginForm && registerForm) {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}
window.showLoginForm = function() {
    if (loginForm && registerForm) {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
}

async function initializeApp(user) {
    state.currentUser = user;
    
    // Fetch profile and inventory in parallel for faster loading
    const [profileResult, inventoryResult] = await Promise.all([
        fetchProfile(user.id),
        fetchPlayerInventory(user.id)
    ]);
    
    // Handle profile fetching result
    let { data: profile, error } = profileResult;
    if (error) {
        console.error("Critical error fetching profile:", error);
        alert("Critical error loading your profile data. Please try logging in again.");
        await logout();
        return;
    }
    state.playerProfile = profile;

    // Handle inventory fetching result
    const { data: inventoryData, error: inventoryError } = inventoryResult;
    if (inventoryError) {
        console.error("Error fetching inventory:", inventoryError);
    } else {
        state.inventory.clear();
        inventoryData.forEach(item => {
            state.inventory.set(item.item_id, { qty: item.quantity, details: item.items });
        });
    }
    
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
    document.getElementById('login-button').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        const { error } = await login(email, password);
        if (error) errorDiv.textContent = 'Login Error: ' + error.message;
        e.target.disabled = false;
    });

    document.getElementById('register-button').addEventListener('click', async (e) => {
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

    document.getElementById('logout-btn').addEventListener('click', logout);
}

/**
 * Checks for an active session and initializes the app or shows the login screen.
 * Simplified to remove all splash screen logic.
 */
export async function handleInitialSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        // If there's no session, the auth overlay is already visible by default.
        // No action needed.
    }
}
