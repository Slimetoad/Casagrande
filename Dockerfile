FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY server ./server
COPY drizzle ./drizzle
COPY public ./public
COPY docs ./docs

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.mjs"]
