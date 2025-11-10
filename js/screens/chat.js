/*
 * Filename: js/screens/chat.js
 * Version: Pharaoh's Legacy 'NOUB' v0.3 (Hypatia Protocol Overhaul)
 * Description: Implements the full, multi-stage UCP-LLM protocol journey with Eve & Hypatia.
 * This version dynamically loads all questions and text templates from external files,
 * manages a sequential session flow, and handles multiple AI personalities.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- DOM Element References ---
let chatMessagesContainer;
let chatInputField;
let chatSendButton;
let chatActionArea;

// --- Loaded Data Holders ---
let protocolData = null;
let eveGeneralQuestions = null;
let hypatiaPhilosophicalQuestions = null;
let hypatiaScaledQuestions = null;
let likertScaleLabels = null;
let eveMentalStatePhrases = null;
let protocolPreamble = '';
let protocolPostamble = '';

// --- Session State Manager ---
let sessionState = {};

function resetSessionState() {
    sessionState = {
        currentStage: 'AWAITING_MENTAL_STATE', // The very first stage
        mainSectionIndex: 0,
        mainFieldIndex: 0,
        eveGeneralIndex: 0,
        hypatiaPhilosophicalIndex: 0,
        hypatiaScaledIndex: 0,
        isAwaitingAnswer: false,
        currentPersonality: 'eve', // Starts with Eve
        selectedMentalState: 'not_specified'
    };
}

// --- Personalities ---
const personalities = {
    eve: { name: 'إيفي 🧚', avatar: 'images/eve_avatar.png' },
    hypatia: { name: 'هيباتيا 🦉', avatar: 'images/hypatia_avatar.png' } // Assuming you have this image
};

/**
 * Loads all necessary external data files for the chat module to function.
 * Returns true on success, false on failure.
 */
async function loadAllProtocolData() {
    try {
        const [
            protocolRes,
            eveGeneralRes,
            hypatiaPhilRes,
            hypatiaScaledRes,
            likertRes,
            mentalStateRes,
            preambleRes,
            postambleRes
        ] = await Promise.all([
            fetch('section_type_data.json'),
            fetch('eve_general_questions.json'),
            fetch('hypatia_philosophical_questions.json'),
            fetch('scaled_questions.json'),
            fetch('likert_scale_labels.json'),
            fetch('eve_mental_state_phrases.json'),
            fetch('protocol_preamble.txt'),
            fetch('protocol_postamble.txt')
        ]);

        // Helper to check responses
        const checkOk = (res, file) => {
            if (!res.ok) throw new Error(`Failed to load ${file}: ${res.statusText}`);
            return res;
        };

        protocolData = await checkOk(protocolRes, 'section_type_data.json').json();
        eveGeneralQuestions = await checkOk(eveGeneralRes, 'eve_general_questions.json').json();
        hypatiaPhilosophicalQuestions = await checkOk(hypatiaPhilRes, 'hypatia_philosophical_questions.json').json();
        hypatiaScaledQuestions = await checkOk(hypatiaScaledRes, 'scaled_questions.json').json();
        likertScaleLabels = await checkOk(likertRes, 'likert_scale_labels.json').json();
        eveMentalStatePhrases = await checkOk(mentalStateRes, 'eve_mental_state_phrases.json').json();
        protocolPreamble = await checkOk(preambleRes, 'protocol_preamble.txt').text();
        protocolPostamble = await checkOk(postambleRes, 'protocol_postamble.txt').text();
        
        console.log("All protocol data loaded successfully.");
        return true;
    } catch (error) {
        console.error("Fatal Error: Could not load required protocol data.", error);
        showToast("خطأ فادح: لا يمكن تحميل بيانات البروتوكول!", 'error');
        return false;
    }
}

/**
 * Adds a message to the chat interface from a specific sender.
 */
