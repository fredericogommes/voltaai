FROM node:22-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/crm.db

RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
