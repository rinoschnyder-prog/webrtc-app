// server.js の全体をこれで置き換えてください
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');
const path = require('path'); // ★ pathモジュールを追加

const app = express();
const port = process.env.PORT || 3000;

// ★ /node_modules へのアクセスを許可する設定を追加
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => { /* 変更なし */ });
server.listen(port, () => { /* 変更なし */ });

// ▼▼▼ 変更がない部分も含めた完全なコードを記載します ▼▼▼
wss.on('connection', (ws, req) => {
  const parameters = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const room = parameters.get('room');
  if (!room) {
    console.log('ルーム名が指定されていないため、接続を閉じます。');
    ws.close();
    return;
  }
  ws.room = room;
  console.log(`クライアントがルームに参加しました: ${room}`);
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
  });
});
server.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});