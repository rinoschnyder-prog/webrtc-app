// server.js (ルーム機能・クラウド対応版)

const https = require('https');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url'); // ★ URLを解析するために追加

const app = express();
// ★ Renderが環境変数でPORTを指定してくるので、それに従う。ローカルテスト用には8080を維持。
const port = process.env.PORT || 8080; 

// index.html や main.js を配信するための設定
// ★ RenderではHTTPS化が自動で行われるため、ローカルのような証明書設定は不要。
//    しかし、ローカルテストのためにHTTPSサーバーのロジックは残しておきます。
if (fs.existsSync('./localhost+2-key.pem')) {
    console.log('Starting HTTPS server for local development.');
    const options = {
      key: fs.readFileSync('./localhost+2-key.pem'),
      cert: fs.readFileSync('./localhost+2.pem')
    };
    var server = https.createServer(options, app);
} else {
    console.log('Starting HTTP server for production (Render).');
    var server = require('http').createServer(app);
}

app.use(express.static(__dirname));

// WebSocketサーバーを起動
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // ★ 接続URLからルーム名を取得する
  const parameters = new URL(req.url, `https://${req.headers.host}`).searchParams;
  const room = parameters.get('room');
  if (!room) {
    console.log('Room not specified, closing connection.');
    ws.close();
    return;
  }
  
  // ★ WebSocketオブジェクトにルーム名を紐づける
  ws.room = room;
  console.log(`Client connected to room: ${room}`);

  ws.on('message', message => {
    const messageString = message.toString();
    // ★ 同じルームにいる、自分以外のクライアントにだけメッセージを転送する
    wss.clients.forEach(client => {
      if (client !== ws && client.room === ws.room && client.readyState === 1) {
        client.send(messageString);
      }
    });
  });

  ws.on('close', () => {
    console.log(`Client disconnected from room: ${room}`);
  });
});

server.listen(port, () => {
  console.log(`Server started on port ${port}`);
});