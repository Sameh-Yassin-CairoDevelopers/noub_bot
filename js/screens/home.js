/*
 * Filename: js/screens/home.js
 * Version: NOUB 0.0.1 Eve Edition (Home Dashboard & Daily Quests - Complete)
 * Description: View Logic Module for the Home Dashboard. Renders the daily quest summary.
 * Ensures proper module loading for quest tracking.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
// NOTE: We rely on the contracts module to handle the quest data and completion logic
import { fetchDailyQuests, completeDailyQuest } from './contracts.js'; 

const dailyQuestsContainer = document.getElementById('daily-quests-container');

/**
 * Renders the daily quest summary cards on the home screen.
 * This is the only exported function, driving the Home Dashboard view.
 */
export async function renderHome() {
    if (!state.currentUser) return;
    
    dailyQuestsContainer.innerHTML = 'Loading daily tasks...';

    // Fetch quest data (logic handled in contracts.js, which manages localStorage for quests)
    const quests = fetchDailyQuests();

    if (!quests || quests.length === 0) {
        dailyQuestsContainer.innerHTML = '<p class="screen-description">No daily tasks available. Check back tomorrow!</p>';
        return;
    }

    dailyQuestsContainer.innerHTML = '';
    
    quests.forEach(quest => {
        // Check completion status based on current progress vs target
        const isCompleted = quest.current >= quest.target;
        
        // Define the button text and class
        const buttonText = isCompleted ? 'Claim' : 'Working...';
        const buttonDisabled = isCompleted ? '' : 'disabled';
        
        // Calculate progress percentage safely
        const progressPercent = Math.min(100, (quest.current / quest.target) * 100);

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
                    <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
                </div>
                <div class="reward">${isCompleted ? 'Claim!' : `+${quest.reward} ☥`}</div>
                <button 
                    class="action-button small" 
                    data-quest-id="${quest.id}" 
                    ${buttonDisabled}
                >
                    ${buttonText}
                </button>
            </div>
        `;
        
        // Add event listener for claiming the reward
        const claimBtn = card.querySelector('button');
        if (isCompleted) {
            claimBtn.addEventListener('click', async () => {
                claimBtn.disabled = true;
                // Calls the completion logic defined in contracts.js
                const success = await completeDailyQuest(quest.id, quest.reward); 
                if (success) {
                    showToast(`Claimed ${quest.reward} Ankhs!`, 'success');
                    renderHome(); // Re-render to show updated status
                } else {
                     showToast('Error claiming reward or already claimed!', 'error');
                     claimBtn.disabled = false;
                }
            });
        }
        
        dailyQuestsContainer.appendChild(card);
    });

}
