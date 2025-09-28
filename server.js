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

// ▼▼▼ 追加: 参加人数をルーム内の全員に通知する関数 ▼▼▼
function broadcastParticipantCount(room) {
    const clientsInRoom = [];
    wss.clients.forEach(client => {
        if (client.room === room && client.readyState === 1) {
            clientsInRoom.push(client);
        }
    });
    const count = clientsInRoom.length;
    const message = JSON.stringify({ type: 'count', count: count });
    
    clientsInRoom.forEach(client => {
        client.send(message);
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
  ws.room = room;
  console.log(`クライアントがルームに参加しました: ${room}`);

  // ▼▼▼ 変更: 新しい参加者が来たら人数を全員に通知 ▼▼▼
  broadcastParticipantCount(room);

  ws.on('message', message => {
    const messageString = message.toString();
    wss.clients.forEach(client => {
      if (client !== ws && client.room === ws.room && client.readyState === 1) {
        client.send(messageString);
      }
    });
  });

  ws.on('close', () => {
    console.log(`クライアントがルームから退出しました: ${room}`);
    // ▼▼▼ 変更: 参加者が退出したら人数を全員に通知 ▼▼▼
    broadcastParticipantCount(room);
  });
});

server.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});