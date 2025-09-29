// main.js の全体をこれで置き換えてください
'use strict';
const createRoomButton = document.getElementById('createRoomButton');
const callButton = document.getElementById('callButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');
const recordButton = document.getElementById('recordButton');
const initialView = document.getElementById('initial-view');
const controls = document.getElementById('controls');
const participantInfo = document.getElementById('participant-info');

let localStream, pc, socket;
let isNegotiating = false;
let isCallInProgress = false;

// 録画関連の変数
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

function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        console.log('Sent message:', message);
    }
}

createRoomButton.addEventListener('click', createNewRoom);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', () => toggleMic());
videoButton.addEventListener('click', () => toggleVideo());
recordButton.addEventListener('click', () => toggleRecording());

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

async function startCallPreparation() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = stream;
        localStream = stream;
        initialView.style.display = 'none';
        remoteVideo.style.display = 'block';
        controls.style.display = 'flex';
        participantInfo.style.display = 'block';
        micButton.disabled = false;
        videoButton.disabled = false;
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
        console.log('Requesting to start a new call...');
        sendMessage({ type: 'request-to-call' });
    }
}

function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    const wsProtocol = 'wss:';
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected.');
        createPeerConnection();
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.type === 'room-full') {
                alert('この通話ルームは満室です（最大2名）。\nトップページに戻ります。');
                window.location.href = '/';
                return;
            }

            if (message.type === 'create-offer') {
                call();
            } else if (message.type === 'peer-joined') {
                console.log('Peer joined, waiting for offer.');
                callButton.disabled = false;
            } else if (message.offer) {
                if (isNegotiating || pc.signalingState !== 'stable') return;
                isNegotiating = true;
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendMessage({ answer: pc.localDescription });
                isNegotiating = false;
            } else if (message.answer) {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                }
            } else if (message.candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (e) {
                    if (pc.remoteDescription) console.error('Error adding received ice candidate', e);
                }
            } else if (message.type === 'count') {
                const count = message.count;
                participantInfo.textContent = `参加人数: ${count}人`;
                if (!isCallInProgress) {
                    callButton.disabled = (count <= 1);
                }
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
        recordButton.disabled = true;
        if (isRecording) {
            toggleRecording();
        }
    };
}

function createPeerConnection() {
    if (pc) pc.close();
    pc = new RTCPeerConnection(servers);
    
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state changed to: ${pc.iceConnectionState}`);
        // ▼▼▼ 修正点: 'iceConnectionstate' -> 'iceConnectionState' に修正 ▼▼▼
        switch(pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                isCallInProgress = true;
                updateCallButton(true);
                callButton.disabled = false;
                recordButton.disabled = false;
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
        if (event.candidate) sendMessage({ candidate: event.candidate });
    };

    pc.ontrack = event => {
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
    if (!pc || isNegotiating || isCallInProgress) return;
    try {
        isNegotiating = true;
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
    
    const participantCount = parseInt(participantInfo.textContent.replace(/[^0-9]/g, ''), 10);
    callButton.disabled = (participantCount <= 1);
    recordButton.disabled = true;
    
    if (isRecording) {
        toggleRecording();
    }

    if (localStream) {
        createPeerConnection();
    }
}

function updateCallButton(isInProgress) {
    const label = callButton.querySelector('.label');
    const icon = callButton.querySelector('.icon');
    if (isInProgress) {
        callButton.classList.add('hangup');
        icon.textContent = '📞';
        label.textContent = '通話終了';
    } else {
        callButton.classList.remove('hangup');
        icon.textContent = '📞';
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

function toggleRecording() {
    if (!isRecording) {
        // --- 録画開始 ---
        if (!isCallInProgress || !remoteVideo.srcObject) {
            alert('相手との通話が開始されてから録画を開始してください。');
            return;
        }

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const localAudioSource = audioContext.createMediaStreamSource(localStream);
            const remoteAudioStream = remoteVideo.srcObject;
            const remoteAudioSource = audioContext.createMediaStreamSource(remoteAudioStream);
            mixedStreamDestination = audioContext.createMediaStreamDestination();
            localAudioSource.connect(mixedStreamDestination);
            remoteAudioSource.connect(mixedStreamDestination);

            const videoTrack = remoteAudioStream.getVideoTracks()[0];
            const mixedAudioTrack = mixedStreamDestination.stream.getAudioTracks()[0];
            const streamToRecord = new MediaStream([videoTrack, mixedAudioTrack]);

            recordedChunks = [];
            mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm; codecs=vp8,opus' });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `webrtc_conversation_${new Date().toISOString()}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                recordedChunks = [];
            };

            mediaRecorder.start(1000);
            isRecording = true;
            recordButton.classList.add('recording');
            recordButton.querySelector('.label').textContent = '録画停止';
            recordButton.querySelector('.icon').textContent = '⏹️';
            console.log('会話の録画を開始しました。');

        } catch (e) {
            console.error('録画の開始に失敗しました:', e);
            alert('録画の開始に失敗しました。詳細はコンソールを確認してください。');
        }

    } else {
        // --- 録画停止 ---
        if (mediaRecorder) {
            mediaRecorder.stop();
        }
        if (audioContext) {
            audioContext.close();
        }
        isRecording = false;
        recordButton.classList.remove('recording');
        recordButton.querySelector('.label').textContent = '録画';
        recordButton.querySelector('.icon').textContent = '⏺️';
        console.log('会話の録画を停止しました。');
    }
}