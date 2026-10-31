// Monitoreo de errores con Sentry. Solo se activa si SENTRY_DSN esta definido
// (se configura unicamente en el despliegue de Vercel, no en local).
// No se combina con OpenTelemetry local: Sentry trae su propio setup de OTel.
const Sentry = require('@sentry/node');

const dsn = (process.env.SENTRY_DSN || '').trim();
const habilitado = Boolean(dsn) && process.env.NODE_ENV !== 'test';

if (habilitado) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || 'production',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
  });
}

module.exports = { Sentry, habilitado };
