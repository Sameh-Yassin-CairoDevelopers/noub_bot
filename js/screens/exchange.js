/*
 * Filename: js/screens/exchange.js
 * Version: NOUB 0.0.4 (WEB3 SWAP UI OVERHAUL - FINAL CODE)
 * Description: Implements a single-page swap interface (like a DEX/Wallet) for currency conversion.
 * Includes UX features: From/To boxes, Max/Percentage buttons, and dynamic display.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast, updateHeaderUI, openModal } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const exchangeContainer = document.getElementById('exchange-screen');

// --- EXCHANGE RATES (Based on Economic Plan) ---
const RATES = {
    // Key: FROM_TO
    "ANKH_PRESTIGE": 1000, 
    "PRESTIGE_ANKH": 1000, 
    "ANKH_TICKET": 100, 
    "TICKET_ANKH": 100, 
    "ANKH_BLESSING": 500,
    "BLESSING_ANKH": 500
};
const MIN_CONVERSION_AMOUNT = 1;

// Maps short codes to playerProfile keys and display names
const CURRENCY_MAP = {
    'ANKH': { key: 'score', icon: '☥', rate: RATES.PRESTIGE_ANKH },
    'PRESTIGE': { key: 'prestige', icon: '🐞', rate: RATES.ANKH_TO_PRESTIGE },
    'TICKET': { key: 'spin_tickets', icon: '🎟️', rate: RATES.ANKH_TO_TICKET },
    'BLESSING': { key: 'blessing', icon: '🗡️', rate: RATES.ANKH_TO_BLESSING },
};

let fromToken = 'ANKH';
let toToken = 'PRESTIGE';

/**
 * Gets player balance based on token name.
 */
function getBalance(tokenName) {
    const map = CURRENCY_MAP[tokenName.toUpperCase()];
    if (map) {
        return state.playerProfile[map.key] || 0;
    }
    return 0;
}

/**
 * Calculates the amount received and required based on current conversion.
 */
function calculateConversion(inputAmount, fromToken, toToken) {
    const fromMap = CURRENCY_MAP[fromToken];
    const toMap = CURRENCY_MAP[toToken];
    const rateKey = `${fromToken}_${toToken}`;
    let costRate = RATES[rateKey];
    
    if (!costRate) {
        const inverseRateKey = `${toToken}_${fromToken}`;
        costRate = RATES[inverseRateKey];
        if (!costRate) return { received: 0, required: 0 };
        
        // This is X -> ANKH conversion
        const received = inputAmount * costRate;
        const required = inputAmount;
        return { received: Math.floor(received), required: required };
    }
    
    // This is ANKH -> X conversion (where X is Prestige, Ticket, Blessing)
    const required = inputAmount;
    const received = inputAmount / costRate;
    
    // Enforce divisibility for ANKH -> X
    if (inputAmount % costRate !== 0) return { received: 0, required: inputAmount, error: `Must be a multiple of ${costRate}.` };
    
    return { received: Math.floor(received), required: required };
}


/**
 * Renders the Exchange Hub UI.
 */
