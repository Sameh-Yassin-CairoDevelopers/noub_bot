/*
 * Filename: js/screens/exchange.js
 * Version: Pharaoh's Legacy 'NOUB' v0.3 (Economy Overhaul)
 * Description: Implements a single-page swap interface for currency conversion.
 * OVERHAUL: Logic completely rewritten to use the central exchange rate system from config.js.
 *           All conversions now correctly route through NOUB as an intermediary, applying the 20% conversion loss.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';
import { TOKEN_RATES, CURRENCY_MAP } from '../config.js'; // Import new constants

const exchangeContainer = document.getElementById('exchange-screen');
const MIN_CONVERSION_AMOUNT = 1;

// Global state for the exchange screen
let fromToken = 'NOUB';
let toToken = 'ANKH';

/**
 * Gets player balance based on the currency's key name.
 * @param {string} tokenName - The name of the token (e.g., 'NOUB', 'ANKH').
 * @returns {number} - The player's balance for that currency.
 */
function getBalance(tokenName) {
    const map = CURRENCY_MAP[tokenName.toUpperCase()];
    if (map && state.playerProfile) { 
        return Math.floor(state.playerProfile[map.key] || 0);
    }
    return 0;
}

/**
 * The core economic function. Calculates the conversion result between any two currencies.
 * All calculations are routed through NOUB to ensure economic stability and correct fee application.
 * @param {number} inputAmount - The amount of the 'fromToken' to convert.
 * @param {string} fromToken - The currency to convert from.
 * @param {string} toToken - The currency to convert to.
 * @returns {object} - An object containing the received amount and any potential errors.
 */
function calculateConversion(inputAmount, fromToken, toToken) {
    fromToken = fromToken.toUpperCase();
    toToken = toToken.toUpperCase();
    
    if (fromToken === toToken || isNaN(inputAmount) || inputAmount <= 0) {
        return { received: 0, required: 0 };
    }

    const rates = TOKEN_RATES.EXCHANGE_RATES;
    let noubValue = 0;
    let receivedAmount = 0;

    // Step 1: Convert the input amount ('fromToken') into its equivalent NOUB value.
    if (fromToken === 'NOUB') {
        noubValue = inputAmount;
    } else {
        // This is a "sell" operation (e.g., selling Prestige for NOUB).
        // We use the 'sell_for_noub' rate which includes the 20% loss.
        const sellRate = rates[fromToken]?.sell_for_noub;
        if (!sellRate) return { received: 0, error: 'Sell rate not defined.' };
        noubValue = inputAmount * sellRate;
    }

    // Step 2: Convert the NOUB value into the target currency ('toToken').
    if (toToken === 'NOUB') {
        receivedAmount = noubValue;
    } else {
        // This is a "buy" operation (e.g., using NOUB to buy Ankh).
        // We use the 'buy_for_noub' rate.
        const buyRate = rates[toToken]?.buy_for_noub;
        if (!buyRate) return { received: 0, error: 'Buy rate not defined.' };
        receivedAmount = noubValue / buyRate;
    }
    
    return { received: Math.floor(receivedAmount), required: inputAmount };
}


/**
 * Renders the entire Exchange Hub UI.
 */
export async function renderExchange() {
    if (!state.currentUser || !exchangeContainer) return;
    
    await refreshPlayerState();

    // Calculate the effective exchange rate for display (e.g., "1 Prestige ≈ 4000 Ankh")
    const rateResult = calculateConversion(1, fromToken, toToken);
    const displayRate = rateResult.received > 0 
        ? `1 ${CURRENCY_MAP[fromToken].icon} ≈ ${rateResult.received} ${CURRENCY_MAP[toToken].icon}`
        : "Select different currencies";

    exchangeContainer.innerHTML = `
        <h2 style="text-align: center;">Currency Swap</h2>
        <div style="text-align: center; margin-bottom: 15px;">
            <p id="conversion-display-rate" class="swap-rate-display">${displayRate}</p>
        </div>
        
        <!-- FROM BOX -->
        <div class="swap-box">
            <div class="swap-header">
                <span>From</span>
                <span class="swap-balance">Balance: ${getBalance(fromToken)} ${CURRENCY_MAP[fromToken].icon}</span>
            </div>
            <div class="swap-input-row">
                <input type="number" id="swap-input-from" placeholder="0" oninput="window.updateSwapOutput()" min="${MIN_CONVERSION_AMOUNT}">
                <select id="select-from-token" onchange="window.selectToken('from', this.value)"></select>
            </div>
        </div>

        <!-- SWAP BUTTON -->
        <div class="swap-icon-container">
            <button id="swap-icon-btn" class="action-button small" onclick="window.swapTokens()">
                <div style="font-size: 20px;">⇅</div>
            </button>
        </div>

        <!-- TO BOX -->
        <div class="swap-box">
            <div class="swap-header">
                <span>To</span>
                <span class="swap-balance">Balance: ${getBalance(toToken)} ${CURRENCY_MAP[toToken].icon}</span>
            </div>
            <div class="swap-input-row">
                <input type="number" id="swap-input-to" placeholder="0" readonly>
                <select id="select-to-token" onchange="window.selectToken('to', this.value)"></select>
            </div>
        </div>

        <button id="execute-swap-btn" class="action-button" onclick="window.executeSwap()">Swap</button>
        <div style="text-align: center; margin-top: 20px;">
            <p id="conversion-details" style="color: var(--text-secondary);"></p>
        </div>
    `;

    // Populate token dropdowns and select the current tokens
    const fromSelect = document.getElementById('select-from-token');
    const toSelect = document.getElementById('select-to-token');

    Object.keys(CURRENCY_MAP).forEach(token => {
        const fromOption = document.createElement('option');
        fromOption.value = token;
        fromOption.textContent = `${CURRENCY_MAP[token].name} (${CURRENCY_MAP[token].icon})`;
        if (token.toUpperCase() === fromToken.toUpperCase()) fromOption.selected = true;
        fromSelect.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = token;
        toOption.textContent = `${CURRENCY_MAP[token].name} (${CURRENCY_MAP[token].icon})`;
        if (token.toUpperCase() === toToken.toUpperCase()) toOption.selected = true;
        toSelect.appendChild(toOption);
    });
    
    window.updateSwapOutput();
}

