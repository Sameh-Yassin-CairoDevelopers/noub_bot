/*
 * Filename: js/screens/tasks.js
 * Version: NOUB v1.2.0 (Professional & Refactored Tasks Hub)
 * Description: A complete, professionally structured, and fully functional task system.
 * This version includes a clear separation of concerns, comprehensive claim logic for all
 * task types (Onboarding, Social, Daily, Weekly, Milestones), and dynamic UI rendering.
 * All functions are documented for academic clarity.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, navigateTo } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { fetchDailyQuests as fetchOriginalDailyQuests, completeDailyQuest } from './contracts.js';

// --- Module-level Constants and State ---
const tasksContainer = document.getElementById('tasks-screen');
let countdownInterval = null;

// --- Data Definitions: Tasks and Reward Structures ---

const ONBOARDING_TASKS = [
    { id: 'ucp_task_1', title: 'Begin Your Protocol', description: 'Visit the "Chat with Eve" screen...', reward: { noub: 500, prestige: 10 }, isClaimed: () => state.playerProfile?.ucp_task_1_claimed, isCompleted: () => (state.ucp instanceof Map && state.ucp.size > 0), action: () => navigateTo('chat-screen'), claimHandler: (task) => claimOnboardingTask(task, 1) },
    { id: 'ucp_task_2', title: 'Complete Eve\'s Interview', description: 'Finish all of Eve\'s main sections...', reward: { noub: 1500, prestige: 75, tickets: 5 }, isClaimed: () => state.playerProfile?.ucp_task_2_claimed, isCompleted: () => state.ucp?.has('eve_general'), claimHandler: (task) => claimOnboardingTask(task, 2) },
    { id: 'ucp_task_3', title: 'Embrace Deep Analysis', description: 'Complete one of Hypatia\'s sessions...', reward: { noub: 5000, prestige: 250, ankh: 5 }, isClaimed: () => state.playerProfile?.ucp_task_3_claimed, isCompleted: () => state.ucp?.has('hypatia_philosophical') || state.ucp?.has('hypatia_scaled'), claimHandler: (task) => claimOnboardingTask(task, 3) },
    { id: 'join_chat', title: 'Join the NOUB Community Chat', description: 'https://t.me/Noub_chat', reward: { noub: 1000 }, isClaimed: () => state.playerProfile.social_tasks_claimed?.['join_chat'], isCompleted: () => true, action: (task, card) => { window.open(task.description, '_blank'); card.querySelector('.go-btn').textContent = 'Check & Claim'; card.querySelector('.go-btn').onclick = () => claimSocialTask(task); } },
    { id: 'join_channel', title: 'Subscribe to NOUB NFTs Channel', description: 'https://t.me/NOUB_NFTS', reward: { noub: 1000 }, isClaimed: () => state.playerProfile.social_tasks_claimed?.['join_channel'], isCompleted: () => true, action: (task, card) => { window.open(task.description, '_blank'); card.querySelector('.go-btn').textContent = 'Check & Claim'; card.querySelector('.go-btn').onclick = () => claimSocialTask(task); } },
];

const NEW_DAILY_TASKS = [
    { id: 'daily_claim_3', title: 'Claim Production 3 Times', target: 3, reward: { noub: 250 }, type: 'production_claim' },
    { id: 'daily_contract_1', title: 'Complete 1 Contract', target: 1, reward: { prestige: 20 }, type: 'contract_complete' },
    { id: 'daily_assign_1', title: 'Assign an Expert', target: 1, reward: { tickets: 2 }, type: 'assign_expert' },
];

const WEEKLY_TASKS = [
    { id: 'weekly_produce_10', title: 'Produce 10 Clay Jars', target: 10, reward: { noub: 2000 }, type: 'production_claim', item_name: 'Clay Jar' },
    { id: 'weekly_contracts_5', title: 'Complete 5 Contracts', target: 5, reward: { ankh: 5 }, type: 'contract_complete' },
    { id: 'weekly_upgrade_3', title: 'Upgrade Buildings 3 Times', target: 3, reward: { prestige: 100 }, type: 'upgrade_building' },
];

const DAILY_TRACK_STAGES = [ { threshold: 1, reward: { tickets: 1 } }, { threshold: 2, reward: { prestige: 10 } }, { threshold: 3, reward: { noub: 500 } } ];
const WEEKLY_TRACK_STAGES = [ { threshold: 1, reward: { noub: 500 } }, { threshold: 2, reward: { prestige: 50 } }, { threshold: 3, reward: { ankh: 10 } } ];
const KV_MILESTONE_REWARDS = [ { level: 10, reward: { noub: 5000, prestige: 50 } }, { level: 20, reward: { tickets: 20, ankh: 5 } }, { level: 30, reward: { noub: 15000, prestige: 150 } }, { level: 40, reward: { tickets: 50, ankh: 15 } }, { level: 50, reward: { noub: 50000, prestige: 500 } }, { level: 62, reward: { ankh: 100 }, isGrand: true } ];


// --- Core Logic: Progress Tracking and Claiming ---

/**
 * Central function to track progress for various in-game actions.
 * It updates the player's progress for daily and weekly tasks.
 * @param {string} taskType - A unique identifier for the action (e.g., 'production_claim').
 * @param {number} [amount=1] - The amount of progress to add.
 * @param {string|null} [itemName=null] - Specific item name for item-related tasks.
 */
