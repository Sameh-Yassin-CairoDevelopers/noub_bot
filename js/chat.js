/*
 * Filename: js/screens/chat.js
 * Version: 21.1 (UCP-LLM Chat Interface - Complete)
 * Description: Logic for the Eve Chat screen. Presents creative questions to the user
 * and stores the answers in the player_protocol_data table.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';

const chatMessagesContainer = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const chatSendButton = document.getElementById('chat-send-button');

// --- UCP QUESTIONS DATA (Simplified Master List) ---
// In a real system, this would be fetched from a master table, but for now we hardcode the structure.
const MASTER_UCP_QUESTIONS = [
    { id: "sun_moon", question: "My creative friend, what do you love more: the sun's ☀️ warmth, or the moon's 🌙 serenity?", type: "mc", options: ["The Warm Sun ☀️", "The Enchanting Moon 🌙"] },
    { id: "future_vision", question: "If you look to the future, how do you imagine yourself in five years? (Tap Send to answer)", type: "textarea" },
    { id: "reading_writing", question: "Do you find yourself more inclined to read stories written by others 📚, or to write your own stories and ideas ✍️?", type: "mc", options: ["I adore reading 📚!", "I love writing ✍️!"] },
    { id: "learning_style", question: "When learning, do you prefer to dive into the details directly 🔬, or understand the big picture first 🗺️?", type: "mc", options: ["Details first 🔬", "The big picture 🗺️"] }
];
// This maps to the sections we defined in the UCP Generator analysis.

let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    // Simple handling for formatting (assumes Eve is the sender)
    if (type === 'eve-bubble') {
        text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    }
    
    messageDiv.innerHTML = text;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function askNextUCPQuestion() {
    if (currentQuestionIndex >= MASTER_UCP_QUESTIONS.length) {
        addMessage("Eve", "Wonderful! We've completed the initial cognitive profile. I've saved your insightful answers.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Eve...";
        return;
    }
    
    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    addMessage("Eve", `[UCP Question ${currentQuestionIndex + 1}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    chatInputField.placeholder = "Type your answer or select an option...";

    // Handle Multiple Choice Options (Render buttons dynamically)
    if (questionConfig.type === 'mc' && questionConfig.options) {
        // Simple display of options (Full buttons implementation requires modifying index.html/style.css, so we keep it simple here)
        const optionsHTML = questionConfig.options.map((opt, index) => 
            `<button class="action-button small" style="width:auto; margin-right: 10px;" onclick="window.handleUCPChoice(${index})">${opt}</button>`
        ).join('');
        addMessage("Eve", optionsHTML, 'eve-bubble');
    }
}

// CRITICAL: Global function to handle MC button clicks
window.handleUCPChoice = function(choiceIndex) {
    if (!isAwaitingUCPAnswer) return;
    
    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    const answer = questionConfig.options[choiceIndex];

    addMessage("User", `(Selected: ${answer})`, 'user-bubble');
    processUCPAnswer(answer);
}

function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = MASTER_UCP_QUESTIONS[currentQuestionIndex];
    
    // Map answer to a structured section (Example mapping: 'sun_moon' to 'cognitive_preferences' section)
    const sectionKeyMap = {
        'sun_moon': 'cognitive_preferences',
        'future_vision': 'projects',
        'reading_writing': 'cognitive_preferences',
        'learning_style': 'cognitive_preferences',
    };
    
    const sectionKey = sectionKeyMap[questionConfig.id] || 'additional_notes';
    
    // Prepare data structure to save
    const dataToSave = {};
    // Store question and answer as an array under the question ID
    dataToSave[questionConfig.id] = { question: questionConfig.question, answer: answer };
    
    // Save to the database
    api.saveUCPSection(state.currentUser.id, questionConfig.id, dataToSave)
        .then(() => {
            showToast('Profile Updated!', 'success');
            currentQuestionIndex++;
            askNextUCPQuestion();
        })
        .catch(err => {
            showToast('Error saving answer!', 'error');
            console.error('UCP Save Error:', err);
        });
}


// --- Main Handlers ---

function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (!messageText) return;
    
    chatInputField.value = '';
    
    if (isAwaitingUCPAnswer) {
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else {
        // Standard chat response (basic placeholder)
        addMessage("User", messageText, 'user-bubble');
        addMessage("Eve", "I see. If you need to fill your profile, ask for the next UCP question.", 'eve-bubble');
    }
}


export async function renderChat() {
    // 1. Set up chat UI elements
    chatMessagesContainer.innerHTML = '';
    
    // 2. Attach Listeners
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter') handleChatSend();
    };

    // 3. Check Protocol Status and Start Conversation
    const { data: protocol } = await api.fetchUCPProtocol(state.currentUser.id);
    
    if (protocol && protocol.length >= MASTER_UCP_QUESTIONS.length) {
        addMessage("Eve", "Welcome back, Explorer. Your Cognitive Profile is complete! You can ask me to recall any section.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Eve...";
    } else {
        currentQuestionIndex = protocol ? protocol.length : 0; // Resume progress
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Profile (UCP). Shall we start?", 'eve-bubble');
        addMessage("Eve", "<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions</button>", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Click 'Start UCP Questions' to begin.";
    }
}

// CRITICAL: Global function to start the interview
window.startUCPInterview = function() {
    chatMessagesContainer.innerHTML = ''; // Clear chat history
    askNextUCPQuestion();
}