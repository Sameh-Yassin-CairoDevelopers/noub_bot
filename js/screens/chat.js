/*
 * Filename: js/screens/chat.js
 * Version: Pharaoh's Legacy 'NOUB' v0.5 (UCP Rewards & Session Resume)
 * Description: Implements a rewards system for completing UCP milestones.
 * Players now receive rewards for completing Eve's stage and the entire protocol.
*/

import { state } from '../state.js';
import * as api from '../api.js';
import { showToast } from '../ui.js';
import { refreshPlayerState } from '../auth.js';

// --- NEW: UCP Completion Rewards Configuration ---
const UCP_HALF_COMPLETION_REWARD = {
    noub: 1000,
    prestige: 50,
    tickets: 10
};

const UCP_FULL_COMPLETION_REWARD = {
    noub: 5000,
    prestige: 250,
    ankh: 5
};

// --- Loaded Data Holders ---
let protocolData = null;
let eveGeneralQuestions = null;
let hypatiaPhilosophicalQuestions = null;
let hypatiaScaledQuestions = null;
let likertScaleLabels = null;
let eveMentalStatePhrases = null;
let protocolPreamble = '';
let protocolPostamble = '';

// --- DOM Element References ---
let chatMessagesContainer, chatInputField, chatSendButton, chatActionArea;

// --- Isolated State Management ---
let sessionState = {};
let localUcpData = {};

function resetSessionState() {
    sessionState = {
        currentStage: 'AWAITING_MENTAL_STATE',
        mainSectionIndex: 0,
        mainFieldIndex: 0,
        eveGeneralIndex: 0,
        hypatiaPhilosophicalIndex: 0,
        hypatiaScaledIndex: 0,
        isAwaitingAnswer: false,
        currentPersonality: 'eve',
        selectedMentalState: 'not_specified',
        halfRewardGranted: localUcpData['rewards']?.halfRewardGranted || false,
        fullRewardGranted: localUcpData['rewards']?.fullRewardGranted || false
    };
    localUcpData = {};
}

const personalities = {
    eve: { name: 'إيفي 🧚', avatar: 'images/eve_avatar.png' },
    hypatia: { name: 'هيباتيا 🦉', avatar: 'images/hypatia_avatar.png' }
};

