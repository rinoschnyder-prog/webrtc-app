// server.js (Renderデプロイ専用・最終確定版)

const http = require('http'); // HTTPサーバー機能だけを読み込む
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');

const app = express();
// Renderが指定するポート番号を取得。もしなければ3000番を使う（ローカルテスト用）
const port = process.env.PORT || 3000; 

// index.html や main.js などの静的ファイルを配信する設定
app.use(express.static(__dirname));

// Expressアプリを使ってHTTPサーバーを直接作成する
const server = http.createServer(app);

// 作成したHTTPサーバーにWebSocketサーバーを紐づける
const wss = new WebSocketServer({ server });

// WebSocketの接続があった時の処理
wss.on('connection', (ws, req) => {
  // 接続URLからルーム名を取得する
  const parameters = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const room = parameters.get('room');
  
  if (!room) {
    console.log('ルーム名が指定されていないため、接続を閉じます。');
    ws.close();
    return;
  }
  
  ws.room = room;
  console.log(`クライアントがルームに参加しました: ${room}`);

  // メッセージを受信した時の処理
  ws.on('message', message => {
    const messageString = message.toString();
    // 同じルームにいる、自分以外のクライアントにだけメッセージを転送する
    wss.clients.forEach(client => {
      if (client !== ws && client.room === ws.room && client.readyState === 1) {
        client.send(messageString);
      }
    });
  });

  // 接続が閉じた時の処理
  ws.on('close', () => {
    console.log(`クライアントがルームから退出しました: ${room}`);
  });
});

// サーバーを指定されたポートで起動し、接続を待ち受ける
server.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動し、接続を待っています。`);
});