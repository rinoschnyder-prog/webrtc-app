const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, clientTracking: true });

const rooms = {};

function broadcast(room, message, sender) {
    if (!rooms[room]) return;
    rooms[room].forEach(client => {
        if (client !== sender && client.readyState === 1) {
            client.send(JSON.stringify(message));
        }
    });
}

function sendCount(room) {
    const count = rooms[room] ? rooms[room].length : 0;
    const msg = { type: 'count', count };
    if (rooms[room]) {
        rooms[room].forEach(c => c.send(JSON.stringify(msg)));
    }
}

wss.on('connection', (ws, req) => {
    const room = new URL(req.url, `http://${req.headers.host}`).searchParams.get('room');
    if (!room) return ws.close();

    if (rooms[room] && rooms[room].length >= 2) {
        ws.send(JSON.stringify({ type: 'room-full' }));
        return ws.close();
    }

    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(ws);
    ws.room = room;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    console.log(`Joined: ${room}`);
    if (rooms[room].length > 1) {
        ws.send(JSON.stringify({ type: 'create-offer' }));
        broadcast(room, { type: 'peer-joined' }, ws);
    }
    sendCount(room);

    ws.on('message', data => {
        const msg = JSON.parse(data);
        if (msg.type === 'request-to-call') {
            ws.send(JSON.stringify({ type: 'create-offer' }));
        } else {
            broadcast(room, msg, ws);
        }
    });

    ws.on('close', () => {
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(c => c !== ws);
            if (rooms[room].length === 0) delete rooms[room];
        }
        sendCount(room);
        console.log(`Left: ${room}`);
    });
});

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(port, () => console.log(`Server running on port ${port}`));
