// modulo de ejemplo.

// Caracteres que pueden romper un atributo HTML o abrir una etiqueta.
var HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

// Solo http(s), sin espacios ni caracteres peligrosos en la URL.
var URL_BASE = '^https?:\\/\\/[^\\s<>"\'`\\\\]+';
var URL_QUERY = '(?:[?#][^\\s<>"\'`\\\\]*)?$';

var RE_IMAGE = new RegExp(URL_BASE + '\\.(?:jpg|jpeg|png|gif|bmp|webp)' + URL_QUERY, 'i');
var RE_VIDEO = new RegExp(URL_BASE + '\\.(?:mp4|webm|ogg|ogv)' + URL_QUERY, 'i');
var RE_YT_VIDEO = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})(?:[&?#][^\s<>"'`\\]*)?$/i;
var RE_COLOR = /^#[0-9a-f]{6}$/i;

// los mensajes de depuracion se silencian al correr pruebas (NODE_ENV=test)
function log() {
  if (process.env.NODE_ENV !== 'test') {
    console.log.apply(console, arguments);
  }
}

var MAX_NOMBRE = 30;
var MAX_MENSAJE = 2000;

module.exports = {


    // logica que valida si un telefono esta correcto...
    is_valid_phone: function (phone) {
      // inicializacion lazy
      var isValid = false;
      // expresion regular copiada de StackOverflow
      var re = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/i;

      // validacion Regex
      try {
        isValid = re.test(phone);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
      // fin del try-catch block
    },

    // neutraliza cualquier HTML: el texto se muestra tal cual, nunca se ejecuta
    escapeHtml: function (text) {
      return String(text).replace(/[&<>"'`]/g, function (c) {
        return HTML_ESCAPES[c];
      });
    },

    is_valid_url_image: function (url) {
      return typeof url === 'string' && RE_IMAGE.test(url);
    },

    // video directo (mp4, webm, ogg) servido por http(s)
    is_valid_url_video: function (url) {
      return typeof url === 'string' && RE_VIDEO.test(url);
    },

    is_valid_yt_video: function (url) {
      return typeof url === 'string' && RE_YT_VIDEO.test(url);
    },

    getYTVideoId: function(url){
      var match = typeof url === 'string' ? url.match(RE_YT_VIDEO) : null;
      return match ? match[1] : null;
    },

    getEmbeddedCode: function (url){
      var id = this.getYTVideoId(url);
      if (!id) {
        return this.escapeHtml(url);
      }
      var code = '<iframe width="560" height="315" src="https://www.youtube.com/embed/'+id+ '" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      return code;
    },

    getImageTag: function(url){
      var tag = '<img src="'+this.escapeHtml(url)+'" alt="imagen" referrerpolicy="no-referrer" style="max-height: 400px;max-width: 400px;">';
      return tag;
    },

    getVideoTag: function(url){
      var tag = '<video src="'+this.escapeHtml(url)+'" controls preload="metadata" style="max-height: 400px;max-width: 400px;"></video>';
      return tag;
    },

    // devuelve un JSON cuyos campos ya son seguros para insertar como HTML
    validateMessage: function(msg){
      // Handle invalid input
      if (!msg || typeof msg !== 'string') {
        return JSON.stringify({ mensaje: '' });
      }

      var obj;
      try {
        obj = JSON.parse(msg);
      } catch (e) {
        log('Error processing message:', e);
        // mensaje que no es JSON: se devuelve como texto escapado
        return JSON.stringify({ mensaje: this.escapeHtml(msg.slice(0, MAX_MENSAJE)) });
      }

      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return JSON.stringify({ mensaje: '' });
      }

      // nombre y color tambien se insertan en el HTML del cliente
      var nombre = typeof obj.nombre === 'string' ? obj.nombre.trim().slice(0, MAX_NOMBRE) : '';
      var color = typeof obj.color === 'string' && RE_COLOR.test(obj.color) ? obj.color : '#000000';
      var mensaje = typeof obj.mensaje === 'string' ? obj.mensaje.trim().slice(0, MAX_MENSAJE) : '';

      if(this.is_valid_url_image(mensaje)){
        log("Es una imagen!")
        mensaje = this.getImageTag(mensaje);
      }
      else if(this.is_valid_yt_video(mensaje)){
        log("Es un video!")
        mensaje = this.getEmbeddedCode(mensaje);
      }
      else if(this.is_valid_url_video(mensaje)){
        log("Es un video!")
        mensaje = this.getVideoTag(mensaje);
      }
      else{
        log("Es un texto!")
        mensaje = this.escapeHtml(mensaje);
      }

      return JSON.stringify({
        nombre: this.escapeHtml(nombre || 'Anonimo'),
        mensaje: mensaje,
        color: color
      });
    },

    // alias en español usado en el enunciado del laboratorio
    validarMensaje: function(msg){
      return this.validateMessage(msg);
    }

  // fin del modulo
  };
