# Coding-Tool Docker Image
# Claude Code / Codex / Gemini CLI Enhancement Tool
# https://github.com/CooperJiang/cc-tool

FROM node:18-alpine

LABEL maintainer="CooperJiang"
LABEL description="Vibe Coding Enhancement Tool - Session Management, Channel Switching, Token Monitoring"
LABEL org.opencontainers.image.source="https://github.com/CooperJiang/cc-tool"

# Install dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    bash

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install -g pm2 && \
    npm install

# Copy web package files and install
COPY src/web/package*.json ./src/web/
RUN cd src/web && npm install

# Copy source code
COPY . .

# Patch: Change proxy listen address from 127.0.0.1 to 0.0.0.0 for Docker networking
RUN sed -i "s/listen(port, '127.0.0.1'/listen(port, '0.0.0.0'/g" src/server/proxy-server.js && \
    sed -i "s/listen(port, '127.0.0.1'/listen(port, '0.0.0.0'/g" src/server/codex-proxy-server.js && \
    sed -i "s/listen(port, '127.0.0.1'/listen(port, '0.0.0.0'/g" src/server/gemini-proxy-server.js

# Build web frontend
RUN cd src/web && npm run build

# Create data directories
RUN mkdir -p /data/.claude/cc-tool && \
    mkdir -p /data/.claude/logs && \
    mkdir -p /data/.claude/projects && \
    mkdir -p /data/.codex && \
    mkdir -p /data/.gemini

# Environment variables
ENV NODE_ENV=production
ENV HOME=/data

# Expose ports
EXPOSE 10099 10088 10089 10090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:10099/api/version || exit 1

# Start server
CMD ["node", "docker-start.js"]
