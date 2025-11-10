/*
 * Filename: js/screens/library.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (OVERHAUL: 72 Entries Library Expansion)
 * Description: View Logic Module for the Tomb Encyclopedia (Library) screen. 
 * OVERHAUL: Expanded library to 72 entries and implemented sequential unlock logic for Ennead.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, openModal, navigateTo } from '../ui.js';
import { supabaseClient } from '../api.js';

const libraryContainer = document.getElementById('library-screen');

// --- EXPANDED MASTER LIBRARY DATA (72 Entries) ---
const MASTER_LIBRARY_DATA = {};

// Helper function to generate 62 KV entries
function generateKVEntries() {
    const kvData = [
        "KV1: Ramses VII", "KV2: Ramses IV", "KV3: Sons of Ramses II", "KV4: Ramses XI", "KV5: Sons of Ramses II", "KV6: Ramses IX",
        "KV7: Ramses I", "KV8: Merenptah", "KV9: Ramses V & VI", "KV10: Amenmesses", "KV11: Ramses III", "KV12: Unknown",
        "KV13: Bay", "KV14: Tausert & Setnakht", "KV15: Seti II", "KV16: Ramses", "KV17: Seti I", "KV18: Ramses X",
        "KV19: Montuherkhepshef", "KV20: Thutmose I & Hatshepsut", "KV21: Unknown", "KV22: Amenhotep III", "KV23: Ay", "KV24: Unknown",
        "KV25: Unknown", "KV26: Unknown", "KV27: Unknown", "KV28: Unknown", "KV29: Unknown", "KV30: Unknown", "KV31: Unknown", "KV32: Tia'a",
        "KV33: Unknown", "KV34: Thutmose III", "KV35: Amenhotep II", "KV36: Maiherpri", "KV37: Unknown", "KV38: Thutmose I", "KV39: Unknown", "KV40: Unknown",
        "KV41: Unknown", "KV42: Hatshepsut-Meryet-Ra", "KV43: Thutmose IV", "KV44: Unknown", "KV45: Userhet", "KV46: Yuya & Thuya", "KV47: Siptah",
        "KV48: Amenemope", "KV49: Unknown", "KV50: Unknown", "KV51: Unknown", "KV52: Unknown", "KV53: Unknown", "KV54: Tutankhamun cache?",
        "KV55: Amarna Cache (Akhenaten?)", "KV56: Gold Tomb?", "KV57: Horemheb", "KV58: Unknown (Chariot Tomb?)", "KV59: Unknown", "KV60: Sitre",
        "KV61: Unknown", "KV62: Tutankhamun"
    ];
    
    kvData.forEach((name, index) => {
        const id = `kv${index + 1}`;
        MASTER_LIBRARY_DATA[id] = { 
            id: id, 
            title: name, 
            content: `Detailed information about the ${name} tomb and its significance.`, 
            unlockCondition: { type: 'kv_completion', level: index + 1 } 
        };
    });
}

// Helper function to generate 10 Ennead entries (purchase unlocks)
function generateEnneadEntries() {
    const enneadGods = [
        { key: 'god_ra', name: 'Ra (The Sun)', desc: 'The Supreme God, creator of the world.' },
        { key: 'god_shu', name: 'Shu (The Air)', desc: 'God of air and separation.' },
        { key: 'god_tefnut', name: 'Tefnut (The Moisture)', desc: 'Goddess of moisture and cosmic order.' },
        { key: 'god_geb', name: 'Geb (The Earth)', desc: 'God of the Earth and vegetation.' },
        { key: 'god_nut', name: 'Nut (The Sky)', desc: 'Goddess of the Sky, swallowing the sun each evening.' },
        { key: 'god_osiris', name: 'Osiris (The Underworld)', desc: 'God of the afterlife, the dead, and the resurrection.' },
        { key: 'god_isis', name: 'Isis (Magic)', desc: 'Goddess of magic, motherhood, and healing.' },
        { key: 'god_set', name: 'Set (Chaos)', desc: 'God of chaos, storms, and the desert.' },
        { key: 'god_nephthys', name: 'Nephthys (Mourning)', desc: 'Goddess of the air, the night, and mourning.' },
        { key: 'god_horus', name: 'Horus (The King)', desc: 'God of kingship, the sky, and protection.' }
    ];
    
    let previousKey = null;
    enneadGods.forEach((god, index) => {
        MASTER_LIBRARY_DATA[god.key] = {
            id: god.key,
            title: `The Great Ennead: ${god.name}`,
            content: god.desc,
            unlockCondition: { type: 'item_purchase', previous: previousKey }
        };
        previousKey = god.key;
    });
}

// CRITICAL: Call generators on load
generateKVEntries();
generateEnneadEntries();


/**
 * Checks KV completion and updates library.
 * @param {number} kvLevelCompleted - The 1-based KV level number just completed.
 */
async function checkAndUnlockLibrary(kvLevelCompleted) {
    if (!state.currentUser) return;
    
    const { data: unlockedData } = await api.fetchPlayerLibrary(state.currentUser.id);
    const unlockedKeys = new Set(unlockedData.map(entry => entry.entry_key));
    
    const unlockPromises = [];
    let newUnlockCount = 0;

    const kvEntryKey = `kv${kvLevelCompleted}`;
    const entry = MASTER_LIBRARY_DATA[kvEntryKey];

    // Only unlock the completed KV gate
    if (entry && entry.unlockCondition.type === 'kv_completion' && !unlockedKeys.has(kvEntryKey)) {
        unlockPromises.push(
            supabaseClient.from('player_library').insert({
                player_id: state.currentUser.id,
                entry_key: kvEntryKey
            })
        );
        newUnlockCount++;
    }

    if (newUnlockCount > 0) {
        await Promise.all(unlockPromises);
        showToast(`New knowledge unearthed! ${newUnlockCount} Encyclopedia entries unlocked.`, 'success');
    }
}
export { checkAndUnlockLibrary };

