FROM node:22-alpine
WORKDIR /app
RUN corepack enable && apk add --no-cache ffmpeg
COPY package.json pnpm-lock.yaml patches/ ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["node", "--import", "tsx/dist/loader.mjs", "server/index.ts"]
