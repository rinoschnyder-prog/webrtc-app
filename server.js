// server.js の全体をこれで置き換えてください
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

    // ▼▼▼ 変更点: 新しいクライアントを追加する前に、ルームの人数をチェック ▼▼▼
    const clientsInRoom = getClientsInRoom(room);
    if (clientsInRoom.length >= 2) {
        console.log(`ルーム[${room}]への参加が拒否されました（満室）`);
        // 満室であることをクライアントに通知
        ws.send(JSON.stringify({ type: 'room-full' }));
        // 接続を閉じる
        ws.close();
        return; // この後の処理は行わない
    }

    // ルームが満室でなければ、クライアントをルームに追加
    if (!rooms[room]) {
        rooms[room] = [];
    }
    rooms[room].push(ws);
    ws.room = room;

    console.log(`クライアントがルームに参加しました: ${room}`);

    // このクライアント以外の、同じルームにいるクライアントを取得
    const otherClients = clientsInRoom.filter(client => client.readyState === 1);

    if (otherClients.length > 0) { // 自分が2人目の場合
        ws.send(JSON.stringify({ type: 'create-offer' }));
        otherClients.forEach(client => {
            client.send(JSON.stringify({ type: 'peer-joined' }));
        });
    }

    // 参加人数の更新は、新しいクライアントを追加した後に全員に通知
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
        
        // 退出後、残っている人に人数を通知
        broadcastParticipantCount(room);
    });
});

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});