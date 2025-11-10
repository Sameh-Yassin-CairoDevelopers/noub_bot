/*
 * Filename: js/screens/tasks.js
 * Version: NOUB 0.0.7 (TASKS SCREEN MODULE)
 * Description: View Logic Module for the new Daily Tasks screen.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
// We import the logic for fetching and completing quests from contracts.js
import { fetchDailyQuests, completeDailyQuest } from './contracts.js'; 

const dailyQuestsContainer = document.getElementById('daily-quests-container');

/**
 * Renders the daily quest summary cards on the tasks screen.
 */
export async function renderTasks() {
    if (!state.currentUser || !dailyQuestsContainer) return;
    
    dailyQuestsContainer.innerHTML = 'Loading daily tasks...';

    // Fetch quest data (logic is handled in contracts.js, which manages localStorage for quests)
    const quests = fetchDailyQuests();

    if (!quests || quests.length === 0) {
        dailyQuestsContainer.innerHTML = '<p class="screen-description">No daily tasks available. Check back tomorrow!</p>';
        return;
    }

    dailyQuestsContainer.innerHTML = '';
    
    quests.forEach(quest => {
        const isCompleted = quest.current >= quest.target;
        // Button should show 'Claimed' if the quest.completed flag is true
        const buttonText = quest.completed ? 'Claimed' : (isCompleted ? 'Claim' : 'Working...');
        // Button is disabled if it's not completed OR if it has already been claimed
        const buttonDisabled = !isCompleted || quest.completed;
        
        const progressPercent = Math.min(100, (quest.current / quest.target) * 100);

        const card = document.createElement('div');
        card.className = 'daily-quest-card';
        card.innerHTML = `
            <div class="quest-details">
                <h4>${quest.title}</h4>
                <p>Progress: ${quest.current} / ${quest.target}</p>
                <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${progressPercent}%;"></div>
                </div>
            </div>
            <div class="quest-action">
                <div class="reward">+${quest.reward} 🪙</div>
                <button 
                    class="action-button small claim-btn" 
                    data-quest-id="${quest.id}" 
                    ${buttonDisabled ? 'disabled' : ''}
                >
                    ${buttonText}
                </button>
            </div>
        `;
        
        const claimBtn = card.querySelector('.claim-btn');
        if (!buttonDisabled) {
            claimBtn.addEventListener('click', async () => {
                claimBtn.disabled = true;
                // Calls the completion logic defined in contracts.js
                const success = await completeDailyQuest(quest.id, quest.reward); 
                if (success) {
                    showToast(`Claimed ${quest.reward} NOUB!`, 'success');
                    renderTasks(); // Re-render the tasks screen to show the 'Claimed' status
                } else {
                     showToast('Error claiming reward or already claimed!', 'error');
                     claimBtn.disabled = false;
                }
            });
        }
        
        dailyQuestsContainer.appendChild(card);
    });
}
