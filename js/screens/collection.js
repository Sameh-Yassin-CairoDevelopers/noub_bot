/*
 * Filename: js/screens/collection.js
 * Version: NOUB v5.0.0 (The Academic Master File)
 * Description: 
 * This module acts as the central controller for Player Assets.
 * It integrates three major subsystems:
 * 1. Inventory Management (Visualization, Filtering, Sorting).
 * 2. Progression Tracking (Albums & Collections).
 * 3. Asset Mutation Logic (Upgrading, Fusing, Sacrificing).
 * 
 * Dependencies: State, API, Auth, UI.
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound, triggerHaptic, triggerNotificationHaptic } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Reference
const collectionContainer = document.getElementById('collection-container');

// =============================================================================
// SECTION 1: CONFIGURATION & CONSTANTS
// =============================================================================

// Album Definitions (Previously in albums.js)
const MASTER_ALBUMS = [
    { 
        id: 1, 
        name: "The Sacred Ennead", 
        icon: "☀️", 
        description: "The nine foundational deities of Heliopolis creation myths.", 
        card_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9], 
        rewards: { noub: 2500, prestige: 50 } 
    },
    { 
        id: 2, 
        name: "Pharaonic Rulers", 
        icon: "👑", 
        description: "The greatest Pharaohs and Queens who shaped history.", 
        card_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18], 
        rewards: { noub: 4000, prestige: 100 } 
    },
    { 
        id: 3, 
        name: "Mythological Beasts", 
        icon: "🐉", 
        description: "Guardians and creatures from the Duat.", 
        card_ids: [19, 20, 21, 22, 23, 24, 25, 26, 27], 
        rewards: { noub: 1500, prestige: 30 } 
    }
];

// Burn Rewards Table (Deterministic outcome for sacrificing cards)
const CARD_BURN_REWARDS = {
    1: { type: 'CURRENCY', payload: { noub: 50, prestige: 1 } },
    2: { type: 'CURRENCY', payload: { noub: 75, prestige: 2 } },
    3: { type: 'CURRENCY', payload: { noub: 100, prestige: 3 } },
    4: { type: 'CURRENCY', payload: { noub: 250, prestige: 5 } },
    5: { type: 'CURRENCY', payload: { noub: 500, prestige: 8 } },
    6: { type: 'CURRENCY', payload: { noub: 1000, prestige: 12 } },
    7: { type: 'CURRENCY', payload: { noub: 2000, prestige: 20 } },
    8: { type: 'CURRENCY', payload: { noub: 3500, prestige: 35 } },
    9: { type: 'CURRENCY', payload: { noub: 5000, prestige: 50, ankh: 5 } },
    // Material Packs
    10: { type: 'RESOURCE_PACK', payload: [{ item_id: 1, quantity: 50 }] },
    11: { type: 'RESOURCE_PACK', payload: [{ item_id: 2, quantity: 75 }] },
    12: { type: 'RESOURCE_PACK', payload: [{ item_id: 3, quantity: 100 }] },
    13: { type: 'RESOURCE_PACK', payload: [{ item_id: 11, quantity: 20 }] },
    14: { type: 'RESOURCE_PACK', payload: [{ item_id: 12, quantity: 25 }] },
    15: { type: 'RESOURCE_PACK', payload: [{ item_id: 13, quantity: 30 }] },
    16: { type: 'RESOURCE_PACK', payload: [{ item_id: 25, quantity: 10 }] },
    17: { type: 'RESOURCE_PACK', payload: [{ item_id: 26, quantity: 5 }] },
    18: { type: 'RESOURCE_PACK', payload: [{ item_id: 40, quantity: 2 }, { item_id: 45, quantity: 1 }] },
    // Special Actions
    19: { type: 'SACRIFICE', action: 'INSTANT_CONTRACT', value: 1, text: "Complete 1 Contract" },
    20: { type: 'SACRIFICE', action: 'PRESTIGE_BOOST', value: 100, text: "Gain 100 Prestige" },
    21: { type: 'SACRIFICE', action: 'TICKET_BOOST', value: 20, text: "Gain 20 Tickets" },
    22: { type: 'SACRIFICE', action: 'ANKH_BOOST', value: 10, text: "Gain 10 Ankh" },
    'default': { type: 'CURRENCY', payload: { noub: 100 } }
};

// =============================================================================
// SECTION 2: VIEW CONTROLLER (Render & Tabs)
// =============================================================================

/**
 * Initializes the Collection Screen Layout.
 * ACADEMIC NOTE: Implements a Singleton UI pattern to prevent re-rendering 
 * the tab structure on every refresh, ensuring DOM stability.
 */
