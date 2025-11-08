/*
 * Filename: js/screens/chat.js
 * Version: Pharaoh's Legacy 'NOUB' v0.2 (CRITICAL FIX: UCP DOM Insertion)
 * Description: Logic for the Eve Chat interface. Implements the UCP-LLM protocol 
 * with dynamic input tools, a redesigned chat interface, and complete protocol export.
 * CRITICAL FIX: Corrected DOM insertion logic to fix the 'insertBefore' error.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// Global references 
let chatMessagesContainer; 
let chatInputField;
let chatSendButton;
let chatActionArea; 
let currentInputArea; // Reference to the dynamic input/textarea/select element

// --- UCP PROTOCOL DATA (Expanded List with new question types) ---
const EVE_UCP_QUESTIONS_LIST = [
    // Personal Data (Text/TextArea)
    { id: "preferredName", question: "First, what is your preferred name for interaction?", type: "text", jsonKey: "preferredName", sectionTitle: "Personal Data" },
    { id: "languages", question: "What are your key languages and proficiency levels (e.g., Arabic (Native), English (Fluent))?", type: "textarea", jsonKey: "languagesProficiency", sectionTitle: "Personal Data" },
    
    // Core Concepts (Range Bar/Select - NEW)
    { id: "alignment_select", question: "What is your desired Intellectual Alignment Level?", type: "range", options: ["1 (Basic)", "2 (Low)", "3 (Medium)", "4 (High)", "5 (Very High)"], jsonKey: "desiredAlignmentLevel", sectionTitle: "Desired Alignment Level" },
    { id: "intervention_select", question: "What is your chosen Model Intervention Level?", type: "select", options: ["High", "Medium", "Low"], jsonKey: "chosenInterventionLevel", sectionTitle: "Model Intervention Level" },
    
    // Core Thinking & Values (TextArea)
    { id: "thinking_reference_desc", question: "Describe your core thinking reference (e.g., Rationalism, Platonism).", type: "textarea", jsonKey: "coreThinkingReferenceDescription", sectionTitle: "Core Thinking Reference" },
    { id: "ethical_value", question: "What is a major ethical value that guides you (e.g., Honesty, Justice)?", type: "text", jsonKey: "ethicalValueName", sectionTitle: "Ethical Values" },
    
    // Hypothetical Philosophical Questions (MCQ - NEW)
    { id: "future_vision", question: "If you look to the future, how do you imagine yourself in five years? And what role might AI play? 🚀", type: "textarea", sectionTitle: "Additional General Notes" },
    { id: "reading_writing", question: "Do you prefer to read stories by others 📚, or write your own stories and ideas ✍️?", type: "mc", options: ["I adore reading 📚!", "I love writing ✍️!", "I enjoy both equally! ⚖️"], sectionTitle: "Additional General Notes" },
    { id: "is_logic_king", question: "In a pure philosophical debate, should logic be king, or should emotional context always be considered?", type: "mc", options: ["Logic is Absolute King 👑", "Emotional Context is Essential ❤️"], sectionTitle: "Additional General Notes" },
    
    // Final Directives
    { id: "constraint_item", question: "What is a key prohibition or warning for the LLM to respect (e.g., Do not provide medical advice)?", type: "textarea", jsonKey: "constraintItem", sectionTitle: "Prohibitions and Warnings" },
];

let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    if (!chatMessagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    // Basic Markdown Simulation
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    messageDiv.innerHTML = text; 
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

/**
 * Manages the state of the chat input area (enabling/disabling text input).
 */
function setInputMode(isEnabled) {
    // Clear dynamic elements
    const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
    dynamicElements.forEach(el => el.remove());
    
    // Clear text input state
    chatInputField.value = '';
    chatInputField.disabled = !isEnabled;
    chatSendButton.disabled = !isEnabled;

    if (isEnabled) {
        chatInputField.style.display = 'block';
        chatSendButton.style.display = 'block';
        chatInputField.placeholder = "Type your response...";
        chatInputField.focus();
    } else {
        chatInputField.style.display = 'none';
        chatSendButton.style.display = 'none';
        chatInputField.placeholder = "Answer the question above using the options.";
    }
}


/**
 * Renders the dynamic input area based on question type (mc, range, select, text, textarea).
 */