export async function trackTaskProgress(taskType, amount = 1, itemName = null) {
    if (!state.currentUser) return;
    
    // Track legacy daily quests that use localStorage
    legacyTrackDailyActivity(taskType, amount, itemName);
    
    let dailyProgress = state.playerProfile.daily_tasks_progress || {};
    let weeklyProgress = state.playerProfile.weekly_tasks_progress || {};
    let needsUpdate = false;

    const tasksToUpdate = [...NEW_DAILY_TASKS, ...WEEKLY_TASKS].filter(task => {
        if (task.type !== taskType) return false;
        if (task.item_name && task.item_name !== itemName) return false;
        return true;
    });

    tasksToUpdate.forEach(task => {
        const isDaily = NEW_DAILY_TASKS.some(dt => dt.id === task.id);
        const progressContainer = isDaily ? dailyProgress : weeklyProgress;
        const claimedContainer = isDaily ? state.playerProfile.daily_tasks_claimed : state.playerProfile.weekly_tasks_claimed;
        
        if (claimedContainer && claimedContainer[task.id]) return; // Don't track progress for already claimed tasks

        if ((progressContainer[task.id] || 0) < task.target) {
            progressContainer[task.id] = Math.min(task.target, (progressContainer[task.id] || 0) + amount);
            needsUpdate = true;
        }
    });

    if (needsUpdate) {
        await api.updatePlayerProfile(state.currentUser.id, {
            daily_tasks_progress: dailyProgress,
            weekly_tasks_progress: weeklyProgress
        });
        await refreshPlayerState();
        // Re-render the screen only if it's currently visible
        if (tasksContainer && !tasksContainer.classList.contains('hidden')) {
            renderTasks();
        }
    }
}

/**
 * A generic function to grant a reward object to the current player.
 * @param {object} rewardObject - The reward to grant (e.g., { noub: 500, prestige: 10 }).
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function grantReward(rewardObject) {
    const profileUpdate = {};
    let rewardString = '';

    if (rewardObject.noub) profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + rewardObject.noub;
    if (rewardObject.prestige) profileUpdate.prestige = (state.playerProfile.prestige || 0) + rewardObject.prestige;
    if (rewardObject.tickets) profileUpdate.spin_tickets = (state.playerProfile.spin_tickets || 0) + rewardObject.tickets;
    if (rewardObject.ankh) profileUpdate.ankh_premium = (state.playerProfile.ankh_premium || 0) + rewardObject.ankh;
    
    if (Object.keys(profileUpdate).length === 0) return true; // No currency reward to grant

    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (error) {
        showToast("Error granting reward!", 'error');
        return false;
    }

    Object.keys(rewardObject).forEach(key => rewardString += `${rewardObject[key]}${key === 'noub' ? '🪙' : key === 'prestige' ? '🐞' : key === 'tickets' ? '🎟️' : '☥'} `);
    showToast(`Reward Claimed: +${rewardString}`, 'success');
    return true;
}

/**
 * Handles the specific logic for claiming onboarding/protocol milestone rewards.
 * @param {object} task - The onboarding task object.
 * @param {number} taskNumber - The number of the task (1, 2, or 3).
 */