function addMessage(senderName, text, type = 'eve-bubble') {
    if (!chatMessagesContainer) return;

    const personality = personalities[sessionState.currentPersonality];
    const sender = (type === 'user-bubble') ? (state.playerProfile?.username || 'أنت') : personality.name;
    const avatar = (type === 'user-bubble') ? (state.playerProfile?.avatar_url || 'images/user_avatar.png') : personality.avatar;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    messageDiv.innerHTML = `
        <p>${text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>')}</p>
    `;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

/**
 * Renders the appropriate input area (buttons, text fields, etc.) for the current question.
 */
function renderInputArea(questionConfig) {
    // Clear previous dynamic elements
    const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
    dynamicElements.forEach(el => el.remove());

    chatInputField.style.display = 'none';
    chatSendButton.style.display = 'none';
    chatInputField.value = '';

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'ucp-dynamic-element ucp-options-container';

    switch (questionConfig.type) {
        case 'mc':
            questionConfig.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt;
                btn.onclick = () => processUserAnswer(opt);
                optionsDiv.appendChild(btn);
            });
            break;

        case 'scaled': // New type for Hypatia's scaled questions
            Object.keys(likertScaleLabels).forEach(scaleKey => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = `${scaleKey} - ${likertScaleLabels[scaleKey]}`;
                btn.onclick = () => processUserAnswer(scaleKey); // Save the numeric key
                optionsDiv.appendChild(btn);
            });
            break;

        case 'tf': // True/False
            ['نعم', 'لا'].forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt;
                btn.onclick = () => processUserAnswer(opt);
                optionsDiv.appendChild(btn);
            });
            break;

        case 'text':
        case 'textarea':
            chatInputField.style.display = 'block';
            chatSendButton.style.display = 'block';
            chatInputField.placeholder = questionConfig.placeholder || "اكتب إجابتك هنا...";
            chatInputField.focus();
            break;

        default:
            // For choice stages like mental state or Hypatia's choice
            questionConfig.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = opt.text;
                btn.onclick = () => processUserAnswer(opt.value);
                optionsDiv.appendChild(btn);
            });
            break;
    }

    if (optionsDiv.hasChildNodes()) {
        chatActionArea.insertBefore(optionsDiv, chatActionArea.firstChild);
    }
}

/**
 * The main engine of the conversation. Determines the current stage and asks the appropriate question.
 */
