// ==================== STATE ====================
let token = localStorage.getItem('token');
let currentUser = null;
let currentLogAppId = null;
let currentPage = 'apps';

const API = '/api';

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    initPanel();
  } else {
    showAuthPage();
  }
});

function showAuthPage() {
  document.getElementById('authPage').classList.remove('hidden');
  document.getElementById('mainPanel').classList.add('hidden');
}

async function initPanel() {
  try {
    const user = await apiFetch('/auth/me');
    currentUser = user;
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainPanel').classList.remove('hidden');
    document.getElementById('navUsername').textContent = `👤 ${user.username}`;
    document.getElementById('userSubdomain').textContent = user.subdomain || '-';

    // Tampilkan nav admin jika admin
    if (user.role === 'admin') {
      document.getElementById('navAdmin').classList.remove('hidden');
    }

    showPage('apps');
  } catch (err) {
    localStorage.removeItem('token');
    token = null;
    showAuthPage();
  }
}

// ==================== AUTH ====================
function showTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogin').className = `flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400'}`;
  document.getElementById('tabRegister').className = `flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === 'register' ? 'bg-blue-600 text-white' : 'text-gray-400'}`;
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideAuthError() {
  document.getElementById('authError').classList.add('hidden');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showAuthError('Email dan password wajib diisi');

  try {
    const data = await apiFetch('/auth/login', 'POST', { email, password }, false);
    token = data.token;
    localStorage.setItem('token', token);
    hideAuthError();
    initPanel();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!username || !email || !password) return showAuthError('Semua field wajib diisi');

  try {
    const data = await apiFetch('/auth/register', 'POST', { username, email, password }, false);
    token = data.token;
    localStorage.setItem('token', token);
    hideAuthError();
    initPanel();
  } catch (err) {
    showAuthError(err.message);
  }
}

function doLogout() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  showAuthPage();
}

// ==================== NAVIGATION ====================
function showPage(page) {
  currentPage = page;
  ['apps', 'domains', 'admin'].forEach(p => {
    document.getElementById(`page${p.charAt(0).toUpperCase() + p.slice(1)}`).classList.toggle('hidden', p !== page);
  });

  // Update nav style
  const navMap = { apps: 'navApps', domains: 'navDomains', admin: 'navAdmin' };
  Object.entries(navMap).forEach(([p, navId]) => {
    const el = document.getElementById(navId);
    if (!el) return;
    if (p === page) {
      el.className = `text-sm px-3 py-1.5 rounded-lg ${p === 'admin' ? 'bg-yellow-600 text-white' : 'bg-blue-600 text-white'}`;
    } else {
      el.className = `text-sm px-3 py-1.5 rounded-lg ${p === 'admin' ? 'text-yellow-400' : 'text-gray-400'} hover:text-white hover:bg-gray-800`;
    }
  });

  if (page === 'apps') loadApps();
  if (page === 'domains') loadDomains();
  if (page === 'admin') loadAdmin();
}

// ==================== APPS ====================
async function loadApps() {
  const container = document.getElementById('appList');
  try {
    const apps = await apiFetch('/apps');
    if (apps.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-gray-500"><div class="text-4xl mb-3">📦</div><p>Belum ada app. Buat sekarang!</p></div>';
      return;
    }
    container.innerHTML = apps.map(app => renderAppCard(app)).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red-400 text-center py-4">${err.message}</div>`;
  }
}

