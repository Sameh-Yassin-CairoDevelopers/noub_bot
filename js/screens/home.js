/*
 * Filename: js/screens/home.js
 * Version: 22.0 (Home Dashboard & Daily Quests - Complete)
 * Description: View Logic Module for the Home Dashboard.
 * Renders the daily quest summary upon screen load.
*/

import { state } from './state.js';
import * as api from './api.js';
import { showToast } from './ui.js';
import { fetchDailyQuests, completeDailyQuest } from '../contracts.js'; // Import quest logic

const dailyQuestsContainer = document.getElementById('daily-quests-container');

/**
 * Renders the daily quest summary cards on the home screen.
 */
export async function renderHome() {
    if (!state.currentUser) return;
    
    dailyQuestsContainer.innerHTML = 'Loading daily tasks...';

    // Fetch quest data (This function is implemented in contracts.js)
    const quests = await fetchDailyQuests();

    if (!quests || quests.length === 0) {
        dailyQuestsContainer.innerHTML = '<p class="screen-description">No daily tasks available. Check back tomorrow!</p>';
        return;
    }

    dailyQuestsContainer.innerHTML = '';
    
    quests.forEach(quest => {
        const isCompleted = quest.current >= quest.target;
        const card = document.createElement('div');
        card.className = 'daily-quest-card';
        card.innerHTML = `
            <div>
                <h4>${quest.title}</h4>
                <p style="font-size: 0.9em; color: ${isCompleted ? 'var(--success-color)' : 'var(--text-secondary)'};">
                    Progress: ${quest.current} / ${quest.target}
                </p>
            </div>
            <div style="text-align: right;">
                <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${Math.min(100, (quest.current / quest.target) * 100)}%;"></div>
                </div>
                <div class="reward">${isCompleted ? 'Claim!' : `+${quest.reward} ☥`}</div>
                <button 
                    class="action-button small" 
                    data-quest-id="${quest.id}" 
                    ${isCompleted ? '' : 'disabled'}
                >
                    ${isCompleted ? 'Claim' : 'Working...'}
                </button>
            </div>
        `;
        
        // Add event listener for claiming the reward
        const claimBtn = card.querySelector('button');
        if (isCompleted) {
            claimBtn.addEventListener('click', async () => {
                claimBtn.disabled = true;
                const success = await completeDailyQuest(quest.id, quest.reward);
                if (success) {
                    showToast(`Claimed ${quest.reward} Ankhs!`, 'success');
                    renderHome(); // Re-render to show updated status
                } else {
                     showToast('Error claiming reward!', 'error');
                     claimBtn.disabled = false;
                }
            });
        }
        
        dailyQuestsContainer.appendChild(card);
    });

}

