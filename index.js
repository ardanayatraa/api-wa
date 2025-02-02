const axios = require('axios');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(bodyParser.json());

const clients = {}; // Menyimpan sesi WhatsApp
const BEARER_TOKEN = 'SOI6imwEskLQqud3pLc0tp97uOGj2jFic5C4Afup59b5e1ea'; // Token untuk Laravel

// Format nomor WhatsApp agar valid
function formatPhoneNumber(phone) {
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '62' + formattedPhone.substring(1);
    }
    return formattedPhone.startsWith('62') ? `${formattedPhone}@c.us` : null;
}

// Fungsi untuk menghapus file sesi yang terkunci
function deleteSessionFile(sessionId) {
    const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session-h', sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.rmdirSync(sessionPath, { recursive: true });
            console.log(`✅ File sesi ${sessionId} berhasil dihapus.`);
        }
    } catch (error) {
        console.error(`❌ Gagal menghapus file sesi ${sessionId}:`, error.message);
    }
}

// Fungsi untuk membuat session WhatsApp
async function createWhatsAppSession(sessionId) {
    if (clients[sessionId]) {
        console.log(`⚠️ Session ${sessionId} sudah aktif!`);
        const client = clients[sessionId];
        
        // Cek status session, jika rusak logout dan buat session baru
        if (!client.pupPage || client.pupPage.isClosed()) {
            console.log(`🚨 Sesi ${sessionId} rusak, logout dan buat sesi baru...`);
            await client.destroy();
            deleteSessionFile(sessionId); // Hapus file sesi yang rusak
            delete clients[sessionId];
            createWhatsAppSession(sessionId); // Buat session baru
            return;
        }

        console.log(`✅ Menggunakan session yang sudah ada: ${sessionId}`);
        return client;
    }

    console.log(`🚀 Membuat session baru: ${sessionId}`);

    const client = new Client({
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        authStrategy: new LocalAuth({ clientId: sessionId }),
    });

    clients[sessionId] = client;

    client.on('qr', async (qr) => {
      console.log(`📌 QR Code untuk session ${sessionId}:`);
      qrcode.generate(qr, { small: true });
      io.emit('qr', { sessionId, qr });
  
      try {
          // Kirim QR code ke Laravel API
          const response = await axios.post(
              'http://127.0.0.1:8000/api/store-qr', // Ganti dengan endpoint Laravel Anda
              {
                  sessionId: sessionId,
                  qr: qr,
              },
              {
                  headers: {
                      'Authorization': `Bearer ${BEARER_TOKEN}`,
                      'Content-Type': 'application/json',
                  },
              }
          );
  
          console.log('✅ QR code berhasil dikirim ke Laravel:', response.data);
      } catch (error) {
          console.error('❌ Gagal mengirim QR ke Laravel:', error.response ? error.response.data : error.message);
      }
  });
  
    client.on('ready', () => {
        console.log(`✅ Session ${sessionId} siap digunakan!`);
        io.emit('ready', { sessionId, status: 'ready', message: `Session ${sessionId} siap digunakan!` });
    });

    client.on('message', async (msg) => {
        console.log(`📩 Pesan baru dari ${msg.from}: ${msg.body}`);

        try {
            const response = await axios.post(
                'http://127.0.0.1:8000/api/store-chat',
                {
                    sender: msg.from,
                    message: msg.body,
                    timestamp: msg.timestamp,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${BEARER_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log('✅ Respons Laravel:', response.data);
            io.emit('new-message', response.data); 
        } catch (error) {
            console.error('❌ Gagal mengirim ke Laravel:', error.response ? error.response.data : error.message);
        }
    });

    client.initialize().catch((error) => {
        if (error.message.includes('EBUSY')) {
            console.log(`❌ Error EBUSY terjadi pada sesi ${sessionId}, mencoba menghapus file sesi...`);
            deleteSessionFile(sessionId);
            createWhatsAppSession(sessionId); // Coba buat session baru setelah menghapus file
        } else {
            console.error(`❌ Error saat menginisialisasi session ${sessionId}:`, error.message);
        }
    });

    return client;
}


app.post('/api/create-session', (req, res) => {
    let { sessionId } = req.body;
    sessionId = sessionId || '2222'; 

    if (clients[sessionId]) {
        const client = clients[sessionId];
        
        // Cek jika session rusak
        if (!client.pupPage || client.pupPage.isClosed()) {
            console.log(`🚨 Session ${sessionId} rusak, logout dan buat session baru...`);
            client.destroy().then(() => {
                deleteSessionFile(sessionId);
                delete clients[sessionId];
                createWhatsAppSession(sessionId);
                res.json({ message: `Sesi ${sessionId} rusak, membuat sesi baru!` });
            });
            return;
        }

        return res.status(200).json({ message: `Session ${sessionId} sudah aktif!` });
    }

    createWhatsAppSession(sessionId);
    res.json({ message: `Session ${sessionId} sedang dibuat!` });
});

app.post('/api/send-message', (req, res) => {
    let { sessionId, phone, message } = req.body;
    sessionId = sessionId || '2222'; 

    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone number and message are required!' });
    }

    const client = clients[sessionId];
    if (!client) {
        return res.status(404).json({ error: `Session ${sessionId} tidak ditemukan!` });
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
        return res.status(400).json({ error: 'Nomor telepon tidak valid! Gunakan format 62XXXXXXXXXX' });
    }

    client.sendMessage(formattedPhone, message)
        .then(() => res.json({ status: '✅ Pesan berhasil dikirim!' }))
        .catch((err) => res.status(500).json({ error: `❌ Gagal mengirim pesan: ${err.message}` }));
});

app.get('/api/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const client = clients[sessionId];

    if (!client) {
        return res.status(404).json({ error: `Session ${sessionId} tidak ditemukan!` });
    }

    client.on('qr', (qr) => {
        res.json({ qr });
    });
});

server.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