export async function renderExchange() {
    if (!state.currentUser) return;

    if (!exchangeContainer) return;
    
    await refreshPlayerState();

    exchangeContainer.innerHTML = `
        <h2 style="text-align: center;">Currency Swap (DEX Style)</h2>
        
        <!-- FROM BOX -->
        <div class="swap-box">
            <div class="swap-header">
                <span>From</span>
                <span class="swap-balance">Balance: ${getBalance(fromToken)} ${CURRENCY_MAP[fromToken].icon}</span>
            </div>
            <div class="swap-input-row">
                <input type="number" id="swap-input-from" placeholder="0.0" oninput="window.updateSwapOutput()" min="${MIN_CONVERSION_AMOUNT}">
                <select id="select-from-token" onchange="window.selectToken('from', this.value)">
                    <!-- Options populated dynamically -->
                </select>
            </div>
            <div class="swap-percent-row">
                <button class="action-button small" onclick="window.setSwapPercentage(0.25)">25%</button>
                <button class="action-button small" onclick="window.setSwapPercentage(0.50)">50%</button>
                <button class="action-button small" onclick="window.setSwapPercentage(1.0)">MAX</button>
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
                <input type="number" id="swap-input-to" placeholder="0.0" readonly>
                <select id="select-to-token" onchange="window.selectToken('to', this.value)">
                    <!-- Options populated dynamically -->
                </select>
            </div>
        </div>

        <!-- CONTINUE BUTTON -->
        <button id="continue-swap-btn" class="action-button" onclick="window.executeSwap()">Continue Swap</button>

        <div style="text-align: center; margin-top: 20px;">
            <p id="conversion-details" style="color: var(--text-secondary);"></p>
        </div>
    `;

    // 1. Populate token dropdowns and select current tokens
    const fromSelect = document.getElementById('select-from-token');
    const toSelect = document.getElementById('select-to-token');

    Object.keys(CURRENCY_MAP).forEach(token => {
        const fromOption = document.createElement('option');
        fromOption.value = token;
        fromOption.textContent = `${token} (${CURRENCY_MAP[token].icon})`;
        if (token === fromToken) fromOption.selected = true;
        fromSelect.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = token;
        toOption.textContent = `${token} (${CURRENCY_MAP[token].icon})`;
        if (token === toToken) toOption.selected = true;
        toSelect.appendChild(toOption);
    });
    
    // 2. Initial UI update
    window.updateSwapOutput();
    
    // 3. Inject CSS for the swap look (for quick testing)
    if (!document.getElementById('swap-style')) {
        const style = document.createElement('style');
        style.id = 'swap-style';
        style.innerHTML = `
            .swap-box { background: var(--surface-dark); padding: 15px; border-radius: 12px; border: 1px solid #3a3a3c; margin-bottom: 10px; }
            .swap-header { display: flex; justify-content: space-between; font-size: 0.9em; color: var(--text-secondary); margin-bottom: 10px; }
            .swap-input-row { display: flex; align-items: center; gap: 10px; }
            .swap-input-row input { flex-grow: 1; font-size: 1.2em; padding: 5px; border: none; background: transparent; color: var(--text-primary); margin: 0; }
            .swap-input-row select { padding: 5px; border-radius: 8px; background: var(--input-bg); color: var(--text-primary); }
            .swap-percent-row { display: flex; gap: 8px; margin-top: 10px; }
            .swap-percent-row button { padding: 5px 10px; font-size: 0.8em; }
            .swap-icon-container { text-align: center; margin: -10px 0; z-index: 10; position: relative; }
            #swap-icon-btn { background: var(--primary-accent); border: 4px solid var(--background-dark); border-radius: 50%; width: 40px; height: 40px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; }
            #swap-icon-btn:active { transform: rotate(180deg); }
            #continue-swap-btn:disabled { opacity: 0.5; }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Updates the output field and conversion details based on input.
 */
window.updateSwapOutput = function() {
    const inputElement = document.getElementById('swap-input-from');
    const outputElement = document.getElementById('swap-input-to');
    const detailsElement = document.getElementById('conversion-details');
    const continueBtn = document.getElementById('continue-swap-btn');
    const inputAmount = parseInt(inputElement.value);
    
    if (isNaN(inputAmount) || inputAmount <= 0) {
        outputElement.value = '0.0';
        detailsElement.textContent = 'Enter an amount to see details.';
        continueBtn.disabled = true;
        return;
    }
    
    const result = calculateConversion(inputAmount, fromToken, toToken);
    
    if (result.error) {
        outputElement.value = '0.0';
        detailsElement.textContent = `Error: ${result.error}`;
        continueBtn.disabled = true;
    } else if (result.required > getBalance(fromToken)) {
        outputElement.value = '0.0';
        detailsElement.innerHTML = `Insufficient Balance. Need <span style="color: var(--danger-color);">${result.required} ${CURRENCY_MAP[fromToken].icon}</span>.`;
        continueBtn.disabled = true;
    } else {
        outputElement.value = result.received.toString();
        const fromIcon = CURRENCY_MAP[fromToken].icon;
        const toIcon = CURRENCY_MAP[toToken].icon;
        
        detailsElement.innerHTML = `You will receive ${result.received} ${toIcon} for ${result.required} ${fromIcon}.`;
        continueBtn.disabled = result.received === 0;
    }
}

/**
 * Sets the token for a specific swap box and updates the UI.
 */
window.selectToken = function(box, newToken) {
    if (box === 'from') {
        fromToken = newToken;
        if (fromToken === toToken) window.swapTokens(); 
    } else {
        toToken = newToken;
        if (fromToken === toToken) window.swapTokens();
    }
    renderExchange(); 
}

/**
 * Swaps the From and To tokens.
 */
window.swapTokens = function() {
    const temp = fromToken;
    fromToken = toToken;
    toToken = temp;
    renderExchange(); 
}

/**
 * Sets the input amount to a percentage of the max balance.
 */
window.setSwapPercentage = function(percentage) {
    const maxBalance = getBalance(fromToken);
    const amount = Math.floor(maxBalance * percentage);
    
    // Enforce divisibility for ANKH conversions to other tokens
    if (fromToken === 'ANKH') {
        const rateToNext = RATES[`ANKH_${toToken}`];
        if (rateToNext) {
            const divisibleAmount = Math.floor(amount / rateToNext) * rateToNext;
            document.getElementById('swap-input-from').value = divisibleAmount;
        } else {
            document.getElementById('swap-input-from').value = amount;
        }
    } else {
        document.getElementById('swap-input-from').value = amount;
    }
    
    window.updateSwapOutput();
}

/**
 * Executes the final swap transaction.
 */
window.executeSwap = async function() {
    const inputElement = document.getElementById('swap-input-from');
    const amountDeducted = parseInt(inputElement.value);
    
    if (isNaN(amountDeducted) || amountDeducted <= 0) return;
    
    const result = calculateConversion(amountDeducted, fromToken, toToken);
    if (result.required > getBalance(fromToken) || result.received === 0) {
        showToast("Transaction failed: Invalid amount or insufficient balance.", 'error');
        return;
    }

    const updateObject = {};
    
    // Deduct from source (Always the 'fromCurrency')
    const deductedKey = CURRENCY_MAP[fromToken].key;
    updateObject[deductedKey] = getBalance(fromToken) - amountDeducted;
    
    // Add to destination (Always the 'toCurrency')
    const receivedKey = CURRENCY_MAP[toToken].key;
    const currentReceivedBalance = getBalance(toToken);
    
    // Safe update: apply addition to the updated object
    if (updateObject[receivedKey]) {
        updateObject[receivedKey] += result.received;
    } else {
        updateObject[receivedKey] = currentReceivedBalance + result.received;
    }

    
    // 1. Execute database update
    const { error } = await api.updatePlayerProfile(state.currentUser.id, updateObject);
    
    if (!error) {
        // 2. Log the activity
        const description = `Swap: ${amountDeducted} ${fromToken} → ${result.received} ${toToken}.`;
        await api.logActivity(state.currentUser.id, 'EXCHANGE', description);
        
        showToast(`Swap Complete! You received ${result.received} ${toToken}.`, 'success');
        
        // 3. Update UI
        await refreshPlayerState();
        renderExchange(); 
    } else {
        showToast('Error processing swap!', 'error');
    }
}
// Export renderExchange for ui.js
export { renderExchange };
