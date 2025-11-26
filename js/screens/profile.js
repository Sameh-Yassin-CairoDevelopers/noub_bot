/*
 * Filename: js/screens/profile.js
 * Version: NOUB v3.0.0 (Pure JS Minting UI)
 * Description: Displays Player Profile and handles the Soul Card Minting interaction.
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { logout, refreshPlayerState } from '../auth.js';
import { playSound, showToast } from '../ui.js';

const profileContainer = document.querySelector('#profile-screen .profile-container');

export async function renderProfile() {
    if (!state.currentUser) return;

    // 1. Refresh Data
    await refreshPlayerState();
    const profile = state.playerProfile;

    // 2. Parallel Fetch for Cards & Specializations
    const [{ data: playerCards }, { data: playerSpecs }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerSpecializations(state.currentUser.id)
    ]);
    
    // 3. Determine Status
    const hasSoulCard = playerCards ? playerCards.some(c => c.card_id === 9999 || c.card_id == '9999') : false;
    
    // Check for DNA (Assuming dna_edu_level existence implies protocol completion)
    const hasDNA = profile.dna_edu_level !== null && profile.dna_edu_level !== undefined;

    // 4. Calculate Stats for Display
    const totalCards = playerCards ? playerCards.length : 0;
    const contractsDone = profile.completed_contracts_count || 0;
    
    const level = profile.level || 1;
    const xp = profile.xp || 0;
    const nextXp = profile.xp_to_next_level || 100;
    const xpPercent = Math.min(100, (xp / nextXp) * 100);
    
    const currentSpec = playerSpecs && playerSpecs.length > 0 
        ? playerSpecs[0].specialization_paths.name 
        : 'Novice';

    // --- DYNAMIC SOUL SECTION ---
    let soulHTML = '';
    
    if (hasSoulCard) {
        // CASE A: Has Soul Card
        soulHTML = `
            <div class="profile-section" style="border: 1px solid var(--primary-accent); background: linear-gradient(45deg, rgba(0,0,0,0.6), rgba(212,175,55,0.1));">
                <h3 style="color: var(--primary-accent); margin-bottom: 5px;">🧬 Identity Matrix</h3>
                <div style="font-family: 'Courier New', monospace; color: #fff; text-align: center; letter-spacing: 2px; font-size: 1.1em; text-shadow: 0 0 5px cyan;">
                    ${profile.dna_eve_code || 'GENESIS-CODE'}
                </div>
                <div style="text-align:center; font-size: 0.8em; color: var(--success-color); margin-top: 5px;">
                    ✨ Soul Mirror Active
                </div>
            </div>
        `;
    } else if (hasDNA) {
        // CASE B: Has Protocol but NO Card -> Show Mint Button
        soulHTML = `
            <div class="profile-section" style="text-align: center;">
                <h3 style="color: cyan;">Protocol Analysis Complete</h3>
                <p style="font-size: 0.85em; color: #ccc; margin-bottom: 15px;">
                    Your intellectual identity has been mapped.
                </p>
                <button id="mint-soul-btn" class="action-button" style="background: linear-gradient(90deg, #000, var(--primary-accent)); border: 1px solid gold; box-shadow: 0 0 10px gold;">
                    ⚡ Materialize Soul Card
                </button>
            </div>
        `;
    } else {
        // CASE C: No Protocol
        soulHTML = `
            <div class="profile-section" style="opacity: 0.6; text-align: center;">
                <h3 style="color: #888;">Missing Protocol</h3>
                <p style="font-size: 0.8em;">Complete the UCP process with Eve to generate your Soul DNA.</p>
            </div>
        `;
    }

    // 5. HTML Assembly
    profileContainer.innerHTML = `
        <div class="profile-header">
            <img src="${profile.avatar_url || 'images/user_avatar.png'}" class="avatar">
            <h2>${profile.username || 'Architect'}</h2>
            <p class="player-level">Level ${level}</p>
        </div>

        <div class="profile-section" style="width:100%">
            <h3 style="color:var(--success-color)">Progression (XP)</h3>
            <div class="xp-progress-container">
                <div class="progress-bar" style="background:#222; height:10px; border-radius:5px; overflow:hidden;">
                    <div style="width:${xpPercent}%; height:100%; background:var(--success-color); transition: width 0.5s;"></div>
                </div>
                <div style="text-align:center; font-size:0.8em; margin-top:4px;">${xp} / ${nextXp}</div>
            </div>
        </div>

        ${soulHTML}

        <div class="profile-section" style="width:100%">
            <h3 style="color:var(--accent-blue)">Statistics</h3>
            <div class="profile-stats-grid main-stats">
                <div class="stat-box"><div class="value">${totalCards}</div><div class="label">Cards</div></div>
                <div class="stat-box"><div class="value">${contractsDone}</div><div class="label">Contracts</div></div>
                <div class="stat-box" style="grid-column:span 2"><div class="value" style="font-size:1em">${currentSpec}</div><div class="label">Path</div></div>
            </div>
        </div>

        <div class="profile-section" style="width:100%">
            <h3 style="color:var(--primary-accent)">Treasury</h3>
            <div class="profile-stats-grid currency-stats">
                <div class="stat-box"><div class="value">${profile.ankh_premium || 0} ☥</div><div class="label">Ankh</div></div>
                <div class="stat-box"><div class="value">${profile.prestige || 0} 🐞</div><div class="label">Prestige</div></div>
                <div class="stat-box"><div class="value">${profile.spin_tickets || 0} 🎟️</div><div class="label">Tickets</div></div>
                <div class="stat-box"><div class="value">${Math.floor(profile.noub_score || 0)} 🪙</div><div class="label">NOUB</div></div>
            </div>
        </div>
        
        <button id="logout-btn" class="action-button danger" style="margin-top:20px; width:100%">Log Out</button>
    `;

    // 6. Event Binding
    document.getElementById('logout-btn').onclick = logout;

    const mintBtn = document.getElementById('mint-soul-btn');
    if (mintBtn) {
        mintBtn.onclick = async () => {
            mintBtn.disabled = true;
            mintBtn.innerText = "Calculating DNA...";
            
            // Calls the new JS-based API function
            const { data, error } = await api.mintUserSoulCard(state.currentUser.id);
            
            if (!error && data) {
                playSound('reward_grand');
                showToast(`Soul Materialized! Power: ${data.power_score}`, 'success');
                // Slight delay to show success state
                setTimeout(() => renderProfile(), 1500);
            } else {
                showToast(error?.message || "Minting failed.", 'error');
                mintBtn.disabled = false;
                mintBtn.innerText = "Try Again";
            }
        };
    }
}
