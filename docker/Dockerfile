# Multi-stage build for PingPlotter
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY src/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Final stage
FROM node:20-alpine

# Install traceroute and networking tools
RUN apk add --no-cache \
    traceroute \
    iputils \
    bind-tools \
    curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY src/monitor-backend.js ./
COPY src/public/ ./public/
COPY src/schema.sql ./

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (configurable via ENV)
EXPOSE 9911

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:9911/health || exit 1

# Start the application
CMD ["node", "monitor-backend.js"]
