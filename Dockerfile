FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

# Runtime image for operational scripts and integration jobs.
CMD ["node", "-e", "console.log('oracle-setup image built successfully')"]
