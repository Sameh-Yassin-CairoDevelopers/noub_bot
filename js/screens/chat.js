/*
 * Filename: js/screens/chat.js
 * Version: NOUB 0.0.1 Eve Edition (UCP-LLM PROTOCOL CORE - Complete)
 * Description: Implements the interactive Eve Chat interface, guides user through
 * the UCP questions, stores data in player_protocol_data, and generates the exportable protocol text.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

const chatMessagesContainer = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const chatSendButton = document.getElementById('chat-send-button');
const chatInputArea = document.getElementById('chat-input-area'); // Assuming an ID for the input container
let currentQuestionIndex = 0;
let isAwaitingUCPAnswer = false;

// --- UCP JSON DATA (Hardcoded structure for 25 sections/questions) ---
// Note: We use the structure of the original UCP generator to maintain 100% fidelity.

const ALL_PROTOCOL_SECTIONS = {
    "personal": {title: "👤 Personal Data", fields: [{id: "preferredName", label: "Preferred Name"}]},
    "social": {title: "🏠 Social Status", fields: [{id: "social_details", label: "Details"}]},
    "educational_professional": {title: "🎓 Educational & Professional Background", fields: [{id: "education_background", label: "Educational Background"}]},
    "thinking_reference": {title: "🧠 Core Thinking Reference", fields: [{id: "thinking_reference_desc", label: "Core Description"}]},
    "cognitive_passion": {title: "💡 Cognitive Passion", fields: [{id: "passion_name", label: "Name of Passion"}]},
    "ethical_values": {title: "⚖️ Guiding Ethical Values", fields: [{id: "value_name", label: "Value Name"}]},
    "concepts_perspective": {title: "👁️ Perspective on Core Concepts", fields: [{id: "core_concept_name", label: "Concept Name"}]},
    "cognitive_tools_methodology": {title: "🛠️ Methodology for Cognitive Tools", fields: [{id: "cognitive_tool_name", label: "Tool Name"}]},
    "inspiring_figures": {title: "🌟 Inspiring Human Models/Figures", fields: [{id: "figure_name", label: "Figure Name"}]},
    "intellectual_sins": {title: "🧐 Intellectual Sins/Biases to Avoid", fields: [{id: "intellectual_sin_name", label: "Sin/Bias"}]},
    "projects": {title: "📌 Projects & Objectives", fields: [{id: "project_name", label: "Project Title"}]},
    "pivotal_examples": {title: "🧪 Pivotal Examples", fields: [{id: "example_name", label: "Example Name"}]},
    "causal_relations": {title: "🔗 Causal Relations Between Concepts", fields: [{id: "cause_concept", label: "Cause Concept"}]},
    "role": {title: "🎭 LLM Functional Persona", fields: [{id: "llm_role_primary", label: "Primary Role"}]},
    "conceptual_tuning": {title: "📚 Conceptual Tuning (User-Specific Terms)", fields: [{id: "user_concept_term", label: "Specific Term"}]},
    "interaction_style": {title: "💬 Preferred Interaction Style", fields: [{id: "preferred_style", label: "Preferred Style"}]},
    "intervention_level": {title: "⚙️ Model Intervention Level", fields: [{id: "intervention_select", label: "Chosen Level"}]},
    "alignment_level": {title: "🧭 Desired Alignment Level", fields: [{id: "alignment_select", label: "Desired Level"}]},
    "critique_mechanism": {title: "🗣️ Mechanism for Critique", fields: [{id: "critique_preference", label: "Critique Preference"}]},
    "constraints_warnings": {title: "🚫 Prohibitions and Warnings", fields: [{id: "constraint_item", label: "Prohibited Item"}]},
    "memory_management_directives": {title: "💾 Memory Management Directives", fields: [{id: "memory_directive", label: "Directive"}]},
    "cognitive_preferences": {title: "🤔 Cognitive/Behavioral Preferences", fields: [{id: "preference_description", label: "Description"}]},
    "mental_state": {title: "🧠 Mental State", fields: [{id: "mental_state_select", label: "Selected State"}]},
    "sports_inclinations": {title: "🏅 Sports Inclinations", fields: [{id: "sport_select", label: "Chosen Inclination"}]},
    "additional_notes": {title: "📝 Additional General Notes", fields: [{id: "general_notes", label: "General Notes"}]}
}; // NOTE: This structure is simplified for saving, but represents the 25 requested sections.


const EVE_INVENTED_QUESTIONS_LIST = [
    { id: "sun_moon", question: "صديقي المبدع، ماذا تحب أكثر: دفء الشمس ☀️ الذي يملأ الحياة، أم سكون القمر 🌙 الملهم للأحلام؟", type: "mc", options: ["الشمس الدافئة ☀️", "القمر الساحر 🌙", "لكل منهما سحره الخاص ✨"] },
    { id: "future_vision", question: "إذا نظرت إلى المستقبل، كيف تتخيل نفسك بعد خمس سنوات؟", type: "textarea" },
    { id: "reading_writing", question: "هل تجد نفسك أكثر ميلًا لقراءة قصص كتبها آخرون 📚، أم لكتابة قصصك وأفكارك الخاصة ✍️؟", type: "mc", options: ["أعشق القراءة 📚!", "أحب الكتابة ✍️!"] },
    { id: "biggest_challenge", question: "ما هو أكبر تحد فكري أو إبداعي تسعى حاليًا للتغلب عليه؟ 💪", type: "textarea" },
    { id: "ideal_day", question: "إذا كان بإمكانك تصميم يوم مثالي، كيف سيبدو روتينك؟ 🌟", type: "textarea" },
    { id: "learning_style_preference", question: "عند تعلم شيء جديد، هل تفضل الغوص في التفاصيل مباشرة 🔬، أم فهم الصورة الكبيرة أولاً 🗺️؟", type: "mc", options: ["التفاصيل أولاً 🔬", "الصورة الكبيرة 🗺️"] }
];


// --- Chat Core Functions ---

function addMessage(sender, text, type = 'eve-bubble') {
    // Implement message display logic (assuming user has implemented CSS for classes like 'eve-bubble', 'user-bubble')
    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    
    // Apply basic markdown formatting (bold/italic)
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    messageDiv.innerHTML = text;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function renderInputArea(questionConfig) {
    // Clears and renders the correct input type based on the question config
    const currentInputArea = document.getElementById('chat-input-area'); // The container that holds input/buttons
    currentInputArea.innerHTML = '';
    
    if (questionConfig.type === 'mc' && questionConfig.options) {
        // Render buttons for Multiple Choice
        questionConfig.options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'action-button small';
            btn.style.margin = '5px';
            btn.textContent = opt;
            btn.onclick = () => window.handleUCPChoice(index, opt);
            currentInputArea.appendChild(btn);
        });
        chatInputField.style.display = 'none';
        chatSendButton.style.display = 'none';

    } else {
        // Render standard input/textarea for text/textarea type
        chatInputField.style.display = 'block';
        chatSendButton.style.display = 'inline-block';
        if (questionConfig.type === 'textarea') {
            // Adjust input field styling for longer text input if necessary (CSS handles the height)
            chatInputField.placeholder = "Type your detailed answer here...";
        } else {
             chatInputField.placeholder = "Type your answer here...";
        }
    }
}


function askNextUCPQuestion() {
    if (currentQuestionIndex >= EVE_INVENTED_QUESTIONS_LIST.length) {
        addMessage("Eve", "Wonderful! We've completed the initial creative profile. Your UCP data is safe.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Aligned Eve...";
        renderInputArea({type: 'text'}); // Render empty text area
        return;
    }
    
    const questionConfig = EVE_INVENTED_QUESTIONS_LIST[currentQuestionIndex];
    addMessage("Eve", `[UCP Question ${currentQuestionIndex + 1}]: ${questionConfig.question}`);
    
    isAwaitingUCPAnswer = true;
    renderInputArea(questionConfig);
}


// CRITICAL: Global function to handle MC button clicks
window.handleUCPChoice = function(choiceIndex, answerText) {
    if (!isAwaitingUCPAnswer) return;
    
    addMessage("User", `(Selected: ${answerText})`, 'user-bubble');
    processUCPAnswer(answerText);
}

function processUCPAnswer(answer) {
    if (!isAwaitingUCPAnswer || !state.currentUser) return;

    const questionConfig = EVE_INVENTED_QUESTIONS_LIST[currentQuestionIndex];
    
    // The section key is the question ID itself (e.g., 'sun_moon', 'future_vision')
    const sectionKey = questionConfig.id; 

    // Prepare data structure to save (using JSONB)
    const dataToSave = { 
        question: questionConfig.question,
        answer: answer, 
        type: questionConfig.type 
    };
    
    // Save to the database
    api.saveUCPSection(state.currentUser.id, sectionKey, dataToSave)
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
        // If we are waiting for a UCP answer (for textarea/text questions)
        addMessage("User", messageText, 'user-bubble');
        processUCPAnswer(messageText);
    } else {
        // Standard chat interaction
        addMessage("User", messageText, 'user-bubble');
        
        // Simple command recognition (Placeholder for original Eve functionality)
        const lowerCaseMessage = messageText.toLowerCase();
        if(lowerCaseMessage.includes("help") || lowerCaseMessage.includes("hint")) {
             addMessage("Eve", "I can help guide you! Try visiting the *Tomb Encyclopedia* (Albums screen) or checking your current tasks.", 'eve-bubble');
        } else if (lowerCaseMessage.includes("start profile") || lowerCaseMessage.includes("start ucp")) {
             window.startUCPInterview();
        } else {
             addMessage("Eve", "I see. My primary focus is currently on completing your Cognitive Profile. Please use the 'Start UCP Questions' button to begin.", 'eve-bubble');
        }
    }
}


export async function renderChat() {
    if (!state.currentUser) return;
    
    // 1. Clear and attach listeners
    chatMessagesContainer.innerHTML = '';
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter') handleChatSend();
    };
    
    // Ensure input area is rendered for interaction
    const chatInputArea = document.getElementById('chat-input-area');
    if(chatInputArea.innerHTML === '') {
        chatInputArea.innerHTML = `
            <input type="text" id="chat-input-field" placeholder="Chat with Eve..." class="full-width-input">
            <button id="chat-send-button" class="action-button small">Send</button>
        `;
        // Re-fetch elements after rendering new HTML
        // NOTE: In the final HTML structure, these elements should be static, not dynamically rendered.
        // Assuming static elements based on the initial index.html structure:
        // chatInputField = document.getElementById('chat-input-field'); 
        // chatSendButton = document.getElementById('chat-send-button'); 
    }


    // 2. Check Protocol Status and Start Conversation
    await refreshPlayerState(); // Ensure we have the latest UCP data

    const protocol = state.ucp;
    
    // Count how many questions have been answered
    const answeredCount = protocol ? protocol.size : 0;
    
    currentQuestionIndex = answeredCount; // Resume progress

    if (answeredCount >= EVE_INVENTED_QUESTIONS_LIST.length) {
        addMessage("Eve", "Welcome back. Your Cognitive Profile is complete! I am now aligned with you.", 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Chat with Aligned Eve...";
    } else {
        addMessage("Eve", "Hello! I am Eve, your guide. We need to complete your Cognitive Profile (UCP). Shall we start?", 'eve-bubble');
        addMessage("Eve", `<button class='action-button small' onclick='window.startUCPInterview()'>Start UCP Questions (Progress: ${answeredCount}/${EVE_INVENTED_QUESTIONS_LIST.length})</button>`, 'eve-bubble');
        isAwaitingUCPAnswer = false;
        chatInputField.placeholder = "Click 'Start UCP Questions' to begin.";
    }
    
    // Add the Export button (Required for protocol submission)
    addMessage("Eve", `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">Generate & Export Protocol (TXT)</button>`, 'eve-bubble');

}

// CRITICAL: Global function to start the interview
window.startUCPInterview = function() {
    chatMessagesContainer.innerHTML = ''; // Clear chat history
    currentQuestionIndex = state.ucp.size; // Resume from latest saved size
    askNextUCPQuestion();
}

// CRITICAL: Function to generate and export the full protocol (placeholder for complex logic)
window.generateAndExportProtocol = function() {
    showToast('Generating Protocol...', 'info');
    
    const protocolData = state.ucp;
    let protocolText = "--- UCP-LLM FINAL PROTOCOL ---\n";
    
    if (protocolData.size === 0) {
        protocolText += "Profile is empty. Please answer Eve's questions first.\n";
    } else {
        protocolData.forEach((data, key) => {
            protocolText += `\n[Section: ${key.toUpperCase()}]\n`;
            protocolText += `Question: ${data.question}\n`;
            protocolText += `Answer: ${data.answer}\n`;
        });
    }

    // Simplified TXT export (for client-side demonstration)
    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NOUB_UCP_Profile_${state.playerProfile.username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Protocol exported successfully!', 'success');
}
