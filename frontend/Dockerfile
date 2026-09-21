FROM node:22-alpine AS base

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock* package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Build the production server bundle (nitro/render-com preset).
# NITRO_PRESET is set as an ARG so it can be overridden at build time
# (e.g. by a platform's build-arg mechanism), but defaults to render-com
# so `docker build` alone produces a deployable Node server.
ARG NITRO_PRESET=render-com
ENV NITRO_PRESET=${NITRO_PRESET}

# Vite inlines VITE_* variables into the client bundle at build time, so the
# board WebSocket URL has to be present here. Setting it only as a runtime
# environment variable has no effect: the value is already baked into the
# bundle. Leaving it empty makes the app fall back to the in-browser mock
# board service, which never contacts the backend.
ARG VITE_BOARD_WS_URL
ENV VITE_BOARD_WS_URL=${VITE_BOARD_WS_URL}

RUN npm run build

EXPOSE 3000

# Run the built production server. It reads PORT from the environment.
CMD ["node", ".output/server/index.mjs"]
