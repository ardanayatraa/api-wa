const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const axios = require('axios');
const path = require('path');
const fs = require('fs');const marked = require('marked');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(cors());

const db = new sqlite3.Database("./sessions.db");
const activeClients = {}; // Menyimpan client yang sedang berjalan

let BEARER_TOKEN = '';

function getBearerToken(phone) {
    return new Promise((resolve, reject) => {
        const query = `SELECT barrier_token FROM sessions WHERE phone = ? ORDER BY created_at DESC LIMIT 1`;
        
        db.get(query, [phone], (err, row) => {
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

// 📌 Create sessions table if not exists
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            phone TEXT PRIMARY KEY,
            barrier_token TEXT,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('❌ Failed to create table:', err.message);
        else console.log('✅ Sessions table created successfully.');
    });
});

const saveSession = (phone) => {
    db.run("INSERT OR IGNORE INTO sessions (phone) VALUES (?)", [phone.toString()]);
};

const deleteSession = (phone) => {
    db.run("DELETE FROM sessions WHERE phone = ?", [phone]);
};

const getSessions = (callback) => {
    db.all("SELECT phone FROM sessions", [], (err, rows) => {
        if (err) return callback([]);
        callback(rows.map((row) => row.phone));
    });
};

const createClient = (phone) => {
    const formattedPhone = phone.toString();
    if (activeClients[formattedPhone]) return; // Jangan buat client baru jika sudah ada

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: formattedPhone }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    client.on('qr', async (qr) => {
        console.log(`📌 QR Code for session ${formattedPhone}:`);
        qrcode.generate(qr, { small: true });
        io.emit('qr', { formattedPhone, qr });
        saveSession(formattedPhone);
    
        try {
            const BEARER_TOKEN = await getBearerToken(formattedPhone);  // Wait for the token
            console.log("Bearer Token:", BEARER_TOKEN);
    
            // Kirim QR code ke Laravel API
            const response = await axios.post(
                'http://hireach.test/api/store-qr', // Endpoint Laravel
                {
                    sessionId: formattedPhone,
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
    

    client.on("ready", () => {
        console.log(`✅ Client ${formattedPhone} is ready!`);
        activeClients[formattedPhone] = client;
        updateQrStatus(formattedPhone, 'expired');  
        updateSessionStatus(formattedPhone, 'active');
    });

    client.on("disconnected", (reason) => {
        console.log(`❌ Client ${formattedPhone} disconnected: ${reason}`);
        delete activeClients[formattedPhone];
        deleteSession(formattedPhone);
        updateSessionStatus(formattedPhone, 'disconnected');
    });

    client.on("message", async (message) => {
        console.log(`📨 Message for ${formattedPhone}: ${message.body}`);
        io.emit("message", { phone: formattedPhone, from: message.from, body: message.body });
    
        try {
            const BEARER_TOKEN = await getBearerToken(formattedPhone);
    
            if (!BEARER_TOKEN) {
                console.error("❌ Token tidak valid atau kosong.");
                return;
            }
    
            const response = await axios.post(
                "http://hireach.test/api/store-chat",
                {
                    sender: message.from,
                    message: message.body,
                    timestamp: message.timestamp,
                },
                {
                    headers: {
                        Authorization: `Bearer ${BEARER_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                }
            );
    
            console.log("✅ Respons Laravel:", response.data);
            io.emit("new-message", response.data);
        } catch (error) {
            console.error(
                "❌ Gagal mengirim ke Laravel:",
                error.response ? error.response.data : error.message
            );
        }
    });
    
    
    client.initialize();
};

function deleteSessionFile(phone) {
    const sessionPath = path.join(__dirname, `.wwebjs_auth/session-${phone}`);
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`✅ Session file for ${phone} deleted.`);
    }
}

async function updateQrStatus(phone, status) {
    try {
        const BEARER_TOKEN = await getBearerToken(phone);  // Get Bearer Token

        // Send QR status to Laravel API
        const response = await axios.post(
            'http://hireach.test/api/update-qr-status', // Laravel API endpoint
            {
                sessionId: phone,
                qr_status: status,  // Send status as 'qr_status'
            },
            {
                headers: {
                    'Authorization': `Bearer ${BEARER_TOKEN}`,  // Authorization header
                    'Content-Type': 'application/json',  // Content type
                },
            }
        );

        console.log(`✅ QR status "${status}" successfully updated for session ${phone}:`, response.data);
    } catch (error) {
        console.error(`❌ Failed to update QR status "${status}" for session ${phone}:`, error.response ? error.response.data : error.message);
    }
}

async function updateSessionStatus(phone, status) {
    try {
        const BEARER_TOKEN = await getBearerToken(phone);  // Get Bearer Token

        // Send session status to Laravel API
        const response = await axios.post(
            'http://hireach.test/api/update-session-status', // Laravel API endpoint
            {
                sessionId: phone,
                session_status: status,  // Send status as 'session_status'
            },
            {
                headers: {
                    'Authorization': `Bearer ${BEARER_TOKEN}`,  // Authorization header
                    'Content-Type': 'application/json',  // Content type
                },
            }
        );

        console.log(`✅ Session status "${status}" successfully updated for session ${phone}:`, response.data);
    } catch (error) {
        console.error(`❌ Failed to update session status "${status}" for session ${phone}:`, error.response ? error.response.data : error.message);
    }
}


app.post('/api/delete', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Nomor HP diperlukan!" });

    const formattedPhone = phone.toString();
    const client = activeClients[formattedPhone];
    if (client) {
        console.log(`🔄 Logging out ${formattedPhone}...`);
        await client.logout();
        client.destroy();
        delete activeClients[formattedPhone];
    }

    db.run("DELETE FROM sessions WHERE phone = ?", [formattedPhone], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        deleteSessionFile(phone);
        res.json({ message: `Session ${phone} deleted successfully.` });
    });
});

app.post('/api/reset', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: "Nomor HP diperlukan!" });
    }

    const formattedPhone = phone.toString();

    // Hapus sesi dari database
    const query = `DELETE FROM sessions WHERE phone = ?`;

    db.run(query, [formattedPhone], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Hapus folder sesi
        deleteSessionFile(formattedPhone);

        console.log(`✅ Sesi ${formattedPhone} berhasil direset. Membuat ulang sesi baru...`);

        // Buat ulang sesi baru setelah reset
        createClient(formattedPhone);

        res.json({ message: `Sesi ${formattedPhone} berhasil direset dan dibuat ulang!` });
    });
});


app.post("/api/create-session", (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required!" });
    createClient(phone);
    res.json({ message: `Client for ${phone} is being initialized...` });
});

app.post('/api/send-message', async (req, res) => {
    const { sessionId, number, message } = req.body;

    if (!sessionId || !number || !message) {
        return res.status(400).json({ error: 'SessionId, nomor, dan pesan harus diisi' });
    }

    // Cek apakah session ada di activeClients
    const client = activeClients[sessionId];
    if (!client) {
        return res.status(404).json({ error: `Session ${sessionId} tidak ditemukan atau belum login.` });
    }

    try {
        await client.sendMessage(number + '@c.us', message);
        res.json({ message: 'Pesan berhasil dikirim!', sessionId, number });
    } catch (err) {
        console.error('❌ Gagal mengirim pesan:', err);
        res.status(500).json({ error: 'Gagal mengirim pesan' });
    }
});


app.put('/api/client/store', async (req, res) => {
    const { phone, user_id, api_token } = req.body;

    // Validasi input
    if (!phone || !user_id || !api_token) {
        return res.status(400).json({ error: "Phone, user_id, and api_token are required!" });
    }

    // Simpan atau perbarui sesi di database
    const query = `
        INSERT INTO sessions (phone, barrier_token, user_id) 
        VALUES (?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET 
            barrier_token = excluded.barrier_token,
            user_id = excluded.user_id
    `;

    db.run(query, [phone, api_token, user_id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 📌 Jalankan client WhatsApp setelah berhasil menyimpan sesi
        createClient(phone);

        res.json({ message: 'Session stored successfully' });
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

const initClients = () => {
    getSessions((sessions) => {
        console.log("🔄 Reloading sessions:", sessions);
        sessions.forEach(createClient);
    });
};

let cleanupDone = false;
const handleShutdown = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    console.log('🛑 Server shutting down...');
    server.close(() => {
        console.log('✅ HTTP server closed.');
        db.close((err) => {
            if (err) console.error('Error closing DB:', err.message);
            else console.log('✅ DB connection closed.');
        });
    });
};

process.once('SIGINT', handleShutdown);
process.once('SIGTERM', handleShutdown);
process.once('SIGHUP', handleShutdown);
process.setMaxListeners(20);

server.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
    initClients();
});