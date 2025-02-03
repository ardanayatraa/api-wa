# 📱 Dokumentasi WhatsApp Bot

## 🚀 Pendahuluan

Dokumentasi ini menjelaskan cara kerja dan fitur-fitur utama dari WhatsApp Bot yang telah dikembangkan. Bot ini menggunakan library whatsapp-web.js dan beberapa teknologi pendukung lainnya.

## 🛠️ Teknologi yang Digunakan

- Express.js: Framework web untuk Node.js
- whatsapp-web.js: Library untuk berinteraksi dengan WhatsApp Web
- Socket.IO: Untuk komunikasi real-time
- SQLite: Database ringan untuk menyimpan sesi
- Axios: Untuk melakukan HTTP requests

## 🔑 Fitur Utama

### 1. 🔄 Manajemen Sesi
### 2. 📨 Pengiriman Pesan
### 3. 🖼️ Generasi QR Code
### 4. 🔐 Autentikasi

## 📋 API Endpoints

### 1. POST /api/create-session

Membuat sesi WhatsApp baru.

**Request:**
```json
{
  "phone": "6281234567890"
}
```

**Response:**
```json
{
  "message": "Client for 6281234567890 is being initialized..."
}
```

### 2. POST /api/delete

Menghapus sesi WhatsApp yang ada.

**Request:**
```json
{
  "phone": "6281234567890"
}
```

**Response:**
```json
{
  "message": "Session 6281234567890 deleted successfully."
}
```

### 3. POST /api/reset

Mereset dan membuat ulang sesi WhatsApp.

**Request:**
```json
{
  "phone": "6281234567890"
}
```

**Response:**
```json
{
  "message": "Sesi 6281234567890 berhasil direset dan dibuat ulang!"
}
```

### 4. POST /api/send-message

Mengirim pesan WhatsApp.

**Request:**
```json
{
  "sessionId": "6281234567890",
  "number": "6289876543210",
  "message": "Halo, ini pesan dari bot!"
}
```

**Response:**
```json
{
  "message": "Pesan berhasil dikirim!",
  "sessionId": "6281234567890",
  "number": "6289876543210"
}
```

### 5. PUT /api/client/store

Menyimpan atau memperbarui informasi sesi.

**Request:**
```json
{
  "phone": "6281234567890",
  "user_id": 123,
  "api_token": "your_api_token_here"
}
```

**Response:**
```json
{
  "message": "Session stored successfully"
}
```

## 🔄 Alur Kerja

1. Saat server dimulai, semua sesi yang tersimpan akan diinisialisasi.
2. Untuk setiap sesi, QR code akan di-generate dan dikirim ke server Laravel.
3. Setelah scan QR code, bot siap menerima dan mengirim pesan.
4. Pesan yang diterima akan diteruskan ke server Laravel.
5. Server dapat mengirim pesan melalui bot menggunakan API yang disediakan.

## ⚠️ Penanganan Error

- Semua error akan di-log ke console
- Respons error akan dikirim kembali ke client dengan kode status yang sesuai

Contoh respons error:

```json
{
  "error": "Nomor HP diperlukan!"
}
```

## 🔒 Keamanan

- Menggunakan token Bearer untuk autentikasi
- Menyimpan sesi di database lokal
- Menggunakan CORS untuk mengamankan akses API



## 📚 Referensi

- [Dokumentasi whatsapp-web.js](https://docs.wwebjs.dev/)
- [Dokumentasi Express.js](https://expressjs.com/)
- [Dokumentasi Socket.IO](https://socket.io/docs/)


