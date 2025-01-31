const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(bodyParser.json());

const clients = {}; // Menyimpan session WhatsApp

// Format nomor agar sesuai dengan WhatsApp API
function formatPhoneNumber(phone) {
  let formattedPhone = phone.replace(/\D/g, ''); // Hapus semua karakter selain angka
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '62' + formattedPhone.substring(1);
  }
  if (!formattedPhone.startsWith('62')) {
    return null; // Invalid format
  }
  return `${formattedPhone}@c.us`; // Format WhatsApp
}

// API untuk membuat session WhatsApp dan mendapatkan QR Code
app.post('/api/create-session', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required!' });
  }

  if (clients[sessionId]) {
    return res.status(400).json({ error: `Session ${sessionId} already exists!` });
  }

  const client = new Client({
    puppeteer: { headless: true },
    authStrategy: new LocalAuth({ clientId: sessionId }),
  });

  clients[sessionId] = client;

  client.on('qr', (qr) => {
    res.json({ qr });
  });

  client.on('ready', () => {
    console.log(`Session ${sessionId} is ready!`);
  });

  client.initialize();
});

// API untuk mengirim pesan ke nomor WhatsApp tertentu
app.post('/api/send-message', (req, res) => {
  const { sessionId, phone, message } = req.body;

  if (!sessionId || !phone || !message) {
    return res.status(400).json({ error: 'Session ID, phone number, and message are required!' });
  }

  const client = clients[sessionId];

  if (!client) {
    return res.status(400).json({ error: `Session ${sessionId} not found!` });
  }

  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) {
    return res.status(400).json({ error: 'Invalid phone number format! Use 62XXXXXXXXXX' });
  }

  client.sendMessage(formattedPhone, message)
    .then(() => res.json({ status: 'Message sent successfully!' }))
    .catch((err) => res.status(500).json({ error: `Failed to send message: ${err.message}` }));
});

// API untuk mendapatkan QR Code dari session yang sudah dibuat
app.get('/api/qr/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  const client = clients[sessionId];
  
  if (!client) {
    return res.status(404).json({ error: `Session ${sessionId} not found!` });
  }

  client.on('qr', (qr) => {
    res.json({ qr });
  });
});

// Menjalankan server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