export async function renderCollection() {
    if (!state.currentUser) return;

    // 1. Layout Hard-Reset: Force block display to contain Tabs + Grid properly
    collectionContainer.style.display = 'block'; 
    collectionContainer.style.padding = '10px';

    // 2. Construct Tab Interface (Once)
    if (!document.getElementById('coll-tabs-ctrl')) {
        collectionContainer.innerHTML = `
            <h2 class="screen-title" style="text-align:center; color:var(--primary-accent); margin-bottom:15px;">Treasury</h2>
            
            <!-- TABS CONTROLLER -->
            <div id="coll-tabs-ctrl" style="display:flex; justify-content:space-around; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:5px;">
                <button class="coll-tab-btn active" data-target="inventory" 
                        style="flex:1; background:none; border:none; color:#fff; font-weight:bold; padding:10px; border-bottom:2px solid var(--primary-accent); cursor:pointer;">
                    My Cards
                </button>
                <button class="coll-tab-btn" data-target="albums" 
                        style="flex:1; background:none; border:none; color:#888; font-weight:bold; padding:10px; cursor:pointer;">
                    Albums
                </button>
            </div>

            <!-- DYNAMIC VIEWPORTS -->
            <div id="coll-view-inventory" class="coll-view"></div>
            <div id="coll-view-albums" class="coll-view hidden" style="display:flex; flex-direction:column; gap:15px;"></div>
        `;

        // 3. Bind Tab Switching Logic
        collectionContainer.querySelectorAll('.coll-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Reset Styles
                document.querySelectorAll('.coll-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#888';
                    b.style.borderBottom = 'none';
                });
                // Active Style
                e.target.classList.add('active');
                e.target.style.color = '#fff';
                e.target.style.borderBottom = '2px solid var(--primary-accent)';

                // View Switching
                document.querySelectorAll('.coll-view').forEach(v => v.classList.add('hidden'));
                const target = e.target.dataset.target;
                const activeView = document.getElementById(`coll-view-${target}`);
                activeView.classList.remove('hidden');

                // Dispatch Renderer
                if (target === 'inventory') renderInventoryView();
                else renderAlbumsView();
            });
        });
    }

    // 4. Initial Load
    renderInventoryView();
}
// =============================================================================
// SECTION 3: INVENTORY LOGIC (My Cards)
// =============================================================================

/**
 * Renders the User's Card Inventory.
 * LOGIC: 
 * 1. Parallel Fetch (Cards + Factories).
 * 2. O(1) Assignment Check via Set.
 * 3. Grouping by Master ID -> Sorting (Soul First).
 */
