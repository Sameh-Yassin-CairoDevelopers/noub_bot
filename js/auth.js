import { supabaseClient } from './config.js';
import { state } from './state.js';
import { fetchProfile } from './api.js';
import { navigateTo, updateHeaderUI } from './ui.js';

const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');

async function initializeApp(user) {
    state.currentUser = user;
    
    let { data: profile, error } = await fetchProfile(user.id);

    if (error && error.code === 'PGRST116') {
        console.log('Profile not found, retrying in 1.5 seconds...');
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
    appContainer.classList.add('hidden');
    authOverlay.classList.remove('hidden');
}

export function setupAuthEventListeners() {
    // Login
    document.getElementById('login-button').addEventListener('click', async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        const { error } = await login(email, password);
        if (error) errorDiv.textContent = 'Login Error: ' + error.message;
    });

    // Sign Up
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

    // Logout
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