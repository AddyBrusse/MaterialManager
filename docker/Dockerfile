# Stage 1: build shared + web
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w packages/shared
RUN npm run build -w apps/web

# Stage 2: build api
FROM node:20-alpine AS api-builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w packages/shared
RUN npm run build -w apps/api
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Stage 3: runtime
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev
COPY --from=api-builder /app/apps/api/dist ./apps/api/dist
COPY --from=api-builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=api-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/index.js"]
