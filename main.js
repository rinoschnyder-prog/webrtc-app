'use strict';

// HTML要素を取得
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micButton = document.getElementById('micButton');
const videoButton = document.getElementById('videoButton');

let localStream;
let pc; // PeerConnection
let socket; // WebSocket

// ★★★ 無料のOpen Relay ProjectのTURNサーバー情報を設定 ★★★
const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:1932' },
        { // ▼▼▼ ここが新しい設定 ▼▼▼
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// --- ボタンのクリックイベントを登録 ---
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);
micButton.addEventListener('click', toggleMic);
videoButton.addEventListener('click', toggleVideo);


// --- シグナリングサーバーに接続 ---
function connectWebSocket() {
    // ページのURLからルーム名を取得
    const room = new URL(window.location.href).searchParams.get('room');
    if (!room) {
        alert('ルーム名が指定されていません。URLの末尾に `?room=あなたのルーム名` を追加してください。');
        return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // WebSocketのURLにルーム名を追加
    const wsUrl = `${wsProtocol}//${window.location.host}/?room=${room}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected');
        // ★ 接続が確立したらCallボタンを有効化する
        callButton.disabled = false;
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            if (message.offer) {
                if (!pc) {
                    createPeerConnection();
                }
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.send(JSON.stringify({ answer: pc.localDescription }));

            } else if (message.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));

            } else if (message.candidate) {
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                }
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
    console.log('Creating PeerConnection...');
    try {
        pc = new RTCPeerConnection(servers);

        pc.oniceconnectionstatechange = (event) => {
            console.log(`ICE connection state change: ${pc.iceConnectionState}`);
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                console.log('Sending ICE candidate:', event.candidate);
                socket.send(JSON.stringify({ candidate: event.candidate }));
            }
        };

        pc.ontrack = event => {
            console.log('Received remote stream');
            remoteVideo.srcObject = event.streams[0];
        };

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            console.log('Local stream added to PeerConnection');
        }
    } catch (e) {
        console.error('Failed to create PeerConnection:', e);
    }
}


// 1. カメラを開始する関数
async function start() {
    console.log('1. start関数が開始されました。');
    startButton.disabled = true;
    
    try {
        console.log('2. navigator.mediaDevices.getUserMedia を呼び出します...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        console.log('3. getUserMediaが成功しました！ストリームを取得。');
        localVideo.srcObject = stream;
        localStream = stream;
        
        connectWebSocket(); // WebSocket接続を開始
        console.log('4. カメラの表示とWebSocket接続準備が完了しました。');
    } catch (e) {
        console.error('カメラの起動中にエラーが発生しました:', e);
        alert(`カメラの起動に失敗しました: ${e.name}`);
        startButton.disabled = false;
    }
}

// 2. 接続を開始 (Call) する関数
async function call() {
    console.log('Call button clicked');
    callButton.disabled = true;
    hangupButton.disabled = false;

    if (!pc) {
        createPeerConnection();
    }
    
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('Sending offer:', offer);
        socket.send(JSON.stringify({ offer: pc.localDescription }));
    } catch(e) {
        console.error('Error creating offer:', e);
    }
}

// 3. 接続を終了する関数
function hangup() {
    console.log('Hanging up.');
    if (pc) {
        pc.close();
        pc = null;
    }
    window.location.reload();
}

// マイクのミュートを切り替える関数
function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micButton.textContent = audioTrack.enabled ? '🎤' : '🔇';
        micButton.style.backgroundColor = audioTrack.enabled ? '#3c4043' : '#ea4335';
    }
}

// ビデオのオン/オフを切り替える関数
function toggleVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoButton.textContent = videoTrack.enabled ? '📹' : '🚫';
        videoButton.style.backgroundColor = videoTrack.enabled ? '#3c4043' : '#ea4335';
    }
}