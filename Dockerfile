FROM node:20-slim AS base
LABEL version="1.0" maintainer="Sanity.io <even@sanity.io>"
RUN apt-get update && apt-get install --no-install-recommends -y bash curl && apt-get upgrade -y && \
  rm -rf /var/lib/apt/lists/*
ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/srv/agent" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  nodejs
USER nodejs

FROM base

# Pass contents of .npmrc as --build-arg NPMRC="$(cat ~/.npmrc)".
# This is necessary for build-time access to private NPM registries
ARG NPMRC

# Set up correct workdir
WORKDIR /srv/agent

# Install app dependencies (pre-source copy in order to cache dependencies)
COPY --chown=nodejs package.json package-lock.json ./
RUN echo "$NPMRC" | base64 -d > ~/.npmrc && \
  npm i && \
  rm ~/.npmrc

# Copy files and set correct user
COPY --chown=nodejs . .

# Build typescript to javascript
RUN npm run build

# Pass the release (git commit hash) down so we can use it for error reporting
ARG RELEASE_HASH

# Run application
ENV NODE_ENV=production \
  SENTRY_RELEASE=$RELEASE_HASH \
  PORT=3001 \
  WEBSOCKET_PORT=3002

# Expose HTTP and WebSocket ports
EXPOSE ${PORT} ${WEBSOCKET_PORT}

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"] 