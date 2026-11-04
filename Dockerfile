# The source uses extensionless ESM imports (e.g. './app'), which plain `node dist/...`
# cannot resolve. Run the TypeScript source with tsx instead (same as `npm run dev`).
# tsx and prisma are devDependencies, so install everything.
FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx src/server.ts"]
