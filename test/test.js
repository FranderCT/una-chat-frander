process.env.NODE_ENV = 'test'; // silencia los logs de depuracion de unalib
var val = require('../libs/unalib');
var assert = require('assert');


describe('unalib', function(){

  // valida un mensaje de chat y devuelve el JSON resultante ya parseado
  function validar(mensaje, extra){
    var base = { nombre: 'Ana', mensaje: mensaje, color: '#A1B2C3' };
    return JSON.parse(val.validateMessage(JSON.stringify(Object.assign(base, extra || {}))));
  }


  describe('funcion is_valid_phone', function(){

    it('deberia devolver true para 8297-8547', function(){

      assert.equal(val.is_valid_phone('8297-8547'), true);

    });

    it('deberia devolver false para 8297p-8547', function(){

      assert.equal(val.is_valid_phone('8297p-8547'), false);

    });

  });


  describe('funcion is_valid_url_image', function(){

    it('deberia devolver true para http://image.com/image.jpg', function(){

      assert.equal(val.is_valid_url_image('http://image.com/image.jpg'), true);

    });

    it('deberia devolver true para http://image.com/image.gif', function(){

      assert.equal(val.is_valid_url_image('http://image.com/image.gif'), true);

    });
    
  });

  describe('funcion is_valid_yt_video', function(){

    it('deberia devolver true para https://www.youtube.com/watch?v=qYwlqx-JLok', function(){

      assert.equal(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok'), true);

    });

  });


  // ---------------------------------------------------------------
  // Lab 5: URLs de imagenes, videos y prevencion de inyeccion de scripts
  // ---------------------------------------------------------------

  describe('validacion de URLs de imagenes', function(){

    ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].forEach(function(ext){
      it('deberia aceptar https://cdn.example.com/foto.' + ext, function(){
        assert.strictEqual(val.is_valid_url_image('https://cdn.example.com/foto.' + ext), true);
      });
    });

    it('deberia aceptar extension en mayusculas y query string', function(){
      assert.strictEqual(val.is_valid_url_image('https://example.com/a/FOTO.PNG?w=200&h=100'), true);
    });

    it('deberia rechazar URLs que no apuntan a una imagen', function(){
      assert.strictEqual(val.is_valid_url_image('https://example.com/pagina.html'), false);
      assert.strictEqual(val.is_valid_url_image('hola mundo'), false);
    });

    it('deberia rechazar protocolos peligrosos', function(){
      assert.strictEqual(val.is_valid_url_image('javascript:alert(1)//x.jpg'), false);
      assert.strictEqual(val.is_valid_url_image('data:image/png;base64,AAAA'), false);
      assert.strictEqual(val.is_valid_url_image('ftp://example.com/x.jpg'), false);
    });

    it('deberia rechazar URLs con comillas, etiquetas o espacios', function(){
      assert.strictEqual(val.is_valid_url_image('https://example.com/x.jpg" onerror="alert(1)'), false);
      assert.strictEqual(val.is_valid_url_image('https://example.com/<script>.jpg'), false);
      assert.strictEqual(val.is_valid_url_image('https://example.com/x.jpg algo mas'), false);
    });

    it('deberia rechazar valores que no son texto', function(){
      assert.strictEqual(val.is_valid_url_image(undefined), false);
      assert.strictEqual(val.is_valid_url_image(null), false);
      assert.strictEqual(val.is_valid_url_image({}), false);
    });

    it('getImageTag deberia generar un <img> con la URL escapada', function(){
      var tag = val.getImageTag('https://example.com/x.jpg?a=1&b=2');
      assert.ok(tag.indexOf('<img src="https://example.com/x.jpg?a=1&amp;b=2"') === 0);
    });

  });

  describe('validacion de URLs de videos', function(){

    it('deberia aceptar enlaces de YouTube (watch, youtu.be y embed)', function(){
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok'), true);
      assert.strictEqual(val.is_valid_yt_video('https://youtu.be/qYwlqx-JLok'), true);
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/embed/qYwlqx-JLok'), true);
    });

    it('deberia rechazar YouTube sin id o con id invalido', function(){
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/watch?v='), false);
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/watch?v=corto'), false);
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/watch?v="><script>alert(1)</script>'), false);
    });

    it('deberia rechazar dominios que imitan a YouTube', function(){
      assert.strictEqual(val.is_valid_yt_video('https://evil.com/youtube.com/watch?v=qYwlqx-JLok'), false);
    });

    ['mp4', 'webm', 'ogg'].forEach(function(ext){
      it('deberia aceptar video directo .' + ext, function(){
        assert.strictEqual(val.is_valid_url_video('https://media.example.com/clip.' + ext), true);
      });
    });

    it('deberia rechazar videos con protocolo o formato no permitido', function(){
      assert.strictEqual(val.is_valid_url_video('javascript:alert(1)//x.mp4'), false);
      assert.strictEqual(val.is_valid_url_video('https://example.com/clip.exe'), false);
      assert.strictEqual(val.is_valid_url_video('https://example.com/clip.mp4" onerror="alert(1)'), false);
    });

    it('getEmbeddedCode deberia integrar el reproductor de YouTube con el id', function(){
      var code = val.getEmbeddedCode('https://www.youtube.com/watch?v=qYwlqx-JLok');
      assert.ok(code.indexOf('<iframe') === 0);
      assert.ok(code.indexOf('src="https://www.youtube.com/embed/qYwlqx-JLok"') !== -1);
    });

    it('getVideoTag deberia integrar un <video> con controles', function(){
      var tag = val.getVideoTag('https://media.example.com/clip.webm');
      assert.ok(tag.indexOf('<video src="https://media.example.com/clip.webm" controls') === 0);
    });

  });

  describe('funcion validateMessage', function(){

    it('deberia convertir una URL de imagen en <img>', function(){
      var out = validar('https://example.com/gato.png');
      assert.ok(out.mensaje.indexOf('<img src="https://example.com/gato.png"') === 0);
    });

    it('deberia convertir una URL de YouTube en <iframe>', function(){
      var out = validar('https://www.youtube.com/watch?v=qYwlqx-JLok');
      assert.ok(out.mensaje.indexOf('<iframe') === 0);
    });

    it('deberia convertir una URL de video directo en <video>', function(){
      var out = validar('https://example.com/clip.webm');
      assert.ok(out.mensaje.indexOf('<video') === 0);
    });

    it('deberia dejar el texto normal sin cambios', function(){
      assert.strictEqual(validar('hola mundo').mensaje, 'hola mundo');
    });

    it('validarMensaje es un alias de validateMessage', function(){
      var msg = JSON.stringify({ nombre: 'Ana', mensaje: 'hola', color: '#000000' });
      assert.strictEqual(val.validarMensaje(msg), val.validateMessage(msg));
    });

  });

  describe('prevencion de inyeccion de scripts', function(){

    function sinHtmlActivo(texto){
      return !/<\s*(script|img|iframe|svg|video|b|a)\b/i.test(texto);
    }

    it('deberia escapar <script> en el mensaje', function(){
      var out = JSON.parse(val.validateMessage(JSON.stringify({
        nombre: 'x', mensaje: "<script>alert('Inyeccion de script');</script>", color: '#000000'
      })));
      assert.ok(sinHtmlActivo(out.mensaje));
      assert.ok(out.mensaje.indexOf('&lt;script&gt;') === 0);
    });

    it('deberia escapar manejadores de eventos (onerror)', function(){
      var out = validar('<img src=x onerror=alert(1)>');
      assert.ok(sinHtmlActivo(out.mensaje));
    });

    it('deberia bloquear intentos de salir del atributo src de la imagen', function(){
      var out = validar('https://example.com/x.jpg" onerror="alert(1)');
      assert.ok(sinHtmlActivo(out.mensaje));
      assert.ok(out.mensaje.indexOf('<') === -1);
    });

    it('deberia escapar HTML en el nombre de usuario', function(){
      var out = validar('hola', { nombre: '<img src=x onerror=alert(1)>' });
      assert.ok(sinHtmlActivo(out.nombre));
    });

    it('deberia reemplazar un color invalido por uno seguro', function(){
      var out = validar('hola', { color: "red;background:url(javascript:alert(1))" });
      assert.strictEqual(out.color, '#000000');
    });

    it('deberia escapar el contenido cuando el mensaje no es JSON valido', function(){
      var out = JSON.parse(val.validateMessage('<script>alert(1)</script>'));
      assert.ok(sinHtmlActivo(out.mensaje));
    });

    it('deberia devolver mensaje vacio para entradas invalidas', function(){
      assert.strictEqual(JSON.parse(val.validateMessage(null)).mensaje, '');
      assert.strictEqual(JSON.parse(val.validateMessage(42)).mensaje, '');
      assert.strictEqual(JSON.parse(val.validateMessage('null')).mensaje, '');
    });

    it('escapeHtml deberia neutralizar & < > " \' y `', function(){
      assert.strictEqual(val.escapeHtml('&<>"\'`'), '&amp;&lt;&gt;&quot;&#39;&#96;');
    });

  });

});