async function claimOnboardingTask(task, taskNumber) {
    if (task.isClaimed() || !task.isCompleted()) return showToast("Task not ready to be claimed.", 'info');
    
    const rewardGranted = await grantReward(task.reward);
    if (!rewardGranted) return;

    const { error: claimError } = await api.claimUcpTaskReward(state.currentUser.id, taskNumber);
    if (claimError) return showToast("Error saving claim status!", 'error');
    
    if (taskNumber === 3) {
        const { error: unlockError } = await api.supabaseClient.from('player_library').upsert({
            player_id: state.currentUser.id, entry_key: 'god_horus'
        });
        if (!unlockError) showToast("New Library Entry Unlocked: The Great Ennead: Horus!", 'success');
    }
    
    await refreshPlayerState();
    renderTasks();
}

/**
 * Handles the logic for claiming daily or weekly task rewards.
 * @param {object} task - The daily/weekly task object.
 */
async function claimTimedTaskReward(task) {
    const isDaily = NEW_DAILY_TASKS.some(dt => dt.id === task.id);
    const profile = state.playerProfile;
    const progressContainer = isDaily ? profile.daily_tasks_progress : profile.weekly_tasks_progress;
    const claimedContainer = isDaily ? profile.daily_tasks_claimed : profile.weekly_tasks_claimed;
    
    if (!progressContainer || (progressContainer[task.id] || 0) < task.target) return showToast("Task is not yet complete!", 'error');
    if (claimedContainer && claimedContainer[task.id]) return showToast("Reward already claimed!", 'info');
    
    const rewardGranted = await grantReward(task.reward);
    if (!rewardGranted) return;

    const profileUpdate = {};
    if (isDaily) {
        profileUpdate.daily_tasks_claimed = { ...(profile.daily_tasks_claimed || {}), [task.id]: true };
        profileUpdate.daily_track_progress = (profile.daily_track_progress || 0) + 1;
    } else {
        profileUpdate.weekly_tasks_claimed = { ...(profile.weekly_tasks_claimed || {}), [task.id]: true };
        profileUpdate.weekly_track_progress = (profile.weekly_track_progress || 0) + 1;
    }

    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);
    if (error) return showToast("Error updating task status!", 'error');

    await refreshPlayerState();
    renderTasks();
}

/**
 * Handles the logic for claiming KV Game milestone rewards.
 * @param {object} milestone - The KV milestone object.
 */
async function claimMilestoneReward(milestone) {
    const claimedMilestones = state.playerProfile.kv_milestones_claimed || [];
    if (claimedMilestones.includes(milestone.level)) return showToast("Milestone reward already claimed.", 'info');
    
    const rewardGranted = await grantReward(milestone.reward);
    if (!rewardGranted) return;

    const newClaimed = [...claimedMilestones, milestone.level];
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { kv_milestones_claimed: newClaimed });
    if (error) return showToast("Error saving milestone claim status!", 'error');

    await refreshPlayerState();
    renderTasks();
}

/**
 * Handles the logic for claiming social tasks (Join chat/channel).
 * @param {object} task - The social task object.
 */
async function claimSocialTask(task) {
    if (state.playerProfile.social_tasks_claimed?.[task.id]) return showToast("Reward already claimed!", 'info');
    
    const rewardGranted = await grantReward(task.reward);
    if (!rewardGranted) return;

    const newClaimed = { ...(state.playerProfile.social_tasks_claimed || {}), [task.id]: true };
    const { error } = await api.updatePlayerProfile(state.currentUser.id, { social_tasks_claimed: newClaimed });
    if (error) return showToast("Error saving claim status!", 'error');
    
    await refreshPlayerState();
    renderTasks();
}


// --- UI Rendering Functions ---