async function renderInventoryView() {
    const container = document.getElementById('coll-view-inventory');
    
    // Force Grid Layout Programmatically (Safety Net)
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(90px, 1fr))';
    container.style.gap = '12px';
    
    container.innerHTML = '<div class="loading-spinner" style="grid-column:1/-1; text-align:center;">Loading...</div>';

    // Fetch Data
    const [{ data: playerCards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    if (!playerCards || playerCards.length === 0) {
        container.style.display = 'block'; // Reset for text message
        return container.innerHTML = '<div class="empty-state" style="text-align:center; padding:20px;">Collection Empty</div>';
    }

    // Logic: Identify Busy Experts
    const assignedIds = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));

    // Grouping
    const cardMap = new Map();
    playerCards.forEach(pc => {
        if (!cardMap.has(pc.card_id)) cardMap.set(pc.card_id, { master: pc.cards, instances: [] });
        cardMap.get(pc.card_id).instances.push(pc);
    });

    // Sorting: Soul Card First -> Then ID
    const sorted = Array.from(cardMap.values()).sort((a, b) => {
        if (a.master.id == 9999) return -1;
        if (b.master.id == 9999) return 1;
        return a.master.id - b.master.id;
    });

    container.innerHTML = '';
    
    sorted.forEach(group => {
        const { master, instances } = group;
        // Display best stats
        const bestInst = instances.reduce((max, curr) => curr.level > max.level ? curr : max, instances[0]);
        const isAssigned = instances.some(i => assignedIds.has(i.instance_id));

        const el = document.createElement('div');
        // Inline styles to ensure stability regardless of CSS file state
        el.style.cssText = "position:relative; cursor:pointer;";
        
        if (master.id == 9999) {
            // Soul Card
            el.className = 'card-stack soul-card';
            el.innerHTML = `
                <div class="soul-glow"></div>
                <img src="${master.image_url}" class="card-image" style="width:100%; border-radius:6px;">
                <h4 style="color:var(--primary-accent); text-shadow:0 0 5px gold; margin:4px 0; font-size:0.8em;">${master.name}</h4>
                <div class="card-details"><span style="color:cyan;">${bestInst.power_score} PWR</span></div>
            `;
        } else {
            // Standard Card
            el.className = 'card-stack';
            el.setAttribute('data-rarity', master.rarity_level || 0);
            if (isAssigned) el.classList.add('assigned-expert');
            
            el.innerHTML = `
                ${isAssigned ? '<div style="position:absolute; top:0; right:0; font-size:1.2em;">⭐</div>' : ''}
                <img src="${master.image_url || 'images/default_card.png'}" class="card-image" style="width:100%; border-radius:6px;">
                <h4 style="margin:4px 0; font-size:0.8em;">${master.name}</h4>
                <div class="card-details" style="display:flex; justify-content:space-between; font-size:0.7em; color:#aaa;">
                    <span>Lvl ${bestInst.level}</span>
                    <span>x${instances.length}</span>
                </div>
            `;
        }

        // Connect to Instance Selection Modal (The new logic)
        el.onclick = () => {
            playSound('click');
            openInstanceSelectionModal(group, assignedIds);
        };
        
        container.appendChild(el);
    });
}
// =============================================================================
// SECTION 4: INSTANCE SELECTION & MODAL LOGIC
// =============================================================================

/**
 * Opens a modal listing ALL instances of a specific card type.
 * Allows the user to select WHICH specific copy to Upgrade, Burn, or Inspect.
 */

/**
 * MODAL 1: Lists all instances of a card type.
 * Users must select a SPECIFIC card instance to perform actions on.
 */