function askNextQuestion() {
    sessionState.isAwaitingAnswer = true;
    let currentQuestion;

    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            currentQuestion = {
                question: "أهلاً بك! قبل أن نبدأ، كيف تصف حالتك الذهنية الآن؟",
                type: 'custom_choice',
                options: [
                    { text: "جيدة / مركز 😊", value: 'good' },
                    { text: "متوسطة / مشتت قليلاً 😐", value: 'average' },
                    { text: "سيئة / غير مركز 😟", value: 'bad' }
                ]
            };
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;

        case 'MAIN_SECTIONS':
            const sectionKeys = Object.keys(protocolData);
            if (sessionState.mainSectionIndex >= sectionKeys.length) {
                sessionState.currentStage = 'EVE_GENERAL';
                askNextQuestion(); // Transition to the next stage
                return;
            }
            const sectionKey = sectionKeys[sessionState.mainSectionIndex];
            const section = protocolData[sectionKey];
            if (sessionState.mainFieldIndex >= section.fields.length) {
                sessionState.mainSectionIndex++;
                sessionState.mainFieldIndex = 0;
                askNextQuestion(); // Move to the next section
                return;
            }
            currentQuestion = section.fields[sessionState.mainFieldIndex];
            addMessage(personalities.eve.name, `[قسم: ${section.title}]<br>${currentQuestion.label}`);
            renderInputArea(currentQuestion);
            break;

        case 'EVE_GENERAL':
            if (sessionState.eveGeneralIndex >= eveGeneralQuestions.length) {
                sessionState.currentStage = 'HYPATIA_CHOICE';
                askNextQuestion();
                return;
            }
            currentQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;

        case 'HYPATIA_CHOICE':
            sessionState.currentPersonality = 'hypatia'; // Switch personality
            currentQuestion = {
                question: "لقد أكملت المرحلة الأساسية مع إيفي. أنا هيباتيا 🦉. سأساعدك في استكشاف أعمق. أي مسار تختار؟",
                type: 'custom_choice',
                options: [
                    { text: "الاستكشاف الفكري (أسئلة فلسفية)", value: 'HYPATIA_PHILOSOPHICAL' },
                    { text: "التحليل السلوكي (أسئلة مقياسية)", value: 'HYPATIA_SCALED' },
                    { text: "إنهاء جمع البيانات الآن", value: 'SESSION_COMPLETE' }
                ]
            };
            addMessage(personalities.hypatia.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;

        case 'HYPATIA_PHILOSOPHICAL':
            if (sessionState.hypatiaPhilosophicalIndex >= hypatiaPhilosophicalQuestions.length) {
                sessionState.currentStage = 'SESSION_COMPLETE';
                askNextQuestion();
                return;
            }
            currentQuestion = hypatiaPhilosophicalQuestions[sessionState.hypatiaPhilosophicalIndex];
            addMessage(personalities.hypatia.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;

        case 'HYPATIA_SCALED':
            if (sessionState.hypatiaScaledIndex >= hypatiaScaledQuestions.length) {
                sessionState.currentStage = 'SESSION_COMPLETE';
                askNextQuestion();
                return;
            }
            currentQuestion = { ...hypatiaScaledQuestions[sessionState.hypatiaScaledIndex], type: 'scaled' };
            addMessage(personalities.hypatia.name, `بناءً على مقياس من 1 إلى 5، إلى أي مدى تنطبق عليك العبارة التالية؟<br><b>"${currentQuestion.text}"</b>`);
            renderInputArea(currentQuestion);
            break;

        case 'SESSION_COMPLETE':
            sessionState.isAwaitingAnswer = false;
            const finalMessage = "رائع! لقد أنجزنا رحلة بناء بروتوكولك. أصبحت بصمتك المعرفية جاهزة الآن.";
            addMessage(personalities.hypatia.name, finalMessage);
            addMessage(personalities.hypatia.name, `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">توليد وتصدير البروتوكول النهائي</button>`);
            // Clear input area
            const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
            dynamicElements.forEach(el => el.remove());
            break;
    }
}

/**
 * Processes the user's answer, saves it, and advances the session state.
 */
async function processUserAnswer(answer) {
    if (!sessionState.isAwaitingAnswer) return;

    sessionState.isAwaitingAnswer = false;
    addMessage(state.playerProfile?.username, answer, 'user-bubble');

    let dataToSave = {};
    let sectionKey, dataKey;

    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            sessionState.selectedMentalState = answer;
            const greeting = eveMentalStatePhrases[answer].greetings[Math.floor(Math.random() * eveMentalStatePhrases[answer].greetings.length)];
            addMessage(personalities.eve.name, greeting.replace('{name}', state.playerProfile?.username || 'صديقي'));
            sessionState.currentStage = 'MAIN_SECTIONS';
            break;

        case 'MAIN_SECTIONS':
            const mainSectionKeys = Object.keys(protocolData);
            const currentMainSectionKey = mainSectionKeys[sessionState.mainSectionIndex];
            const currentMainSection = protocolData[currentMainSectionKey];
            const currentField = currentMainSection.fields[sessionState.mainFieldIndex];
            
            sectionKey = `main_${currentMainSectionKey}`;
            dataKey = currentField.jsonKey || currentField.name;
            dataToSave = { question: currentField.label, answer: answer };
            
            sessionState.mainFieldIndex++;
            break;
        
        case 'EVE_GENERAL':
            const eveQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            sectionKey = 'eve_general';
            dataKey = eveQuestion.id;
            dataToSave = { question: eveQuestion.question, answer: answer };
            sessionState.eveGeneralIndex++;
            break;
        
        case 'HYPATIA_CHOICE':
            sessionState.currentStage = answer; // The answer IS the next stage
            break;

        case 'HYPATIA_PHILOSOPHICAL':
            const philQuestion = hypatiaPhilosophicalQuestions[sessionState.hypatiaPhilosophicalIndex];
            sectionKey = 'hypatia_philosophical';
            dataKey = philQuestion.id;
            dataToSave = { question: philQuestion.question, answer: answer };
            sessionState.hypatiaPhilosophicalIndex++;
            break;

        case 'HYPATIA_SCALED':
            const scaledQuestion = hypatiaScaledQuestions[sessionState.hypatiaScaledIndex];
            sectionKey = 'hypatia_scaled';
            dataKey = scaledQuestion.id;
            dataToSave = { question: scaledQuestion.text, answer: answer, axis: scaledQuestion.axis };
            sessionState.hypatiaScaledIndex++;
            break;
    }

    if (sectionKey && dataKey) {
        // Here we're saving a simplified structure to Supabase
        // You can make section_data more complex if needed
        await api.saveUCPSection(state.currentUser.id, sectionKey, { [dataKey]: dataToSave });
        await refreshPlayerState(); // Refresh the local state.ucp map
    }
    
    // Use a small delay to make the conversation feel more natural
    setTimeout(askNextQuestion, 500);
}

