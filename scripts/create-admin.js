#!/usr/bin/env node
/**
 * Script untuk membuat akun admin pertama.
 * Jalankan: node scripts/create-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const readline = require('readline');

const db = require('../src/database');
db.init();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(r => rl.question(q, r)); }

async function main() {
  console.log('\n🔑 Buat Akun Admin\n');

  const username = (await ask('Username: ')).trim();
  const email = (await ask('Email: ')).trim().toLowerCase();
  const password = await ask('Password (min 8 karakter): ');

  if (!username || !email || !password) {
    console.error('❌ Semua field wajib diisi'); process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password minimal 8 karakter'); process.exit(1);
  }

  const existing = db.db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    console.error('❌ Username atau email sudah digunakan'); process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);
  const result = db.db.prepare(
    'INSERT INTO users (username, email, password, role, port_assigned) VALUES (?, ?, ?, ?, ?)'
  ).run(username, email, hashed, 'admin', 9999);

  console.log(`\n✅ Admin berhasil dibuat!`);
  console.log(`   ID: ${result.lastInsertRowid}`);
  console.log(`   Username: ${username}`);
  console.log(`   Email: ${email}\n`);

  rl.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
