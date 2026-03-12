# VOXA Sonic Service - Nova Sonic real-time voice (Socket.IO + Bedrock)
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src ./src

EXPOSE 80

ENV PORT=80
CMD ["node", "src/server.js"]
