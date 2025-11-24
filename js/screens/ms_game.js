/*
 * Filename: js/screens/ms_game.js
 * Version: NOUB v2.3.1 (CRITICAL TAB FIX & Calendar Logic)
 * Description: Manages the combined screen for the Idle Drop Generator and the Royal Calendar events.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- CONSTANTS ---
const ONE_SECOND = 1000;
const msGameContainer = document.getElementById('ms-game-screen');
let idleGeneratorInterval = null;

// IDLE GENERATOR CONFIGURATION
const IDLE_GENERATOR_CONFIG = {
    BASE_RATE_PER_MINUTE: 0.25, 
    BASE_CAPACITY_HOURS: 8,     
    CAPACITY_INCREASE_PER_LEVEL: 0.5, 
    RATE_INCREASE_PER_LEVEL: 0.1,    
    UPGRADE_COST_BASE: 1000,
    UPGRADE_COST_MULTIPLIER: 1.5,
};

// --------------------------------------------------------
// --- UTILITY FUNCTIONS ---
// --------------------------------------------------------

function formatTime(ms) {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / ONE_SECOND);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
}

function calculateIdleDrop(level) {
    const config = IDLE_GENERATOR_CONFIG;
    const capacityMinutes = (config.BASE_CAPACITY_HOURS * 60) + ((level - 1) * config.CAPACITY_INCREASE_PER_LEVEL * 60);
    const ratePerMinute = config.BASE_RATE_PER_MINUTE + ((level - 1) * config.RATE_INCREASE_PER_LEVEL);
    const ratePerMs = ratePerMinute / (60 * 1000); 
    const maxNoub = Math.floor(ratePerMinute * capacityMinutes);

    return {
        capacityMs: capacityMinutes * 60 * 1000,
        ratePerMinute: ratePerMinute,
        ratePerMs: ratePerMs,
        maxNoub: maxNoub,
        upgradeCost: Math.floor(config.UPGRADE_COST_BASE * Math.pow(config.UPGRADE_COST_MULTIPLIER, level - 1))
    };
}

// --------------------------------------------------------
// --- IDLE DROP LOGIC ---
// --------------------------------------------------------

async function handleClaimIdleDrop() {
    if (!state.currentUser) return;
    const playerId = state.currentUser.id;
    const profile = state.playerProfile; 
    if (!profile) return showToast("Error fetching generator state.", 'error');

    const generatorLevel = profile.idle_generator_level || 1;
    const generatorState = calculateIdleDrop(generatorLevel);
    const lastClaimTime = new Date(profile.last_claim_time).getTime();
    const elapsedTime = Date.now() - lastClaimTime;
    
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);
    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);

    if (noubGenerated < 1) return showToast("Nothing to claim yet.", 'info');

    const updateObject = {
        noub_score: profile.noub_score + noubGenerated,
        last_claim_time: new Date().toISOString() // Reset timer
    };
    await api.updatePlayerProfile(playerId, updateObject);
    await api.addXp(state.currentUser.id, 1);
    await refreshPlayerState();
    showToast(`Claimed ${noubGenerated} NOUB!`, 'success');
    renderDropContent(); // Re-render only the active tab
}

async function handleUpgradeIdleDrop(currentLevel, upgradeCost) {
    if (state.playerProfile.noub_score < upgradeCost) return showToast("Not enough NOUB to upgrade!", 'error');
    
    const newLevel = currentLevel + 1;
    const { error: profileError } = await api.updatePlayerProfile(state.currentUser.id, {
        noub_score: state.playerProfile.noub_score - upgradeCost,
        idle_generator_level: newLevel
    });
    if (profileError) return showToast("Upgrade failed!", 'error');

    await api.addXp(state.currentUser.id, 50);
    await refreshPlayerState();
    showToast(`Idle Generator upgraded to Level ${newLevel}!`, 'success');
    renderDropContent();
}


// --------------------------------------------------------
// --- ROYAL CALENDAR LOGIC (NEW) ---
// --------------------------------------------------------

/**
 * Utility to check if a recurring event is claimable today.
 */
function isClaimable(event, playerClaims) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const isToday = event.event_month === (today.getMonth() + 1) && event.event_day === today.getDate();
    // Assuming playerClaims is a fetched array of claims for the current player
    const alreadyClaimed = playerClaims.some(claim => claim.event_id === event.id && claim.claimed_year === currentYear);
    return isToday && !alreadyClaimed;
}

/**
 * Handles the claim action for a specific event.
 */
async function handleClaimEvent(event) {
    if (!state.currentUser) return;
    showToast(`Claiming reward for: ${event.title}...`, 'info');
    
    const playerId = state.currentUser.id;
    const currentYear = new Date().getFullYear();
    let rewardType = event.reward_type.toUpperCase();
    let rewardAmount = event.reward_amount;

    const profileUpdate = {};
    if (rewardType === 'NOUB') profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + rewardAmount;
    // NOTE: Logic for other reward types (ANKH, CARD, BUFF) is needed here!
    
    const { error: updateError } = await api.updatePlayerProfile(playerId, profileUpdate);
    const { error: claimError } = await api.supabaseClient.from('player_event_claims').insert({
        player_id: playerId,
        event_id: event.id,
        claimed_year: currentYear
    });

    if (updateError || claimError) {
        showToast("Claim failed due to database error.", 'error');
        return;
    }

    showToast(`Claimed ${rewardAmount} ${rewardType}! Happy historical day!`, 'success');
    await refreshPlayerState();
    renderCalendarContent(); 
}


