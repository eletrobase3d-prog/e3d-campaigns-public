FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./

# Coolify injects NODE_ENV=production as a build argument/environment.
# Force installation of dev dependencies here because Nest CLI + TypeScript
# are required only to compile the application.
RUN npm_config_production=false npm ci --include=dev --no-audit --no-fund


FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build


FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Runtime receives production dependencies only.
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
