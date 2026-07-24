FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY knexfile.js ./
COPY migrations ./migrations
COPY seeds ./seeds
COPY server.js ./
COPY src ./src
COPY public ./public

EXPOSE 4000

# Migrations are run as a separate step (docker-compose's app service
# command below runs `knex migrate:latest` before `node server.js`), not
# baked into the image build — this keeps the image reusable across
# environments whose schema state may differ, and keeps `npm run migrate`
# as the single source of truth for how migrations are applied.
CMD ["npm", "start"]
