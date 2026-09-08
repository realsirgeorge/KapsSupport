FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# This app has never had a public/ directory (no static assets committed to
# one) — but the final stage always copies it, and `COPY --from` fails
# outright on a missing source directory rather than copying nothing. This
# guarantees it exists, empty, so the build doesn't break the moment
# something adds one but also doesn't break today when nothing has.
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package*.json ./

EXPOSE 3000
CMD ["npm", "start"]
