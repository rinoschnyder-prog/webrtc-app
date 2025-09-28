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

// ▼▼▼ 追加: SVGアイコンを定数として定義 ▼▼▼
const ICONS = {
    micOn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85l-.02.15v2c0 2.76-2.24 5-5 5s-5-2.24-5-5v-2c0-.55-.45-1-1-1s-1 .45-1 1v2c0 3.53 2.61 6.43 6 6.92V21h-2c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-2v-3.08c3.39-.49 6-3.39 6-6.92v-2c0-.55-.45-1-1-1z"/></svg>`,
    micOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.82 5.82c.01-.01.01-.02.02-.03c.01 0 .01-.01.01-.01V5c0-.55.45-1 1-1s1 .45 1 1v6c0 1.66-1.34 3-3 3-.32 0-.63-.05-.92-.14l-2.02-2.02c.54.1.84.16 1.94.16zm-3.18-2.82L4.22 6.59C3.47 7.35 3 8.32 3 9.35v1.3c0 .55.45 1 1 1s1-.45 1-1v-1.3c0-1.1.9-2 2-2 .16 0 .32.02.47.06L2.81 2.81a.996.996 0 1 0-1.41 1.41L19.19 22l1.41-1.41-8.8-8.8L3.82 3.82l-1.41 1.41L12 15.17V17.9c-3.39-.49-6-3.39-6-6.92v-1.65c0-.55.45-1 1-1s1 .45 1 1z"/></svg>`,
    videoOn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    videoOff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2.81 2.81a.996.996 0 1 0-1.41 1.41L3 5.83V17c0 .55.45 1 1 1h12c.34 0 .65-.17.83-.44L18.42 19H4V7.58l-1.6-1.6c-.2-.2-.2-.51 0-.71zM17 16.42V7c0-.55-.45-1-1-1H7.58l10.83 10.83c.1-.17.17-.36.17-.58v-3.5l4 4v-11l-4 4v.17l-1.42-1.42L17 10.5z"/></svg>`,
    call: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24c1.12.37 2.33.57 3.57.57c.55 0 1 .45 1 1V20c0 .55-.45 1-1 1c-9.39 0-17-7.61-17-17c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1c0 1.25.2 2.45.57 3.57c.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
    hangup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.62.72l1.44 1.44c.95-.24 1.94-.36 2.94-.36c3.22 0 6.22.86 8.77 2.36l1.45-1.45C20.19 10.1 16.32 9 12 9zm-4.62 4.44L2.81 2.81a.996.996 0 1 0-1.41 1.41L6.62 9.45c-2.5 1.48-4.48 3.5-5.91 5.71c-.24.36-.14.86.21 1.1l2.58 1.83c.41.29.96.22 1.28-.17c1.46-1.78 3.32-3.25 5.38-4.22l2.84 2.84c-1.35.81-2.93 1.63-4.56 2.34c-.45.19-1 .01-1.27-.41L5 15.5c-.32-.47-.13-1.09.35-1.39c1.92-1.21 4.1-1.91 6.38-1.91c.79 0 1.56.09 2.3.26l1.46 1.46C14.15 13.25 12.6 13 11 13c-1.23 0-2.43.15-3.62.44z"/></svg>`
};

let localStream, pc, socket;
let remoteCandidatesQueue = [];
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// 初期アイコン設定
function initializeIcons() {
    micButton.innerHTML = ICONS.micOn;
    videoButton.innerHTML = ICONS.videoOn;
    callButton.innerHTML = ICONS.call;
}
initializeIcons(); // ページ読み込み時に実行

createRoomButton.addEventListener('click', createNewRoom);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', toggleMic);
videoButton.addEventListener('click', toggleVideo);
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
                socket.send(JSON.stringify({ answer: pc.localDescription }));
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
    pc.onicecandidate = event => { if (event.candidate) { socket.send(JSON.stringify({ candidate: event.candidate })); } };
    pc.ontrack = event => { remoteVideo.srcObject = event.streams[0]; };
    if (localStream) { localStream.getTracks().forEach(track => pc.addTrack(track, localStream)); }
}
async function call() {
    if (!pc) createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({ offer: pc.localDescription }));
    isCallInProgress = true;
    updateCallButton(true);
}
function hangup() {
    if (pc) { pc.close(); pc = null; }
    isCallInProgress = false;
    updateCallButton(false);
    remoteVideo.srcObject = null;
    remoteCandidatesQueue = [];
}

// ▼▼▼ 変更: ボタンの更新処理をSVGアイコンの切り替えに変更 ▼▼▼
function updateCallButton(isInProgress) {
    if (isInProgress) {
        callButton.classList.add('hangup');
        callButton.innerHTML = ICONS.hangup;
    } else {
        callButton.classList.remove('hangup');
        callButton.innerHTML = ICONS.call;
    }
}
function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micButton.innerHTML = audioTrack.enabled ? ICONS.micOn : ICONS.micOff;
        micButton.style.backgroundColor = audioTrack.enabled ? '#3c4043' : '#ea4335';
    }
}
function toggleVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoButton.innerHTML = videoTrack.enabled ? ICONS.videoOn : ICONS.videoOff;
        videoButton.style.backgroundColor = videoTrack.enabled ? '#3c4043' : '#ea4335';
    }
}