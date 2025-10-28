/*
 * Filename: js/screens/library.js
 * Version: NOUB 0.0.2 (LIBRARY MODULE - COMPLETE)
 * Description: View Logic Module for the Tomb Encyclopedia (Library) screen. 
 * Integrates data structure from 'noub original game.html' with Supabase status.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

const libraryContainer = document.getElementById('library-screen');

// --- MASTER LIBRARY DATA (Derived from noub original game.html logic) ---
// This acts as the *reference* data, while Supabase stores *which* entries are unlocked.
const MASTER_LIBRARY_DATA = {
    'valley_intro': { id: 'valley_intro', title: "Valley of the Kings", content: "The principal burial place of the major royal figures of the Egyptian New Kingdom...", unlockCondition: { type: 'initial', level: 0} },
    'kv1_info': { id: 'kv1_info', title: "KV1: Ramses VII", content: "The tomb of Ramses VII, a pharaoh of the 20th Dynasty. It's relatively small and unfinished compared to others.", unlockCondition: { type: 'kv_completion', level: 1 } },
    'dynasty_20': { id: 'dynasty_20', title: "The 20th Dynasty", content: "Characterized by the Ramesside pharaohs, internal strife, and the decline of royal power...", unlockCondition: { type: 'kv_completion', level: 7 } },
    'kv62_tut': { id: 'kv62_tut', title: "KV62: Tutankhamun's Tomb", content: "The legendary, nearly intact tomb of the Boy King. Unlocking this requires solving the final gate!", unlockCondition: { type: 'kv_completion', level: 62 } },
    'egyptian_gods': { id: 'egyptian_gods', title: "Major Egyptian Gods (Poster)", content: "Ra, Osiris, Isis, Horus, Anubis, Thoth - the most potent forces in the Egyptian cosmos.", unlockCondition: { type: 'item_purchase', itemId: 'lore_egypt'} }
    // More entries would be defined here...
};

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
    
    // 1. Fetch Unlocked Entries from Supabase
    const { data: unlockedData, error } = await api.fetchPlayerLibrary(state.currentUser.id);

    if (error) {
        listContainer.innerHTML = '<p class="error-message">Error loading Encyclopedia data.</p>';
        return;
    }

    // Convert unlocked data to a set for fast lookup
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
        const isUnlocked = unlockedKeys.has(key);
        
        let unlockText = 'Unlock condition unknown.';
        const unlockType = entry.unlockCondition.type;
        
        if (isUnlocked) {
             unlockText = 'Entry unlocked.';
        } else if (unlockType === 'kv_completion') {
            unlockText = `Requires completing KV Gate ${entry.unlockCondition.level}.`;
        } else if (unlockType === 'item_purchase') {
             // Placeholder for fetching item name, assuming a master item table exists later
            unlockText = `Unlockable by purchasing a specific item from the Shop.`;
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

// Export the function for use by ui.js
export { renderLibrary };
