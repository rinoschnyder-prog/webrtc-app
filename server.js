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

// ルームごとのクライアントを管理するオブジェクト
const rooms = {};

// 指定されたルームのクライアントリストを取得するヘルパー関数
function getClientsInRoom(room) {
    return rooms[room] || [];
}

// ルームの参加人数をそのルームの全員にブロードキャストする関数
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

    // クライアントをルームに追加
    if (!rooms[room]) {
        rooms[room] = [];
    }
    rooms[room].push(ws);
    ws.room = room; // wsオブジェクトにルーム情報を紐付け

    console.log(`クライアントがルームに参加しました: ${room}`);

    // ▼▼▼ 変更点: 接続ロジックを明確化 ▼▼▼
    // このクライアント以外の、同じルームにいるクライアントを取得
    const otherClients = getClientsInRoom(room).filter(client => client !== ws && client.readyState === 1);

    // もしルームに他のクライアントがいたら（自分が2人目の場合）
    if (otherClients.length > 0) {
        // 新しく接続してきたクライアント（自分自身）に、Offerを作成するよう指示
        ws.send(JSON.stringify({ type: 'create-offer' }));

        // 先にいたクライアントに、新しいピアが参加したことを通知
        otherClients.forEach(client => {
            client.send(JSON.stringify({ type: 'peer-joined' }));
        });
    }

    // 接続時に参加人数を全員に通知
    broadcastParticipantCount(room);

    ws.on('message', message => {
        const messageString = message.toString();
        // 受信したメッセージを、送信者以外の同じルームのクライアントに転送
        getClientsInRoom(room).forEach(client => {
            if (client !== ws && client.readyState === 1) {
                client.send(messageString);
            }
        });
    });

    ws.on('close', () => {
        console.log(`クライアントがルームから退出しました: ${room}`);
        
        // クライアントをルームから削除
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(client => client !== ws);
            if (rooms[room].length === 0) {
                delete rooms[room]; // ルームが空になったら削除
            }
        }
        
        // 退出後、残っている人に人数を通知
        broadcastParticipantCount(room);
    });
});

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});