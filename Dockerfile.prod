FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source files
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 10001 grader || true && \
    adduser -u 10001 -G grader -s /bin/sh -D grader || true && \
    chown -R grader:grader /app

USER grader

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run application
CMD ["node", "src/server.js"]