function renderAppCard(app) {
  const statusColor = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    error: 'bg-red-500'
  }[app.status] || 'bg-gray-500';

  const statusText = { running: '● Running', stopped: '○ Stopped', error: '⚠ Error' }[app.status] || app.status;

  return `
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors" id="appCard-${app.id}">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold text-lg">${escHtml(app.name)}</span>
            <span class="text-xs px-2 py-0.5 bg-gray-800 rounded text-gray-400">${escHtml(app.type)}</span>
          </div>
          <div class="text-sm text-gray-400 space-y-0.5">
            <div>Port: <span class="text-gray-200 font-mono">${app.port}</span></div>
            <div>Start: <span class="text-gray-200 font-mono text-xs">${escHtml(app.start_command)}</span></div>
            <div>Domains: <span class="text-gray-200">${app.domain_count || 0}</span></div>
          </div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded-full text-white ${statusColor}">${statusText}</span>
      </div>

      <div class="flex flex-wrap gap-2 mt-4">
        ${app.status !== 'running'
          ? `<button onclick="appAction(${app.id}, 'start')" class="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">▶ Start</button>`
          : `<button onclick="appAction(${app.id}, 'restart')" class="bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">↻ Restart</button>
             <button onclick="appAction(${app.id}, 'stop')" class="bg-orange-600 hover:bg-orange-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">■ Stop</button>`
        }
        <button onclick="showLogs(${app.id}, '${escHtml(app.name)}')" class="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">📋 Logs</button>
        <button onclick="addSubdomain(${app.id})" class="bg-blue-700 hover:bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">🌐 Subdomain</button>
        <button onclick="deleteApp(${app.id}, '${escHtml(app.name)}')" class="bg-red-800 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">🗑 Hapus</button>
      </div>
    </div>
  `;
}

async function createApp() {
  const name = document.getElementById('newAppName').value.trim();
  const type = document.getElementById('newAppType').value;
  const start_command = document.getElementById('newAppCmd').value.trim() || undefined;
  const msgEl = document.getElementById('appCreateMsg');

  if (!name) return showMsg(msgEl, 'error', 'Nama app wajib diisi');

  try {
    const data = await apiFetch('/apps', 'POST', { name, type, start_command });
    showMsg(msgEl, 'success', `App "${data.app.name}" berhasil dibuat! Port: ${data.app.port}`);
    document.getElementById('newAppName').value = '';
    document.getElementById('newAppCmd').value = '';
    loadApps();
  } catch (err) {
    showMsg(msgEl, 'error', err.message);
  }
}

async function appAction(appId, action) {
  const card = document.getElementById(`appCard-${appId}`);
  if (card) card.style.opacity = '0.6';

  try {
    const data = await apiFetch(`/apps/${appId}/${action}`, 'POST');
    await loadApps();
  } catch (err) {
    alert('Error: ' + err.message);
    if (card) card.style.opacity = '1';
  }
}