/**
 * Updates the output field and conversion details based on the user's input.
 * This function is called every time the input amount changes.
 */
window.updateSwapOutput = function() {
    const inputElement = document.getElementById('swap-input-from');
    const outputElement = document.getElementById('swap-input-to');
    const detailsElement = document.getElementById('conversion-details');
    const swapBtn = document.getElementById('execute-swap-btn');
    const inputAmount = parseInt(inputElement.value);
    
    if (isNaN(inputAmount) || inputAmount < MIN_CONVERSION_AMOUNT) {
        outputElement.value = '';
        detailsElement.textContent = 'Enter an amount to swap.';
        swapBtn.disabled = true;
        return;
    }
    
    const result = calculateConversion(inputAmount, fromToken, toToken);
    
    if (result.error) {
        outputElement.value = '0';
        detailsElement.textContent = `Error: ${result.error}`;
        swapBtn.disabled = true;
    } else if (result.required > getBalance(fromToken)) {
        outputElement.value = '0';
        detailsElement.innerHTML = `Insufficient Balance. Need <span style="color: var(--danger-color);">${result.required} ${CURRENCY_MAP[fromToken].icon}</span>.`;
        swapBtn.disabled = true;
    } else {
        outputElement.value = result.received.toString();
        detailsElement.innerHTML = `You will receive ≈ ${result.received} ${CURRENCY_MAP[toToken].icon}.`;
        swapBtn.disabled = result.received === 0;
    }
}

/**
 * Sets the token for a specific swap box ('from' or 'to') and re-renders the UI.
 * @param {string} box - The box to change ('from' or 'to').
 * @param {string} newToken - The new token selected.
 */
window.selectToken = function(box, newToken) {
    if (box === 'from') {
        fromToken = newToken;
    } else {
        toToken = newToken;
    }
    // If both tokens are the same, automatically swap the other one.
    if (fromToken === toToken) {
        window.swapTokens();
    } else {
        renderExchange(); 
    }
}

/**
 * Swaps the 'from' and 'to' tokens and re-renders the UI.
 */
window.swapTokens = function() {
    [fromToken, toToken] = [toToken, fromToken]; // Modern way to swap variables
    renderExchange(); 
}

/**
 * Executes the final swap transaction after user confirmation.
 */
window.executeSwap = async function() {
    const inputElement = document.getElementById('swap-input-from');
    const amountToDeduct = parseInt(inputElement.value);
    
    if (isNaN(amountToDeduct) || amountToDeduct < MIN_CONVERSION_AMOUNT) {
        showToast("Invalid amount.", 'error');
        return;
    }
    
    const result = calculateConversion(amountToDeduct, fromToken, toToken);
    if (result.error || result.required > getBalance(fromToken) || result.received === 0) {
        showToast("Transaction failed: Invalid amount or insufficient balance.", 'error');
        return;
    }

    const updateObject = {};
    
    // Deduct from the source currency
    const fromKey = CURRENCY_MAP[fromToken].key;
    updateObject[fromKey] = getBalance(fromToken) - amountToDeduct;
    
    // Add to the destination currency
    const toKey = CURRENCY_MAP[toToken].key;
    updateObject[toKey] = getBalance(toToken) + result.received;

    // Execute the database update
    const { error } = await api.updatePlayerProfile(state.currentUser.id, updateObject);
    
    if (!error) {
        const description = `Swap: ${amountToDeduct} ${fromToken} → ${result.received} ${toToken}.`;
        await api.logActivity(state.currentUser.id, 'EXCHANGE', description);
        showToast(`Swap Complete! You received ${result.received} ${CURRENCY_MAP[toToken].icon}.`, 'success');
        
        await refreshPlayerState();
        renderExchange(); 
    } else {
        showToast('Error processing swap! Please try again.', 'error');
    }
}
