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

function getClientsInRoom(room) {
    const clients = [];
    wss.clients.forEach(client => {
        if (client.room === room && client.readyState === 1) {
            clients.push(client);
        }
    });
    return clients;
}

function broadcastParticipantCount(room) {
    const clientsInRoom = getClientsInRoom(room);
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

  // ▼▼▼ 変更: 接続ロジックを修正 ▼▼▼
  const clientsInRoom = getClientsInRoom(room);
  
  // もし部屋にすでに誰かいる場合 (つまり、自分が2人目の場合)
  if (clientsInRoom.length > 1) {
    // 部屋にいる他のクライアント（先にいた人）にだけ通話開始の合図を送る
    clientsInRoom.forEach(client => {
      if (client !== ws) {
        client.send(JSON.stringify({ type: 'ready' }));
      }
    });
  }

  // 参加人数の更新は全員に通知
  broadcastParticipantCount(room);

  ws.on('message', message => {
    const messageString = message.toString();
    // 他のクライアントにメッセージを転送
    getClientsInRoom(room).forEach(client => {
      if (client !== ws) {
        client.send(messageString);
      }
    });
  });

  ws.on('close', () => {
    console.log(`クライアントがルームから退出しました: ${room}`);
    // 退出後、残っている人に人数を通知
    broadcastParticipantCount(room);
  });
});

server.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});