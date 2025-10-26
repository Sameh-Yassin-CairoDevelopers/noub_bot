/*
 * Filename: js/screens/chat.js
 * Version: NOUB 0.0.1 Eve Edition (LAB TEST - DATA RENDER)
 * Description: Minimal code to test if the chat screen can render safely and fetch basic data.
 * This replaces the complex UCP logic for diagnostic purposes.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { navigateTo } from '../ui.js'; // Need navigateTo to return home

const CHAT_CONTAINER = document.getElementById('chat-screen');

export async function renderChat() {
    if (!state.currentUser) return;
    
    // 1. Fetch DOM Element safely (CRITICAL FIX)
    const chatMessagesContainer = document.getElementById('chat-messages'); 

    if (!CHAT_CONTAINER || !chatMessagesContainer) {
        console.error("CRITICAL: Chat screen container (#chat-screen or #chat-messages) not found in DOM.");
        // We cannot proceed if the container is missing, but we prevent further script errors.
        CHAT_CONTAINER.innerHTML = "<h2>Error: Chat Structure Missing.</h2>";
        return; 
    }
    
    // 2. Load basic user data for display
    await api.fetchProfile(state.currentUser.id); // Refresh profile if needed

    // 3. Build the test UI
    CHAT_CONTAINER.innerHTML = `
        <h2 style="margin-bottom: 20px;">Eve Interface Test (UCP)</h2>
        <div id="chat-messages" style="height: 200px; background: #333; padding: 10px; overflow-y: auto;">
             <!-- Message content moves here -->
             <p style="color: yellow;">TEST: DOM Container Rendered Safely.</p>
        </div>
        
        <div style="margin-top: 20px; padding: 10px; background: #1e1e1e; border-radius: 8px;">
            <h3>Profile Data Check:</h3>
            <p>Username: <b>${state.playerProfile.username || 'Loading...'}</b></p>
            <p>Ankh Balance: <b>${state.playerProfile.score || 0} ☥</b></p>
        </div>
        
        <button id="test-home-btn" class="action-button danger" style="margin-top: 30px;">Return to Home</button>
    `;
    
    // 4. Attach a simple listener
    document.getElementById('test-home-btn').onclick = () => {
         navigateTo('home-screen');
    };
    
    // Re-fetch the message container (as we just overwrote it) to ensure no errors if subsequent chat functions run.
    document.getElementById('chat-messages').innerHTML += `<p>Success: API Data Loaded.</p>`;
}
