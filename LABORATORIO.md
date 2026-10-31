# Laboratorio de monitoreo de logs – UNA Chat

## 2.1 Señales de monitoreo

| Señal | Qué permite observar | Ejemplo en UNA Chat | Dónde se consulta |
|---|---|---|---|
| **Logs** | Eventos discretos con texto y atributos | `message processed`, `message failed: ...`, `http request 400` | Loki |
| **Métricas** | Números agregados en el tiempo | solicitudes/s (`chat.http.requests`), latencia (`chat.http.request.duration`), errores (`chat.http.errors`) | Mimir / Prometheus |
| **Trazas** | El recorrido de una solicitud por sus pasos (spans) con duración y resultado | `POST /api/messages` → `chat.process_message` → `chat.validate_message` | Tempo |

**Grafana** es la interfaz para consultar y graficar; **Loki** almacena logs; **Tempo** almacena trazas; **Mimir** almacena métricas. Los logs y las trazas se relacionan por `trace_id`.

## Integración elegida

OpenTelemetry para Node.js (`telemetry.js`) exporta por OTLP/HTTP directo al gateway OTLP de Grafana Cloud (sin Alloy ni collector).

```
UNA Chat (Node, local o Docker) --OTLP/HTTP--> https://otlp-gateway-<region>.grafana.net/otlp --> Tempo / Loki / Mimir --> Grafana
```

- Auto-instrumentación: http, express, socket.io. Spans manuales: `chat.process_message`, `chat.validate_message`.
- Logs JSON por consola y por OTLP, con `trace_id`/`span_id` del span activo (`observability.js`).
- Recurso: `service.name=una-chat`, `deployment.environment=local`, `run.mode=host|docker`.
- Solo se activa si `OTEL_EXPORTER_OTLP_ENDPOINT` está definido. **Nunca** se activa en Vercel (`VERCEL` definido) ni en pruebas.
- Credenciales solo en `.env` (ignorado por git). Plantilla: `.env.example`.

## Parte 1 – Vercel (Cronitor + Sentry)

Variables en Vercel (Project → Settings → Environment Variables): `SENTRY_DSN`. **No** definir `OTEL_*`.

Error controlado para Sentry (sin código temporal): definir `ENABLE_TEST_ERRORS=true` en Vercel, redesplegar y ejecutar

```bash
curl -i -X POST https://<su-app>.vercel.app/api/messages \
  -H 'content-type: application/json' -H 'x-simulate-error: true' -d '{"mensaje":"x"}'
```

Después **borrar** `ENABLE_TEST_ERRORS` en Vercel y redesplegar (retira el mecanismo).
Monitor de Cronitor: URL `https://<su-app>.vercel.app/health`, assertion `response.code = 200`, alerta por correo.

## Parte 2 – Local (host) → Grafana Cloud

```bash
cp .env.example .env      # completar endpoint y header de Grafana Cloud
npm install
npm start                 # http://localhost:3000
node scripts/functional-test.js http://localhost:3000 5
# fallo controlado (500) y solicitud inválida (400):
curl -s -X POST localhost:3000/api/messages -H 'content-type: application/json' -H 'x-simulate-error: true' -d '{"mensaje":"x"}'
curl -s -X POST localhost:3000/api/messages -H 'content-type: application/json' -d '{"mensaje":""}'
```

## Parte 3 – Docker + Artillery

```bash
docker compose up --build -d          # http://localhost:3000  (usa .env para Grafana)
docker compose logs -f una-chat
node scripts/functional-test.js http://localhost:3000 5      # anota INICIO/FIN y test.id

npm i -g artillery
export TEST_ID=artillery-$(date +%Y%m%d-%H%M%S)
date -u; artillery run artillery/load-test.yml --output artillery/reports/report.json; date -u
artillery report artillery/reports/report.json                # reporte HTML
```

## Consultas en Grafana Cloud (Explore)

- **Logs (Loki):** `{service_name="una-chat", deployment_environment="local"} | json` · pruebas: `|= "artillery-"` · errores: `|= "level" |= "error"`
- **Trazas (Tempo, TraceQL):** `{ resource.service.name = "una-chat" && resource.deployment.environment = "local" }` · fallidas: `{ resource.service.name = "una-chat" && status = error }`
- **Métricas (Prometheus):** `sum(rate(chat_http_requests_total{service_name="una-chat"}[1m]))` · errores: `sum(rate(chat_http_errors_total[1m]))` · p95: `histogram_quantile(0.95, sum by (le) (rate(chat_http_request_duration_milliseconds_bucket[1m])))`
  (los nombres exactos se ven en el selector de métricas de Explore).
