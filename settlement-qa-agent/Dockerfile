# Multi-stage Dockerfile for Settlement Q&A Agent

# 1. Build Client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2. Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Copy server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

# Copy source code and mock databases
WORKDIR /app
COPY server/ ./server/
COPY data/ ./data/

# Copy compiled frontend from client-builder
COPY --from=client-builder /app/client/dist ./client/dist

# Expose port
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
