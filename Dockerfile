# Aspen's Playground - Production Dockerfile
# Multi-stage build for smaller final image

# ===========================================
# Stage 1: Build dependencies
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# ===========================================
# Stage 2: Production image
# ===========================================
FROM node:20-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs index.html ./
COPY --chown=nodejs:nodejs game.js ./
COPY --chown=nodejs:nodejs service-worker.js ./
COPY --chown=nodejs:nodejs manifest.json ./
COPY --chown=nodejs:nodejs robots.txt ./
COPY --chown=nodejs:nodejs sitemap.xml ./
COPY --chown=nodejs:nodejs modules ./modules
COPY --chown=nodejs:nodejs sounds ./sounds
COPY --chown=nodejs:nodejs icons ./icons

# Create directories for runtime data
RUN mkdir -p logs ssl && \
    chown -R nodejs:nodejs logs ssl

# Switch to non-root user
USER nodejs

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=INFO

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
