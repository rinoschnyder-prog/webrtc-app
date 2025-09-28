// main.js (最終確定版・修正済み)
'use strict';
const createRoomButton = document.getElementById('createRoomButton');
const callButton = document.getElementById('callButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');
const initialView = document.getElementById('initial-view');
const controls = document.getElementById('controls');
let localStream, pc, socket;
// ▼▼▼ 修正点1: ICE Candidateを一時的に保持するキューを追加 ▼▼▼
let remoteCandidatesQueue = [];
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};
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
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; // http/httpsに両対応
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
        console.log('WebSocket connected');
        callButton.disabled = false;
        micButton.disabled = false;
        videoButton.disabled = false;
    };
    // ▼▼▼ 修正点2: onmessageの処理を全面的に修正 ▼▼▼
    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);

            if (message.offer) {
                if (!pc) createPeerConnection();
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));

                // キューに溜まっていたICE候補を処理
                for (const candidate of remoteCandidatesQueue) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                remoteCandidatesQueue = []; // キューをリセット

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.send(JSON.stringify({ answer: pc.localDescription }));
                isCallInProgress = true;
                updateCallButton(true);

            } else if (message.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                
                // キューに溜まっていたICE候補を処理
                for (const candidate of remoteCandidatesQueue) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                remoteCandidatesQueue = []; // キューをリセット

            } else if (message.candidate) {
                // remoteDescriptionが設定されるまではキューに溜める
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } else {
                    remoteCandidatesQueue.push(message.candidate);
                }
            }
        } catch (e) { console.error('Error handling message:', e); }
    };
}
function createPeerConnection() {
    pc = new RTCPeerConnection(servers);
    pc.oniceconnectionstatechange = () => { 
        console.log(`ICE connection state change: ${pc.iceConnectionState}`); 
        // ▼▼▼ 修正点3: タイポを修正 (iceConnectionstate -> iceConnectionState) ▼▼▼
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
    // キューもリセット
    remoteCandidatesQueue = [];
}
function updateCallButton(isInProgress) {
    if (isInProgress) {
        callButton.classList.add('hangup');
        callButton.textContent = '📞'; // 切断ボタンのアイコン
        callButton.style.transform = 'scaleX(-1) rotate(135deg)';
    } else {
        callButton.classList.remove('hangup');
        callButton.textContent = '📞'; // 発信ボタンのアイコン
        callButton.style.transform = 'none';
    }
}
function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micButton.textContent = audioTrack.enabled ? '🎤' : '🔇';
        micButton.style.backgroundColor = audioTrack.enabled ? '#3c4043' : '#ea4335';
    }
}
function toggleVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoButton.textContent = videoTrack.enabled ? '📹' : '🚫';
        videoButton.style.backgroundColor = videoTrack.enabled ? '#3c4043' : '#ea4335';
    }
}