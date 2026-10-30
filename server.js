
// npm install para descargar los paquetes...

// libreriuas
var validation = require('./libs/unalib');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// root: presentar html
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// escuchar una conexion por socket
io.on('connection', function(socket){
  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function(msg){

    msg =  validation.validateMessage(msg);
    // volvemos a emitir el mensaje ya validado
    io.emit('Evento-Mensaje-Server', msg);
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
