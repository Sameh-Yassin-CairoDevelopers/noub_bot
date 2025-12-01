/*
 * Filename: js/screens/collection.js
 * Version: NOUB v7.0.0 (The Master Academic Edition)
 * Author: Sameh Yassin & Co-Pilot
 * 
 * -----------------------------------------------------------------------------
 * MODULE DOCUMENTATION
 * -----------------------------------------------------------------------------
 * This module serves as the consolidated Controller for the Player's Assets.
 * It unifies the previously separate 'Collection' and 'Albums' modules into
 * a single, robust interface using a Tabbed View System.
 * 
 * CORE FUNCTIONS:
 * 1. Initialization: Sets up a conflict-free DOM structure.
 * 2. Inventory Logic: Renders owned cards with "Soul Card" priority.
 * 3. Asset Mutation: Implements "Fusion" (Merge) and "Sacrifice" (Burn) logic.
 * 4. Progression: Tracks and rewards Album completion.
 * 
 * -----------------------------------------------------------------------------
 */

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, playSound } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// DOM Reference (The main container div in index.html)
const collectionContainer = document.getElementById('collection-container');

// =============================================================================
// SECTION 1: STATIC DATA CONFIGURATION
// =============================================================================

/**
 * Master Albums Definition.
 * Includes the original 3 albums plus the 2 new expansions (Dendera & Arsenal).
 */
const MASTER_ALBUMS = [
    { 
        id: 1, name: "The Sacred Ennead", icon: "☀️", 
        description: "The nine foundational deities of creation.", 
        card_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9], 
        rewards: { noub: 2500, prestige: 50 } 
    },
    { 
        id: 2, name: "Pharaonic Rulers", icon: "👑", 
        description: "Greatest Kings and Queens of Egypt.", 
        card_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18], 
        rewards: { noub: 4000, prestige: 100 } 
    },
    { 
        id: 3, name: "Mythological Beasts", icon: "🐉", 
        description: "Guardians and creatures from the Duat.", 
        card_ids: [19, 20, 21, 22, 23, 24, 25, 26, 27], 
        rewards: { noub: 1500, prestige: 30 } 
    },
    { 
        id: 4, name: "Dendera Temple", icon: "🌌", 
        description: "Secrets of Astronomy, Time, and Science.", 
        card_ids: [28, 29, 30, 31, 32, 33, 34, 35, 36], 
        rewards: { noub: 6000, prestige: 50 } 
    },
    { 
        id: 5, name: "Royal Arsenal", icon: "⚔️", 
        description: "Tools of War and Military Might.", 
        card_ids: [37, 38, 39, 40, 41, 42, 43, 44, 45], 
        rewards: { noub: 8000, prestige: 100 } 
    }
];

/**
 * Deterministic Reward Table for Card Sacrifice.
 * Key: Card ID (or 'default'), Value: Reward Object.
 */
const CARD_BURN_REWARDS = {
    'default': { type: 'CURRENCY', payload: { noub: 100 } }
    // Specific IDs can be added here if needed in future balancing
};

// =============================================================================
// SECTION 2: INITIALIZATION & TAB SYSTEM
// =============================================================================

/**
 * [Function 1] renderCollection
 * The Entry Point. Configures the layout and initializes the tab system.
 * Uses Inline Styles to guarantee layout stability regardless of external CSS.
 */
