/*
 * Filename: js/screens/profile.js
 * Version: Pharaoh's Legacy 'NOUB' v2.0.0 (XP System & Grid UI Implemented)
 * Description: View Logic Module for the Profile screen. This version implements
 * the requested 2-column grid layout for core stats and currencies for better organization.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { logout } from '../auth.js'; 
import { refreshPlayerState } from '../auth.js';

// DOM Element References
const profileContainer = document.querySelector('#profile-screen .profile-container');
const DEFAULT_AVATAR = 'images/user_avatar.png';


/**
 * Renders the player's comprehensive profile dashboard.
 * UPDATED: Includes Soul Card Minting Logic.
 */
export async function renderProfile() {
    if (!state.currentUser || !state.playerProfile) return;

    await refreshPlayerState();
    const profile = state.playerProfile;

    // 1. Fetch auxiliary data
    const [{ data: playerCards }, { data: playerSpecs }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerSpecializations(state.currentUser.id)
    ]);
    
    // 2. Check for Soul Card status
    const hasSoulCard = playerCards ? playerCards.some(c => c.card_id === 9999 || c.card_id == '9999') : false;
    // Check if DNA exists (assumes dna_edu_level is a good indicator that protocol is synced)
    const hasDNA = profile.dna_edu_level !== null && profile.dna_edu_level !== undefined;

    // 3. Stats Calculation
    const totalCardsCount = playerCards ? playerCards.length : 0;
    const totalContractsCompleted = profile.completed_contracts_count || 0;
    
    const playerLevel = profile.level || 1;
    const currentXp = profile.xp || 0;
    const xpToNextLevel = profile.xp_to_next_level || 100;
    const xpProgressPercent = Math.min(100, (currentXp / xpToNextLevel) * 100);
    
    const specializationName = playerSpecs && playerSpecs.length > 0 
        ? playerSpecs[0].specialization_paths.name 
        : 'None Selected';

    // --- BUILD SOUL SECTION HTML ---
    let soulSectionHTML = '';
    
    if (hasSoulCard) {
        // الحالة الأولى: يمتلك الكارت بالفعل
        soulSectionHTML = `
            <div class="profile-section soul-active" style="border: 1px solid var(--primary-accent); background: rgba(212, 175, 55, 0.1);">
                <h3 style="color: var(--primary-accent);">🧬 الهوية الرقمية (Soul Matrix)</h3>
                <p style="font-family: monospace; color: #fff; text-align: center; letter-spacing: 2px;">
                    ${profile.dna_eve_code || 'UNKNOWN-DNA'}
                </p>
                <div style="text-align:center; font-size: 0.8em; color: var(--success-color);">
                    ✨ الروح مجسدة في كارت المرآة
                </div>
            </div>
        `;
    } else if (hasDNA) {
        // الحالة الثانية: لديه DNA لكن لم يصك الكارت (يظهر الزر)
        soulSectionHTML = `
            <div class="profile-section" style="text-align: center;">
                <h3 style="color: cyan;">تجسيد البروتوكول</h3>
                <p style="font-size: 0.9em; color: #ccc;">تم تحليل بروتوكولك بنجاح. بصمتك جاهزة للتجسيد.</p>
                <button id="mint-soul-btn" class="action-button" style="background: linear-gradient(45deg, #000, var(--primary-accent)); border: 1px solid gold;">
                    ⚡ تجسيد كارت الروح
                </button>
            </div>
        `;
    } else {
        // الحالة الثالثة: ليس لديه بروتوكول (لاعب جديد)
        soulSectionHTML = `
            <div class="profile-section" style="opacity: 0.7;">
                <h3 style="color: #888;">بروتوكول UCP مفقود</h3>
                <p style="font-size: 0.8em;">أكمل محادثتك مع "إيف" لتوليد بصمتك الروحية.</p>
            </div>
        `;
    }

    // 4. Build Main UI
    profileContainer.innerHTML = `
        <div class="profile-header">
            <img src="${profile.avatar_url || 'images/user_avatar.png'}" alt="Avatar" class="avatar">
            <h2>${profile.username || 'Explorer'}</h2>
            <p class="player-level">Level ${playerLevel}</p>
        </div>

        <!-- XP Section -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--success-color);">الخبرة (XP)</h3>
            <div class="xp-progress-container">
                <div class="progress-bar" style="background: #333; height: 10px; border-radius: 5px;">
                    <div class="progress-bar-inner" style="width: ${xpProgressPercent}%; height: 100%; background: var(--success-color);"></div>
                </div>
                <p style="text-align: center; font-size: 0.8em; margin-top: 5px;">${currentXp} / ${xpToNextLevel}</p>
            </div>
        </div>

        <!-- SOUL SECTION (Dynamic) -->
        ${soulSectionHTML}

        <!-- Stats Grid -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--accent-blue);">الإحصائيات</h3>
            <div class="profile-stats-grid main-stats">
                <div class="stat-box"><div class="value">${totalCardsCount}</div><div class="label">الكروت</div></div>
                <div class="stat-box"><div class="value">${totalContractsCompleted}</div><div class="label">العقود</div></div>
                <div class="stat-box" style="grid-column: span 2;"><div class="value" style="font-size:1em;">${specializationName}</div><div class="label">المسار</div></div>
            </div>
        </div>

        <!-- Currencies -->
        <div class="profile-section" style="width: 100%;">
            <h3 style="color: var(--primary-accent);">الخزينة</h3>
            <div class="profile-stats-grid currency-stats">
                <div class="stat-box"><div class="value">${profile.ankh_premium || 0} ☥</div><div class="label">Ankh</div></div>
                <div class="stat-box"><div class="value">${profile.prestige || 0} 🐞</div><div class="label">Prestige</div></div>
                <div class="stat-box"><div class="value">${profile.spin_tickets || 0} 🎟️</div><div class="label">Tickets</div></div>
                <div class="stat-box"><div class="value">${Math.floor(profile.noub_score || 0)} 🪙</div><div class="label">NOUB</div></div>
            </div>
        </div>
        
        <button id="logout-btn" class="action-button danger" style="margin-top: 20px;">تسجيل الخروج</button>
    `;

    // Attach Listeners
    document.getElementById('logout-btn').onclick = logout;
    
    // Attach Mint Button Listener if exists
    const mintBtn = document.getElementById('mint-soul-btn');
    if (mintBtn) {
        mintBtn.onclick = async () => {
            mintBtn.disabled = true;
            mintBtn.innerText = "جاري التجسيد...";
            
            // Call the API Wrapper we created in Step 1
            const { data, error } = await api.mintUserSoulCard(state.currentUser.id);
            
            if (!error) {
                import('../ui.js').then(ui => {
                    ui.playSound('reward_grand');
                    ui.showToast(`تم تجسيد الروح بنجاح! القوة: ${data.power_score}`, 'success');
                });
                // Re-render to show the "Soul Active" state
                renderProfile();
            } else {
                import('../ui.js').then(ui => ui.showToast(error.message, 'error'));
                mintBtn.disabled = false;
                mintBtn.innerText = "محاولة مرة أخرى";
            }
        };
    }
}

