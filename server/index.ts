import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const startedAt = new Date().toISOString();

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, startedAt }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello' }));
});

server.listen(PORT, () => console.log(`brawlcam server on :${PORT}`));
