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
const marked = require('marked');
const app = express();
const port = 3000;
const server = http.createServer(app);
const io = socketIo(server);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

app.use(cors());
app.use(bodyParser.json());

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS session (
            session_id TEXT PRIMARY KEY,
            barrier_token TEXT,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('❌ Gagal membuat tabel:', err.message);
        else console.log('✅ Tabel session berhasil dibuat.');
    });
});


const clients = {}; // Menyimpan sesi WhatsApp

let BEARER_TOKEN = '';

function getBearerToken(sessionId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT barrier_token FROM session WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`;
        
        db.get(query, [sessionId], (err, row) => {
            if (err) {
                reject(err);  // Menangani error query
            } else if (!row) {
                reject(new Error('Session not found'));  // Jika session tidak ditemukan
            } else {
                console.log('Token ditemukan:', row.barrier_token);  // Menampilkan hasil query di console
                BEARER_TOKEN = row.barrier_token; // Simpan token secara global
                resolve(BEARER_TOKEN);  // Mengembalikan token yang ditemukan
            }
        });
    });
}


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
    const sessionsDir = path.join(__dirname, '.wwebjs_auth');
    
    // Jika sessionId adalah 'all', hapus semua sesi
    if (sessionId === 'all') {
        fs.readdirSync(sessionsDir).forEach((folder) => {
            if (folder.startsWith('session-')) {
                const folderPath = path.join(sessionsDir, folder);
                try {
                    fs.rmdirSync(folderPath, { recursive: true });
                    console.log(`✅ Folder sesi ${folder} berhasil dihapus.`);
                } catch (error) {
                    console.error(`❌ Gagal menghapus folder sesi ${folder}:`, error.message);
                }
            }
        });
        return;
    }

    // Cek apakah folder dengan nama sessionId ada
    const sessionPath = path.join(sessionsDir, `session-${sessionId}`);

    // Cek apakah folder sesuai dengan sessionId ada di dalam directory
    fs.readdirSync(sessionsDir).forEach((folder) => {
        if (folder === `session-${sessionId}`) {
            try {
                const folderPath = path.join(sessionsDir, folder);
                fs.rmdirSync(folderPath, { recursive: true });
                console.log(`✅ Folder sesi ${folder} berhasil dihapus.`);
            } catch (error) {
                console.error(`❌ Gagal menghapus folder sesi ${folder}:`, error.message);
            }
        } else {
            console.log(`❌ Folder sesi ${sessionId} tidak ditemukan.`);
        }
    });
}

function deleteCacheFile(sessionId) {
    const cacheDir = path.join(__dirname, '.wwebjs_cache', `session-${sessionId}`);

    if (fs.existsSync(cacheDir)) {
        try {
            fs.rmdirSync(cacheDir, { recursive: true });
            console.log(`✅ Cache untuk sesi ${sessionId} berhasil dihapus.`);
        } catch (error) {
            console.error(`❌ Gagal menghapus cache sesi ${sessionId}:`, error.message);
        }
    } else {
        console.log(`⚠️ Cache untuk sesi ${sessionId} tidak ditemukan.`);
    }
}

function saveSession(sessionId) {
    const query = `INSERT INTO session (session_id) VALUES (?) 
                   ON CONFLICT(session_id) DO NOTHING`;
    
    db.run(query, [sessionId], function (err) {
        if (err) {
            console.error('❌ Gagal menyimpan session:', err.message);
        } else {
            console.log(`✅ Session ${sessionId} berhasil disimpan.`);
        }
    });
}

app.put('/sessions/:id', (req, res) => {
    const { id } = req.params;
    const { barrier_token, user_id } = req.body;
    
    const query = `UPDATE session SET barrier_token = ?, user_id = ? WHERE session_id = ?`;
    
    db.run(query, [barrier_token, user_id, id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }
        res.json({ message: 'Session updated successfully' });
    });
});

app.get('/sessions/:id', (req, res) => {
    const { id } = req.params;
    
    const query = `SELECT session_id, barrier_token, user_id FROM session WHERE session_id = ?`;
    
    db.get(query, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ message: 'Session not found' });
        }
        res.json(row);
    });
});



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
    saveSession(sessionId);

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
    
    // Event ketika autentikasi berhasil
    client.on('authenticated', () => {
        console.log('✅ WhatsApp authenticated successfully!');
    });

    // Event ketika autentikasi gagal
    client.on('auth_failure', (msg) => {
        console.log('❌ Authentication failed:', msg);
    });

    client.on('ready', () => {
        console.log(`✅ Session ${sessionId} siap digunakan!`);
        io.emit('ready', { sessionId, status: 'ready', message: `Session ${sessionId} siap digunakan!` });
        // Notify React app that the session is ready
        io.emit('session-ready', { sessionId, status: 'ready' });
    });


    client.on('message', async (msg) => {
        console.log(`📩 Pesan baru dari ${msg.from}: ${msg.body}`);
        getBearerToken(sessionId).then(() => {
            console.log('✅ Bearer token:', BEARER_TOKEN);
        }).catch((err) => {           
            console.error('❌ Gagal mendapatkan bearer token:', err.message);
        });
    
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

    createWhatsAppSession(sessionId).then(() => {
        res.json({ message: `Session ${sessionId} sedang dibuat!` });
    });
});

app.post('/api/send-message', (req, res) => {
    let { sessionId, phone, message } = req.body;
    sessionId = sessionId ; 

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

app.get('/', (req, res) => {
    const readmePath = path.join(__dirname, 'README.md');
    
    fs.readFile(readmePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('❌ Gagal membaca README.md');
        }

        const htmlContent = marked.parse(data); // Konversi Markdown ke HTML
        res.send(`
            <html>
            <head>
                <title>Api Documentation</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: auto; }
                    pre { background: #f4f4f4; padding: 10px; overflow: auto; }
                    code { font-family: monospace; }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `);
    });
});

// Rute untuk membuat session berdasarkan sessionId
app.get('/api/create/:sessionId', async (req, res) => {
    let { sessionId } = req.params;

    // Cek jika session sudah ada
    if (clients[sessionId]) {
        const client = clients[sessionId];

        // Cek jika session rusak
        if (!client.pupPage || client.pupPage.isClosed()) {
            console.log(`🚨 Session ${sessionId} rusak, logout dan buat sesi baru...`);
            await client.destroy();
            deleteSessionFile(sessionId); // Hapus file sesi yang rusak
            delete clients[sessionId];
            await createWhatsAppSession(sessionId); // Buat session baru
            return res.json({ message: `Sesi ${sessionId} rusak, membuat sesi baru!` });
        }

        return res.status(200).json({ message: `Session ${sessionId} sudah aktif!` });
    }

    // Membuat session baru
    const client = await createWhatsAppSession(sessionId);
    
    // Menangani event QR dan mengirimkan URL QR ke layar
    client.on('qr', (qr) => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;

        res.send(`
            <html>
            <head>
                <title>QR Code for ${sessionId}</title>
            </head>
            <body style="text-align: center;">
                <h2>QR Code untuk Sesi ${sessionId}</h2>
                <img src="${qrUrl}" alt="QR Code">
            </body>
            </html>
        `);
    });
});

app.post('/api/delete', (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'SessionId tidak ditemukan!' });
    }

    if (sessionId === 'all') {
        // Hapus semua sesi
        deleteSessionFile('all');
        res.json({ message: 'Semua sesi berhasil dihapus!' });
        return;
    }

    // Cek jika sesi ada
    if (!clients[sessionId]) {
        return res.status(404).json({ error: `Session ${sessionId} tidak ditemukan!` });
    }

    // Menghentikan sesi dan menghapus file sesi
    const client = clients[sessionId];

    client.destroy().then(() => {
        // Hapus sesi dari objek clients dan hapus file sesi
        delete clients[sessionId];
        deleteSessionFile(sessionId); // Hapus file sesi yang terkait
        deleteCacheFile(sessionId);
        res.json({ message: `Sesi ${sessionId} berhasil dihapus!` });
    }).catch((err) => {
        console.error('❌ Gagal menghapus session:', err.message);
        res.status(500).json({ error: `❌ Gagal menghapus session ${sessionId}: ${err.message}` });
    });
});

app.get('/api/delete/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (sessionId === 'all') {
        // Hapus semua sesi
        deleteSessionFile('all');
        res.json({ message: 'Semua sesi berhasil dihapus!' });
        return;
    }

    // Cek jika sesi ada
    if (!clients[sessionId]) {
        return res.status(404).json({ error: `Session ${sessionId} tidak ditemukan!` });
    }

    // Menghentikan sesi dan menghapus file sesi
    const client = clients[sessionId];

    client.destroy().then(() => {
        // Hapus sesi dari objek clients dan hapus file sesi
        delete clients[sessionId];
        deleteSessionFile(sessionId); // Hapus file sesi yang terkait
        deleteCacheFile(sessionId);
        res.json({ message: `Sesi ${sessionId} berhasil dihapus!` });
    }).catch((err) => {
        console.error('❌ Gagal menghapus session:', err.message);
        res.status(500).json({ error: `❌ Gagal menghapus session ${sessionId}: ${err.message}` });
    });
});

server.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