function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (messageText) {
        processUserAnswer(messageText);
    }
}

/**
 * Entry point for rendering the chat screen.
 */
export async function renderChat() {
    chatMessagesContainer = document.getElementById('chat-messages');
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');
    chatActionArea = document.getElementById('chat-input-area');

    if (!chatMessagesContainer || !chatInputField || !chatSendButton || !chatActionArea) {
        console.error("Chat interface elements not found.");
        return;
    }

    chatMessagesContainer.innerHTML = '';
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => {
        if (e.key === 'Enter' && !chatInputField.disabled) handleChatSend();
    };

    // Load all data if it's not already loaded
    if (!protocolData) {
        const loaded = await loadAllProtocolData();
        if (!loaded) return;
    }

    resetSessionState();
    askNextQuestion();
}

/**
 * Generates and triggers the download of the final protocol file.
 */
window.generateAndExportProtocol = function() {
    showToast('جارٍ توليد البروتوكول...', 'info');

    const username = state.playerProfile.username || 'المستكشف';
    let protocolText = protocolPreamble.replace(/{اسم_المستخدم_المفضل}/g, username) + '\n\n';
    
    protocolText += "--- أقسام البيانات الأساسية ---\n\n";
    const mainSectionKeys = Object.keys(protocolData);
    mainSectionKeys.forEach(sectionKey => {
        const ucpKey = `main_${sectionKey}`;
        if (state.ucp.has(ucpKey)) {
            protocolText += `[قسم: ${protocolData[sectionKey].title}]\n`;
            const sectionData = state.ucp.get(ucpKey);
            for(const dataKey in sectionData) {
                const item = sectionData[dataKey];
                protocolText += `- ${item.question}: ${item.answer}\n`;
            }
            protocolText += '\n';
        }
    });

    if (state.ucp.has('eve_general')) {
        protocolText += "--- أسئلة إيفي الإبداعية ---\n\n";
        const eveData = state.ucp.get('eve_general');
        for (const dataKey in eveData) {
            const item = eveData[dataKey];
            protocolText += `- ${item.question}: ${item.answer}\n`;
        }
        protocolText += '\n';
    }

    if (state.ucp.has('hypatia_philosophical') || state.ucp.has('hypatia_scaled')) {
        protocolText += "--- تحليل هيباتيا العميق ---\n\n";
        if (state.ucp.has('hypatia_philosophical')) {
             protocolText += "[جلسة فلسفية]\n";
             const philData = state.ucp.get('hypatia_philosophical');
             for (const dataKey in philData) {
                const item = philData[dataKey];
                protocolText += `- ${item.question}: ${item.answer}\n`;
            }
            protocolText += '\n';
        }
        if (state.ucp.has('hypatia_scaled')) {
             protocolText += "[جلسة تحليل سلوكي]\n";
             const scaledData = state.ucp.get('hypatia_scaled');
             for (const dataKey in scaledData) {
                const item = scaledData[dataKey];
                protocolText += `- "${item.question}": ${item.answer}/5 (${likertScaleLabels[item.answer]})\n`;
            }
            protocolText += '\n';
        }
    }

    protocolText += protocolPostamble.replace(/{اسم_المستخدم_المفضل}/g, username);

    // Export Logic
    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `UCP_Protocol_${username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('تم تصدير البروتوكول بنجاح!', 'success');
}
