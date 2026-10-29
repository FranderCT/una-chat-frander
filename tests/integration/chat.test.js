// Pruebas de integracion: backend Node.js (Express + Socket.IO) + una-lib
const request = require('supertest');
const { io: Client } = require('socket.io-client');
const unalib = require('../../libs/unalib');
const { http, io } = require('../../server');

const EVENTO = 'Evento-Mensaje-Server';

let url;
let cliente;

// envia un mensaje por Socket.IO y espera la respuesta del servidor
function enviar(nombre, mensaje, color = '#1A2B3C') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('el servidor no respondio')), 3000);
    cliente.once(EVENTO, (respuesta) => {
      clearTimeout(timer);
      resolve(JSON.parse(respuesta));
    });
    cliente.emit(EVENTO, JSON.stringify({ nombre, mensaje, color }));
  });
}

beforeAll(async () => {
  await new Promise((resolve) => http.listen(0, resolve));
  url = `http://localhost:${http.address().port}`;
  cliente = Client(url, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    cliente.on('connect', resolve);
    cliente.on('connect_error', reject);
  });
});

afterAll(async () => {
  cliente.close();
  await io.close(); // cierra Socket.IO y el servidor HTTP
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HTTP', () => {
  test('GET / entrega el html del chat', async () => {
    const res = await request(http).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Chat Socket.IO UNA');
  });
});

describe('Socket.IO + una-lib', () => {
  test('el backend llama realmente a validarMensaje de una-lib', async () => {
    const espia = jest.spyOn(unalib, 'validateMessage');
    await enviar('Ana', 'hola');
    expect(espia).toHaveBeenCalledTimes(1);
    expect(JSON.parse(espia.mock.calls[0][0]).mensaje).toBe('hola');
  });

  test('texto normal: lo acepta y lo reenvia igual', async () => {
    const res = await enviar('Ana', 'hola mundo');
    expect(res).toEqual({ nombre: 'Ana', mensaje: 'hola mundo', color: '#1A2B3C' });
  });

  test('URL de imagen valida: el backend acepta el mensaje y lo convierte en <img>', async () => {
    const res = await enviar('Ana', 'https://example.com/gato.png');
    expect(res.mensaje).toMatch(/^<img src="https:\/\/example\.com\/gato\.png"/);
  });

  test('URL de video valida (YouTube): el backend acepta el mensaje y lo convierte en <iframe>', async () => {
    const res = await enviar('Ana', 'https://www.youtube.com/watch?v=qYwlqx-JLok');
    expect(res.mensaje).toContain('<iframe');
    expect(res.mensaje).toContain('https://www.youtube.com/embed/qYwlqx-JLok');
  });

  test('URL de video valida (archivo): el backend acepta el mensaje y lo convierte en <video>', async () => {
    const res = await enviar('Ana', 'https://example.com/clip.webm');
    expect(res.mensaje).toMatch(/^<video src="https:\/\/example\.com\/clip\.webm" controls/);
  });

  test('script: la validacion devuelve contenido saneado', async () => {
    const res = await enviar('Ana', "<script>alert('Inyeccion de script');</script>");
    expect(res.mensaje).not.toMatch(/<script/i);
    expect(res.mensaje).toContain('&lt;script&gt;');
  });

  test('atributo malicioso en URL de imagen: no genera ninguna etiqueta', async () => {
    const res = await enviar('Ana', 'https://example.com/x.jpg" onerror="alert(1)');
    expect(res.mensaje).not.toContain('<');
  });

  test('nombre y color maliciosos tambien se sanean', async () => {
    const res = await enviar('<img src=x onerror=alert(1)>', 'hola', 'red;x:url(javascript:alert(1))');
    expect(res.nombre).not.toContain('<');
    expect(res.color).toBe('#000000');
  });

  test('mensaje que no es JSON: el backend no se cae y devuelve texto escapado', async () => {
    const recibido = new Promise((resolve) => cliente.once(EVENTO, resolve));
    cliente.emit(EVENTO, '<script>alert(1)</script>');
    const res = JSON.parse(await recibido);
    expect(res.mensaje).not.toMatch(/<script/i);
  });
});
