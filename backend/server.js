// server.js - Express backend for WhatsApp CRM Tester
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server: WebSocketServer } = require('ws');
const path = require('path');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// In-memory list of websocket clients for pushing logs
const wss = new WebSocketServer({ noServer: true });
let wsClients = [];

wss.on('connection', (ws) => {
  wsClients.push(ws);
  ws.on('close', () => {
    wsClients = wsClients.filter((c) => c !== ws);
  });
});

// Upgrade HTTP server for WebSocket
const server = app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Webhook endpoint – receives inbound messages from Meta
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  // Log payload to console and DB
  console.log('Incoming webhook:', JSON.stringify(payload, null, 2));
  await logger.logMessage({
    message_id: payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || 'unknown',
    direction: 'inbound',
    status: 'received',
    raw: payload,
  });
  // Broadcast to WS clients
  const msg = { type: 'log', data: payload };
  wsClients.forEach((c) => c.send(JSON.stringify(msg)));
  // Respond with 200 OK as required by Meta
  res.sendStatus(200);
});

// Endpoint to trigger an outbound test message
app.post('/api/send-test', async (req, res) => {
  const { to, template } = req.body; // optional customisation
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
  try {
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: to || 'RECIPIENT_PHONE_NUMBER',
        type: 'template',
        template: template || { name: 'hello_world', language: { code: 'en_US' } },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const messageId = response.data.messages?.[0]?.id || response.data.id;
    // Log outbound
    await logger.logMessage({
      message_id: messageId,
      direction: 'outbound',
      status: 'sent',
      raw: response.data,
    });
    // Broadcast to WS clients
    wsClients.forEach((c) =>
      c.send(JSON.stringify({ type: 'log', data: { outbound: response.data } }))
    );
    res.json({ message_id: messageId });
  } catch (error) {
    console.error('Error sending test message:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to send test message', details: error.response?.data });
  }
});

// Simple health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

module.exports = app;
