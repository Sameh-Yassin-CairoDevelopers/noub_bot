/*
 * Filename: js/screens/library.js
 * Version: NOUB 0.0.4 (LIBRARY MODULE - CRITICAL FIX: Supabase Client Access & Unlocks linked to KV Progress)
 * Description: View Logic Module for the Tomb Encyclopedia (Library) screen. 
 * Now correctly links unlock status to the player's current highest KV Gate cleared and fixes the Supabase client access error.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
// FIX: Import supabaseClient from api.js to enable direct database operations (INSERT)
import { supabaseClient } from '../api.js'; 

const libraryContainer = document.getElementById('library-screen');

// --- MASTER LIBRARY DATA (Reference Data - Should match Supabase logic) ---
// unlockCondition.level refers to the KV Gate number (1-based index) required to open it.
const MASTER_LIBRARY_DATA = {
    'valley_intro': { id: 'valley_intro', title: "Valley of the Kings", content: "The principal burial place of the major royal figures of the Egyptian New Kingdom...", unlockCondition: { type: 'initial', level: 0} },
    'kv1_info': { id: 'kv1_info', title: "KV1: Ramses VII", content: "The tomb of Ramses VII, a pharaoh of the 20th Dynasty. It's relatively small and unfinished compared to others.", unlockCondition: { type: 'kv_completion', level: 1 } },
    'dynasty_20': { id: 'dynasty_20', title: "The 20th Dynasty", content: "Characterized by the Ramesside pharaohs, internal strife, and the decline of royal power...", unlockCondition: { type: 'kv_completion', level: 7 } },
    'kv62_tut': { id: 'kv62_tut', title: "KV62: Tutankhamun's Tomb", content: "The legendary, nearly intact tomb of the Boy King. Unlocking this requires solving the final gate!", unlockCondition: { type: 'kv_completion', level: 62 } },
    'egyptian_gods': { id: 'egyptian_gods', title: "Major Egyptian Gods (Poster)", content: "Ra, Osiris, Isis, Horus, Anubis, Thoth - the most potent forces in the Egyptian cosmos.", unlockCondition: { type: 'item_purchase', itemId: 'lore_egypt'} }
};

/**
 * Checks the KV completion status and updates player library in DB if a new entry is unlocked.
 * This function is called *after* a successful KV win.
 * @param {number} kvLevelCompleted - The 1-based KV level number that was just completed.
 */
async function checkAndUnlockLibrary(kvLevelCompleted) {
    if (!state.currentUser) return;
    
    // Fetch player's current library entries
    const { data: unlockedData } = await api.fetchPlayerLibrary(state.currentUser.id);
    const unlockedKeys = new Set(unlockedData.map(entry => entry.entry_key));
    
    const unlockPromises = [];
    let newUnlockCount = 0;

    for (const key in MASTER_LIBRARY_DATA) {
        const entry = MASTER_LIBRARY_DATA[key];
        const condition = entry.unlockCondition;

        // Check only KV completion conditions and if not already unlocked
        if (condition.type === 'kv_completion' && condition.level <= kvLevelCompleted && !unlockedKeys.has(key)) {
            // Use the directly imported supabaseClient for insert
            unlockPromises.push(
                supabaseClient.from('player_library').insert({
                    player_id: state.currentUser.id,
                    entry_key: key
                })
            );
            newUnlockCount++;
            unlockedKeys.add(key); // Add to set for immediate check if another entry has the same level
        }
    }

    if (newUnlockCount > 0) {
        // Run all pending inserts simultaneously
        const results = await Promise.all(unlockPromises);
        
        // Check for any errors in the inserts
        const errorCount = results.filter(r => r.error).length;
        if (errorCount === 0) {
             showToast(`New knowledge unearthed! ${newUnlockCount} Encyclopedia entries unlocked.`, 'success');
        } else {
             console.error("Library Unlock Error:", results.filter(r => r.error));
             showToast(`Error unlocking ${errorCount} entries. Check database connection.`, 'error');
        }
    }
}
// Exported to be called from kvgame.js after a win.
export { checkAndUnlockLibrary };