function openInstanceSelectionModal(cardGroup, assignedIds) {
    const { master, instances } = cardGroup;
    
    // Soul Card Protection
    if (master.id == 9999) {
        const modal = document.getElementById('card-interaction-modal');
        modal.innerHTML = `
            <div class="modal-content" style="text-align:center; border:2px solid gold;">
                <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
                <h3 style="color:gold;">The Soul Mirror</h3>
                <p style="color:#aaa;">Immutable Identity.</p>
            </div>`;
        openModal('card-interaction-modal');
        return;
    }

    // Sorting: Unlocked & High Level First
    instances.sort((a, b) => b.level - a.level);

    const listHTML = instances.map(inst => {
        const isAssigned = assignedIds.has(inst.instance_id);
        const isLocked = inst.is_locked;
        
        let statusHTML = '<span style="color:#0f0">Ready</span>';
        if (isAssigned) statusHTML = '<span style="color:gold">Expert (Busy)</span>';
        else if (isLocked) statusHTML = '<span style="color:red">Locked (Trade)</span>';

        return `
            <div class="instance-row" style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:10px; margin-bottom:5px; border-radius:6px;">
                <div>
                    <strong style="color:#fff;">Lvl ${inst.level}</strong> 
                    <span style="font-size:0.8em; color:#aaa;">(Power: ${inst.power_score})</span>
                </div>
                <div style="text-align:right; font-size:0.8em;">
                    ${statusHTML}
                    ${!isAssigned && !isLocked ? 
                        `<button class="action-button small" onclick="window.selectInstance('${inst.instance_id}')" style="margin-left:10px;">Select</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const modal = document.getElementById('card-interaction-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <div style="text-align:center; padding-bottom:10px; border-bottom:1px solid #444; margin-bottom:10px;">
                <img src="${master.image_url}" style="width:60px; border-radius:5px;">
                <h3 style="margin:5px 0; color:var(--primary-accent);">${master.name}</h3>
            </div>
            <div style="max-height:300px; overflow-y:auto;">${listHTML}</div>
        </div>
    `;
    
    // Store context for next step
    window.TempCardGroup = cardGroup; 
    openModal('card-interaction-modal');
}

/**
 * MODAL 2: Actions for the Selected Instance.
 * Calculates Fusion possibilities (Looking for duplicates of same level).
 */
window.selectInstance = (instanceId) => {
    const group = window.TempCardGroup;
    const target = group.instances.find(i => i.instance_id === instanceId);
    
    // Find Sacrifices: Same Level, Not Self, Not Locked
    const sacrifices = group.instances.filter(i => 
        i.instance_id !== instanceId && 
        i.level === target.level && 
        !i.is_locked
    );
    
    const canFuse = sacrifices.length > 0;
    const burnReward = CARD_BURN_REWARDS[group.master.id] || CARD_BURN_REWARDS['default'];

    const modal = document.getElementById('card-interaction-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <h3 style="text-align:center; color:var(--accent-blue);">Card Actions</h3>
            <p style="text-align:center; color:#aaa; font-size:0.9em;">Level ${target.level} Selected</p>

            <!-- FUSION -->
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; margin-bottom:10px; border:1px solid #444;">
                <h4 style="margin-top:0;">Fusion Upgrade</h4>
                <p style="font-size:0.8em; color:#aaa;">Requires another Level ${target.level} copy.</p>
                <button class="action-button" onclick="window.executeFusion('${instanceId}', '${sacrifices[0]?.instance_id}')" 
                        ${canFuse ? '' : 'disabled style="opacity:0.5"'}>
                    ${canFuse ? 'Fuse with Duplicate' : 'No Duplicates Found'}
                </button>
            </div>

            <!-- BURN -->
            <div style="background:rgba(255,0,0,0.1); padding:15px; border-radius:8px; border:1px solid var(--danger-color);">
                <h4 style="margin-top:0; color:var(--danger-color);">Sacrifice</h4>
                <p style="font-size:0.8em; color:#aaa;">Gain: ${burnReward.payload.noub} 🪙</p>
                <button class="action-button danger small" onclick="window.executeBurn('${instanceId}', ${group.master.id})">
                    Burn
                </button>
            </div>
        </div>
    `;
}
// =============================================================================
// SECTION 5: ACTION EXECUTION HANDLERS
// =============================================================================

window.handleFusion = async (targetId, sacrificeId) => {
    if (!sacrificeId) return;
    showToast("Fusing...", "info");

    // 1. Delete Sacrifice
    await api.deleteCardInstance(sacrificeId);
    
    // 2. Upgrade Target (Simple Logic: Level+1, Power+20%)
    const group = window.TempCardGroup;
    const target = group.instances.find(i => i.instance_id === targetId);
    const newLevel = target.level + 1;
    const newPower = Math.floor(target.power_score * 1.2);
    
    await api.performCardUpgrade(targetId, newLevel, newPower);
    
    playSound('reward_grand');
    showToast(`Success! Upgraded to Level ${newLevel}`, 'success');
    
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderInventoryView(); // Refresh UI
};

window.handleBurn = async (instanceId, masterId) => {
    const reward = CARD_BURN_REWARDS[masterId] || CARD_BURN_REWARDS['default'];
    
    if (!confirm(`Sacrifice this card?\nRewards: ${JSON.stringify(reward.payload || reward.text)}`)) return;
    
    showToast("Sacrificing...", "info");
    await api.deleteCardInstance(instanceId);
    
    // Grant Rewards
    let updates = {};
    if (reward.type === 'CURRENCY') {
        if(reward.payload.noub) updates.noub_score = (state.playerProfile.noub_score || 0) + reward.payload.noub;
        if(reward.payload.prestige) updates.prestige = (state.playerProfile.prestige || 0) + reward.payload.prestige;
        await api.updatePlayerProfile(state.currentUser.id, updates);
    }
    
    playSound('claim_reward');
    showToast("Sacrifice Complete.", 'success');
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderInventoryView();
};

// =============================================================================
// SECTION 6: ALBUMS LOGIC (Tab 2)
// =============================================================================

async function renderAlbumsView() {
    const container = document.getElementById('coll-view-albums');
    container.innerHTML = '<div class="loading-spinner"></div>';

    // Re-fetch cards to calculate completion
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const ownedCardIds = new Set(playerCards.map(c => c.card_id));

    container.innerHTML = `<div style="display:grid; gap:15px;"></div>`;
    const grid = container.querySelector('div');

    MASTER_ALBUMS.forEach(album => {
        const collected = album.card_ids.filter(id => ownedCardIds.has(id)).length;
        const total = album.card_ids.length;
        const isComplete = collected === total;
        const progress = Math.floor((collected / total) * 100);

        grid.innerHTML += `
            <div onclick="window.openAlbumDetails(${album.id})" 
                 style="background:#1e1e1e; padding:15px; border-radius:10px; cursor:pointer; border-left:4px solid ${isComplete ? 'var(--success-color)' : 'var(--primary-accent)'}; display:flex; justify-content:space-between; align-items:center;">
                
                <div style="display:flex; align-items:center; gap:15px;">
                    <div style="font-size:2em;">${album.icon}</div>
                    <div>
                        <h4 style="margin:0; color:#fff;">${album.name}</h4>
                        <div style="margin-top:5px; width:100px; height:6px; background:#333; border-radius:3px; overflow:hidden;">
                            <div style="width:${progress}%; height:100%; background:${isComplete ? 'var(--success-color)' : 'var(--primary-accent)'};"></div>
                        </div>
                        <div style="font-size:0.7em; color:#888; margin-top:3px;">${collected}/${total} Cards</div>
                    </div>
                </div>
                
                <div style="text-align:right;">
                    <div style="color:var(--accent-blue); font-size:0.8em; font-weight:bold;">+${album.rewards.noub}🪙</div>
                    <div style="font-size:1.2em; color:#666;">➜</div>
                </div>
            </div>
        `;
    });
}

window.openAlbumDetails = async (albumId) => {
    const album = MASTER_ALBUMS.find(a => a.id === albumId);
    const { data: masterCards } = await api.fetchAllMasterCards();
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    
    // Count owned copies
    const ownedCounts = new Map();
    playerCards.forEach(c => ownedCounts.set(c.card_id, (ownedCounts.get(c.card_id) || 0) + 1));

    // Create Modal
    const modalId = 'album-modal';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        document.body.appendChild(modal);
    }

    const slotsHTML = album.card_ids.map(id => {
        const card = masterCards.find(m => m.id === id) || { name: 'Unknown', image_url: 'images/default_card.png' };
        const count = ownedCounts.get(id) || 0;
        const isOwned = count > 0;

        return `
            <div style="text-align:center; opacity:${isOwned ? 1 : 0.4}; filter:${isOwned ? 'none' : 'grayscale(1)'};">
                <div style="position:relative; display:inline-block;">
                    <img src="${card.image_url}" style="width:60px; border-radius:6px; border:1px solid #444;">
                    ${isOwned ? `<div style="position:absolute; top:-5px; right:-5px; background:var(--success-color); color:#000; font-size:0.7em; padding:1px 4px; border-radius:4px;">x${count}</div>` : ''}
                </div>
                <div style="font-size:0.6em; margin-top:2px; color:#ccc;">${card.name}</div>
            </div>
        `;
    }).join('');

    const allCollected = album.card_ids.every(id => ownedCounts.get(id) > 0);

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-size:2.5em; margin-bottom:5px;">${album.icon}</div>
                <h3 style="margin:0; color:var(--primary-accent);">${album.name}</h3>
                <p style="font-size:0.8em; color:#888;">${album.description}</p>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:15px; margin-bottom:20px; background:#151515; padding:15px; border-radius:10px;">
                ${slotsHTML}
            </div>
            
            <button class="action-button" ${allCollected ? '' : 'disabled style="opacity:0.5"'} onclick="alert('Reward Logic Placeholder')">
                ${allCollected ? `Claim ${album.rewards.noub} 🪙` : 'Collect All to Claim'}
            </button>
        </div>
    `;
    openModal(modalId);
};

// =============================================================================
// --- GLOBAL BINDINGS (CRITICAL FOR BUTTON CLICKS) ---
// =============================================================================

window.renderCollection = renderCollection; // للوصول لها من القائمة الرئيسية
window.openInstanceSelectionModal = openInstanceSelectionModal; // لفتح قائمة النسخ
window.selectInstance = selectInstance; // لاختيار نسخة محددة
window.executeFusion = executeFusion; // لتنفيذ الدمج
window.executeBurn = executeBurn; // لتنفيذ الحرق
window.openAlbumDetail = openAlbumDetail; // لفتح الألبوم

// ملاحظة: تأكد أن هذه الأسماء تطابق أسماء الدوال المكتوبة داخل الملف