async function deleteApp(appId, name) {
  if (!confirm(`Hapus app "${name}"? Semua domain terkait juga akan dihapus.`)) return;
  try {
    await apiFetch(`/apps/${appId}`, 'DELETE');
    loadApps();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function addSubdomain(appId) {
  try {
    const data = await apiFetch('/domains/subdomain', 'POST', { app_id: appId });
    alert(`✅ Subdomain berhasil: ${data.url}`);
    loadApps();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ==================== DOMAINS ====================
async function loadDomains() {
  // Populate app select
  try {
    const apps = await apiFetch('/apps');
    const sel = document.getElementById('domainAppId');
    sel.innerHTML = '<option value="">Pilih app...</option>' +
      apps.map(a => `<option value="${a.id}">${escHtml(a.name)} (port ${a.port})</option>`).join('');
  } catch (e) {}

  // Load domain list
  const container = document.getElementById('domainList');
  try {
    const domains = await apiFetch('/domains');
    if (domains.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-gray-500"><div class="text-4xl mb-3">🌐</div><p>Belum ada domain.</p></div>';
      return;
    }
    container.innerHTML = domains.map(d => `
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-mono text-blue-300">${escHtml(d.domain)}</span>
            <span class="text-xs px-2 py-0.5 rounded ${d.type === 'custom' ? 'bg-purple-800 text-purple-200' : 'bg-blue-900 text-blue-200'}">${d.type}</span>
          </div>
          <div class="text-sm text-gray-400">
            App: <span class="text-gray-200">${escHtml(d.app_name)}</span> · Port: ${d.port}
          </div>
        </div>
        <div class="flex gap-2">
          <a href="http://${d.domain}" target="_blank" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg">🔗 Buka</a>
          <button onclick="deleteDomain(${d.id}, '${escHtml(d.domain)}')" class="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded-lg">🗑 Hapus</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red-400 text-center">${err.message}</div>`;
  }
}

async function addCustomDomain() {
  const app_id = document.getElementById('domainAppId').value;
  const domain = document.getElementById('customDomain').value.trim();
  const msgEl = document.getElementById('domainMsg');

  if (!app_id || !domain) return showMsg(msgEl, 'error', 'Pilih app dan isi domain');

  try {
    const data = await apiFetch('/domains/custom', 'POST', { app_id, domain });
    showMsg(msgEl, 'success', `✅ ${data.message} | ${data.instruction}`);
    document.getElementById('customDomain').value = '';
    loadDomains();
  } catch (err) {
    showMsg(msgEl, 'error', err.message);
  }
}

async function deleteDomain(id, domain) {
  if (!confirm(`Hapus domain "${domain}"?`)) return;
  try {
    await apiFetch(`/domains/${id}`, 'DELETE');
    loadDomains();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ==================== ADMIN ====================
async function loadAdmin() {
  if (!currentUser || currentUser.role !== 'admin') return;

  // Stats
  try {
    const stats = await apiFetch('/admin/stats');
    document.getElementById('adminStats').innerHTML = [
      { label: 'Total User', value: stats.total_users, color: 'blue' },
      { label: 'User Aktif', value: stats.active_users, color: 'green' },
      { label: 'Total App', value: stats.total_apps, color: 'purple' },
      { label: 'App Running', value: stats.running_apps, color: 'emerald' },
      { label: 'Total Domain', value: stats.total_domains, color: 'yellow' },
      { label: 'Domain Custom', value: stats.custom_domains, color: 'orange' },
    ].map(s => `
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-${s.color}-400">${s.value}</div>
        <div class="text-xs text-gray-400 mt-1">${s.label}</div>
      </div>
    `).join('');
  } catch (e) {}

  // Users
  try {
    const users = await apiFetch('/admin/users');
    document.getElementById('adminUserList').innerHTML = users.map(u => `
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium">${escHtml(u.username)}</span>
            <span class="text-xs px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-yellow-800 text-yellow-200' : 'bg-gray-700 text-gray-300'}">${u.role}</span>
            <span class="text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span>
          </div>
          <div class="text-sm text-gray-400">${escHtml(u.email)} · ${u.app_count} app · ${u.domain_count} domain</div>
        </div>
        <div class="flex gap-2">
          ${u.id !== currentUser.id ? `
            <button onclick="toggleUser(${u.id}, ${u.is_active ? 0 : 1})" class="text-xs px-3 py-1.5 rounded-lg ${u.is_active ? 'bg-orange-800 hover:bg-orange-700' : 'bg-green-800 hover:bg-green-700'}">
              ${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function toggleUser(userId, newStatus) {
  try {
    await apiFetch(`/admin/users/${userId}`, 'PATCH', { is_active: newStatus });
    loadAdmin();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ==================== LOGS ====================
async function showLogs(appId, appName) {
  currentLogAppId = appId;
  document.getElementById('logsTitle').textContent = `📋 Logs: ${appName}`;
  document.getElementById('logsContent').textContent = 'Memuat logs...';
  document.getElementById('logsModal').classList.remove('hidden');
  await fetchLogs();
}

async function fetchLogs() {
  if (!currentLogAppId) return;
  try {
    const data = await apiFetch(`/apps/${currentLogAppId}/logs?lines=100`);
    document.getElementById('logsContent').textContent = data.logs || 'Tidak ada logs.';
    // Auto scroll ke bawah
    const pre = document.getElementById('logsContent');
    pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
  } catch (err) {
    document.getElementById('logsContent').textContent = 'Gagal memuat logs: ' + err.message;
  }
}

async function refreshLogs() {
  document.getElementById('logsContent').textContent = 'Memuat...';
  await fetchLogs();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'logsModal') currentLogAppId = null;
}

// ==================== UTILS ====================
async function apiFetch(endpoint, method = 'GET', body = null, withAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAuth && token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

function showMsg(el, type, msg) {
  el.textContent = msg;
  el.className = `mt-2 text-sm p-2 rounded-lg ${type === 'error' ? 'text-red-400 bg-red-900/30' : 'text-green-400 bg-green-900/30'}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tutup modal saat klik luar
document.getElementById('logsModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal('logsModal');
});
