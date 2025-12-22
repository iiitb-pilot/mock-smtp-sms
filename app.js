'use strict';

const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');


const SMTP_SERVER_PORT = process.env.SMTP_SERVER_PORT || 8025
const SERVER_PORT = process.env.SERVER_PORT || 8080
const WS_SERVER_PORT = process.env.WS_SERVER_PORT || 8081
const SERVER_HOST = process.env.SERVER_HOST || "localhost"
const WS_PROTOCOL = process.env.WS_PROTOCOL || "ws"
const WS_EX_PROTOCOL = process.env.WS_EX_PROTOCOL || "ws"
const WS_EX_SERVER_PORT = process.env.WS_EX_SERVER_PORT || 8081
const WS_EX_BASE_PATH = process.env.WS_EX_BASE_PATH || ""
const HTTP_PROTOCOL = process.env.HTTP_PROTOCOL || "http"
const INDEX = path.join(__dirname, "index.html");


/* ---------------- SMTP SERVER ---------------- */

const smtpServer = new SMTPServer({
  disabledCommands: ['AUTH', 'STARTTLS'],
  onData(stream, session, callback) {
    console.log("SMTP mail receiving started");
    simpleParser(stream)
      .then(mail => {

        console.log("SMTP mail received:");
        console.log("  From:", mail.from?.text);
        console.log("  To:", mail.to?.text);
        console.log("  Subject:", mail.subject);

        const attachments = (mail.attachments || []).map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          content: att.content.toString("base64")
        }));
        console.log(`  Attachments: ${attachments.length}`);

        const message = {
          type: "MAIL",
          date: new Date().toISOString(),
          from: mail.from,
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments
        };
        broadcast(message);
      })
      .catch(err => {
        console.error("Error parsing SMTP mail:", err);
      });

    stream.on("end", () => {
      console.log("SMTP mail stream ended");
      callback();
    });
  }
});

smtpServer.on("error", err => {
  console.error("SMTP Server Error:", err);
});

smtpServer.listen(SMTP_SERVER_PORT);
console.log(`\x1b[33m SMTP Server Running on ${SERVER_HOST}:${SMTP_SERVER_PORT}\x1b[0m`)

/* ---------------- HTTP SERVER ---------------- */
const http_server = express();


//Set the route for index file
http_server.get('/', (req, res) => {
  console.log("Serving index.html");
  res.sendFile(INDEX);
});

//Set the route for configuration file
http_server.get('/config', (req, res) => {
  console.log("Serving /config");
  res.send({
    wsProtocol: WS_EX_PROTOCOL,
    wsPort: WS_EX_SERVER_PORT,
    basePath: WS_EX_BASE_PATH
  });
});

http_server.get("/sendsms", (req, res) => {
  console.log("SMS request received:");
  console.log("  To:", req.query.mobiles);
  console.log("  From:", req.query.sender);

  const msg = {
    type: "SMS",
    date: new Date().toISOString(),
    to: { text: req.query.mobiles },
    from: { text: req.query.sender },
    subject: "SMS",
    text: req.query.message
  };
  broadcast(msg);
  res.sendStatus(200);
});

http_server.listen(SERVER_PORT, () =>
  console.log(`\x1b[33m HTTP Server Running on http://${SERVER_HOST}:${SERVER_PORT}\x1b[0m`));

/* ---------------- WEBSOCKET ---------------- */

const wss = new WebSocket.Server({ port: WS_SERVER_PORT });

console.log(`\x1b[33m Socket Server Running on ws://${SERVER_HOST}:${WS_SERVER_PORT}\x1b[0m`);

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}
