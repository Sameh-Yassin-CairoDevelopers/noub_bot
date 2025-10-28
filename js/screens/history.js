/*
 * Filename: js/screens/history.js
 * Version: NOUB 0.0.2 (HISTORY MODULE - FINAL CODE)
 * Description: View Logic Module for the Game History screen. 
 * Re-integrates the concept of tracking past KV Game expeditions using Supabase API.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

const historyContainer = document.getElementById('history-screen');

/**
 * Renders the player's game history (KV Game attempts).
 */
export async function renderHistory() {
    if (!state.currentUser) return;
    
    if (!historyContainer) {
        console.error("History container not found in DOM.");
        return;
    }

    historyContainer.innerHTML = '<h2>Game History (KV Expeditions)</h2><div id="history-list-container">Loading history...</div>';
    
    const listContainer = document.getElementById('history-list-container');
    
    // 1. Fetch History Data from Supabase
    const { data: history, error } = await api.fetchGameHistory(state.currentUser.id);

    if (error || !history) {
        listContainer.innerHTML = '<p class="error-message">Error loading game history. (Check API connection and table existence)</p>';
        return;
    }

    if (history.length === 0) {
        listContainer.innerHTML = '<p>No expeditions recorded yet. Start a KV Game!</p>';
        return;
    }

    // 2. Render List (Styled to be clean and mobile-friendly)
    const historyListHTML = history.map(entry => {
        const isWin = entry.result_status === 'Win';
        const resultColor = isWin ? 'var(--success-color)' : 'var(--danger-color)';
        const borderColor = isWin ? 'var(--primary-accent)' : '#7f8c8d';
        
        return `
            <li class="history-entry" style="border-left: 5px solid ${borderColor}; margin-bottom: 10px; padding: 10px; background: var(--surface-dark); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 1em; font-weight: bold;">
                        ${entry.game_type || 'KV Game'} - Level KV${entry.level_kv || '??'}
                    </div>
                    <span style="color: ${resultColor}; font-weight: bold;">
                        ${entry.result_status || 'Incomplete'}
                    </span>
                </div>
                <div style="font-size: 0.9em; color: var(--text-secondary); margin-top: 5px;">
                    <span style="margin-right: 15px;">Date: ${new Date(entry.date).toLocaleDateString()}</span>
                    <span>Time Spent: ${entry.time_taken || '--'}s</span>
                </div>
                ${entry.code ? `<div style="font-size: 0.8em; color: var(--primary-accent); margin-top: 5px;">Code: ${entry.code}</div>` : ''}
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul style="list-style: none; padding: 0;">${historyListHTML}</ul>`;
}
