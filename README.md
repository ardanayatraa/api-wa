# 🚀 Dokumentasi WhatsApp Web API

Selamat datang di **WhatsApp Web API** resmi! API ini memungkinkan Anda berinteraksi dengan **WhatsApp Web** menggunakan `whatsapp-web.js`, **Node.js**, dan **Express**. API ini menyediakan endpoint untuk membuat sesi WhatsApp, mengirim pesan, mengambil kode QR, dan mengelola sesi. Mulai dengan mengikuti panduan di bawah ini.

## 📜 Persyaratan

- **Node.js** 👉 [Instal Node.js](https://nodejs.org/)
- **NPM (Node Package Manager)** 👉 [Instal NPM](https://www.npmjs.com/)
- **Laravel API** 👉 (Untuk menyimpan data obrolan - Opsional)

## 🔧 Instalasi

1. Klon repositori atau unduh file.
2. Instal dependensi yang diperlukan:

```bash
npm install
```

3. Jalankan server:

```bash
node server.js
```

Server Anda akan berjalan di `http://localhost:3000`.

---

## 📑 Endpoint API

### 1. `/api/create-session` (POST)
Membuat sesi baru atau memeriksa apakah sesi sudah aktif.

#### Body Permintaan

```json
{
  "sessionId": "id-sesi-unik"
}
```

#### Respon

```json
{
  "message": "Sesi 1234 sedang dibuat!"
}
```

### 2. `/api/send-message` (POST)
Mengirim pesan WhatsApp dari sesi tertentu.

#### Body Permintaan

```json
{
  "sessionId": "id-sesi-unik",
  "phone": "628123456789",
  "message": "Halo, ini adalah pesan uji coba"
}
```

#### Respon

```json
{
  "status": "✅ Pesan berhasil dikirim!"
}
```

### 3. `/api/qr/:sessionId` (GET)
Mendapatkan kode QR untuk sesi tertentu.

#### Respon

```json
{
  "qr": "<QR_CODE_STRING>"
}
```

### 4. `/api/create/:sessionId` (GET)
Membuat sesi baru jika belum ada atau mengembalikan status sesi saat ini.

#### Respon

```json
{
  "message": "Sesi <sessionId> sudah aktif!"
}
```

### 5. `/api/delete` (POST)
Menghapus sesi berdasarkan ID sesi.

#### Body Permintaan

```json
{
  "sessionId": "id-sesi-unik"
}
```

#### Respon

```json
{
  "message": "Sesi <sessionId> berhasil dihapus!"
}
```

### 6. `/api/delete/:sessionId` (GET)
Menghapus sesi berdasarkan ID sesi.

#### Respon

```json
{
  "message": "Sesi <sessionId> berhasil dihapus!"
}
```

---

## ⚙️ Cara Kerja

### Manajemen Sesi
- **Membuat Sesi**: Sesi baru dibuat menggunakan `sessionId` unik. Jika sesi sudah ada, sistem akan memeriksa validitas dan statusnya.
- **Mengirim Pesan**: Pesan dapat dikirim ke kontak WhatsApp menggunakan nomor telepon dalam format `62XXXXXXXXXX`.
- **Kode QR**: Kode QR dibuat untuk sesi guna mengautentikasi klien WhatsApp Web.
- **Menghapus Sesi**: Sesi dapat dihapus berdasarkan `sessionId`, atau semua sesi dapat dihapus sekaligus.

---

## ⚠️ Penanganan Kesalahan

- Jika `sessionId` tidak valid atau sesi tidak ditemukan, akan dikembalikan **kesalahan 404**.
- Jika sesi rusak atau korup, sesi akan dihapus dan dibuat ulang.

---

## 📝 Lisensi

Proyek ini bersifat **open-source** dan tersedia di bawah [Lisensi MIT](https://opensource.org/licenses/MIT).

---

## 🏅 Lencana

[![Node.js](https://img.shields.io/badge/Node.js-12.x-green)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-blue)](https://opensource.org/licenses/MIT)

---

📌 *Dibuat oleh Ardana Yatra*