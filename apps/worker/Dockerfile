# Render worker (FFmpeg). Build from repo root: docker build -f apps/worker/Dockerfile -t postai-worker .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /fonts && curl -fsSL -o /fonts/CaveatBrush-Regular.ttf https://github.com/google/fonts/raw/main/ofl/caveatbrush/CaveatBrush-Regular.ttf
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/worker/package.json apps/worker/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @postai/worker --workspace @postai/domain --ignore-scripts
COPY packages/domain packages/domain
COPY apps/worker apps/worker
ENV FONT_FILE=/fonts/CaveatBrush-Regular.ttf NODE_ENV=production
USER node
CMD ["npx", "tsx", "apps/worker/src/main.ts"]
