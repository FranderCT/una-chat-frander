// Login con Auth0 (Regular Web Application, Authorization Code + PKCE, Client Secret Post).
// El Client Secret se obtiene de Supabase Vault al arrancar (server/vault.js) y vive solo en memoria.
// Si faltan AUTH0_DOMAIN o AUTH0_CLIENT_ID, la autenticacion queda desactivada y el chat abierto (pruebas).
const crypto = require('crypto');
const vault = require('./vault');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (key, data) => b64url(crypto.createHmac('sha256', key).update(data).digest());

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function createAuth(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const domain = (env.AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clientId = (env.AUTH0_CLIENT_ID || '').trim();
  const baseUrl = (env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const enabled = !!(domain && clientId);
  const secureCookie = baseUrl.startsWith('https://');
  const redirectUri = baseUrl + '/auth/callback';
  const sessionKey = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  const SESSION_TTL = 8 * 3600; // segundos

  let clientSecret = null; // solo en memoria; nunca se loguea ni se expone

  // ---- cookies firmadas (sesion y flujo de login) ----
  function pack(name, payload, ttl) {
    const body = b64url(JSON.stringify(Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + ttl })));
    return name + '=' + body + '.' + sign(sessionKey, name + '.' + body);
  }
  function unpack(name, req) {
    const raw = parseCookies(req.headers && req.headers.cookie)[name];
    if (!raw) return null;
    const i = raw.lastIndexOf('.');
    const body = raw.slice(0, i), mac = raw.slice(i + 1);
    const good = sign(sessionKey, name + '.' + body);
    if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      return data.exp > Date.now() / 1000 ? data : null;
    } catch (e) { return null; }
  }
  function setCookie(res, cookie, ttl) {
    res.append('Set-Cookie', cookie + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + ttl + (secureCookie ? '; Secure' : ''));
  }
  const clearCookie = (res, name) => setCookie(res, name + '=', 0);

  function session(req) { return enabled ? unpack('una_session', req) : { name: 'Anonimo', open: true }; }

  // ---- intercambio de codigo en Auth0 (client_secret_post) ----
  async function tokenRequest(params) {
    const body = new URLSearchParams(Object.assign({ client_id: clientId, client_secret: clientSecret }, params));
    const r = await fetch('https://' + domain + '/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    let json = {};
    try { json = await r.json(); } catch (e) { /* cuerpo no JSON */ }
    return { status: r.status, json };
  }

  // Prueba de arranque: codigo falso. invalid_grant = Auth0 acepto la credencial; invalid_client = secreto distinto.
  async function startupProbe() {
    const r = await tokenRequest({
      grant_type: 'authorization_code',
      code: 'vault-startup-probe',
      redirect_uri: redirectUri,
      code_verifier: b64url(crypto.randomBytes(32))
    });
    return { status: r.status, error: r.json.error || null };
  }

  async function init(log) {
    log = log || console.log;
    if (!enabled) { log('auth: desactivada (faltan AUTH0_DOMAIN/AUTH0_CLIENT_ID)'); return; }
    clientSecret = await vault.getAuth0ClientSecret(env.VAULT_DATABASE_URL);
    log('auth: Client Secret leido desde Vault (longitud ' + clientSecret.length + ')');
    const p = await startupProbe();
    log('auth: prueba de arranque -> HTTP ' + p.status + ' error=' + p.error + (p.error === 'invalid_grant' ? ' (esperado)' : ''));
  }

  function mount(app) {
    const express = require('express');

    app.get('/auth/config', function (req, res) {
      res.set('Cache-Control', 'no-store');
      res.json(enabled ? { enabled: true, domain: domain, clientId: clientId } : { enabled: false });
    });

    app.get('/auth/login', function (req, res) {
      if (!enabled) return res.status(404).json({ error: 'auth deshabilitada' });
      if (!clientSecret) return res.status(503).json({ error: 'auth no inicializada' });
      const state = b64url(crypto.randomBytes(16));
      const nonce = b64url(crypto.randomBytes(16));
      const verifier = b64url(crypto.randomBytes(32));
      setCookie(res, pack('una_login', { state: state, nonce: nonce, verifier: verifier }, 600), 600);
      const q = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
        scope: 'openid profile email', state: state, nonce: nonce,
        code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256'
      });
      res.redirect(302, 'https://' + domain + '/authorize?' + q.toString());
    });

    app.get('/auth/callback', async function (req, res) {
      if (!enabled || !clientSecret) return res.status(503).json({ error: 'auth no inicializada' });
      const flow = unpack('una_login', req);
      clearCookie(res, 'una_login');
      if (!flow || !req.query.code || req.query.state !== flow.state) {
        return res.status(400).json({ error: 'login_invalido' });
      }
      try {
        const t = await tokenRequest({
          grant_type: 'authorization_code', code: String(req.query.code),
          redirect_uri: redirectUri, code_verifier: flow.verifier
        });
        if (t.status !== 200 || !t.json.id_token) {
          return res.status(401).json({ error: t.json.error || 'token_error' });
        }
        const claims = JSON.parse(Buffer.from(t.json.id_token.split('.')[1], 'base64url').toString());
        const aud = [].concat(claims.aud);
        if (claims.iss !== 'https://' + domain + '/' || aud.indexOf(clientId) < 0 ||
            claims.nonce !== flow.nonce || claims.exp < Date.now() / 1000) {
          return res.status(401).json({ error: 'id_token_invalido' });
        }
        setCookie(res, pack('una_session', {
          sub: claims.sub, name: claims.name || claims.nickname || 'Usuario', email: claims.email || ''
        }, SESSION_TTL), SESSION_TTL);
        res.redirect(302, '/');
      } catch (e) {
        res.status(502).json({ error: 'auth_provider_error' });
      }
    });

    // cerrar sesion: borra la cookie y cierra la sesion de Auth0
    app.get('/auth/logout', function (req, res) {
      clearCookie(res, 'una_session');
      if (!enabled) return res.redirect(302, '/');
      const q = new URLSearchParams({ client_id: clientId, returnTo: baseUrl });
      res.redirect(302, 'https://' + domain + '/v2/logout?' + q.toString());
    });

    // sala: 401 sin sesion; con sesion devuelve quien es el usuario
    app.get('/sala', function (req, res) {
      const s = session(req);
      if (!s) return res.status(401).json({ error: 'unauthorized', login: '/auth/login' });
      res.set('Cache-Control', 'no-store');
      res.json({ name: s.name, email: s.email || '' });
    });
  }

  // middleware para rutas HTTP y sockets
  function requireSession(req, res, next) {
    if (session(req)) return next();
    res.status(401).json({ error: 'unauthorized', login: '/auth/login' });
  }
  function socketGuard(socket, next) {
    if (session(socket.request)) return next();
    next(new Error('unauthorized'));
  }

  return { enabled: enabled, init: init, mount: mount, requireSession: requireSession, socketGuard: socketGuard, session: session };
}

module.exports = { createAuth, parseCookies };
