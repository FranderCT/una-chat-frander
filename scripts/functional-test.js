// Prueba funcional del chat (Socket.IO): envia varios mensajes y comprueba que cada uno regresa.
// Uso:  node scripts/functional-test.js [url] [cantidad]     (por defecto http://localhost:3000, 5)
const { io } = require('socket.io-client');

const url = process.argv[2] || 'http://localhost:3000';
const total = Number(process.argv[3]) || 5;
const testId = 'func-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const EVENTO = 'Evento-Mensaje-Server';

const socket = io(url, { transports: ['websocket'] });
let recibidos = 0;
const inicio = new Date();

socket.on('connect_error', (e) => { console.error('No se pudo conectar a ' + url + ': ' + e.message); process.exit(1); });
socket.on('connect', () => {
  console.log('INICIO ' + inicio.toISOString() + ' test.id=' + testId + ' url=' + url);
  for (let i = 1; i <= total; i++) {
    socket.emit(EVENTO, JSON.stringify({ nombre: 'tester', mensaje: 'mensaje funcional ' + i, color: '#22aa66', testId }));
  }
});
socket.on(EVENTO, (msg) => {
  const m = JSON.parse(msg);
  if (m.nombre !== 'tester') return;
  recibidos++;
  console.log('  respuesta ' + recibidos + '/' + total + ': ' + m.mensaje);
  if (recibidos === total) fin(0);
});
setTimeout(() => fin(1), 10000);

function fin(codigo) {
  console.log('FIN ' + new Date().toISOString() + ' respuestas=' + recibidos + '/' + total + (codigo ? ' (FALLO)' : ' (OK)'));
  socket.close();
  process.exit(codigo);
}
