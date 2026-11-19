// Servidor de prueba para `tests/tiempo_real.rs`: imita lo justo del gateway `/realtime` del
// backend (saludo con token, `auth:expired` + corte) y el `POST /v1/auth/refresh`.
// Se lanza con NODE_PATH apuntando a `backend/node_modules` (de ahí sale socket.io).
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/auth/refresh') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accessToken: 'nuevo', refreshToken: 'r2' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server);
io.of('/realtime').on('connection', (socket) => {
  const { token, deviceId, platform, client } = socket.handshake.auth ?? {};
  if (token !== 'nuevo') {
    // Igual que el backend cuando caduca el token con el que se abrió la conexión.
    socket.emit('auth:expired');
    socket.disconnect(true);
    return;
  }
  socket.emit('pet:update', { id: 'p1', token, deviceId, platform, client });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PUERTO ${server.address().port}`);
});
