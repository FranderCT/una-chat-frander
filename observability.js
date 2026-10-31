// Logs, metricas y trazas de la aplicacion. Si OpenTelemetry no esta activo,
// las APIs de @opentelemetry/api son no-op y solo queda el log JSON por consola.
const { trace, metrics, logs, SeverityNumber, SpanStatusCode } = require('@opentelemetry/api');

const tracer = trace.getTracer('una-chat');
const meter = metrics.getMeter('una-chat');
const otelLogger = logs.getLogger('una-chat');

const SEVERIDAD = {
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

// log estructurado: consola (JSON) + OTLP. trace_id/span_id se toman del span activo.
function log(level, message, attrs) {
  attrs = attrs || {};
  const sc = trace.getActiveSpan() && trace.getActiveSpan().spanContext();
  const linea = Object.assign(
    { time: new Date().toISOString(), level: level, msg: message },
    attrs,
    sc ? { trace_id: sc.traceId, span_id: sc.spanId } : {}
  );
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify(linea));
  }
  otelLogger.emit({
    severityNumber: SEVERIDAD[level],
    severityText: level.toUpperCase(),
    body: message,
    attributes: attrs,
  });
}

const logger = {
  info: (m, a) => log('info', m, a),
  warn: (m, a) => log('warn', m, a),
  error: (m, a) => log('error', m, a),
};

// ---- metricas ----
const httpRequests = meter.createCounter('chat.http.requests', {
  description: 'Solicitudes HTTP recibidas por UNA Chat',
});
const httpDuration = meter.createHistogram('chat.http.request.duration', {
  description: 'Tiempo de respuesta de las solicitudes HTTP',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500] },
});
const httpErrors = meter.createCounter('chat.http.errors', {
  description: 'Solicitudes HTTP con respuesta 4xx/5xx',
});
const messages = meter.createCounter('chat.messages', {
  description: 'Mensajes procesados por el chat (canal http o socket)',
});
const messageDuration = meter.createHistogram('chat.message.duration', {
  description: 'Tiempo de procesamiento de un mensaje',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250] },
});

// middleware de Express: metricas + log por solicitud (excluye el trafico interno de socket.io y /health)
function httpMetrics(req, res, next) {
  if (req.path.startsWith('/socket.io') || req.path === '/health') return next();
  const inicio = process.hrtime.bigint();
  res.on('finish', function () {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    const attrs = {
      'http.request.method': req.method,
      'http.route': route,
      'http.response.status_code': res.statusCode,
      'status.class': Math.floor(res.statusCode / 100) + 'xx',
    };
    httpRequests.add(1, attrs);
    httpDuration.record(ms, attrs);
    if (res.statusCode >= 400) httpErrors.add(1, attrs);
    logger[res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'](
      'http request', {
        'http.request.method': req.method,
        'http.route': route,
        'http.response.status_code': res.statusCode,
        'duration.ms': Math.round(ms * 100) / 100,
        'test.id': req.get('x-test-id') || undefined,
      });
  });
  next();
}

// Procesa un mensaje de chat dentro de un span "chat.process_message" (con un hijo
// "chat.validate_message"). Devuelve el JSON validado o lanza el error (queda en el span).
function processMessage(raw, opts, validate) {
  const canal = opts.channel;
  return tracer.startActiveSpan(
    'chat.process_message',
    { attributes: { 'chat.channel': canal, 'test.id': opts.testId || '' } },
    function (span) {
      const inicio = process.hrtime.bigint();
      let resultado = 'ok';
      try {
        if (opts.simulateError) {
          throw new Error('Fallo controlado: error simulado para la prueba de monitoreo');
        }
        const validado = tracer.startActiveSpan('chat.validate_message', function (hijo) {
          try { return validate(raw); } finally { hijo.end(); }
        });
        const parsed = JSON.parse(validado);
        if (!parsed.mensaje) resultado = 'rejected';
        span.setAttribute('chat.result', resultado);
        span.setAttribute('chat.user', parsed.nombre || '');
        span.setAttribute('chat.message.length', (parsed.mensaje || '').length);
        logger.info(resultado === 'ok' ? 'message processed' : 'message rejected (empty)', {
          'chat.channel': canal,
          'chat.result': resultado,
          'chat.user': parsed.nombre || '',
          'test.id': opts.testId || undefined,
        });
        return validado;
      } catch (err) {
        resultado = 'error';
        span.setAttribute('chat.result', resultado);
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        logger.error('message failed: ' + err.message, {
          'chat.channel': canal,
          'chat.result': resultado,
          'test.id': opts.testId || undefined,
        });
        throw err;
      } finally {
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
        messages.add(1, { 'chat.channel': canal, 'chat.result': resultado });
        messageDuration.record(ms, { 'chat.channel': canal, 'chat.result': resultado });
        span.end();
      }
    }
  );
}

module.exports = { logger, httpMetrics, processMessage, tracer };