function renderInputArea(questionConfig) {
    if (!chatActionArea) return;
    
    setInputMode(questionConfig.type === 'text' || questionConfig.type === 'textarea');
    
    // The insertion point is always the chatActionArea, before the existing elements
    
    if (questionConfig.type === 'mc' || questionConfig.type === 'select' || questionConfig.type === 'range') {
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'ucp-dynamic-element ucp-options-container';
        
        if (questionConfig.type === 'mc' || questionConfig.type === 'select') {
            
            questionConfig.options.forEach((opt) => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt;
                btn.onclick = () => window.handleUCPChoice(opt);
                optionsDiv.appendChild(btn);
            });
            
        } else if (questionConfig.type === 'range') {
            // NEW: Range Input (e.g., 1-5 Bar)
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'ucp-range-slider-container';
            
            questionConfig.options.forEach((label, index) => {
                const value = index + 1;
                const rangeBtn = document.createElement('button');
                rangeBtn.className = 'action-button small ucp-range-btn';
                rangeBtn.textContent = value;
                rangeBtn.onclick = () => window.handleUCPChoice(label);
                rangeDiv.appendChild(rangeBtn);
            });
            optionsDiv.appendChild(rangeDiv);
        }
        
        // CRITICAL FIX: Insert optionsDiv directly into chatActionArea
        chatActionArea.insertBefore(optionsDiv, chatActionArea.firstChild);
        
    } else {
        // Standard text/textarea input is active
        if (questionConfig.type === 'textarea') {
             chatInputField.placeholder = "Type your detailed answer here...";
        }
    }
}


