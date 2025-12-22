'use strict';

// --- DOM要素 ---
const createRoomButton = document.getElementById('createRoomButton');
const callButton = document.getElementById('callButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');
const zoomButton = document.getElementById('zoomButton');
const recordButton = document.getElementById('recordButton');
const initialView = document.getElementById('initial-view');
const controls = document.getElementById('controls');
const participantInfo = document.getElementById('participant-info');
const recordingCanvas = document.getElementById('recordingCanvas');
const canvasContext = recordingCanvas.getContext('2d');
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const frameRateSelect = document.getElementById('frameRateSelect');
const audioQualitySelect = document.getElementById('audioQualitySelect');
const loadingOverlay = document.getElementById('loading-overlay');
const copyLinkButton = document.getElementById('copyLinkButton');

// --- グローバル変数 ---
let localStream, pc, socket;
let isNegotiating = false;
let isCallInProgress = false;
let isRemoteVideoReady = false;
let animationFrameId;
let remoteCandidatesQueue = [];
let currentZoom = 1; // ズーム状態 (1.0, 1.5, 2.0)
const isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let audioContext, mixedStreamDestination;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// --- イベント登録 ---
createRoomButton.addEventListener('click', createNewRoom);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', () => toggleMic());
videoButton.addEventListener('click', () => toggleVideo());
zoomButton.addEventListener('click', () => toggleZoom());
recordButton.addEventListener('click', () => toggleRecording());
settingsButton.addEventListener('click', () => {
    settingsPanel.style.display = (settingsPanel.style.display === 'flex') ? 'none' : 'flex';
});
copyLinkButton.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert('招待リンクをコピーしました！相手に送ってください。');
    });
});

async function startCallPreparation() {
    try {
        loadingOverlay.style.display = 'flex';
        const selectedFrameRate = parseInt(frameRateSelect.value, 10);
        const constraints = {
            audio: true,
            video: { frameRate: { ideal: selectedFrameRate } }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        initialView.style.display = 'none';
        remoteVideo.style.display = 'block';
        controls.style.display = 'flex';
        document.getElementById('room-info').style.display = 'flex';
        
        micButton.disabled = false;
        videoButton.disabled = false;
        settingsButton.disabled = false;
        zoomButton.disabled = false;
        
        if (isAppleDevice) {
            recordButton.style.display = 'none';
            settingsButton.style.display = 'none';
        }

        toggleMic(true);
        toggleVideo(true);
        connectWebSocket();
    } catch (e) {
        alert('カメラ/マイクの起動に失敗しました。');
        loadingOverlay.style.display = 'none';
    }
}

function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        loadingOverlay.style.display = 'none';
        createPeerConnection();
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'room-full') {
            alert('満室です。');
            window.location.href = '/';
            return;
        }
        if (message.type === 'create-offer') {
            call();
        } else if (message.type === 'peer-joined') {
            callButton.disabled = false;
        } else if (message.offer) {
            await handleOffer(message.offer);
        } else if (message.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        } else if (message.candidate) {
            handleCandidate(message.candidate);
        } else if (message.type === 'count') {
            participantInfo.textContent = `参加人数: ${message.count}人`;
            if (!isCallInProgress) callButton.disabled = (message.count <= 1);
        } else if (message.type === 'hangup') {
            resetCallState();
        }
    };
    
    socket.onclose = () => {
        resetCallState();
        zoomButton.disabled = true;
    };
}

async function handleOffer(offer) {
    if (isNegotiating) return;
    isNegotiating = true;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendMessage({ answer: pc.localDescription });
    remoteCandidatesQueue.forEach(candidate => pc.addIceCandidate(candidate));
    remoteCandidatesQueue = [];
    isNegotiating = false;
}

function handleCandidate(candidateData) {
    const candidate = new RTCIceCandidate(candidateData);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(candidate);
    } else {
        remoteCandidatesQueue.push(candidate);
    }
}

function createPeerConnection() {
    if (pc) pc.close();
    pc = new RTCPeerConnection(servers);
    let disconnectTimeout;

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected') {
            if (disconnectTimeout) clearTimeout(disconnectTimeout);
            isCallInProgress = true;
            updateCallButton(true);
            callButton.disabled = false;
        } else if (pc.iceConnectionState === 'disconnected') {
            disconnectTimeout = setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected') hangup();
            }, 10000);
        }
    };

    pc.onicecandidate = event => {
        if (event.candidate) sendMessage({ candidate: event.candidate });
    };

    pc.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.onloadedmetadata = () => {
            isRemoteVideoReady = true;
            if (!isAppleDevice) recordButton.disabled = false;
        };
    };
    
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
}

async function call() {
    if (isNegotiating) return;
    isNegotiating = true;
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({ offer: pc.localDescription });
    } catch (e) {
        console.error(e);
    } finally {
        isNegotiating = false;
    }
}

