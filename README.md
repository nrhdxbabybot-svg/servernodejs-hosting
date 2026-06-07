# 🚀 Hosting Panel

Panel hosting mandiri untuk Armbian / Debian — deploy app Node.js & Python dengan domain custom dan subdomain otomatis.

## Fitur

- ✅ Register & login user (JWT Auth)
- ✅ Deploy app Node.js / Python
- ✅ Manajemen proses via PM2 (start/stop/restart)
- ✅ Lihat logs realtime
- ✅ Subdomain otomatis: `namauser.domainmu.com`
- ✅ Domain custom: `tokonya.com`
- ✅ Auto-generate Nginx config
- ✅ Panel admin (kelola user, lihat statistik)
- ✅ Rate limiting & keamanan dasar

---

## Instalasi di Armbian (Debian Bookworm)

```bash
# Upload folder ke server, lalu:
sudo bash setup.sh
```

Script akan otomatis:
1. Install Node.js, Nginx, PM2
2. Setup `.env` dengan JWT secret acak
3. Konfigurasi Nginx
4. Jalankan panel via PM2

---

## Konfigurasi Manual

Edit `.env`:

```env
PORT=3000
JWT_SECRET=random_secret_panjang
SERVER_IP=192.168.100.27
BASE_DOMAIN=domainmu.com        # Domain untuk subdomain gratis
PANEL_DOMAIN=panel.domainmu.com # Domain akses panel (opsional)
NGINX_SITES_PATH=/etc/nginx/sites-available
NGINX_ENABLED_PATH=/etc/nginx/sites-enabled
APPS_DIR=/home/apps
```

---

## Buat Admin Pertama

```bash
node scripts/create-admin.js
```

---

## Flow Penggunaan

### User biasa:
1. Register di panel → dapat subdomain `username.domainmu.com`
2. Buat app (Node.js/Python)
3. Start app → otomatis berjalan di port yang dialokasikan
4. Akses via subdomain

### Custom domain:
1. User input domain `tokonya.com` di panel
2. Panel instruksikan: "Arahkan DNS A record ke IP: x.x.x.x"
3. Setelah DNS propagate → Nginx config otomatis dibuat
4. App akses via `tokonya.com` ✅

---

## Struktur Proyek

```
hosting-panel/
├── server.js              # Entry point Express
├── .env                   # Konfigurasi (jangan di-commit!)
├── public/
│   ├── index.html         # Frontend panel
│   └── app.js             # Frontend JavaScript
├── src/
│   ├── database.js        # SQLite + schema
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   └── routes/
│       ├── auth.js        # Register, login, me
│       ├── apps.js        # CRUD app + PM2
│       ├── domains.js     # Subdomain + custom domain
│       └── admin.js       # Panel admin
├── scripts/
│   └── create-admin.js    # CLI buat admin
└── setup.sh               # Script install otomatis
```

---

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/auth/register` | Daftar user baru |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Info user login |
| GET | `/api/apps` | Daftar app milik user |
| POST | `/api/apps` | Buat app baru |
| POST | `/api/apps/:id/start` | Start app |
| POST | `/api/apps/:id/stop` | Stop app |
| POST | `/api/apps/:id/restart` | Restart app |
| GET | `/api/apps/:id/logs` | Lihat logs |
| DELETE | `/api/apps/:id` | Hapus app |
| GET | `/api/domains` | Daftar domain |
| POST | `/api/domains/subdomain` | Buat subdomain |
| POST | `/api/domains/custom` | Tambah domain custom |
| DELETE | `/api/domains/:id` | Hapus domain |
| GET | `/api/admin/stats` | Statistik server (admin) |
| GET | `/api/admin/users` | Semua user (admin) |

---

## Perintah Berguna

```bash
# Lihat logs panel
pm2 logs hosting-panel

# Restart panel
pm2 restart hosting-panel

# Status semua proses
pm2 list

# Reload Nginx
sudo nginx -t && sudo systemctl reload nginx
```