/**
 * Renders a single task card in a specified container.
 * @param {HTMLElement} container - The parent DOM element.
 * @param {object} task - The task object to render.
 * @param {string} type - 'onboarding', 'daily', or 'weekly'.
 */

function renderTaskCard(container, task, type) {
    let currentProgress = 0, isClaimed = false, isCompleted = false;
    const profile = state.playerProfile;

    if (type === 'onboarding') {
        isClaimed = task.isClaimed();
        isCompleted = task.isCompleted();
    } else {
        const progressContainer = type === 'daily' ? profile.daily_tasks_progress : profile.weekly_tasks_progress;
        const claimedContainer = type === 'daily' ? profile.daily_tasks_claimed : profile.weekly_tasks_claimed;
        currentProgress = (progressContainer && progressContainer[task.id]) || 0;
        isClaimed = (claimedContainer && claimedContainer[task.id]) || false;
        isCompleted = task.target > 0 && currentProgress >= task.target;
    }

    const buttonHTML = isClaimed ? `<button class="action-button small" disabled>Claimed</button>`
                     : isCompleted ? `<button class="action-button small claim-btn">Claim</button>`
                     : `<button class="action-button small go-btn">${task.action ? 'Go' : 'Working...'}</button>`;
    
    const detailsHTML = task.description ? `<p>${task.description}</p>` :
                       task.target > 0 ? `<p>Progress: ${currentProgress} / ${task.target}</p><div class="progress-bar"><div class="progress-bar-inner" style="width: ${Math.min(100, (currentProgress / task.target) * 100)}%;"></div></div>`
                       : '';

    const card = document.createElement('div');
    card.className = 'daily-quest-card';
    card.innerHTML = `<div class="quest-details"><h4>${task.title}</h4>${detailsHTML}</div><div class="quest-action">${buttonHTML}</div>`;

    const claimBtn = card.querySelector('.claim-btn');
    if (claimBtn) {
        if (type === 'onboarding' && task.claimHandler) {
            claimBtn.onclick = () => task.claimHandler(task);
        } else if (type !== 'onboarding') {
            claimBtn.onclick = () => claimTimedTaskReward(task);
        }
    }
    
    const goBtn = card.querySelector('.go-btn');
    if (goBtn && task.action) {
        // --- THIS IS THE CORRECTED LOGIC ---
        // For social tasks, the action function itself handles the logic.
        // For other tasks, it's a simple navigation.
        if (task.id === 'join_chat' || task.id === 'join_channel') {
             goBtn.onclick = () => task.action(task, card);
        } else {
             goBtn.onclick = task.action;
        }
    }
    
    container.appendChild(card);
}

/**
 * Renders the original daily quests (from localStorage).
 * @param {HTMLElement} container - The parent DOM element.
 * @param {object} quest - The quest object.
 */
function renderOriginalDailyQuest(container, quest) {
    const isCompleted = quest.current >= quest.target;
    const buttonText = quest.completed ? 'Claimed' : (isCompleted ? 'Claim' : 'Working...');
    const buttonDisabled = !isCompleted || quest.completed;
    const progressPercent = Math.min(100, (quest.current / quest.target) * 100);
    const card = document.createElement('div');
    card.className = 'daily-quest-card';
    card.innerHTML = `
        <div class="quest-details">
            <h4>${quest.title}</h4>
            <p>Progress: ${quest.current} / ${quest.target}</p>
            <div class="progress-bar"><div class="progress-bar-inner" style="width: ${progressPercent}%;"></div></div>
        </div>
        <div class="quest-action">
            <div class="reward">+${quest.reward} 🪙</div>
            <button class="action-button small claim-btn" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
        </div>
    `;
    const claimBtn = card.querySelector('.claim-btn');
    if (!buttonDisabled) {
        claimBtn.onclick = async () => {
            claimBtn.disabled = true;
            const success = await completeDailyQuest(quest.id, quest.reward); 
            if (success) {
                showToast(`Claimed ${quest.reward} NOUB!`, 'success');
                renderTasks(); 
            } else {
                 showToast('Error claiming reward or already claimed!', 'error');
                 claimBtn.disabled = false;
            }
        };
    }
    container.appendChild(card);
}

