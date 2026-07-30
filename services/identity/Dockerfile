# syntax=docker/dockerfile:1
# Build from monorepo root:
#   fly deploy --config services/identity/fly.toml --dockerfile services/identity/Dockerfile

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY services/identity ./services/identity
RUN npm ci \
  && npm run build -w @ellines-eip/shared \
  && npx prisma generate --schema=services/identity/prisma/schema.prisma \
  && npm run build -w @ellines-eip/identity \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV IDENTITY_SERVICE_PORT=8080
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/services/identity
EXPOSE 8080
CMD ["node", "dist/main.js"]
