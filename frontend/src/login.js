/**
 * login.js — Xử lý đăng nhập trang login.html
 * Gọi POST /api/auth/login, lưu JWT token, redirect sang index.html
 */

document.addEventListener('DOMContentLoaded', function () {
  const form        = document.querySelector('.login-form');
  const usernameIn  = document.getElementById('username');
  const passwordIn  = document.getElementById('password');
  const submitBtn   = document.querySelector('.btn-login-submit');

  /* Xoá mật khẩu demo mặc định (••••••••) */
  if (passwordIn.value === '••••••••') passwordIn.value = '';

  /* Nếu đã đăng nhập → chuyển thẳng sang dashboard */
  if (getToken()) {
    window.location.href = 'index.html';
    return;
  }

  /* ------------- TẠO KHỐI HIỂN THỊ THÔNG BÁO LỖI / THÀNH CÔNG ------------- */
  const alertBox = document.createElement('div');
  alertBox.id = 'login-alert';
  alertBox.style.cssText = `
    display:none; padding:12px 16px; border-radius:10px;
    font-size:0.88rem; font-weight:600; margin-bottom:16px;
    align-items:center; gap:8px;
  `;
  form.insertBefore(alertBox, form.firstChild);

  function showAlert(msg, type) {
    const colors = {
      error:   { bg:'#fee2e2', border:'#fecaca', color:'#991b1b',
                 icon:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' },
      success: { bg:'#ecfdf5', border:'#bbf7d0', color:'#065f46',
                 icon:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' },
    };
    const c = colors[type] || colors.error;
    alertBox.style.display     = 'flex';
    alertBox.style.background  = c.bg;
    alertBox.style.border      = `1px solid ${c.border}`;
    alertBox.style.color       = c.color;
    alertBox.innerHTML         = `${c.icon}<span>${msg}</span>`;
  }

  function hideAlert() { alertBox.style.display = 'none'; }

  /* ------------- TRẠNG THÁI LOADING ------------- */
  const btnOriginalHTML = submitBtn.innerHTML;

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.style.opacity = on ? '0.7' : '1';
    submitBtn.style.cursor  = on ? 'not-allowed' : 'pointer';
    if (on) {
      submitBtn.innerHTML = `
        <span style="width:18px;height:18px;border:2px solid rgba(255,255,255,.3);
              border-top-color:#fff;border-radius:50%;display:inline-block;
              animation:agspin .6s linear infinite"></span>
        <span>Đang xác thực…</span>`;
      /* inject keyframes nếu chưa có */
      if (!document.getElementById('ag-spin-style')) {
        const s = document.createElement('style');
        s.id = 'ag-spin-style';
        s.textContent = '@keyframes agspin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
      }
    } else {
      submitBtn.innerHTML = btnOriginalHTML;
    }
  }

  /* ------------- GỬI FORM ĐĂNG NHẬP ------------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAlert();

    const username = usernameIn.value.trim();
    const password = passwordIn.value;

    if (!username || !password) {
      showAlert('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.', 'error');
      return;
    }

    setLoading(true);

    try {
      const result = await apiLogin(username, password);

      /* Lưu token & thông tin user */
      setToken(result.access_token);
      setCurrentUser(result.user);

      showAlert(
        `Xin chào, ${result.user.full_name || result.user.username}! Đang chuyển hướng…`,
        'success'
      );

      /* Chuyển trang sau 600ms */
      setTimeout(() => { window.location.href = 'index.html'; }, 600);

    } catch (err) {
      showAlert(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.', 'error');
      setLoading(false);
    }
  });

  /* ------------- CLICK TÀI KHOẢN MẪU → TỰ ĐIỀN ------------- */
  document.querySelectorAll('.demo-item').forEach(function (item) {
    item.style.cursor = 'pointer';
    item.style.transition = 'background .15s';
    item.addEventListener('mouseenter', function () { item.style.background = '#f0fdf4'; });
    item.addEventListener('mouseleave', function () { item.style.background = ''; });

    item.addEventListener('click', function () {
      const txt = item.querySelector('span:first-child');
      if (!txt) return;
      const match = txt.textContent.match(/:\s*(.+@\S+)/);
      if (match) {
        usernameIn.value = match[1].trim();
        passwordIn.value = '';
        passwordIn.focus();
        hideAlert();
      }
    });
  });

  /* ------------- LIÊN KẾT "Quên mật khẩu" ------------- */
  const forgotLink = document.querySelector('.forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', function (e) {
      e.preventDefault();
      showAlert('Tính năng đặt lại mật khẩu sẽ sớm được triển khai.', 'error');
    });
  }
});
