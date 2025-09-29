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
        if (client.readyState === 1) {
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

    if (!rooms[room]) {
        rooms[room] = [];
    }
    rooms[room].push(ws);
    ws.room = room;

    console.log(`クライアントがルームに参加しました: ${room}`);

    const otherClients = getClientsInRoom(room).filter(client => client !== ws && client.readyState === 1);

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

        // ▼▼▼ 変更点: 再接続要求を処理するロジックを追加 ▼▼▼
        if (parsedMessage.type === 'request-to-call') {
            console.log(`ルーム[${room}]で再接続要求を受信`);
            // 要求してきた本人にだけ、Offerを作成するよう指示を返す
            ws.send(JSON.stringify({ type: 'create-offer' }));
            return; // 他のクライアントには転送しない
        }
        
        // 通常のメッセージは送信者以外の全員に転送
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

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});