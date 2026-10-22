FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/app/dados/gastos.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# A pasta do banco já nasce com dono "node": o volume do Coolify herda essa
# permissão na primeira montagem, e o bot não precisa rodar como root.
RUN mkdir -p /app/dados && chown node:node /app/dados
USER node
VOLUME /app/dados

CMD ["node", "src/bot.ts"]