/**
 * Renders the Tomb Encyclopedia.
 */
export async function renderLibrary() {
    if (!state.currentUser) return;
    
    if (!libraryContainer) {
        console.error("Library container not found in DOM.");
        return;
    }

    libraryContainer.innerHTML = '<h2>Tomb Encyclopedia</h2><div id="library-list-container">Loading entries...</div>';
    
    const listContainer = document.getElementById('library-list-container');
    
    const [{ data: unlockedData, error }, { data: kvProgress }] = await Promise.all([
        api.fetchPlayerLibrary(state.currentUser.id),
        api.fetchKVProgress(state.currentUser.id)
    ]);
    
    if (error) {
        listContainer.innerHTML = '<p class="error-message">Error loading Encyclopedia data.</p>';
        return;
    }
    
    const highestKVCompleted = (kvProgress?.current_kv_level || 1) - 1;
    const unlockedKeys = new Set(unlockedData.map(entry => entry.entry_key));
    
    // Sort by type then level/order
    const sortedEntryKeys = Object.keys(MASTER_LIBRARY_DATA).sort((a, b) => {
        const entryA = MASTER_LIBRARY_DATA[a];
        const entryB = MASTER_LIBRARY_DATA[b];
        
        // Group KV entries first
        const isKvA = entryA.unlockCondition.type === 'kv_completion';
        const isKvB = entryB.unlockCondition.type === 'kv_completion';

        if (isKvA && !isKvB) return -1;
        if (!isKvA && isKvB) return 1;

        // Sort KV by level
        if (isKvA && isKvB) {
            return entryA.unlockCondition.level - entryB.unlockCondition.level;
        }
        
        // Sort Ennead (Purchase) by order of entry
        return a.localeCompare(b); 
    });

    const libraryListHTML = sortedEntryKeys.map(key => {
        const entry = MASTER_LIBRARY_DATA[key];
        let isUnlocked = unlockedKeys.has(entry.id);
        let unlockText = 'Unlock condition unknown.';

        // Check unlock status for display
        if (entry.unlockCondition.type === 'kv_completion') {
            if (highestKVCompleted >= entry.unlockCondition.level) isUnlocked = true;
            unlockText = `Requires completing KV Gate ${entry.unlockCondition.level}. (Progress: KV${highestKVCompleted})`;
        } else if (entry.unlockCondition.type === 'item_purchase') {
            const isSequentialLocked = entry.unlockCondition.previous && !unlockedKeys.has(entry.unlockCondition.previous);
            if (!isUnlocked && isSequentialLocked) {
                unlockText = `Requires unlocking the previous Ennead entry first.`;
            } else if (!isUnlocked) {
                 unlockText = `Unlockable by purchasing the '${entry.title}' entry from the Shop.`;
            }
        }
        
        // Apply unlocked status for display even if DB hasn't been written to yet
        if (unlockedKeys.has(entry.id)) isUnlocked = true;


        return `
            <li class="library-entry ${isUnlocked ? '' : 'locked'}" onclick="${isUnlocked ? `window.openLibraryDetail('${entry.id}', '${entry.title}')` : `showToast('${unlockText.replace(/'/g, "\\'")}', 'info')`}" style="border-left: 5px solid ${isUnlocked ? 'var(--primary-accent)' : 'var(--text-secondary)'}; margin-bottom: 10px; padding: 10px; background: var(--surface-dark); border-radius: 8px; cursor: pointer;">
                <h4 style="color: ${isUnlocked ? 'var(--text-primary)' : 'var(--text-secondary)'}; margin-top: 0; margin-bottom: 5px;">${entry.title}</h4>
                <div class="entry-content" style="font-size: 0.9em; color: ${isUnlocked ? 'var(--text-secondary)' : '#606c6d'};">
                    ${isUnlocked ? (entry.content.length > 50 ? entry.content.substring(0, 50) + '...' : entry.content) : `[LOCKED] - ${unlockText}`}
                </div>
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul style="list-style: none; padding: 0;">${libraryListHTML}</ul>`;
}

/**
 * NEW: Global function to open a detail modal for a library entry.
 */
window.openLibraryDetail = function(entryId, entryTitle) {
    const entry = MASTER_LIBRARY_DATA[entryId];
    if (!entry) return;
    
    // Check for modal element existence (we need to assume index.html has a generic modal for details)
    let modal = document.getElementById('library-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'library-detail-modal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div id="library-detail-modal-content" class="modal-content">
                <button class="modal-close-btn" onclick="closeModal('library-detail-modal')">&times;</button>
                <h2></h2>
                <p></p>
                <div class="library-rewards"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.querySelector('#library-detail-modal-content h2').textContent = entryTitle;
    document.querySelector('#library-detail-modal-content p').textContent = entry.content;
    
    // Example of potential secret reward/link display
    let rewardHTML = '';
    if (entryId === 'kv62') {
         rewardHTML = '<p style="color:var(--success-color); font-weight:bold;">SECRET: You have earned the Pharaoh\'s Blessing! Check your Contracts for a hidden task.</p>';
    } else {
         rewardHTML = '<p style="color:var(--primary-accent);">No known secret reward for this entry yet.</p>';
    }
    document.querySelector('.library-rewards').innerHTML = rewardHTML;
    
    openModal('library-detail-modal');
}