// --- ズーム機能 ---
function toggleZoom() {
    if (currentZoom === 1) currentZoom = 1.5;
    else if (currentZoom === 1.5) currentZoom = 2;
    else currentZoom = 1;
    
    remoteVideo.style.transform = `scale(${currentZoom})`;
    zoomButton.querySelector('.label').textContent = `ズーム x${currentZoom}`;
}

// --- 録画機能 ---
function toggleRecording() {
    if (!isRecording) startRecording();
    else stopRecording();
}

async function startRecording() {
    if (!isRemoteVideoReady || remoteVideo.videoWidth === 0) {
        alert('映像の準備ができるまでお待ちください。');
        return;
    }
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        const localSource = audioContext.createMediaStreamSource(localStream);
        const remoteSource = audioContext.createMediaStreamSource(remoteVideo.srcObject);
        mixedStreamDestination = audioContext.createMediaStreamDestination();
        localSource.connect(mixedStreamDestination);
        remoteSource.connect(mixedStreamDestination);

        animationFrameId = requestAnimationFrame(drawVideosOnCanvas);
        const canvasStream = recordingCanvas.captureStream(30);
        const streamToRecord = new MediaStream([
            canvasStream.getVideoTracks()[0],
            mixedStreamDestination.stream.getAudioTracks()[0]
        ]);
        
        const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus') 
                         ? 'video/webm; codecs=vp8,opus' : 'video/webm';

        mediaRecorder = new MediaRecorder(streamToRecord, {
            mimeType,
            audioBitsPerSecond: parseInt(audioQualitySelect.value, 10)
        });

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = saveRecording;
        
        mediaRecorder.start(1000);
        isRecording = true;
        recordButton.classList.add('recording');
        recordButton.querySelector('.label').textContent = '録画停止';
    } catch (e) {
        alert('録画に失敗しました。');
    }
}

function stopRecording() {
    if (mediaRecorder) mediaRecorder.stop();
    if (audioContext) audioContext.close();
    cancelAnimationFrame(animationFrameId);
    isRecording = false;
    recordButton.classList.remove('recording');
    recordButton.querySelector('.label').textContent = '録画';
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-record-${Date.now()}.webm`;
    a.click();
    recordedChunks = [];
}

// 録画用Canvas描画（ズームを計算に含める）
function drawVideosOnCanvas() {
    if (!isRecording) return;
    
    recordingCanvas.width = remoteVideo.videoWidth;
    recordingCanvas.height = remoteVideo.videoHeight;

    // ズームに応じた切り取り範囲の計算
    const sw = remoteVideo.videoWidth / currentZoom;
    const sh = remoteVideo.videoHeight / currentZoom;
    const sx = (remoteVideo.videoWidth - sw) / 2;
    const sy = (remoteVideo.videoHeight - sh) / 2;

    // ズームした状態で描画
    canvasContext.drawImage(remoteVideo, sx, sy, sw, sh, 0, 0, recordingCanvas.width, recordingCanvas.height);
    
    // 自分のカメラ
    const localW = recordingCanvas.width * 0.25;
    const localH = localVideo.videoHeight * (localW / localVideo.videoWidth);
    canvasContext.drawImage(localVideo, recordingCanvas.width - localW - 20, recordingCanvas.height - localH - 20, localW, localH);
    
    animationFrameId = requestAnimationFrame(drawVideosOnCanvas);
}

// --- 共通 ---
function sendMessage(msg) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function createNewRoom() {
    window.location.href = `/?room=${uuid.v4()}`;
}

function handleCallButtonClick() {
    if (isCallInProgress) hangup();
    else sendMessage({ type: 'request-to-call' });
}

function hangup() {
    sendMessage({ type: 'hangup' });
    resetCallState();
}

function resetCallState() {
    isCallInProgress = false;
    isRemoteVideoReady = false;
    remoteCandidatesQueue = [];
    currentZoom = 1;
    remoteVideo.style.transform = `scale(1)`;
    zoomButton.querySelector('.label').textContent = 'ズーム';
    
    if (pc) { pc.close(); pc = null; }
    remoteVideo.srcObject = null;
    updateCallButton(false);
    recordButton.disabled = true;
    if (isRecording) stopRecording();
    createPeerConnection();
}

function updateCallButton(active) {
    callButton.classList.toggle('hangup', active);
    callButton.querySelector('.label').textContent = active ? '通話終了' : '通話開始';
}

function toggleMic(initial = false) {
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    if (!initial) track.enabled = !track.enabled;
    micButton.querySelector('.icon').textContent = track.enabled ? '🎤' : '🔇';
    micButton.style.backgroundColor = track.enabled ? '#3c4043' : '#ea4335';
}

function toggleVideo(initial = false) {
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    if (!initial) track.enabled = !track.enabled;
    videoButton.querySelector('.icon').textContent = track.enabled ? '📹' : '🚫';
    videoButton.style.backgroundColor = track.enabled ? '#3c4043' : '#ea4335';
}

window.addEventListener('load', () => {
    if (new URL(window.location.href).searchParams.get('room')) startCallPreparation();
});