export async function renderCollection() {
    if (!state.currentUser) return;

    // 1. Layout Enforcement: Clear collisions
    collectionContainer.style.display = 'block';
    collectionContainer.style.padding = '10px';

    // 2. Construct Singleton UI (Header & Tabs)
    if (!document.getElementById('coll-tabs-ctrl')) {
        collectionContainer.innerHTML = `
            <h2 class="screen-title" style="text-align:center; color:var(--primary-accent); margin-bottom:15px;">Treasury & Archives</h2>
            
            <!-- TAB CONTROLLER -->
            <div id="coll-tabs-ctrl" style="display:flex; justify-content:space-around; margin-bottom:20px; border-bottom:1px solid #444; background:rgba(0,0,0,0.2); border-radius:8px; padding:5px;">
                <button class="coll-tab-btn active" data-target="inventory" 
                        style="flex:1; background:none; border:none; color:#fff; font-weight:bold; padding:12px; border-bottom:2px solid var(--primary-accent); cursor:pointer;">
                    My Cards
                </button>
                <button class="coll-tab-btn" data-target="albums" 
                        style="flex:1; background:none; border:none; color:#888; font-weight:bold; padding:12px; cursor:pointer;">
                    Albums
                </button>
            </div>

            <!-- VIEWPORT 1: INVENTORY -->
            <div id="coll-view-inventory" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); gap:12px;"></div>

            <!-- VIEWPORT 2: ALBUMS -->
            <div id="coll-view-albums" style="display:none; flex-direction:column; gap:15px;"></div>
        `;

        // 3. Bind Tab Events
        const tabs = collectionContainer.querySelectorAll('.coll-tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Style Update
                tabs.forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#888';
                    b.style.borderBottom = 'none';
                });
                e.target.classList.add('active');
                e.target.style.color = '#fff';
                e.target.style.borderBottom = '2px solid var(--primary-accent)';

                // View Switching Logic
                const target = e.target.dataset.target;
                const invView = document.getElementById('coll-view-inventory');
                const albView = document.getElementById('coll-view-albums');

                if (target === 'inventory') {
                    invView.style.display = 'grid'; // Show Grid
                    albView.style.display = 'none'; // Hide List
                    renderInventoryView();
                } else {
                    invView.style.display = 'none'; // Hide Grid
                    albView.style.display = 'flex'; // Show Flex List
                    renderAlbumsView();
                }
            });
        });
    }

    // Initial Data Load
    renderInventoryView();
}

// =============================================================================
// SECTION 3: INVENTORY LOGIC (VIEW 1)
// =============================================================================

/**
 * [Function 2] renderInventoryView
 * Fetches Cards + Factories. Aggregates duplicates. Renders the Card Grid.
 * Handles the visual priority of the Soul Card.
 */
async function renderInventoryView() {
    const container = document.getElementById('coll-view-inventory');
    container.innerHTML = '<div class="loading-spinner" style="grid-column:1/-1; text-align:center; color:#aaa;">Loading...</div>';

    // Parallel Fetch
    const [{ data: playerCards }, { data: factories }] = await Promise.all([
        api.fetchPlayerCards(state.currentUser.id),
        api.fetchPlayerFactories(state.currentUser.id)
    ]);

    if (!playerCards || playerCards.length === 0) {
        container.style.display = 'block';
        return container.innerHTML = '<div class="empty-state" style="text-align:center; color:#666;">Collection Empty</div>';
    } else {
        container.style.display = 'grid'; // Ensure Grid
    }

    // O(1) Set for Expert Checking
    const assignedIds = new Set(factories.map(f => f.assigned_card_instance_id).filter(Boolean));

    // Aggregation: Map<CardID, {Master, Instances[]}>
    const cardMap = new Map();
    playerCards.forEach(pc => {
        if (!cardMap.has(pc.card_id)) cardMap.set(pc.card_id, { master: pc.cards, instances: [] });
        cardMap.get(pc.card_id).instances.push(pc);
    });

    // Sorting: Soul Card (9999) First
    const sorted = Array.from(cardMap.values()).sort((a, b) => {
        if (a.master.id == 9999) return -1;
        if (b.master.id == 9999) return 1;
        return a.master.id - b.master.id;
    });

    container.innerHTML = '';
    
    sorted.forEach(group => {
        const { master, instances } = group;
        const displayInst = instances.reduce((max, curr) => curr.level > max.level ? curr : max, instances[0]);
        const isGroupAssigned = instances.some(i => assignedIds.has(i.instance_id));

        const el = document.createElement('div');
        // Using Original Class Names + Inline Fixes
        el.className = 'card-stack'; 
        el.setAttribute('data-rarity', master.rarity_level || 0);
        if (isGroupAssigned) el.classList.add('assigned-expert');
        
        // Visual Render
        if (master.id == 9999) {
            // Soul Card Special Visuals
            el.classList.add('soul-card');
            el.style.cssText = "border: 2px solid gold; box-shadow: 0 0 10px rgba(212,175,55,0.5);";
            const dna = state.playerProfile.dna_eve_code || 'DNA';
            el.innerHTML = `
                <div class="soul-glow"></div>
                <img src="${master.image_url}" class="card-image" style="width:100%; border-radius:6px;">
                <h4 style="color:gold; margin:5px 0; font-size:0.8em;">${master.name}</h4>
                <div class="card-details"><span style="color:cyan;">PWR: ${displayInst.power_score}</span></div>
                <div style="font-size:0.5em; color:#aaa;">${dna}</div>
            `;
        } else {
            // Standard Visuals
            el.innerHTML = `
                ${isGroupAssigned ? '<div style="position:absolute; top:2px; right:2px; font-size:1.2em;">⭐</div>' : ''}
                <img src="${master.image_url || 'images/default_card.png'}" class="card-image" style="width:100%; border-radius:6px;">
                <h4 style="margin:5px 0 2px 0; font-size:0.8em; color:#fff;">${master.name}</h4>
                <div class="card-details" style="display:flex; justify-content:space-between; width:100%; font-size:0.7em; color:#aaa;">
                    <span>Lvl ${displayInst.level}</span>
                    <span>x${instances.length}</span>
                </div>
            `;
        }

        el.onclick = () => {
            playSound('click');
            openInstanceSelectionModal(group, assignedIds);
        };
        container.appendChild(el);
    });
}

