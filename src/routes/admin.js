const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Semua route di sini butuh admin
router.use(adminMiddleware);

// GET /api/admin/users - daftar semua user
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.port_assigned, u.created_at, u.is_active,
      (SELECT COUNT(*) FROM apps a WHERE a.user_id = u.id) as app_count,
      (SELECT COUNT(*) FROM domains d WHERE d.user_id = u.id) as domain_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// PATCH /api/admin/users/:id - update status user
router.patch('/users/:id', (req, res) => {
  try {
    const { is_active, role } = req.body;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Jangan ban diri sendiri
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa mengubah akun sendiri' });
    }

    if (is_active !== undefined) {
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
    }
    if (role && ['admin', 'user'].includes(role)) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    }

    res.json({ message: 'User berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal update user' });
  }
});

// DELETE /api/admin/users/:id - hapus user
router.delete('/users/:id', (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal hapus user' });
  }
});

// GET /api/admin/stats - statistik server
router.get('/stats', (req, res) => {
  const stats = {
    total_users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    active_users: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c,
    total_apps: db.prepare('SELECT COUNT(*) as c FROM apps').get().c,
    running_apps: db.prepare("SELECT COUNT(*) as c FROM apps WHERE status = 'running'").get().c,
    total_domains: db.prepare('SELECT COUNT(*) as c FROM domains').get().c,
    custom_domains: db.prepare("SELECT COUNT(*) as c FROM domains WHERE type = 'custom'").get().c,
  };
  res.json(stats);
});

// GET /api/admin/apps - semua app
router.get('/apps', (req, res) => {
  const apps = db.prepare(`
    SELECT a.*, u.username
    FROM apps a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
  `).all();
  res.json(apps);
});

// POST /api/admin/create-admin - buat akun admin pertama (sekali pakai)
// Setelah ada 1 admin, endpoint ini tidak bisa diakses lagi kecuali via admin
router.post('/create-admin', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    const hashed = await bcrypt.hash(password, 12);
    db.prepare(
      'INSERT INTO users (username, email, password, role, port_assigned) VALUES (?, ?, ?, ?, ?)'
    ).run(username, email, hashed, 'admin', 9999);

    res.json({ message: 'Admin berhasil dibuat' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal buat admin: ' + err.message });
  }
});

module.exports = router;
