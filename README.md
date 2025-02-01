# WhatsApp API 

Proyek ini adalah API berbasis Node.js menggunakan `whatsapp-web.js` untuk mengontrol WhatsApp Web secara otomatis. API ini memungkinkan Anda untuk membuat sesi WhatsApp, mendapatkan QR Code untuk login, serta mengirim pesan ke nomor tertentu.

## 📌 Fitur
- **Membuat sesi WhatsApp** dan mendapatkan QR Code untuk login.
- **Mengirim pesan WhatsApp** ke nomor tertentu.
- **Mendapatkan QR Code sesi yang sedang berjalan**.

## 🛠 Instalasi

1. **Clone repository ini** (jika menggunakan Git):
   ```sh
   git clone https://github.com/username/whatsapp-api.git
   cd whatsapp-api
   ```

2. **Install dependencies**:
   ```sh
   npm install
   ```

3. **Jalankan server**:
   ```sh
   node index.js
   ```


## 🔥 API Endpoints

### 1️⃣ Membuat Sesi WhatsApp dan Mendapatkan QR Code
**Endpoint:**  
```
POST /api/create-session
```
**Request Body (JSON):**
```json
{
  "sessionId": "mySession123"
}
```
**Response Pesan Sesi sedang di buat, cek terminal untuk scan barcode:**
```json
{
    "message": "Session 3333 sedang dibuat!"
}
```

---

### 2️⃣ Mengirim Pesan WhatsApp
**Endpoint:**  
```
POST /api/send-message
```
**Request Body (JSON):**
```json
{
  "sessionId": "mySession123",
  "phone": "6281234567890",
  "message": "Halo, ini pesan dari API WhatsApp!"
}
```
**Response (Berhasil dikirim):**
```json
{
  "status": "Message sent successfully!"
}
```
**Response (Gagal dikirim):**
```json
{
  "error": "Failed to send message: [Error Message]"
}
```

---

### 3️⃣ Mendapatkan QR Code Sesi yang Sedang Berjalan
**Endpoint:**  
```
GET /api/qr/:sessionId
```
**Contoh:**  
```
GET /api/qr/mySession123
```
**Response (QR Code Terbaru):**
```json
{
  "qr": "data:image/png;base64,..." 
}
```
**Response (Jika sesi tidak ditemukan):**
```json
{
  "error": "Session mySession123 not found!"
}
```

---

## 📌 Cara Menggunakan di React.js

1. **Install axios** untuk melakukan HTTP request:
   ```sh
   npm install axios
   ```

2. **Buat fungsi untuk mendapatkan QR Code di React:**
   ```js
   import axios from 'axios';

   const getQRCode = async (sessionId) => {
     try {
       const response = await axios.get(`http://localhost:3000/api/qr/${sessionId}`);
       console.log(response.data.qr);
     } catch (error) {
       console.error('Error fetching QR Code:', error.response?.data?.error || error.message);
     }
   };
   ```

3. **Buat fungsi untuk mengirim pesan:**
   ```js
   const sendMessage = async (sessionId, phone, message) => {
     try {
       const response = await axios.post('http://localhost:3000/api/send-message', {
         sessionId,
         phone,
         message
       });
       console.log(response.data.status);
     } catch (error) {
       console.error('Error sending message:', error.response?.data?.error || error.message);
     }
   };
   ```

## 🎯 Catatan
- **Nomor WhatsApp harus dalam format internasional**, misalnya: `6281234567890` (bukan `081234567890`).
- **Kode QR Akan Muncul di terminal dan semua respon akan muncul di terminal tempat menjalankan index.js**.
- **Pastikan WhatsApp Web aktif** setelah scan QR Code agar sesi tetap berjalan.
- **Gunakan server dengan database** jika ingin menyimpan sesi WhatsApp agar tidak perlu scan ulang setiap kali server restart.

## 📌 Lisensi
Proyek ini dibuat untuk keperluan edukasi dan pengembangan. Gunakan dengan bijak dan jangan gunakan untuk spam atau aktivitas ilegal. 🚀