/**
 * Renders the Tomb Encyclopedia based on unlocked entries from Supabase.
 */
export async function renderLibrary() {
    if (!state.currentUser) return;
    
    if (!libraryContainer) {
        console.error("Library container not found in DOM.");
        return;
    }

    libraryContainer.innerHTML = '<h2>Tomb Encyclopedia</h2><div id="library-list-container">Loading entries...</div>';
    
    const listContainer = document.getElementById('library-list-container');
    
    // 1. Fetch Unlocked Entries from Supabase AND KV Progress
    const [{ data: unlockedData, error }, { data: kvProgress }] = await Promise.all([
        api.fetchPlayerLibrary(state.currentUser.id),
        api.fetchKVProgress(state.currentUser.id)
    ]);
    
    if (error) {
        listContainer.innerHTML = '<p class="error-message">Error loading Encyclopedia data.</p>';
        return;
    }
    
    // current_kv_level is the NEXT level to attempt, so current_kv_level - 1 is the highest completed level
    const highestKVCompleted = (kvProgress?.current_kv_level || 1) - 1;
    const unlockedKeys = new Set(unlockedData.map(entry => entry.entry_key));
    
    // 2. Determine sorted order (by unlock level/condition)
    const sortedEntryKeys = Object.keys(MASTER_LIBRARY_DATA).sort((a, b) => {
        const entryA = MASTER_LIBRARY_DATA[a];
        const entryB = MASTER_LIBRARY_DATA[b];
        
        const levelA = entryA.unlockCondition.level ?? 999;
        const levelB = entryB.unlockCondition.level ?? 999;

        if (levelA !== levelB) return levelA - levelB;
        return entryA.title.localeCompare(entryB.title);
    });

    // 3. Render List
    const libraryListHTML = sortedEntryKeys.map(key => {
        const entry = MASTER_LIBRARY_DATA[key];
        
        // Determine unlock status dynamically for display
        let isUnlocked = unlockedKeys.has(key) || entry.unlockCondition.type === 'initial';
        if (entry.unlockCondition.type === 'kv_completion' && highestKVCompleted >= entry.unlockCondition.level) {
             isUnlocked = true; 
        } else if (entry.unlockCondition.type === 'item_purchase') {
             isUnlocked = unlockedKeys.has(key);
        }

        let unlockText = 'Unlock condition unknown.';
        const unlockType = entry.unlockCondition.type;
        
        if (isUnlocked) {
             unlockText = 'Entry unlocked.';
        } else if (unlockType === 'kv_completion') {
            unlockText = `Requires completing KV Gate ${entry.unlockCondition.level}. (Current Progress: KV${highestKVCompleted})`;
        } else if (unlockType === 'item_purchase') {
            unlockText = `Unlockable by purchasing the 'Egyptian Gods Poster' from the Shop.`;
        }
        
        return `
            <li class="library-entry ${isUnlocked ? '' : 'locked'}" style="border-left: 5px solid ${isUnlocked ? 'var(--primary-accent)' : 'var(--text-secondary)'}; margin-bottom: 10px; padding: 10px; background: var(--surface-dark); border-radius: 8px;">
                <h4 style="color: ${isUnlocked ? 'var(--text-primary)' : 'var(--text-secondary)'}; margin-top: 0; margin-bottom: 5px;">${entry.title}</h4>
                <div class="entry-content" style="font-size: 0.9em; color: ${isUnlocked ? 'var(--text-secondary)' : '#606c6d'};">
                    ${isUnlocked ? entry.content : `[LOCKED] - ${unlockText}`}
                </div>
            </li>
        `;
    }).join('');

    listContainer.innerHTML = `<ul style="list-style: none; padding: 0;">${libraryListHTML}</ul>`;
}
