
/*
 * Filename: js/auth.js
 * Version: 16.0 (Refined UI)
 * Description: Authentication Module. Now manages the splash screen transition
 * and fixes the previously unresponsive sign-up button.
*/

import { supabaseClient } from './config.js';
import { state } from './state.js';
import { fetchProfile, fetchPlayerInventory } from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const splashScreen = document.getElementById('splash-screen');

/**
 * Waits for the splash screen animation to complete.
 */
async function waitForSplash() {
    if (state.isSplashFinished) {
        return Promise.resolve();
    }
    // If splash is not finished, wait for it
    return new Promise(resolve => {
        const check = setInterval(() => {
            if (state.isSplashFinished) {
                clearInterval(check);
                resolve();
            }
        }, 100);
    });
}

/**
 * Initializes the main application view after a successful login.
 * @param {object} user - The user object from Supabase Auth.
 */
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

    // Wait for splash screen to finish before showing the app
    await waitForSplash();
    
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

/**
 * Sets up event listeners for the authentication forms (login, signup, logout).
 */
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
 * Handles the initial splash screen and session check.
 */
export async function handleInitialSession() {
    // Start splash screen fade out after 2 seconds
    setTimeout(() => {
        splashScreen.style.opacity = '0';
        // After fade out, remove it and show auth screen
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            state.isSplashFinished = true;
            // Show auth screen only if no session is found later
        }, 500);
    }, 2000);

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await initializeApp(session.user);
    } else {
        await waitForSplash(); // Wait for splash to finish before showing login
        authOverlay.classList.remove('hidden');
    }
}