function askNextUCPQuestion() {
    if (currentQuestionIndex >= EVE_UCP_QUESTIONS_LIST.length) {
        addMessage("Eve", "Wonderful! We've completed your comprehensive Cognitive Protocol. You can now generate and export your full protocol.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        setInputMode(true);
        chatInputField.placeholder = "Protocol Complete. Chat freely or export.";
        // Final Export button
        addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
        return;
    }
    
    const questionConfig = EVE_UCP_QUESTIONS_LIST[currentQuestionIndex];
    addMessage("Eve", `[UCP Section: ${questionConfig.sectionTitle}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    renderInputArea(questionConfig);
}


window.handleUCPChoice = function(answerText) {
    if (!isAwaitingUCPAnswer) return;
    
    addMessage("User", `(Selected: ${answerText})`, 'user-bubble');
    processUCPAnswer(answerText);
}

/**
 * Processes the answer, saves it to Supabase, and advances the question index.
 */
function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = EVE_UCP_QUESTIONS_LIST[currentQuestionIndex];
    const sectionKey = questionConfig.sectionTitle.replace(/[\s\&\.\/]+/g, '_').toLowerCase(); 
    const dataKey = questionConfig.jsonKey || questionConfig.id; 

    const dataToSave = { 
        [dataKey]: answer, 
        question: questionConfig.question 
    };
    
    api.saveUCPSection(state.currentUser.id, sectionKey, dataToSave)
        .then(() => {
            currentQuestionIndex++;
            askNextUCPQuestion();
            showToast('Protocol Updated!', 'success');
        })
        .catch(err => {
            // Log full error, but give generic message to user
            showToast('Error saving answer! Failed to update protocol.', 'error');
            console.error('UCP Save Error:', err);
        });
}


function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (!messageText) return;
    
    chatInputField.value = ''; // Clear input immediately

    if (isAwaitingUCPAnswer && !chatInputField.disabled) {
        // If awaiting a response from the user for a UCP question via text input
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else if (!isAwaitingUCPAnswer) {
        // Standard chat simulation
        addMessage("User", messageText, 'user-bubble');
        simulateEveResponse(messageText);
    }
}

function simulateEveResponse(userMessage) {
    setTimeout(() => {
        const lowerCaseMessage = userMessage.toLowerCase();
        
        if (lowerCaseMessage.includes("start protocol") || lowerCaseMessage.includes("start ucp")) {
             window.startUCPInterview();
             return;
        } else if (lowerCaseMessage.includes("export")) {
            addMessage("Eve", "Certainly! Click the button to generate and view your protocol.", 'eve-bubble');
            addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');
            return;
        } else if (lowerCaseMessage.includes("hello") || lowerCaseMessage.includes("hi")) {
            addMessage("Eve", `Hello! My focus is on helping you build your Cognitive Protocol. Type 'Start UCP' to begin.`, 'eve-bubble');
            return;
        } 
        
        addMessage("Eve", "My primary focus is currently on completing your Cognitive Protocol. Type 'Start UCP' to continue.", 'eve-bubble');
    }, 800 + Math.random() * 700);
}


export async function renderChat() {
    if (!state.currentUser) return;
    
    // 1. Fetch DOM Elements safely 
    chatMessagesContainer = document.getElementById('chat-messages'); 
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');
    chatActionArea = document.getElementById('chat-input-area'); // The container holding the buttons and input

    if (!chatMessagesContainer || !chatInputField || !chatSendButton || !chatActionArea) {
        console.error("Chat interface elements not found."); 
        return; 
    }
    
    // 2. Clear and attach listeners
    chatMessagesContainer.innerHTML = '';
    if (chatSendButton) chatSendButton.onclick = handleChatSend;
    if (chatInputField) chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter' && !chatInputField.disabled) handleChatSend();
    };

    // 3. Check Protocol Status and Start Conversation
    await refreshPlayerState();

    let lastAnsweredIndex = -1;
    for (let i = 0; i < EVE_UCP_QUESTIONS_LIST.length; i++) {
        const q = EVE_UCP_QUESTIONS_LIST[i];
        const sectionKey = q.sectionTitle.replace(/[\s\&\.\/]+/g, '_').toLowerCase();
        if (state.ucp.has(sectionKey)) {
             lastAnsweredIndex = i; 
        }
    }
    
    currentQuestionIndex = lastAnsweredIndex + 1;
    
    if (currentQuestionIndex >= EVE_UCP_QUESTIONS_LIST.length) {
        addMessage("Eve", "Welcome back. Your Cognitive Protocol is complete! I am now aligned with you.", 'eve-bubble');
        setInputMode(true);
    } else {
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Protocol (UCP). Shall we continue?", 'eve-bubble');
        addMessage("Eve", `<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions (Progress: ${currentQuestionIndex}/${EVE_UCP_QUESTIONS_LIST.length})</button>`, 'eve-bubble');
        setInputMode(true);
    }
}

// CRITICAL: Global functions must be implemented 
window.startUCPInterview = function() {
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = ''; 
    addMessage("Eve", "Initiating Cognitive Protocol... Your answers will define my interaction with you.", 'eve-bubble');
    currentQuestionIndex = 0;
    askNextUCPQuestion();
}

/**
 * Generates the full protocol text and initiates export.
 */
window.generateAndExportProtocol = function() {
    showToast('Generating Protocol...', 'info');
    
    const protocolData = state.ucp;
    const username = state.playerProfile.username || 'Explorer';
    
    // NEW: CLICHE/HEADER TEXT FOR THE PROTOCOL (As requested)
    let protocolText = `--- NOUB HYPATIA PROTOCOL - PHARAOH'S LEGACY ---\n`;
    protocolText += `--- A product of the Unified Cognitive Protocol (UCP-LLM) ---\n`;
    protocolText += `Version: Pharaoh's Legacy 'NOUB' v0.2\n`;
    protocolText += `Subject: ${username}\n`;
    protocolText += `Generation Date: ${new Date().toLocaleDateString()}\n\n`;
    
    if (protocolData.size === 0) {
        protocolText += "Profile is empty. Please answer Eve's questions first.\n";
    } else {
        protocolData.forEach((sectionData, sectionKey) => {
            // SECURITY FIX: Sanitize sectionKey to ensure it's clean before printing
            const cleanSectionKey = sectionKey.toUpperCase().replace(/_/g, ' ');

            protocolText += `\n[SECTION: ${cleanSectionKey}]\n`;
            
            Object.keys(sectionData).forEach(dataKey => {
                if (dataKey === 'question') return; 
                
                const questionText = sectionData.question || 'N/A';
                const answerText = sectionData[dataKey];
                
                protocolText += `QUESTION: ${questionText}\n`;
                protocolText += `ANSWER (${dataKey}): ${answerText}\n`;
            });
        });
    }
    
    // --- Export Logic ---
    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NOUB_UCP_Profile_${username}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Protocol exported successfully! Check your downloads.', 'success');
}
