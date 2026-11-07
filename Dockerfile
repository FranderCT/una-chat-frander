# UNA Chat - imagen Node.js
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# dependencias primero para aprovechar la cache de capas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js telemetry.js sentry.js observability.js index.html ./
COPY libs ./libs
COPY server ./server

EXPOSE 3000

# usa el comando de inicio definido en el proyecto (package.json -> "start": "node server.js")
CMD ["npm", "start"]
