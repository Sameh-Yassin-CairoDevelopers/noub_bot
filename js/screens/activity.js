/*
 * Filename: js/screens/activity.js
 * Version: NOUB 0.0.4 (ACTIVITY LOG SCREEN - FINAL CODE)
 * Description: View Logic Module for displaying player's transaction and action history.
 * Fetches data from the newly established 'activity_log' Supabase table.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

const activityContainer = document.getElementById('activity-screen'); 

/**
 * Renders the player's activity log.
 */
export async function renderActivity() {
    if (!state.currentUser) return;
    
    if (!activityContainer) {
        console.error("Activity container not found in DOM.");
        return;
    }

    activityContainer.innerHTML = '<h2>Activity Log</h2><div id="activity-list-container">Loading activity...</div>';
    
    const listContainer = document.getElementById('activity-list-container');
    
    // 1. Fetch Activity Data from Supabase
    const { data: activity, error } = await api.fetchActivityLog(state.currentUser.id);

    if (error || !activity) {
        listContainer.innerHTML = '<p class="error-message">Error loading activity log. (Check API connection and table existence)</p>';
        return;
    }

    if (activity.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No activities recorded yet.</p>';
        return;
    }

    // 2. Render List
    const activityListHTML = activity.map(entry => {
        let icon = '📝'; 
        let color = 'var(--text-secondary)';

        switch (entry.activity_type) {
            case 'EXCHANGE': icon = '🔄'; color = 'var(--ankh-color)'; break;
            case 'PURCHASE': icon = '💰'; color = 'var(--primary-accent)'; break;
            case 'UPGRADE': icon = '✨'; color = 'var(--success-color)'; break;
            case 'CONTRACT_COMPLETE': icon = '✅'; color = 'var(--success-color)'; break;
            case 'BURN': icon = '🔥'; color = 'var(--danger-color)'; break;
            case 'STARTER_PACK': icon = '🎁'; color = 'var(--rarity-legendary)'; break; // Use legend color for starter pack
            default: icon = 'ℹ️'; color = 'var(--text-secondary)'; break;
        }
        
        return `
            <li style="display: flex; justify-content: space-between; align-items: center; background: var(--surface-dark); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                <div style="font-size: 1.2em; margin-right: 15px; color: ${color}; flex-shrink: 0;">${icon}</div>
                <div style="flex-grow: 1; font-size: 0.9em;">
                    ${entry.description}
                </div>
                <div style="font-size: 0.7em; color: var(--text-secondary); flex-shrink: 0;">
                    ${new Date(entry.created_at).toLocaleTimeString()}
                </div>
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul style="list-style: none; padding: 0;">${activityListHTML}</ul>`;
}
// NO EXPORT HERE
