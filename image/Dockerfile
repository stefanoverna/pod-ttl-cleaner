FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN apk --no-cache add bash curl

RUN npm install

COPY . .