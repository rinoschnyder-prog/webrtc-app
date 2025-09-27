'use strict';

// HTML要素を取得
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
// hangupButtonはcallButtonと兼用するので、getElementByIdのリストからは削除
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');

let localStream;
let pc; // PeerConnection
let socket; // WebSocket

// 無料のOpen Relay ProjectのTURNサーバー情報を設定
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// --- ボタンのクリックイベントを登録 ---
startButton.addEventListener('click', start);
callButton.addEventListener('click', handleCallButtonClick);
micButton.addEventListener('click', toggleMic);
videoButton.addEventListener('click', toggleVideo);

// Call/Hang Upボタンの兼用ハンドラ
let isCallInProgress = false;
function handleCallButtonClick() {
    if (isCallInProgress) {
        hangup();
    } else {
        call();
    }
}

// --- シグナリングサーバーに接続 ---
function connectWebSocket() {
    const room = new URL(window.location.href).searchParams.get('room');
    if (!room) {
        alert('ルーム名が指定されていません。URLの末尾に `?room=あなたのルーム名` を追加してください。');
        return;
    }

    const wsProtocol = window.location.protocol === 'https' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected');
        callButton.disabled = false; // WebSocket接続後にCallボタンを有効化
        micButton.disabled = false;
        videoButton.disabled = false;
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.offer) {
                if (!pc) createPeerConnection();
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.send(JSON.stringify({ answer: pc.localDescription }));
                // 着信側も通話状態にする
                isCallInProgress = true;
                updateCallButton(true);
            } else if (message.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
            } else if (message.candidate) {
                if (pc) await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };
}

// PeerConnectionを作成する共通関数
function createPeerConnection() {
    pc = new RTCPeerConnection(servers);

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state change: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            // 接続が成功したら通話状態にする
            isCallInProgress = true;
            updateCallButton(true);
        }
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ candidate: event.candidate }));
        }
    };

    pc.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
}

// 1. カメラを開始する（ページの自動実行から呼ばれる）
async function start() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideo.srcObject = stream;
        localStream = stream;
        connectWebSocket();
    } catch (e) {
        alert(`カメラの起動に失敗しました: ${e.name}`);
    }
}

// 2. 接続を開始 (Call) する関数
async function call() {
    console.log('Calling...');
    if (!pc) createPeerConnection();
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({ offer: pc.localDescription }));

    isCallInProgress = true;
    updateCallButton(true);
}

// 3. 接続を終了する関数
function hangup() {
    console.log('Hanging up...');
    if (pc) {
        pc.close();
        pc = null;
    }
    isCallInProgress = false;
    updateCallButton(false);
    remoteVideo.srcObject = null; // 相手のビデオをクリア
    
    // 必要であれば、WebSocketを再接続したり、ページをリロードしたりする
    // 今回はシンプルにボタンの状態を戻すだけにする
}

// Callボタンの表示を更新する関数
function updateCallButton(isInProgress) {
    if (isInProgress) {
        callButton.classList.add('hangup'); // 赤色にするためのクラスを追加 (CSSで定義)
        callButton.style.transform = 'scaleX(-1)'; // 絵文字を反転
    } else {
        callButton.classList.remove('hangup'); // 赤色クラスを削除
        callButton.style.transform = 'none'; // 反転を戻す
    }
}

// --- マイクのミュートを切り替える関数 ---
function toggleMic() {
    if (!localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        
        if (audioTrack.enabled) {
            micButton.textContent = '🎤';
            micButton.style.backgroundColor = '#3c4043';
        } else {
            micButton.textContent = '🔇';
            micButton.style.backgroundColor = '#ea4335';
        }
    }
}

// --- ビデオのオン/オフを切り替える関数 ---
function toggleVideo() {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;

        if (videoTrack.enabled) {
            videoButton.textContent = '📹';
            videoButton.style.backgroundColor = '#3c4043';
        } else {
            videoButton.textContent = '🚫';
            videoButton.style.backgroundColor = '#ea4335';
        }
    }
}