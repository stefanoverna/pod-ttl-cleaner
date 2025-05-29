FROM node:22-alpine

WORKDIR /app

COPY image/package.json image/package-lock.json ./

RUN apk --no-cache add bash curl

RUN npm install

COPY image/ .