FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache iputils

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["npm", "start"]