/**
 * Renders a reward track UI component.
 * @param {HTMLElement} container - The parent DOM element.
 * @param {string} title - The title of the track.
 * @param {Array} stages - The stages of the reward track.
 * @param {number} progress - The current progress of the player.
 * @param {number} endTime - The timestamp for the countdown timer.
 */
function renderRewardTrack(container, title, stages, progress, endTime) {
    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track';
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px;`;
    let stagesHTML = stages.map((stage, index) => `
        <div class="track-stage ${progress >= stage.threshold ? 'completed' : ''}" style="text-align: center;">
            <div class="stage-icon" style="font-size: 1.5em; opacity: ${progress >= stage.threshold ? '1' : '0.4'};">🎁</div>
            <div class="stage-label" style="font-size: 0.7em;">${index + 1}</div>
        </div>
    `).join('');
    const progressPercent = Math.min(100, (progress / (stages[stages.length - 1]?.threshold || 1)) * 100);
    trackDiv.innerHTML = `
        <div class="track-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">${title}</h4>
            <span class="track-timer" data-end-time="${endTime}" style="background: #333; padding: 2px 8px; border-radius: 8px; font-size: 0.8em;">--:--:--</span>
        </div>
        <div class="track-progress-bar" style="background: #333; border-radius: 5px; height: 8px; margin-bottom: 10px; overflow: hidden;">
            <div class="track-progress-fill" style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); border-radius: 5px;"></div>
        </div>
        <div class="track-stages-container" style="display: flex; justify-content: space-around;">${stagesHTML}</div>
    `;
    container.appendChild(trackDiv);
}

/**
 * Renders the persistent milestone track for the KV Game.
 * @param {HTMLElement} container - The parent DOM element.
 */
async function renderMilestoneTrack(container) {
    const { data: kvProgressData } = await api.fetchKVProgress(state.currentUser.id);
    const currentKVLevel = (kvProgressData?.current_kv_level || 1) - 1;
    const claimedMilestones = state.playerProfile.kv_milestones_claimed || [];
    const trackDiv = document.createElement('div');
    trackDiv.className = 'reward-track';
    trackDiv.style.cssText = `background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 20px;`;
    const nextMilestone = KV_MILESTONE_REWARDS.find(m => !claimedMilestones.includes(m.level));
    let progressPercent = 0;
    if (nextMilestone) {
        const milestoneIndex = KV_MILESTONE_REWARDS.indexOf(nextMilestone);
        const prevMilestoneLevel = KV_MILESTONE_REWARDS[milestoneIndex - 1]?.level || 0;
        progressPercent = Math.min(100, ((currentKVLevel - prevMilestoneLevel) / (nextMilestone.level - prevMilestoneLevel)) * 100);
    } else if (claimedMilestones.length >= KV_MILESTONE_REWARDS.length) {
        progressPercent = 100;
    }
    let stagesHTML = KV_MILESTONE_REWARDS.map(milestone => {
        const isCompleted = currentKVLevel >= milestone.level;
        const isClaimed = claimedMilestones.includes(milestone.level);
        return `
            <div class="track-stage ${isClaimed ? 'claimed' : isCompleted ? 'completed' : ''}" style="text-align: center; position: relative;">
                <div class="stage-icon" style="font-size: 1.5em; opacity: ${isClaimed ? 1 : isCompleted ? 0.8 : 0.4}; filter: ${isClaimed ? 'grayscale(80%)' : 'none'};">
                    ${milestone.isGrand ? '🏆' : '🎁'}
                </div>
                <div class="stage-label" style="font-size: 0.7em;">KV ${milestone.level}</div>
                ${isCompleted && !isClaimed ? `<button class="action-button small claim-milestone-btn" data-level="${milestone.level}" style="position: absolute; bottom: -25px; left: 50%; transform: translateX(-50%); padding: 2px 6px; font-size: 0.7em;">Claim</button>` : ''}
            </div>
        `;
    }).join('');
    trackDiv.innerHTML = `
        <div class="track-header"><h4 style="margin: 0;">Valley of the Kings Milestones</h4></div>
        <div class="track-progress-bar" style="margin: 10px 0;"><div class="track-progress-fill" style="width: ${progressPercent}%;"></div></div>
        <div class="track-stages-container" style="display: flex; justify-content: space-around;">${stagesHTML}</div>
    `;
    container.appendChild(trackDiv);
    trackDiv.querySelectorAll('.claim-milestone-btn').forEach(btn => {
        const level = parseInt(btn.dataset.level);
        const milestone = KV_MILESTONE_REWARDS.find(m => m.level === level);
        if (milestone) btn.onclick = () => claimMilestoneReward(milestone);
    });
}

/**
 * Main function to render the entire tasks screen.
 */
export async function renderTasks() {
    if (!state.currentUser) return;
    await refreshPlayerState();
    const profile = state.playerProfile;

    // Ensure all necessary profile properties exist to prevent errors
    ['daily_tasks_progress', 'weekly_tasks_progress', 'daily_tasks_claimed', 'weekly_tasks_claimed', 'social_tasks_claimed'].forEach(p => {
        if (!profile[p]) profile[p] = {};
    });
    if (!profile.kv_milestones_claimed) profile.kv_milestones_claimed = [];
    if (!state.ucp) state.ucp = new Map();

    const container = document.getElementById('daily-quests-container');
    if (!container) return;
    container.innerHTML = '';

    await renderMilestoneTrack(container);
    
    // --- Render Daily Section (Track + Quests) ---
    const dailySection = document.createElement('div');
    const now = new Date();
    const endOfDay = new Date(now).setUTCHours(24, 0, 0, 0);
    renderRewardTrack(dailySection, 'Daily Rewards', DAILY_TRACK_STAGES, profile.daily_track_progress || 0, endOfDay);
    const dailyTitle = document.createElement('h3');
    dailyTitle.textContent = 'Daily Quests';
    dailySection.appendChild(dailyTitle);
    const originalDailyQuests = fetchOriginalDailyQuests();
    originalDailyQuests.forEach(quest => renderOriginalDailyQuest(dailySection, quest));
    NEW_DAILY_TASKS.forEach(task => renderTaskCard(dailySection, task, 'daily'));
    container.appendChild(dailySection);
    
    // --- Render Weekly Section (Track + Quests) ---
    const weeklySection = document.createElement('div');
    const endOfWeek = new Date(now.setDate(now.getDate() + (7 - (now.getUTCDay() || 7)))).setUTCHours(24, 0, 0, 0);
    renderRewardTrack(weeklySection, 'Weekly Rewards', WEEKLY_TRACK_STAGES, profile.weekly_track_progress || 0, endOfWeek);
    const weeklyTitle = document.createElement('h3');
    weeklyTitle.textContent = 'Weekly Quests';
    weeklyTitle.style.marginTop = '20px';
    weeklySection.appendChild(weeklyTitle);
    WEEKLY_TASKS.forEach(task => renderTaskCard(weeklySection, task, 'weekly'));
    container.appendChild(weeklySection);

    // --- Render Onboarding Section ---
    const onboardingTitle = document.createElement('h3');
    onboardingTitle.textContent = 'One-Time Tasks';
    onboardingTitle.style.marginTop = '20px';
    container.appendChild(onboardingTitle);
    ONBOARDING_TASKS.forEach(task => renderTaskCard(container, task, 'onboarding'));
    
    startTimers();
}

/**
 * Starts and manages the countdown timers for daily/weekly rewards.
 */
function startTimers() {
    if (countdownInterval) clearInterval(countdownInterval);
    function update() {
        document.querySelectorAll('.track-timer').forEach(timerEl => {
            const endTime = parseInt(timerEl.dataset.endTime);
            if (isNaN(endTime)) return;
            const remaining = endTime - Date.now();
            if (remaining <= 0) {
                timerEl.textContent = "00:00:00";
                // TODO: Add logic to trigger task reset here
                return;
            }
            const hours = Math.floor((remaining / (1000 * 60 * 60)));
            const minutes = Math.floor((remaining / (1000 / 60)) % 60);
            const seconds = Math.floor((remaining / 1000) % 60);
            timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        });
    }
    update();
    countdownInterval = setInterval(update, 1000);
}

