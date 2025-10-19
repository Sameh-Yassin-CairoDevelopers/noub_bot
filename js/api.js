
import { supabaseClient } from './config.js';

export async function fetchProfile(userId) {
    return await supabaseClient.from('profiles').select('*').eq('id', userId).single();
}

export async function fetchPlayerCards(playerId) {
    return await supabaseClient.from('player_cards').select('cards(*)').eq('player_id', playerId);
}

export async function fetchAllMasterCards() {
    return await supabaseClient.from('cards').select('id');
}

export async function updatePlayerScore(playerId, newScore) {
    return await supabaseClient.from('profiles').update({ score: newScore }).eq('id', playerId);
}

export async function addCardToPlayerCollection(playerId, cardId) {
    return await supabaseClient.from('player_cards').insert({ player_id: playerId, card_id: cardId });
} 