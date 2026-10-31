// npm install para descargar los paquetes...

// telemetria y monitoreo de errores: deben cargarse antes que express/socket.io
require('./telemetry');
var sentry = require('./sentry');

// libreriuas
var validation = require('./libs/unalib');
var obs = require('./observability');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// solo en local/pruebas: permite provocar un fallo controlado con la cabecera x-simulate-error
var ERRORES_DE_PRUEBA = process.env.ENABLE_TEST_ERRORS === 'true';

app.use(obs.httpMetrics);

// root: presentar html
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// verificacion de estado (Docker healthcheck / Cronitor)
app.get('/health', function(req, res){
  res.json({ status: 'ok' });
});

// procesa un mensaje por HTTP: mismo flujo que el evento de socket, usado por la prueba de carga
// POST /api/messages  {"nombre": "...", "mensaje": "...", "color": "#aabbcc"}
app.post('/api/messages', express.json({ limit: '10kb' }), function(req, res, next){
  var cuerpo = req.body;
  var testId = req.get('x-test-id') || '';
  try {
    var validado = obs.processMessage(JSON.stringify(cuerpo), {
      channel: 'http',
      testId: testId,
      simulateError: ERRORES_DE_PRUEBA && req.get('x-simulate-error') === 'true'
    }, validation.validateMessage.bind(validation));
    var msg = JSON.parse(validado);
    if (!msg.mensaje) {
      return res.status(400).json({ error: 'mensaje vacio o invalido' });
    }
    io.emit('Evento-Mensaje-Server', validado);
    res.json({ ok: true, mensaje: msg });
  } catch (err) {
    next(err);
  }
});

// escuchar una conexion por socket
io.on('connection', function(socket){
  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function(msg){
    var testId = '';
    try { testId = String(JSON.parse(msg).testId || ''); } catch (e) { /* mensaje no JSON */ }

    try {
      msg = obs.processMessage(msg, { channel: 'socket', testId: testId },
                               validation.validateMessage.bind(validation));
    } catch (err) {
      return; // processMessage ya registro el error (span, metrica y log)
    }
    // volvemos a emitir el mensaje ya validado
    io.emit('Evento-Mensaje-Server', msg);
  });
});

// errores no controlados: log con trace_id, Sentry (si esta activo) y respuesta 500
if (sentry.habilitado) {
  sentry.Sentry.setupExpressErrorHandler(app);
}
app.use(function(err, req, res, next){
  if (res.headersSent) return next(err);
  var status = err.status || err.statusCode || 500;
  if (status >= 500) {
    obs.logger.error('unhandled error: ' + err.message, { 'http.route': req.path });
  }
  // en serverless hay que enviar el evento a Sentry antes de que se congele la funcion
  var listo = sentry.habilitado ? sentry.Sentry.flush(2000) : Promise.resolve();
  listo.then(function(){
    res.status(status).json({ error: status >= 500 ? 'internal_error' : err.message });
  });
});

// solo escucha si se ejecuta con "npm start"; las pruebas importan el modulo
if (require.main === module) {
  http.listen(port, function(){
    console.log('listening on *:' + port);
  });
}

// Vercel necesita que el export sea la app (funcion); las pruebas usan app.http / app.io
app.app = app;
app.http = http;
app.io = io;
module.exports = app;
