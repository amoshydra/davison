FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && apk add --no-cache ffmpeg
COPY package.json pnpm-lock.yaml patches/ ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/patches ./patches
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["node", "dist-server/index.js"]
