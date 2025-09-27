// main.js の全体をこれで置き換えてください
'use strict';

// HTML要素を取得
const createRoomButton = document.getElementById('createRoomButton');
const callButton = document.getElementById('callButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');
const initialView = document.getElementById('initial-view');
const controls = document.getElementById('controls');

let localStream;
let pc;
let socket;

const servers = { /* 変更なし */ };

// --- ボタンのクリックイベントを登録 ---
// startButtonの代わりにcreateRoomButtonを登録
createRoomButton.addEventListener('click', createNewRoom);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', toggleMic);
videoButton.addEventListener('click', toggleVideo);

// 新しいルームを作成してリダイレクトする関数
function createNewRoom() {
    const newRoomId = uuid.v4(); // v4形式のUUIDを生成
    // ?room=... を付けた新しいURLにリダイレクト
    window.location.href = `/?room=${newRoomId}`;
}

// ページ読み込み時の処理
window.addEventListener('load', () => {
    // URLにルーム名がある場合のみ、通話画面を開始する
    const room = new URL(window.location.href).searchParams.get('room');
    if (room) {
        startCall();
    }
});

// 通話画面を開始するメインの関数（以前のstart関数）
async function startCall() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = stream;
        localStream = stream;

        // UIの状態を切り替える
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


// ... (これ以降の関数は変更なし) ...

// ▼▼▼ 変更がない関数も含めた完全なコードを記載します ▼▼▼
let isCallInProgress = false;
function handleCallButtonClick() { if (isCallInProgress) { hangup(); } else { call(); } }
function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    const wsProtocol = 'wss:';
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => { console.log('WebSocket connected'); callButton.disabled = false; };
    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.offer) {
                if (!pc) createPeerConnection();
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.send(JSON.stringify({ answer: pc.localDescription }));
                isCallInProgress = true;
                updateCallButton(true);
            } else if (message.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
            } else if (message.candidate) {
                if (pc) await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        } catch (e) { console.error('Error handling message:', e); }
    };
}
function createPeerConnection() {
    pc = new RTCPeerConnection(servers);
    pc.oniceconnectionstatechange = () => { console.log(`ICE connection state change: ${pc.iceConnectionState}`); if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') { isCallInProgress = true; updateCallButton(true); } };
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
}
function updateCallButton(isInProgress) {
    if (isInProgress) {
        callButton.classList.add('hangup');
        callButton.style.transform = 'scaleX(-1)';
    } else {
        callButton.classList.remove('hangup');
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