async function loadAllProtocolData() {
    try {
        if (protocolData) return true;
        const [protocolRes, eveGeneralRes, hypatiaPhilRes, hypatiaScaledRes, likertRes, mentalStateRes, preambleRes, postambleRes] = await Promise.all([
            fetch('section_type_data.json'), fetch('eve_general_questions.json'), fetch('hypatia_philosophical_questions.json'),
            fetch('scaled_questions.json'), fetch('likert_scale_labels.json'), fetch('eve_mental_state_phrases.json'),
            fetch('protocol_preamble.txt'), fetch('protocol_postamble.txt')
        ]);
        const checkOk = (res, file) => { if (!res.ok) throw new Error(`Failed to load ${file}: ${res.statusText}`); return res; };
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

function addMessage(senderName, text, type = 'eve-bubble') {
    if (!chatMessagesContainer) return;
    const personality = personalities[sessionState.currentPersonality];
    const sender = (type === 'user-bubble') ? (state.playerProfile?.username || 'أنت') : personality.name;
    const avatar = (type === 'user-bubble') ? (state.playerProfile?.avatar_url || 'images/user_avatar.png') : personality.avatar;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add(type);
    messageDiv.innerHTML = `<p>${text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>')}</p>`;
    chatMessagesContainer.appendChild(messageDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function renderInputArea(questionConfig) {
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
        case 'scaled':
            Object.keys(likertScaleLabels).forEach(scaleKey => {
                const btn = document.createElement('button');
                btn.className = 'action-button small ucp-option-btn';
                btn.textContent = `${scaleKey} - ${likertScaleLabels[scaleKey]}`;
                btn.onclick = () => processUserAnswer(scaleKey);
                optionsDiv.appendChild(btn);
            });
            break;
        case 'tf':
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
        default: // custom_choice
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
 * NEW FUNCTION: Grants a reward to the player and updates their profile.
 * @param {string} rewardType - 'half' or 'full'
 */
async function grantUcpReward(rewardType) {
    const reward = (rewardType === 'half') ? UCP_HALF_COMPLETION_REWARD : UCP_FULL_COMPLETION_REWARD;
    const isHalf = (rewardType === 'half');

    if ((isHalf && sessionState.halfRewardGranted) || (!isHalf && sessionState.fullRewardGranted)) {
        console.log(`Reward for ${rewardType} completion already granted.`);
        return;
    }

    addMessage(personalities.eve.name, `🎉 **مكافأة إنجاز!** 🎉<br>تقديرًا لجهودك في بناء بصمتك المعرفية، لقد حصلت على مكافأة!`);
    
    let rewardString = '';
    const profileUpdate = {};

    if (reward.noub) {
        profileUpdate.noub_score = (state.playerProfile.noub_score || 0) + reward.noub;
        rewardString += `${reward.noub}🪙 `;
    }
    if (reward.prestige) {
        profileUpdate.prestige = (state.playerProfile.prestige || 0) + reward.prestige;
        rewardString += `${reward.prestige}🐞 `;
    }
    if (reward.tickets) {
        profileUpdate.spin_tickets = (state.playerProfile.spin_tickets || 0) + reward.tickets;
        rewardString += `${reward.tickets}🎟️ `;
    }
    if (reward.ankh) {
        profileUpdate.ankh_premium = (state.playerProfile.ankh_premium || 0) + reward.ankh;
        rewardString += `${reward.ankh}☥ `;
    }

    const { error } = await api.updatePlayerProfile(state.currentUser.id, profileUpdate);

    if (error) {
        showToast("خطأ أثناء منح المكافأة!", 'error');
        return;
    }

    // Mark reward as granted
    if (isHalf) sessionState.halfRewardGranted = true;
    else sessionState.fullRewardGranted = true;

    // Save the reward status in the protocol itself
    if (!localUcpData['rewards']) localUcpData['rewards'] = {};
    localUcpData['rewards'][isHalf ? 'halfRewardGranted' : 'fullRewardGranted'] = true;
    api.saveUCPSection(state.currentUser.id, 'rewards', localUcpData['rewards']);

    showToast(`+${rewardString}`, 'success');
    await refreshPlayerState(); // Refresh to update header UI
}

function askNextQuestion() {
    sessionState.isAwaitingAnswer = true;
    let currentQuestion;
    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            currentQuestion = { question: "أهلاً بك! قبل أن نبدأ، كيف تصف حالتك الذهنية الآن؟", type: 'custom_choice', options: [{ text: "جيدة / مركز 😊", value: 'good' }, { text: "متوسطة / مشتت قليلاً 😐", value: 'average' }, { text: "سيئة / غير مركز 😟", value: 'bad' }] };
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'MAIN_SECTIONS':
            const sectionKeys = Object.keys(protocolData);
            if (sessionState.mainSectionIndex >= sectionKeys.length) {
                sessionState.currentStage = 'EVE_GENERAL';
                askNextQuestion();
                return;
            }
            const sectionKey = sectionKeys[sessionState.mainSectionIndex];
            const section = protocolData[sectionKey];
            if (sessionState.mainFieldIndex >= section.fields.length) {
                sessionState.mainSectionIndex++;
                sessionState.mainFieldIndex = 0;
                askNextQuestion();
                return;
            }
            currentQuestion = section.fields[sessionState.mainFieldIndex];
            addMessage(personalities.eve.name, `[قسم: ${section.title}]<br>${currentQuestion.label}`);
            renderInputArea(currentQuestion);
            break;
        case 'EVE_GENERAL':
            if (sessionState.eveGeneralIndex >= eveGeneralQuestions.length) {
                // --- REWARD TRIGGER 1 (HALF) ---
                grantUcpReward('half');
                sessionState.currentStage = 'HYPATIA_CHOICE';
                askNextQuestion();
                return;
            }
            currentQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            addMessage(personalities.eve.name, currentQuestion.question);
            renderInputArea(currentQuestion);
            break;
        case 'HYPATIA_CHOICE':
            sessionState.currentPersonality = 'hypatia';
            currentQuestion = { question: "لقد أكملت المرحلة الأساسية مع إيفي. أنا هيباتيا 🦉. سأساعدك في استكشاف أعمق. أي مسار تختار؟", type: 'custom_choice', options: [{ text: "الاستكشاف الفكري (أسئلة فلسفية)", value: 'HYPATIA_PHILOSOPHICAL' }, { text: "التحليل السلوكي (أسئلة مقياسية)", value: 'HYPATIA_SCALED' }, { text: "إنهاء جمع البيانات الآن", value: 'SESSION_COMPLETE' }] };
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
            // --- REWARD TRIGGER 2 (FULL) ---
            grantUcpReward('full');
            sessionState.isAwaitingAnswer = false;
            const finalMessage = "رائع! لقد أنجزنا رحلة بناء بروتوكولك. أصبحت بصمتك المعرفية جاهزة الآن.";
            addMessage(personalities[sessionState.currentPersonality].name, finalMessage);
            addMessage(personalities[sessionState.currentPersonality].name, `<button class='action-button small' onclick='window.generateAndExportProtocol()' style="background-color: #2ecc71; margin-top: 15px;">توليد وتصدير البروتوكول النهائي</button>`);
            const dynamicElements = chatActionArea.querySelectorAll('.ucp-dynamic-element');
            dynamicElements.forEach(el => el.remove());
            break;
    }
}

function processUserAnswer(answer) {
    if (!sessionState.isAwaitingAnswer) return;
    sessionState.isAwaitingAnswer = false;
    addMessage(state.playerProfile?.username, answer, 'user-bubble');

    let sectionKeyForSave, dataToSave;

    switch (sessionState.currentStage) {
        case 'AWAITING_MENTAL_STATE':
            sessionState.selectedMentalState = answer;
            const greeting = eveMentalStatePhrases[answer].greetings[Math.floor(Math.random() * eveMentalStatePhrases[answer].greetings.length)];
            addMessage(personalities.eve.name, greeting.replace('{name}', state.playerProfile?.username || 'صديقي'));
            sessionState.currentStage = 'MAIN_SECTIONS';
            break;

        case 'MAIN_SECTIONS':
            const sectionKey = Object.keys(protocolData)[sessionState.mainSectionIndex];
            const field = protocolData[sectionKey].fields[sessionState.mainFieldIndex];
            sectionKeyForSave = `main_${sectionKey}`;
            dataToSave = { [field.jsonKey || field.name]: { question: field.label, answer: answer } };
            sessionState.mainFieldIndex++;
            break;
        
        case 'EVE_GENERAL':
            const eveQuestion = eveGeneralQuestions[sessionState.eveGeneralIndex];
            sectionKeyForSave = 'eve_general';
            dataToSave = { [eveQuestion.id]: { question: eveQuestion.question, answer: answer } };
            sessionState.eveGeneralIndex++;
            break;
        
        case 'HYPATIA_CHOICE':
            sessionState.currentStage = answer;
            break;

        case 'HYPATIA_PHILOSOPHICAL':
            const philQuestion = hypatiaPhilosophicalQuestions[sessionState.hypatiaPhilosophicalIndex];
            sectionKeyForSave = 'hypatia_philosophical';
            dataToSave = { [philQuestion.id]: { question: philQuestion.question, answer: answer } };
            sessionState.hypatiaPhilosophicalIndex++;
            break;

        case 'HYPATIA_SCALED':
            const scaledQuestion = hypatiaScaledQuestions[sessionState.hypatiaScaledIndex];
            sectionKeyForSave = 'hypatia_scaled';
            dataToSave = { [scaledQuestion.id]: { question: scaledQuestion.text, answer: answer, axis: scaledQuestion.axis } };
            sessionState.hypatiaScaledIndex++;
            break;
    }

    if (sectionKeyForSave && dataToSave) {
        if (!localUcpData[sectionKeyForSave]) {
            localUcpData[sectionKeyForSave] = {};
        }
        Object.assign(localUcpData[sectionKeyForSave], dataToSave);
        
        if (!(state.ucp instanceof Map)) state.ucp = new Map();
        state.ucp.set(sectionKeyForSave, localUcpData[sectionKeyForSave]);

        api.saveUCPSection(state.currentUser.id, sectionKeyForSave, localUcpData[sectionKeyForSave]);
        
        showToast('تم تحديث البروتوكول', 'success');
    }

    setTimeout(askNextQuestion, 300);
}

function handleChatSend() {
    const messageText = chatInputField.value.trim();
    if (messageText) {
        processUserAnswer(messageText);
    }
}

function fastForwardSessionState() {
    const mainSectionsKeys = Object.keys(protocolData);
    const completedMainSections = mainSectionsKeys.every(key => localUcpData[`main_${key}`] && Object.keys(localUcpData[`main_${key}`]).length >= protocolData[key].fields.length);
    
    if (!completedMainSections) {
        for (let i = 0; i < mainSectionsKeys.length; i++) {
            const sectionKey = `main_${mainSectionsKeys[i]}`;
            if (!localUcpData[sectionKey]) {
                sessionState.mainSectionIndex = i;
                sessionState.mainFieldIndex = 0;
                sessionState.currentStage = 'MAIN_SECTIONS';
                return;
            }
            const numFields = protocolData[mainSectionsKeys[i]].fields.length;
            const numAnswered = Object.keys(localUcpData[sectionKey]).length;
            if (numAnswered < numFields) {
                sessionState.mainSectionIndex = i;
                sessionState.mainFieldIndex = numAnswered;
                sessionState.currentStage = 'MAIN_SECTIONS';
                return;
            }
        }
    }

    const completedEveGeneral = localUcpData['eve_general'] && Object.keys(localUcpData['eve_general']).length >= eveGeneralQuestions.length;
    if (!completedEveGeneral) {
        sessionState.eveGeneralIndex = localUcpData['eve_general'] ? Object.keys(localUcpData['eve_general']).length : 0;
        sessionState.currentStage = 'EVE_GENERAL';
        return;
    }

    const hasChosenHypatia = localUcpData['hypatia_philosophical'] || localUcpData['hypatia_scaled'];
    if (!hasChosenHypatia) {
        sessionState.currentStage = 'HYPATIA_CHOICE';
        return;
    }
    
    const completedHypatiaPhil = localUcpData['hypatia_philosophical'] && Object.keys(localUcpData['hypatia_philosophical']).length >= hypatiaPhilosophicalQuestions.length;
    if (localUcpData['hypatia_philosophical'] && !completedHypatiaPhil) {
        sessionState.hypatiaPhilosophicalIndex = Object.keys(localUcpData['hypatia_philosophical']).length;
        sessionState.currentStage = 'HYPATIA_PHILOSOPHICAL';
        sessionState.currentPersonality = 'hypatia';
        return;
    }

    const completedHypatiaScaled = localUcpData['hypatia_scaled'] && Object.keys(localUcpData['hypatia_scaled']).length >= hypatiaScaledQuestions.length;
     if (localUcpData['hypatia_scaled'] && !completedHypatiaScaled) {
        sessionState.hypatiaScaledIndex = Object.keys(localUcpData['hypatia_scaled']).length;
        sessionState.currentStage = 'HYPATIA_SCALED';
        sessionState.currentPersonality = 'hypatia';
        return;
    }

    sessionState.currentStage = 'SESSION_COMPLETE';
}

export async function renderChat() {
    chatMessagesContainer = document.getElementById('chat-messages');
    chatInputField = document.getElementById('chat-input-field');
    chatSendButton = document.getElementById('chat-send-button');
    chatActionArea = document.getElementById('chat-input-area');

    if (!chatMessagesContainer || !chatInputField || !chatSendButton || !chatActionArea) {
        console.error("Chat interface elements not found."); return;
    }

    chatMessagesContainer.innerHTML = '';
    chatSendButton.onclick = handleChatSend;
    chatInputField.onkeypress = (e) => { if (e.key === 'Enter' && !chatInputField.disabled) handleChatSend(); };

    const loaded = await loadAllProtocolData();
    if (!loaded) return;
    
    await refreshPlayerState(); 
    resetSessionState(); // Reset state but keep track of granted rewards from loaded data.
    
    if (state.ucp instanceof Map && state.ucp.size > 0) {
        state.ucp.forEach((value, key) => {
            localUcpData[key] = value;
        });
        console.log("Chat session initialized with previously saved user data.");
        fastForwardSessionState();
        addMessage(personalities.eve.name, `أهلاً بك مجدداً ${state.playerProfile?.username}! لنكمل من حيث توقفنا.`);
    } else {
        console.log("Starting a fresh chat session.");
    }
    
    askNextQuestion();
}

window.generateAndExportProtocol = function() {
    showToast('جارٍ توليد البروتوكول...', 'info');
    const username = state.playerProfile.username || 'المستكشف';
    let protocolText = protocolPreamble.replace(/{اسم_المستخدم_المفضل}/g, username) + '\n\n';
    
    protocolText += "--- أقسام البيانات الأساسية ---\n\n";
    const mainSectionKeys = Object.keys(protocolData);
    mainSectionKeys.forEach(sectionKey => {
        const ucpKey = `main_${sectionKey}`;
        if (localUcpData[ucpKey]) {
            protocolText += `[قسم: ${protocolData[sectionKey].title}]\n`;
            const sectionData = localUcpData[ucpKey];
            for (const dataKey in sectionData) {
                const item = sectionData[dataKey];
                protocolText += `- ${item.question}: ${item.answer}\n`;
            }
            protocolText += '\n';
        }
    });

    if (localUcpData['eve_general']) {
        protocolText += "--- أسئلة إيفي الإبداعية ---\n\n";
        Object.values(localUcpData['eve_general']).forEach(item => {
            protocolText += `- ${item.question}: ${item.answer}\n`;
        });
        protocolText += '\n';
    }

    if (localUcpData['hypatia_philosophical'] || localUcpData['hypatia_scaled']) {
        protocolText += "--- تحليل هيباتيا العميق ---\n\n";
        if (localUcpData['hypatia_philosophical']) {
            protocolText += "[جلسة فلسفية]\n";
            Object.values(localUcpData['hypatia_philosophical']).forEach(item => {
                protocolText += `- ${item.question}: ${item.answer}\n`;
            });
            protocolText += '\n';
        }
        if (localUcpData['hypatia_scaled']) {
            protocolText += "[جلسة تحليل سلوكي]\n";
            Object.values(localUcpData['hypatia_scaled']).forEach(item => {
                protocolText += `- "${item.question}": ${item.answer}/5 (${likertScaleLabels[item.answer]})\n`;
            });
            protocolText += '\n';
        }
    }

    protocolText += protocolPostamble.replace(/{اسم_المستخدم_المفضل}/g, username);

    const blob = new Blob([protocolText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `UCP_Protocol_${username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('تم تصدير البروتوكول بنجاح!', 'success');
}
