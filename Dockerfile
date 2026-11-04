# The source uses extensionless ESM imports (e.g. './app'), which plain `node dist/...`
# cannot resolve. Run the TypeScript source with tsx instead (same as `npm run dev`).
FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm i --no-save tsx@4 prisma@5.22.0
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx src/server.ts"]
