// main.js の全体をこれで置き換えてください
'use strict';
const createRoomButton = document.getElementById('createRoomButton');
const callButton = document.getElementById('callButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');
const initialView = document.getElementById('initial-view');
const controls = document.getElementById('controls');
const participantInfo = document.getElementById('participant-info');

let localStream, pc, socket;
let isNegotiating = false;
let isCallInProgress = false;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // ポートを19302に変更 (より一般的)
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// --- 初期化処理 ---
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        console.log('Sent message:', message); // 送信ログ
    }
}

createRoomButton.addEventListener('click', createNewRoom);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', () => toggleMic());
videoButton.addEventListener('click', () => toggleVideo());

function createNewRoom() {
    const newRoomId = uuid.v4();
    window.location.href = `/?room=${newRoomId}`;
}

window.addEventListener('load', () => {
    const room = new URL(window.location.href).searchParams.get('room');
    if (room) {
        startCallPreparation();
    }
});

// --- メインロジック ---
async function startCallPreparation() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = stream;
        localStream = stream;
        initialView.style.display = 'none';
        remoteVideo.style.display = 'block';
        controls.style.display = 'flex';
        participantInfo.style.display = 'block';
        toggleMic(true);
        toggleVideo(true);
        connectWebSocket();
    } catch (e) {
        alert(`カメラまたはマイクの起動に失敗しました: ${e.name}\n\nブラウザの設定でカメラとマイクへのアクセスを許可してください。`);
    }
}

function handleCallButtonClick() {
    if (isCallInProgress) {
        hangup();
    } else {
        // 手動での発信はサーバーからの指示で行うため、このボタンからは基本的に切断のみ
        console.warn("Manual call initiation is disabled. Call starts automatically.");
    }
}

function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    const wsProtocol = 'wss:'; // Render.comはwssを強制するため
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected.');
        createPeerConnection();
        // ボタンは接続が確立してから有効化する
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message); // 受信ログ

            // ▼▼▼ 変更点: サーバーからの指示に基づいて動作 ▼▼▼
            if (message.type === 'create-offer') {
                console.log('Received create-offer signal. Initiating call.');
                call();
            } else if (message.type === 'peer-joined') {
                console.log('Peer joined, waiting for offer.');
                // 相手からのOfferを待つ
            } else if (message.offer) {
                if (isNegotiating || pc.signalingState !== 'stable') return;
                console.log('Received offer.');
                isNegotiating = true;
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendMessage({ answer: pc.localDescription });
                isNegotiating = false;
            } else if (message.answer) {
                if (pc.signalingState === 'have-local-offer') {
                    console.log('Received answer.');
                    await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                }
            } else if (message.candidate) {
                console.log('Received ICE candidate.');
                // リモートdescriptionが設定される前にcandidateが届くことがあるため、キューイングはしないが、エラーは握りつぶす
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (e) {
                    if (pc.remoteDescription) console.error('Error adding received ice candidate', e);
                }
            } else if (message.type === 'count') {
                participantInfo.textContent = `参加人数: ${message.count}人`;
            } else if (message.type === 'hangup') {
                resetCallState();
            }
        } catch (e) { console.error('Error handling message:', e); }
    };
    
    socket.onclose = () => {
        console.log('WebSocket disconnected.');
        resetCallState();
        callButton.disabled = true;
        micButton.disabled = true;
        videoButton.disabled = true;
    };
}

function createPeerConnection() {
    if (pc) pc.close();
    pc = new RTCPeerConnection(servers);
    
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state changed to: ${pc.iceConnectionState}`);
        switch(pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                isCallInProgress = true;
                updateCallButton(true);
                // ボタンを有効化
                callButton.disabled = false;
                micButton.disabled = false;
                videoButton.disabled = false;
                break;
            case 'disconnected':
            case 'failed':
            case 'closed':
                if (isCallInProgress) {
                    resetCallState();
                }
                break;
        }
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            sendMessage({ candidate: event.candidate });
        } else {
            console.log('All ICE candidates have been sent.');
        }
    };

    pc.ontrack = event => {
        console.log('Remote track received.');
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(e => console.error('Remote video play failed:', e));
        }
    };
    
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
}

async function call() {
    if (!pc || isNegotiating || isCallInProgress) {
        console.warn("Call aborted. PC not ready, negotiating, or call already in progress.");
        return;
    }
    try {
        isNegotiating = true;
        console.log("Creating offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({ offer: pc.localDescription });
    } catch(e) {
      console.error("Failed to create offer:", e);
    } finally {
        isNegotiating = false;
    }
}

function hangup() {
    sendMessage({ type: 'hangup' });
    resetCallState();
}

function resetCallState() {
    console.log("Resetting call state.");
    isCallInProgress = false;
    isNegotiating = false;
    if (pc) {
        pc.close();
        pc = null;
    }
    remoteVideo.srcObject = null;
    updateCallButton(false);
    
    // ピア接続を再作成して次の接続に備える
    if (localStream) {
        createPeerConnection();
    }
}

function updateCallButton(isInProgress) {
    const label = callButton.querySelector('.label');
    if (isInProgress) {
        callButton.classList.add('hangup');
        label.textContent = '通話終了';
    } else {
        callButton.classList.remove('hangup');
        label.textContent = '通話開始';
    }
}

function toggleMic(isInitial = false) {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    const icon = micButton.querySelector('.icon');
    const label = micButton.querySelector('.label');
    if (audioTrack) {
        if (!isInitial) audioTrack.enabled = !audioTrack.enabled;
        if (audioTrack.enabled) {
            icon.textContent = '🎤';
            label.textContent = 'ミュート';
            micButton.style.backgroundColor = '#3c4043';
        } else {
            icon.textContent = '🔇';
            label.textContent = 'ミュート解除';
            micButton.style.backgroundColor = '#ea4335';
        }
    }
}

function toggleVideo(isInitial = false) {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const icon = videoButton.querySelector('.icon');
    const label = videoButton.querySelector('.label');
    if (videoTrack) {
        if (!isInitial) videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
            icon.textContent = '📹';
            label.textContent = 'ビデオ停止';
            videoButton.style.backgroundColor = '#3c4043';
        } else {
            icon.textContent = '🚫';
            label.textContent = 'ビデオ開始';
            videoButton.style.backgroundColor = '#ea4335';
        }
    }
}