// --------------------------------------------------------
// --- RENDER LOGIC (Combined Tabs) ---
// --------------------------------------------------------

let activeTab = 'drop'; // Default active tab

/**
 * Renders the content of the 'Drop' tab.
 */
function renderDropContent() {
    const content = document.getElementById('ms-content-drop');
    if (!content) return;
    
    const profile = state.playerProfile;
    const generatorLevel = profile.idle_generator_level || 1;
    const lastClaimTimeMs = new Date(profile.last_claim_time).getTime();
    const now = Date.now();

    const generatorState = calculateIdleDrop(generatorLevel);
    const elapsedTime = now - lastClaimTimeMs;
    const timeToCount = Math.min(elapsedTime, generatorState.capacityMs);

    const noubGenerated = Math.floor(timeToCount * generatorState.ratePerMs);
    const remainingTimeMs = generatorState.capacityMs - timeToCount;
    const capacityPercent = (timeToCount / generatorState.capacityMs) * 100;
    const isFull = remainingTimeMs <= 0;
    
    const timeDisplay = isFull ? 'FULL' : formatTime(remainingTimeMs);
    const buttonText = isFull ? `CLAIM ${noubGenerated} 🪙` : `CLAIM ${noubGenerated} 🪙 (Still Producing)`;
    
    content.innerHTML = `
        <div class="idle-generator-card game-container" style="box-shadow: none;">
            <div class="generator-header" style="border-bottom: 1px solid #3a3a3c; padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="margin:0; color: var(--primary-accent);">Vault Status - Lvl ${generatorLevel}</h3>
                <img src="images/idle_vault.png" alt="Vault Icon" style="width: 50px; height: 50px; filter: drop-shadow(0 0 5px var(--primary-accent));">
            </div>
            
            <div class="generator-info" style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 20px; font-size: 0.9em;">
                <p>Rate: <strong style="color: var(--success-color);">${generatorState.ratePerMinute.toFixed(2)} 🪙/min</strong></p>
                <p>Capacity: <strong style="color: var(--accent-blue);">${(generatorState.capacityMs / 3600000).toFixed(1)} hrs</strong></p>
            </div>
            
            <div class="generator-timer" style="text-align: center; margin-bottom: 15px;">
                <p style="font-size: 1.2em; font-weight: bold; color: ${isFull ? 'var(--danger-color)' : 'var(--primary-accent)'};">
                    ${isFull ? `CAPACITY REACHED! (Max: ${generatorState.maxNoub} 🪙)` : `Time to Full: ${timeDisplay}`}
                </p>
            </div>
            
            <div class="progress-bar-container" style="margin-bottom: 20px;">
                <div class="progress-bar" style="height: 20px; border-radius: 10px;">
                    <div class="progress-bar-inner" id="idle-progress-inner" style="width: ${capacityPercent}%; background: linear-gradient(to right, #4caf50, var(--primary-accent)); border-radius: 10px;"></div>
                </div>
                <p style="text-align: center; margin-top: 5px; font-size: 0.9em;">
                    Accumulated: <strong id="idle-accumulated-noub">${noubGenerated} 🪙</strong> of ${generatorState.maxNoub} 🪙
                </p>
            </div>

            <button id="claim-idle-drop-btn" class="action-button" ${noubGenerated < 1 ? 'disabled' : ''} style="margin-bottom: 10px;">
                ${buttonText}
            </button>
            
            <button id="upgrade-idle-drop-btn" class="action-button small" style="background-color: var(--accent-blue); box-shadow: 0 4px 0 #006b72;">
                UPGRADE (Cost: ${generatorState.upgradeCost} 🪙)
            </button>
        </div>
    `;

    document.getElementById('claim-idle-drop-btn').onclick = handleClaimIdleDrop;
    document.getElementById('upgrade-idle-drop-btn').onclick = () => handleUpgradeIdleDrop(generatorLevel, generatorState.upgradeCost);

    // Stop and start interval
    if (idleGeneratorInterval) clearInterval(idleGeneratorInterval);
    if (!isFull) {
        const lastClaimTimeMs = new Date(profile.last_claim_time).getTime(); 
        idleGeneratorInterval = setInterval(() => {
            const timeSinceLastClaim = Date.now() - lastClaimTimeMs;
            const timeRemaining = generatorState.capacityMs - timeSinceLastClaim;

            if (timeRemaining <= 0) {
                renderDropContent(); // Recalculate and update to FULL state
                return;
            }
            
            const generated = Math.floor(timeSinceLastClaim * generatorState.ratePerMs);
            const percent = (timeSinceLastClaim / generatorState.capacityMs) * 100;
            const timeFull = formatTime(timeRemaining);
            
            const timerEl = content.querySelector('.generator-timer p');
            const progressEl = document.getElementById('idle-progress-inner');
            const noubEl = document.getElementById('idle-accumulated-noub');
            const claimBtn = document.getElementById('claim-idle-drop-btn');

            if (timerEl) timerEl.innerHTML = `Time to Full: ${timeFull}`;
            if (progressEl) progressEl.style.width = `${percent}%`;
            if (noubEl) noubEl.innerHTML = `${generated} 🪙`;
            if (claimBtn) claimBtn.textContent = `CLAIM ${generated} 🪙 (Still Producing)`;
            if (claimBtn) claimBtn.disabled = generated < 1;

        }, ONE_SECOND);
    }
}


