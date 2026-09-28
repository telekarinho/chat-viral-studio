# Build from the repo root: docker build -f apps/api/Dockerfile -t postai-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @postai/api --workspace @postai/domain --ignore-scripts
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN npm run build --workspace @postai/api && npm prune --omit=dev --workspace @postai/api --workspace @postai/domain

FROM node:22-alpine
ENV NODE_ENV=production PORT=3333
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
USER node
EXPOSE 3333
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3333/health || exit 1
CMD ["node", "dist/main.js"]
