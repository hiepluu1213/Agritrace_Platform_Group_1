/**
 * api.js — AgriTrace Frontend API Service
 * Quản lý token JWT, gọi tất cả endpoint backend.
 * Backend mặc định chạy tại http://localhost:5000
 */

const API_BASE_URL = 'http://localhost:5000';

/* ================================================================
   TOKEN & USER MANAGEMENT (localStorage)
   ================================================================ */
function getToken() {
  return localStorage.getItem('agritrace_token');
}

function setToken(token) {
  localStorage.setItem('agritrace_token', token);
}

function removeToken() {
  localStorage.removeItem('agritrace_token');
  localStorage.removeItem('agritrace_user');
}

function getCurrentUser() {
  const raw = localStorage.getItem('agritrace_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setCurrentUser(user) {
  localStorage.setItem('agritrace_user', JSON.stringify(user));
}

/* ================================================================
   CORE API REQUEST
   ================================================================ */
async function apiRequest(method, endpoint, body) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method, headers };
  if (body !== undefined && body !== null && ['POST', 'PUT', 'PATCH'].includes(method)) {
    opts.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, opts);
  } catch (networkErr) {
    throw new Error('Không thể kết nối tới máy chủ. Vui lòng kiểm tra backend đang chạy.');
  }

  /* 401 → token hết hạn hoặc chưa đăng nhập */
  if (response.status === 401) {
    removeToken();
    const p = window.location.pathname;
    window.location.href = p.includes('/pages/') ? '../login.html' : 'login.html';
    throw new Error('Phiên đăng nhập hết hạn');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Lỗi HTTP ${response.status}`);
  }
  return data;
}

/* ================================================================
   AUTH API
   ================================================================ */
async function apiLogin(username, password) {
  return apiRequest('POST', '/api/auth/login', { username, password });
}

async function apiRegister(data) {
  return apiRequest('POST', '/api/auth/register', data);
}

async function apiGetMe() {
  return apiRequest('GET', '/api/auth/me');
}

/* ================================================================
   MASTER DATA API
   ================================================================ */
async function apiGetGoods() {
  return apiRequest('GET', '/api/goods');
}

async function apiGetGoodsById(id) {
  return apiRequest('GET', `/api/goods/${id}`);
}

async function apiGetFarmers() {
  return apiRequest('GET', '/api/farmers');
}

async function apiGetDrivers() {
  return apiRequest('GET', '/api/drivers');
}

/* ================================================================
   INTAKE API
   ================================================================ */
async function apiGetIntakes(status) {
  const qs = status ? `?status=${status}` : '';
  return apiRequest('GET', `/api/intakes${qs}`);
}

async function apiGetIntakeById(id) {
  return apiRequest('GET', `/api/intakes/${id}`);
}

/* ================================================================
   PROCESSING & LOT OPERATIONS API
   ================================================================ */
async function apiGetProcessing() {
  return apiRequest('GET', '/api/processing');
}

async function apiCreateProcessing(data) {
  return apiRequest('POST', '/api/processing', data);
}

/** Gộp lô: N lô → 1 lô mới */
async function apiBlendLots(data) {
  return apiRequest('POST', '/api/lot-operations/blend', data);
}

/** Tách lô: 1 lô → M lô nhỏ */
async function apiSplitLot(data) {
  return apiRequest('POST', '/api/lot-operations/split', data);
}

/** Truy vết phả hệ 1 lô */
async function apiGetLotGenealogy(lotId) {
  return apiRequest('GET', `/api/lots/${lotId}/genealogy`);
}

/* ================================================================
   TRANSPORT API
   ================================================================ */
async function apiGetWaybills() {
  return apiRequest('GET', '/api/waybills');
}

async function apiGetWaybillById(id) {
  return apiRequest('GET', `/api/waybills/${id}`);
}

/* ================================================================
   REPORTS API
   ================================================================ */
async function apiGenerateReport(reportDate) {
  return apiRequest('POST', '/api/reports/daily/generate', { report_date: reportDate });
}

async function apiGetReports() {
  return apiRequest('GET', '/api/reports/daily');
}

/* ================================================================
   AUTH GUARD & LOGOUT
   ================================================================ */
function requireAuth() {
  if (!getToken()) {
    const p = window.location.pathname;
    window.location.href = p.includes('/pages/') ? '../login.html' : 'login.html';
    return false;
  }
  return true;
}

function logout() {
  removeToken();
  const p = window.location.pathname;
  window.location.href = p.includes('/pages/') ? '../login.html' : 'login.html';
}

/* ================================================================
   COMMON UI HELPERS (dùng chung cho mọi trang)
   ================================================================ */

/** Cập nhật tên + avatar người dùng trên header */
function updateUserProfile() {
  const user = getCurrentUser();
  if (!user) return;
  const nameEl = document.querySelector('.user-profile-name');
  const avatarEl = document.querySelector('.user-avatar-circle');
  if (nameEl) nameEl.textContent = user.full_name || user.username;
  if (avatarEl && user.full_name) {
    const parts = user.full_name.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }
}

/** Gắn event cho nút Đăng xuất trên sidebar */
function setupLogout() {
  const btn = document.querySelector('.sidebar-logout-btn');
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      logout();
    });
  }
}

/** Format số có dấu phẩy (VN locale) */
function fmtNum(n) {
  return parseFloat(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
