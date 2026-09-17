FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
# Real ffmpeg (with libx264 + freetype for drawtext) instead of the single-threaded
# WASM build the browser is stuck with — this is the whole point of this service.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY assets ./assets
# Cloud Run injects PORT; the app must listen on it.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
