// Telemetria OpenTelemetry (trazas, metricas y logs) hacia Grafana Cloud por OTLP/HTTP.
// Debe cargarse ANTES que express/socket.io: server.js lo requiere en su primera linea.
//
// Solo se activa si OTEL_EXPORTER_OTLP_ENDPOINT esta definido (archivo .env o variables
// de entorno del proceso/contenedor). Nunca se activa en Vercel ni durante las pruebas.
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  require('dotenv').config({ quiet: true });
}

const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
const habilitado = Boolean(endpoint) && process.env.NODE_ENV !== 'test' && !process.env.VERCEL;

if (habilitado) {
  // valores por defecto: servicio y entorno de origen (local)
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'una-chat';
  process.env.OTEL_RESOURCE_ATTRIBUTES =
    process.env.OTEL_RESOURCE_ATTRIBUTES || 'deployment.environment=local';

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

  const gatewayHost = new URL(endpoint).host;

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 10000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // sin spans por cada middleware de Express (solo el handler de cada ruta)
        '@opentelemetry/instrumentation-express': { ignoreLayersType: ['middleware'] },
        // evita el bucle: no trazar las llamadas de salida hacia el gateway de Grafana
        '@opentelemetry/instrumentation-http': {
          // el healthcheck de Docker/Cronitor no se traza
          ignoreIncomingRequestHook: (req) => req.url === '/health',
          ignoreOutgoingRequestHook: (req) => (req.hostname || req.host || '').includes(gatewayHost),
        },
      }),
    ],
  });

  sdk.start();

  // vacia los buffers al cerrar para no perder las ultimas senales
  const cerrar = () => sdk.shutdown().catch(() => {}).finally(() => process.exit(0));
  process.once('SIGTERM', cerrar);
  process.once('SIGINT', cerrar);

  console.log(
    '[telemetry] OpenTelemetry activo -> ' + endpoint +
    ' | service=' + process.env.OTEL_SERVICE_NAME +
    ' | ' + process.env.OTEL_RESOURCE_ATTRIBUTES
  );
}

module.exports = { habilitado };
