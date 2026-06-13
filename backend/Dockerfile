# Backend image — includes FFmpeg for MP4 transcode + build tools for better-sqlite3.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
