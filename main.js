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
let remoteCandidatesQueue = [];
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// ▼▼▼ 追加: WebSocketが有効な時だけメッセージを送信するヘルパー関数 ▼▼▼
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        console.warn('WebSocket is not open. Message not sent:', message);
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
    if (room) startCall();
});
async function startCall() {
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
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
            alert('カメラとマイクへのアクセスがブロックされました。ブラウザの設定を確認してください。');
        } else {
            alert(`カメラの起動に失敗しました: ${e.name}`);
        }
    }
}
let isCallInProgress = false;
function handleCallButtonClick() { if (isCallInProgress) { hangup(); } else { call(); } }
function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
        console.log('WebSocket connected');
        callButton.disabled = false;
        micButton.disabled = false;
        videoButton.disabled = false;
    };
    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.offer) {
                if (!pc) createPeerConnection();
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                for (const candidate of remoteCandidatesQueue) { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
                remoteCandidatesQueue = [];
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                // ▼▼▼ 変更: 安全な送信関数を使用 ▼▼▼
                sendMessage({ answer: pc.localDescription });
                isCallInProgress = true;
                updateCallButton(true);
            } else if (message.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                for (const candidate of remoteCandidatesQueue) { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
                remoteCandidatesQueue = [];
            } else if (message.candidate) {
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } else {
                    remoteCandidatesQueue.push(message.candidate);
                }
            } else if (message.type === 'count') {
                participantInfo.textContent = `参加人数: ${message.count}人`;
            }
        } catch (e) { console.error('Error handling message:', e); }
    };
}
function createPeerConnection() {
    pc = new RTCPeerConnection(servers);
    pc.oniceconnectionstatechange = () => { 
        console.log(`ICE connection state change: ${pc.iceConnectionState}`); 
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') { 
            isCallInProgress = true; 
            updateCallButton(true); 
        } 
    };
    pc.onicecandidate = event => { 
        if (event.candidate) { 
            // ▼▼▼ 変更: 安全な送信関数を使用 ▼▼▼
            sendMessage({ candidate: event.candidate }); 
        } 
    };
    pc.ontrack = event => { remoteVideo.srcObject = event.streams[0]; };
    if (localStream) { localStream.getTracks().forEach(track => pc.addTrack(track, localStream)); }
}
async function call() {
    if (!pc) createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // ▼▼▼ 変更: 安全な送信関数を使用 ▼▼▼
    sendMessage({ offer: pc.localDescription });
    isCallInProgress = true;
    updateCallButton(true);
}
function hangup() {
    // ▼▼▼ 追加: WebSocket接続も閉じる ▼▼▼
    if (socket) {
        socket.close();
        socket = null;
    }
    if (pc) { 
        pc.close(); 
        pc = null; 
    }
    isCallInProgress = false;
    updateCallButton(false);
    remoteVideo.srcObject = null;
    remoteCandidatesQueue = [];

    // ページをリロードするか、初期画面に戻すのが親切
    // window.location.href = '/';
}
function updateCallButton(isInProgress) {
    const icon = callButton.querySelector('.icon');
    const label = callButton.querySelector('.label');
    if (isInProgress) {
        callButton.classList.add('hangup');
        icon.style.transform = 'scaleX(-1) rotate(135deg)';
        label.textContent = '通話終了';
    } else {
        callButton.classList.remove('hangup');
        icon.style.transform = 'none';
        label.textContent = '通話開始';
    }
}
function toggleMic(isInitial = false) {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    const icon = micButton.querySelector('.icon');
    const label = micButton.querySelector('.label');

    if (audioTrack) {
        if (!isInitial) {
          audioTrack.enabled = !audioTrack.enabled;
        }
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
    const videoTrack = videoButton.querySelector('.icon');
    const label = videoButton.querySelector('.label');

    if (videoTrack) {
        if (!isInitial) {
          videoTrack.enabled = !videoTrack.enabled;
        }
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