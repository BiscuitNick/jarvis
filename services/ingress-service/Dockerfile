# Multi-stage build for optimized image size

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for mediasoup (native addon)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    linux-headers

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including native addons)
RUN npm ci --only=production=false

# Copy source code and proto files
COPY src ./src
COPY proto ./proto

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    linux-headers

# Copy package files
COPY package*.json ./

# Install production dependencies only (including native addons)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose HTTP, gRPC, and WebRTC ports
EXPOSE 3000 50051 10000-10100/udp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
