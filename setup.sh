#!/bin/bash
# ============================================================
#  Hosting Panel - Setup Script untuk Armbian / Debian
#  Jalankan sebagai root: sudo bash setup.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Cek root
[ "$EUID" -ne 0 ] && error "Jalankan sebagai root: sudo bash setup.sh"

PANEL_DIR="/opt/hosting-panel"
APPS_DIR="/home/apps"

info "=== Hosting Panel Setup ==="

# 1. Update & install dependencies
info "Menginstall dependencies sistem..."
apt-get update -qq
apt-get install -y -qq nodejs npm nginx curl

# Cek versi Node.js (minimal v16)
NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 16 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [ "$NODE_VER" = "old" ]; then
  warn "Node.js versi lama, mengupdate..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

info "Node.js: $(node --version)"
info "npm: $(npm --version)"

# 2. Install PM2 global
info "Menginstall PM2..."
npm install -g pm2 --quiet
pm2 startup systemd -u root --hp /root || true

# 3. Buat direktori
info "Membuat direktori..."
mkdir -p "$PANEL_DIR" "$APPS_DIR"

# 4. Copy files
info "Menyalin file panel..."
cp -r . "$PANEL_DIR/"

# 5. Install npm dependencies
info "Menginstall npm dependencies..."
cd "$PANEL_DIR"
npm install --production --quiet

# 6. Setup .env
if [ ! -f "$PANEL_DIR/.env" ]; then
  info "Membuat file .env..."
  cp "$PANEL_DIR/.env.example" "$PANEL_DIR/.env"

  # Generate JWT secret otomatis
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/ganti_dengan_random_string_panjang_minimal_32_karakter/$JWT_SECRET/" "$PANEL_DIR/.env"

  # Set server IP otomatis
  SERVER_IP=$(hostname -I | awk '{print $1}')
  sed -i "s/192.168.100.27/$SERVER_IP/" "$PANEL_DIR/.env"

  warn "⚠️  Edit file .env untuk mengatur PANEL_DOMAIN dan BASE_DOMAIN:"
  warn "    nano $PANEL_DIR/.env"
fi

# 7. Setup Nginx untuk panel
info "Mengkonfigurasi Nginx..."
SERVER_IP=$(hostname -I | awk '{print $1}')
PANEL_PORT=$(grep PORT "$PANEL_DIR/.env" | cut -d'=' -f2 | tr -d ' ')
PANEL_PORT=${PANEL_PORT:-3000}

cat > /etc/nginx/sites-available/hosting-panel << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:$PANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Hapus default nginx
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/hosting-panel /etc/nginx/sites-enabled/hosting-panel

# Test & reload nginx
nginx -t && systemctl reload nginx

# 8. Start panel dengan PM2
info "Menjalankan panel dengan PM2..."
cd "$PANEL_DIR"
pm2 delete hosting-panel 2>/dev/null || true
pm2 start server.js --name "hosting-panel"
pm2 save

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Hosting Panel berhasil diinstall!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐 Akses panel: ${YELLOW}http://$SERVER_IP${NC}"
echo ""
echo -e "  📝 Langkah selanjutnya:"
echo -e "     1. Buka browser ke http://$SERVER_IP"
echo -e "     2. Register akun pertama (akan jadi admin)"
echo -e "     3. Edit ${YELLOW}$PANEL_DIR/.env${NC} untuk konfigurasi domain"
echo ""
echo -e "  📋 Perintah berguna:"
echo -e "     pm2 logs hosting-panel  - lihat logs"
echo -e "     pm2 restart hosting-panel - restart panel"
echo -e "     nano $PANEL_DIR/.env    - edit konfigurasi"
echo ""
