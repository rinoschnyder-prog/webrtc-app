// server.js の全体をこれで置き換えてください
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));

const server = http.createServer(app);
// ▼▼▼ 変更点1: clientTrackingを有効にする ▼▼▼
const wss = new WebSocketServer({ server, clientTracking: true });

const rooms = {};

function getClientsInRoom(room) {
    return rooms[room] || [];
}

function broadcastParticipantCount(room) {
    const clients = getClientsInRoom(room);
    const count = clients.length;
    const message = JSON.stringify({ type: 'count', count });
    
    clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    });
    console.log(`ルーム[${room}]の参加人数: ${count}人`);
}

wss.on('connection', (ws, req) => {
    const parameters = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const room = parameters.get('room');
    if (!room) {
        ws.close();
        return;
    }

    const clientsInRoom = getClientsInRoom(room);
    if (clientsInRoom.length >= 2) {
        console.log(`ルーム[${room}]への参加が拒否されました（満室）`);
        ws.send(JSON.stringify({ type: 'room-full' }));
        ws.close();
        return;
    }

    if (!rooms[room]) {
        rooms[room] = [];
    }
    rooms[room].push(ws);
    ws.room = room;

    // ▼▼▼ 変更点2: 接続時に生存フラグを立て、pongイベントのリスナーを設定 ▼▼▼
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    console.log(`クライアントがルームに参加しました: ${room}`);

    const otherClients = clientsInRoom.filter(client => client.readyState === 1);

    if (otherClients.length > 0) {
        ws.send(JSON.stringify({ type: 'create-offer' }));
        otherClients.forEach(client => {
            client.send(JSON.stringify({ type: 'peer-joined' }));
        });
    }

    broadcastParticipantCount(room);

    ws.on('message', message => {
        const messageString = message.toString();
        const parsedMessage = JSON.parse(messageString);

        if (parsedMessage.type === 'request-to-call') {
            console.log(`ルーム[${room}]で再接続要求を受信`);
            ws.send(JSON.stringify({ type: 'create-offer' }));
            return;
        }
        
        getClientsInRoom(room).forEach(client => {
            if (client !== ws && client.readyState === 1) {
                client.send(messageString);
            }
        });
    });

    ws.on('close', () => {
        console.log(`クライアントがルームから退出しました: ${room}`);
        
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(client => client !== ws);
            if (rooms[room].length === 0) {
                delete rooms[room];
            }
        }
        
        broadcastParticipantCount(room);
    });
});

// ▼▼▼ 変更点3: ハートビート（生存確認）の仕組みを追加 ▼▼▼
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
        console.log(`クライアント[${ws.room}]へのPing応答がなかったため、接続を強制終了します。`);
        return ws.terminate(); // 応答がなければ強制終了
    }

    ws.isAlive = false; // 次の確認のために一旦フラグを倒す
    ws.ping(); // 生存確認のPingを送信
  });
}, 30000); // 30秒ごとに実行

// サーバーが閉じる際にインターバルもクリアする
wss.on('close', () => {
  clearInterval(interval);
});

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});