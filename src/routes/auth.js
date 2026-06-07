const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, getNextPort } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validasi input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username harus 3-20 karakter' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username hanya boleh huruf, angka, dan underscore' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }

    // Cek duplikat
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(409).json({ error: 'Username atau email sudah digunakan' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const port = getNextPort();

    const result = db.prepare(
      'INSERT INTO users (username, email, password, port_assigned) VALUES (?, ?, ?, ?)'
    ).run(username, email.toLowerCase(), hashedPassword, port);

    // Buat subdomain otomatis
    const baseDomain = process.env.BASE_DOMAIN || 'domainmu.com';
    const subdomain = `${username}.${baseDomain}`;

    const token = jwt.sign(
      { userId: result.lastInsertRowid, username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        email: email.toLowerCase(),
        role: 'user',
        port_assigned: port,
        subdomain
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Gagal registrasi' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const baseDomain = process.env.BASE_DOMAIN || 'domainmu.com';

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        port_assigned: user.port_assigned,
        subdomain: `${user.username}.${baseDomain}`
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Gagal login' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const baseDomain = process.env.BASE_DOMAIN || 'domainmu.com';
  const user = db.prepare('SELECT id, username, email, role, port_assigned, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({
    ...user,
    subdomain: `${user.username}.${baseDomain}`
  });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Password lama salah' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);

    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengubah password' });
  }
});

module.exports = router;
