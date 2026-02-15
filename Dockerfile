# Soliseum backend - bypasses Railpack/Rust detection for Railway
FROM node:18-alpine AS builder

WORKDIR /app

# Install all deps (including devDependencies for @types/* and tsc)
COPY soliseum-backend/package.json soliseum-backend/package-lock.json ./
RUN npm ci

COPY soliseum-backend/tsconfig.json ./
COPY soliseum-backend/src ./src

RUN npm run build

# Runtime stage - prod deps only
FROM node:18-alpine

WORKDIR /app

COPY soliseum-backend/package.json soliseum-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/index.js"]