/**
 * Renders the content of the 'Events' (Royal Calendar) tab.
 */
async function renderCalendarContent() {
    const content = document.getElementById('ms-content-events');
    if (!content) return;
    
    content.innerHTML = '<p style="text-align:center;">Loading Royal Calendar events...</p>';

    // 1. Fetch all events and player's claims
    const [{ data: events, error: eError }, { data: claims, error: cError }] = await Promise.all([
        api.supabaseClient.from('game_events').select('*').order('event_month', { ascending: true }).order('event_day', { ascending: true }),
        api.supabaseClient.from('player_event_claims').select('*').eq('player_id', state.currentUser.id)
    ]);

    if (eError || cError || !events) {
        return content.innerHTML = '<p class="error-message">Error loading calendar data. Check network connection and table access.</p>';
    }

    const playerClaims = claims || [];
    const eventsHtml = events.map(event => {
        const claimable = isClaimable(event, playerClaims);
        const eventDate = `${event.event_day.toString().padStart(2, '0')}-${event.event_month.toString().padStart(2, '0')}`;
        
        let rewardDisplay = `${event.reward_amount} ${event.reward_type.toUpperCase()}`;
        if (event.reward_type.toUpperCase() === 'BUFF') {
            rewardDisplay = `+${event.reward_amount * 100}% Production Buff (24h)`;
        }
        
        // Check if event is already claimed for this year
        const alreadyClaimed = playerClaims.some(claim => claim.event_id === event.id && claim.claimed_year === new Date().getFullYear());
        
        return `
            <div class="event-card ${claimable ? 'claimable' : (alreadyClaimed ? 'claimed' : 'default')}" style="opacity: ${alreadyClaimed ? 0.6 : 1};">
                <div class="event-date">${eventDate}</div>
                <div class="event-details">
                    <h4>${event.title} ${event.is_major ? '⭐' : ''}</h4>
                    <p class="lore">${event.description_lore || 'No detailed lore available.'}</p>
                </div>
                <div class="event-actions">
                    <span class="reward-info">${rewardDisplay}</span>
                    <button class="action-button small ${claimable ? '' : 'disabled'}" ${claimable ? '' : 'disabled'} onclick="handleClaimEvent(${JSON.stringify(event).replace(/"/g, "'")})">
                        ${alreadyClaimed ? 'CLAIMED' : (claimable ? 'CLAIM' : 'WAIT')}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = `<div id="events-timeline" style="display: flex; flex-direction: column; gap: 15px;">${eventsHtml || '<p style="text-align:center; margin-top:20px;">No upcoming events currently scheduled.</p>'}</div>`;
}

/**
 * Handles the tab switch logic for the combined screen.
 * @param {string} tabName - 'drop' or 'events'.
 */
function handleMsGameTabSwitch(tabName) {
    // 1. Update active tab UI
    document.querySelectorAll('.ms-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.ms-tab-btn[data-ms-tab="${tabName}"]`)?.classList.add('active');

    // 2. Hide all content and show the selected one
    document.querySelectorAll('.ms-content-tab').forEach(content => content.classList.add('hidden'));
    document.getElementById(`ms-content-${tabName}`).classList.remove('hidden');
    activeTab = tabName;

    // 3. Render content dynamically
    if (tabName === 'drop') {
        renderDropContent();
    } else if (tabName === 'events') {
        renderCalendarContent();
    }
}


// --------------------------------------------------------
// --- RENDER FUNCTION (Exported) ---
// --------------------------------------------------------

export async function renderMsGame() {
    if (!state.currentUser || !msGameContainer) return;
    
    // 1. Ensure UI is built once
    if (!document.getElementById('ms-tabs-container')) {
        msGameContainer.innerHTML = `
            <h2>Royal Vault / Calendar</h2>
            <div id="ms-tabs-container" style="display:flex; justify-content:space-around; border-bottom: 2px solid #3a3a3c; margin-bottom: 20px;">
                <button class="ms-tab-btn active" data-ms-tab="drop">Idle Drop</button>
                <button class="ms-tab-btn" data-ms-tab="events">Calendar</button>
            </div>
            
            <div id="ms-content-drop" class="ms-content-tab"></div>
            <div id="ms-content-events" class="ms-content-tab hidden"></div>
        `;
        
        // Attach event listeners to the tabs
        document.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleMsGameTabSwitch(e.currentTarget.dataset.msTab));
        });
    }

    // Initial load: Render the default 'drop' tab
    handleMsGameTabSwitch(activeTab);
}
