# Evidencias – Laboratorio de monitoreo de logs (UNA Chat)

Zona horaria de las capturas de Grafana: UTC-6 (hora local de Costa Rica). Credenciales: ninguna aparece en las capturas ni en el repositorio (`.env` está en `.gitignore`).

## Parte 1 – Vercel (`https://una-chat-frander.vercel.app`)

| Archivo | Qué demuestra |
|---|---|
| `01-cronitor-monitor-vercel.png` | Monitor de Cronitor "UNA Chat - Vercel (health)" sobre `https://una-chat-frander.vercel.app/health`: estado Healthy, uptime 100 %, tiempo de respuesta (~375 ms), 4 regiones, chequeo cada 5 min y la condición de disponibilidad `response.code = 200`. |
| `02-cronitor-notificaciones.png` | Lista de notificación "Default" (usada por el monitor) con el destinatario de las alertas `frandercarrillo2@gmail.com`. |
| `03-sentry-evento-vercel.png` | Evento `UNA-CHAT-1` recibido en Sentry desde el despliegue de Vercel (url `…vercel.app/api/messages`, entorno `production`, release = commit desplegado). Muestra mensaje del error, `handled: no`, `mechanism: auto.http.express`, la ruta (`POST /api/messages`), el runtime (`node`, `/var/task/...` = función serverless) y la línea exacta del código que lanzó la excepción (`observability.js:102`). Con eso se identifica qué falló, dónde y en qué versión. |

El error de prueba se provocó con `POST /api/messages` + cabecera `x-simulate-error: true`, habilitado solo mientras la variable de entorno `ENABLE_TEST_ERRORS=true` existía en Vercel. Esa variable ya fue **eliminada** y el proyecto redesplegado (el mismo `curl` devuelve 200). Vercel no tiene variables `OTEL_*`: no envía telemetría a Grafana.

## Parte 2 – UNA Chat local (host, `npm start`) → Grafana Cloud

| Archivo | Qué demuestra |
|---|---|
| `10-parte2-grafana-logs-host.png` | Logs en Loki filtrados por `service_name="una-chat"`, `deployment_environment="local"`, `run_mode="host"` e intervalo de la prueba (18:01–18:03 del 30-oct-2026). |
| `11-parte2-grafana-trazas-host.png` | Trazas en Tempo (`resource.service.name = "una-chat" && resource.run.mode = "host"`) de `POST /api/messages` y `receive /` (Socket.IO). |

Recorrido de los datos: app Node local → SDK OpenTelemetry (`telemetry.js`) → OTLP/HTTP → `otlp-gateway-prod-us-east-3.grafana.net/otlp` → Tempo / Loki / Mimir → Explore. Recurso: `service.name=una-chat`, `deployment.environment=local`, `run.mode=host`.

## Parte 3 – Docker + Artillery

### 3.1 Prueba funcional (Docker)

| Archivo | Qué demuestra |
|---|---|
| `05-chat-docker-localhost3000.png` | Chat servido por el contenedor en `localhost:3000` (visible en la barra de direcciones) con una conversación de 4 mensajes. |
| `05b-docker-contenedor-activo.png` | `docker compose ps`: contenedor `una-chat` *healthy*, puerto `0.0.0.0:3000->3000/tcp`; `/health` responde `{"status":"ok"}`. |
| `06-grafana-logs-docker-local.png` | Logs filtrados por servicio, entorno `local`, `run_mode="docker"` y el intervalo 18:25:30–18:30:30 (incluye la carga de Artillery con `test_id=artillery-20261030-182656` y la conversación del chat). |
| `07-grafana-metricas-carga.png` | Métricas durante la prueba: tasa de solicitudes por código (200/400/500), p95 de latencia y errores. |
| `08-grafana-traza-detalle.png` | Detalle de la traza `ce993f4d5e89ebedf86b26d04480b7c4` (500 controlado): 3 spans (`POST /api/messages` → `request handler` → `chat.process_message`), duración 2,31 ms, resultado error. |
| `09-grafana-log-mismo-trace_id.png` | Logs `| trace_id="ce993f4d5e89ebedf86b26d04480b7c4"`: 3 líneas ERROR que comparten el `trace_id` de la traza anterior. |

Prueba funcional por Socket.IO (`scripts/functional-test.js`): 8/8 mensajes recibidos, identificada en los logs con `test.id=func-20261031002653` (ver `artillery/reports/funcional.txt`).

### 3.2 Prueba de carga (Artillery, local contra Docker)

- Archivo de prueba: `artillery/load-test.yml` (destino `http://localhost:3000`, `duration: 60`, `arrivalRate: 5`, un `POST /api/messages` por usuario virtual).
- Comando: `TEST_ID=artillery-20261030-182656 artillery run artillery/load-test.yml --output artillery/reports/report.json`
- Inicio: 2026-10-31T00:26:56Z (18:26:56 local) · Fin: 00:27:59Z (18:27:59 local).
- Reportes: `artillery/reports/report.json`, `artillery/reports/artillery-console.txt`, `artillery/reports/tiempos.txt`.
- Cuenta de Artillery: `04-artillery-cuenta.png` (Artillery Cloud no ofrece login con Google; se usó GitHub. La prueba corre localmente, no en la nube).

| Métrica (Artillery) | Resultado |
|---|---|
| Solicitudes | **300** (previstas: 300) |
| Tasa observada | **5 req/s** |
| Códigos de respuesta | **200 × 300** (0 errores, 0 timeouts) |
| Latencia (ms) | min 2 · **p50 5** · mean 5,7 · **p95 7,9** · p99 10,9 · max 13 |
| Usuarios virtuales | 300 creados, 300 completados, 0 fallidos |

**Conclusión.** Las 300 solicitudes previstas (5/s × 60 s) coinciden exactamente con las 300 realizadas, a una tasa observada de 5/s; el total de la ejecución fue de ~63 s porque Artillery espera a que terminen las últimas respuestas. No hubo errores ni timeouts y la latencia se mantuvo estable (p95 < 8 ms, máx. 13 ms): a 5 req/s la aplicación no se acerca a su límite, así que la carga no degradó el servicio. En Grafana (`06`/`07`) se ve el mismo patrón: ~300 pares de logs `http request` + `message processed` en el minuto de la prueba, solo respuestas 200 y la latencia sin crecimiento. Las únicas respuestas 400/500 de la ventana son las de las pruebas de fallo controlado hechas antes de la carga.

Nota sobre las métricas: Grafana Cloud recibe muestras de Mimir cada ~60 s para este stack, por eso las gráficas tienen pocos puntos y la tasa se calcula con `rate(...[2m])`.

## Cómo reproducir

```bash
cp .env.example .env            # completar con endpoint y header de Grafana Cloud (nunca subir .env)
docker compose up --build -d    # http://localhost:3000
node scripts/functional-test.js http://localhost:3000 8
export TEST_ID=artillery-$(date +%Y%m%d-%H%M%S)
artillery run artillery/load-test.yml --output artillery/reports/report.json
```

Consultas usadas en Grafana (Explore): ver `LABORATORIO.md`.