// =============================================================================
// SECTION 4: INTERACTION & MODALS (Logic Hub)
// =============================================================================

/**
 * [Function 3] openInstanceSelectionModal
 * Displays all copies of a card type.
 * Filters and flags copies based on Status (Expert/Locked/Ready).
 */
function openInstanceSelectionModal(cardGroup, assignedIds) {
    const { master, instances } = cardGroup;
    
    if (master.id == 9999) {
        alert("Soul Card is Immutable.");
        return;
    }

    instances.sort((a, b) => b.level - a.level); // High level first

    const listHTML = instances.map(inst => {
        const isAssigned = assignedIds.has(inst.instance_id);
        const isLocked = inst.is_locked;
        
        let statusHTML = '<span style="color:#0f0">Ready</span>';
        let actionBtn = `<button class="action-button small" onclick="window.selectInstance('${inst.instance_id}')" style="margin-left:10px;">Manage</button>`;

        if (isAssigned) {
            statusHTML = '<span style="color:gold">Busy (Expert)</span>';
            actionBtn = ''; 
        } else if (isLocked) {
            statusHTML = '<span style="color:red">Locked (Trade)</span>';
            actionBtn = '';
        }

        return `
            <div class="instance-row" style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:10px; margin-bottom:5px; border-radius:5px; border:1px solid #444;">
                <div>
                    <strong style="color:#fff;">Lvl ${inst.level}</strong> 
                    <span style="font-size:0.8em; color:#aaa;">(Pwr ${inst.power_score})</span>
                </div>
                <div style="text-align:right; font-size:0.8em;">
                    ${statusHTML}
                    ${actionBtn}
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
    
    window.TempCardGroup = cardGroup; 
    openModal('card-interaction-modal');
}

/**
 * [Function 4] selectInstance
 * The Decision Logic. Determines if Fusion is possible for the selected card.
 * Looks for duplicates of the same level to act as fuel.
 */
window.selectInstance = (instanceId) => {
    const group = window.TempCardGroup;
    const target = group.instances.find(i => i.instance_id === instanceId);
    
    // FUSION LOGIC: Find valid sacrifices (Same Level, Not Self, Not Locked)
    const duplicates = group.instances.filter(i => 
        i.instance_id !== instanceId && 
        i.level === target.level && 
        !i.is_locked
        // Note: assignedIds filtered out in Step 3 UI, but server will reject if force called.
    );
    
    const canFuse = duplicates.length > 0;
    const nextLevel = target.level + 1;

    const modal = document.getElementById('card-interaction-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('card-interaction-modal')">&times;</button>
            <h3 style="text-align:center; color:var(--accent-blue); margin-bottom:15px;">Action: Level ${target.level}</h3>
            
            <!-- FUSION -->
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; margin-bottom:10px; border:1px solid #444;">
                <h4 style="margin-top:0;">Fusion Upgrade ➜ Lvl ${nextLevel}</h4>
                <p style="font-size:0.8em; color:#aaa; margin-bottom:10px;">
                    Combines 2x Level ${target.level} cards.<br>
                    Available Duplicates: <strong style="color:#fff;">${duplicates.length}</strong>
                </p>
                <button class="action-button" onclick="window.executeFusion('${instanceId}', '${duplicates[0]?.instance_id}')" 
                        ${canFuse ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}>
                    ${canFuse ? 'Fuse Now' : 'Need Duplicate'}
                </button>
            </div>

            <!-- BURN -->
            <div style="background:rgba(255,0,0,0.1); padding:15px; border-radius:8px; border:1px solid var(--danger-color);">
                <h4 style="margin:0 0 5px 0; color:var(--danger-color);">Sacrifice</h4>
                <button class="action-button danger small" onclick="window.executeBurn('${instanceId}', ${group.master.id})">
                    Burn for 100 🪙
                </button>
            </div>
        </div>
    `;
}

// =============================================================================
// SECTION 5: ACTION HANDLERS (Data Mutation)
// =============================================================================

/**
 * [Function 5] executeFusion
 * Performs the merge: Deletes Sacrifice -> Upgrades Target.
 */
window.executeFusion = async (targetId, sacrificeId) => {
    if (!sacrificeId) return;
    showToast("Fusing Energies...", "info");

    // 1. Delete Sacrifice
    await api.deleteCardInstance(sacrificeId);
    
    // 2. Upgrade Target
    const group = window.TempCardGroup;
    const target = group.instances.find(i => i.instance_id === targetId);
    const newLevel = target.level + 1;
    const newPower = Math.floor(target.power_score * 1.25); // +25% Power Curve
    
    await api.performCardUpgrade(targetId, newLevel, newPower);
    
    playSound('reward_grand');
    showToast(`Fusion Successful! Card is now Level ${newLevel}`, 'success');
    
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderInventoryView();
};

/**
 * [Function 6] executeBurn
 * Performs sacrifice: Deletes Card -> Grants Currency.
 */
window.executeBurn = async (instanceId, masterId) => {
    if(!confirm("Sacrifice this card permanently for resources?")) return;
    
    showToast("Sacrificing...", "info");
    await api.deleteCardInstance(instanceId);
    
    // Reward Logic
    const reward = CARD_BURN_REWARDS[masterId] || CARD_BURN_REWARDS['default'];
    if (reward.type === 'CURRENCY') {
        const updates = {};
        if(reward.payload.noub) updates.noub_score = (state.playerProfile.noub_score || 0) + reward.payload.noub;
        await api.updatePlayerProfile(state.currentUser.id, updates);
    }
    
    playSound('claim_reward');
    showToast("Sacrifice Accepted.", 'success');
    await refreshPlayerState();
    window.closeModal('card-interaction-modal');
    renderInventoryView();
};

// =============================================================================
// SECTION 6: ALBUMS VIEW (Tab 2 Logic)
// =============================================================================

/**
 * [Function 7] renderAlbumsView
 * Renders the 5 progression albums.
 */
async function renderAlbumsView() {
    const container = document.getElementById('coll-view-albums');
    container.innerHTML = '<div class="loading-spinner"></div>';
    
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    const ownedIds = new Set(playerCards.map(c => c.card_id));
    
    container.innerHTML = `<div style="display:grid; gap:15px;"></div>`;
    const list = container.querySelector('div');

    MASTER_ALBUMS.forEach(album => {
        const collected = album.card_ids.filter(id => ownedIds.has(id)).length;
        const total = album.card_ids.length;
        const isComplete = collected === total;
        const percent = Math.floor((collected / total) * 100);
        
        list.innerHTML += `
            <div class="album-card" onclick="window.openAlbumDetails(${album.id})" 
                 style="background:#1e1e1e; padding:15px; border-radius:10px; cursor:pointer; border-left:4px solid ${isComplete ? 'var(--success-color)' : 'var(--primary-accent)'}; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:15px; align-items:center;">
                    <div style="font-size:2.5em;">${album.icon}</div>
                    <div>
                        <h4 style="margin:0; color:#fff;">${album.name}</h4>
                        <div style="width:100px; height:8px; background:#333; border-radius:4px; margin-top:5px; overflow:hidden;">
                            <div style="height:100%; width:${percent}%; background:${isComplete ? 'var(--success-color)' : 'var(--primary-accent)'}; transition:width 0.5s;"></div>
                        </div>
                        <div style="font-size:0.75em; color:#888; margin-top:3px;">${collected} / ${total} Found</div>
                    </div>
                </div>
                <div style="color:var(--accent-blue); font-weight:bold; font-size:0.9em;">➜</div>
            </div>
        `;
    });
}

/**
 * [Function 8] openAlbumDetails
 * Shows the 3x3 Grid of cards within an album.
 */
window.openAlbumDetails = async (albumId) => {
    const album = MASTER_ALBUMS.find(a => a.id === albumId);
    const { data: masterCards } = await api.fetchAllMasterCards();
    const { data: playerCards } = await api.fetchPlayerCards(state.currentUser.id);
    
    const ownedMap = new Map();
    playerCards.forEach(c => ownedMap.set(c.card_id, (ownedMap.get(c.card_id)||0) + 1));

    const modalId = 'card-interaction-modal'; // Reuse generic modal
    const modal = document.getElementById(modalId);

    const slotsHTML = album.card_ids.map(id => {
        const card = masterCards.find(m => m.id === id) || { name: 'Hidden', image_url: 'images/default_card.png' };
        const count = ownedMap.get(id) || 0;
        const isOwned = count > 0;

        return `
            <div style="text-align:center; opacity:${isOwned ? 1 : 0.3}; filter:${isOwned ? 'none' : 'grayscale(1)'};">
                <div style="position:relative; display:inline-block;">
                    <img src="${card.image_url}" style="width:60px; height:60px; border-radius:6px; border:1px solid #555;">
                    ${isOwned ? `<div style="position:absolute; top:-5px; right:-5px; background:var(--success-color); color:#000; font-weight:bold; font-size:0.7em; padding:0 4px; border-radius:4px;">x${count}</div>` : ''}
                </div>
                <div style="font-size:0.6em; margin-top:4px; color:#ccc; max-width:60px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.name}</div>
            </div>
        `;
    }).join('');

    const allCollected = album.card_ids.every(id => ownedMap.get(id) > 0);

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" onclick="window.closeModal('${modalId}')">&times;</button>
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-size:3em; margin-bottom:5px;">${album.icon}</div>
                <h3 style="margin:0; color:var(--primary-accent);">${album.name}</h3>
                <p style="font-size:0.8em; color:#888;">${album.description}</p>
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:15px; margin-bottom:20px; background:#151515; padding:15px; border-radius:10px; max-height:250px; overflow-y:auto;">
                ${slotsHTML}
            </div>
            <div style="text-align:center;">
                <button id="claim-album-btn" class="action-button" ${allCollected ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}>
                    ${allCollected ? `Claim ${album.rewards.noub} 🪙` : 'Collect All to Claim'}
                </button>
            </div>
        </div>
    `;
    
    openModal(modalId);
    document.getElementById('claim-album-btn').onclick = () => claimAlbumReward(album);
};

/**
 * [Function 9] claimAlbumReward
 * Grants the completion bonus.
 */
async function claimAlbumReward(album) {
    if (!confirm("Claim this album reward?")) return;
    
    const updates = {
        noub_score: (state.playerProfile.noub_score || 0) + album.rewards.noub,
        prestige: (state.playerProfile.prestige || 0) + (album.rewards.prestige || 0)
    };
    
    await api.updatePlayerProfile(state.currentUser.id, updates);
    await api.logActivity(state.currentUser.id, 'ALBUM_COMPLETE', `Completed ${album.name}`);
    
    playSound('reward_grand');
    showToast("Reward Claimed!", 'success');
    
    // Close modal
    window.closeModal('card-interaction-modal');
    // Refresh View
    refreshPlayerState();
}

// =============================================================================
// SECTION 7: GLOBAL BINDINGS
// =============================================================================
window.renderCollection = renderCollection;
window.openInstanceSelectionModal = openInstanceSelectionModal;
window.selectInstance = selectInstance;
window.executeFusion = executeFusion;
window.executeBurn = executeBurn;
window.openAlbumDetails = openAlbumDetails;
