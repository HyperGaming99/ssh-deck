# SSH-Deck-Sync-Server. Daten liegen in /data (als Volume mounten!).
FROM node:22-alpine
WORKDIR /app
COPY server/server.js ./server.js
# optional für E-Mail-Codes: SMTP_URL setzen und nodemailer installieren
RUN npm i --no-audit --no-fund nodemailer
ENV DB_PATH=/data/deck.db PORT=8787
VOLUME /data
EXPOSE 8787
CMD ["node", "server.js"]
