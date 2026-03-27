FROM node:20-alpine

WORKDIR /workspace

RUN apk add --no-cache bash curl docker-cli git

COPY package*.json ./
RUN npm ci

COPY . .

CMD ["node", "scripts/brainsait-oracle.mjs", "status"]