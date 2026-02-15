# Soliseum backend - bypasses Railpack/Rust detection for Railway
FROM node:18-alpine

WORKDIR /app

# Copy backend only
COPY soliseum-backend/package.json soliseum-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY soliseum-backend/tsconfig.json ./
COPY soliseum-backend/src ./src

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
