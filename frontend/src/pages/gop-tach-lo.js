/**
 * gop-tach-lo.js — Trang Gộp & Tách Lô
 * Kết nối API:
 *   POST /api/lot-operations/split   (Tách lô)
 *   POST /api/lot-operations/blend   (Gộp lô)
 *   GET  /api/lots/<id>/genealogy    (Phả hệ)
 *   GET  /api/intakes                (Danh sách lô)
 *   GET  /api/goods                  (Danh mục hàng hóa)
 */

(function () {
  'use strict';

  /* ================================================================
     STATE
     ================================================================ */
  let lots       = [];   // danh sách lô (từ intakes)
  let goodsList  = [];   // danh mục hàng hóa
  let currentTab = 'split';  // 'split' | 'blend'

  /* ================================================================
     INIT
     ================================================================ */
  document.addEventListener('DOMContentLoaded', async function () {
    if (!requireAuth()) return;
    injectStyles();
    updateUserProfile();
    setupLogout();
    setupFilterPills();
    setupButtons();
    await loadData();
  });

  /* ================================================================
     INJECT CUSTOM CSS (modal, toast, form, spinner)
     ================================================================ */
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
/* ===== Toast ===== */
.agri-toast-container{position:fixed;top:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:12px;pointer-events:none}
.agri-toast{pointer-events:auto;padding:14px 20px;border-radius:12px;font-size:.88rem;font-weight:600;display:flex;align-items:center;gap:10px;min-width:320px;max-width:480px;box-shadow:0 10px 25px -5px rgba(0,0,0,.15);animation:agSlideIn .3s ease-out;transition:opacity .3s,transform .3s}
.agri-toast.success{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46}
.agri-toast.error{background:#fee2e2;border:1px solid #fecaca;color:#991b1b}
.agri-toast.info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
@keyframes agSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}

/* ===== Modal ===== */
.agri-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center;animation:agFadeIn .2s ease-out}
.agri-modal{background:#fff;border-radius:16px;width:92%;max-width:680px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px -12px rgba(0,0,0,.25);animation:agScaleIn .25s ease-out}
.agri-modal-header{display:flex;align-items:center;justify-content:space-between;padding:24px 28px 16px;border-bottom:1px solid #e5ece7}
.agri-modal-title{font-size:1.12rem;font-weight:800;color:#132219}
.agri-modal-close{width:32px;height:32px;border:none;background:#f3f6f4;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#586e60;transition:all .15s}
.agri-modal-close:hover{background:#e5ece7;color:#132219}
.agri-modal-body{padding:20px 28px}
.agri-modal-footer{padding:16px 28px 24px;border-top:1px solid #e5ece7;display:flex;justify-content:flex-end;gap:12px}
@keyframes agFadeIn{from{opacity:0}to{opacity:1}}
@keyframes agScaleIn{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}

/* ===== Form ===== */
.agri-form-group{margin-bottom:16px}
.agri-form-label{display:block;font-size:.84rem;font-weight:700;color:#132219;margin-bottom:6px}
.agri-form-input,.agri-form-select,.agri-form-textarea{width:100%;padding:10px 14px;border:1px solid #e5ece7;border-radius:10px;font-family:inherit;font-size:.9rem;color:#132219;background:#fff;transition:border-color .15s,box-shadow .15s}
.agri-form-input:focus,.agri-form-select:focus,.agri-form-textarea:focus{outline:none;border-color:#107548;box-shadow:0 0 0 3px rgba(16,117,72,.1)}

/* ===== Dynamic list items ===== */
.agri-dyn-item{display:flex;gap:10px;align-items:center;padding:12px;background:#f8faf8;border:1px solid #e5ece7;border-radius:10px;margin-bottom:10px}
.agri-dyn-item input,.agri-dyn-item select{border:1px solid #e5ece7;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:.88rem;color:#132219;background:#fff}
.agri-dyn-item input:focus,.agri-dyn-item select:focus{outline:none;border-color:#107548;box-shadow:0 0 0 3px rgba(16,117,72,.1)}

.agri-btn-add{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#f3f6f4;border:1px dashed #b0c4b6;border-radius:8px;color:#107548;font-weight:600;font-size:.84rem;cursor:pointer;transition:all .15s;font-family:inherit}
.agri-btn-add:hover{background:#e8f5e9;border-color:#107548}

.agri-btn-remove{width:28px;height:28px;border:none;background:#fee2e2;border-radius:6px;color:#b91c1c;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;font-size:.9rem;font-weight:700;font-family:inherit}
.agri-btn-remove:hover{background:#fecaca}

/* ===== Balance indicator ===== */
.agri-balance{padding:12px 16px;border-radius:10px;font-size:.88rem;font-weight:600;display:flex;align-items:center;gap:8px;margin-top:12px}
.agri-balance.ok{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46}
.agri-balance.bad{background:#fee2e2;border:1px solid #fecaca;color:#991b1b}

/* ===== Lot info box ===== */
.agri-lot-info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:.85rem;color:#166534}

/* ===== Result card ===== */
.agri-result-card{background:#f0fdf4;border:1px solid #a7f3d0;border-radius:12px;padding:20px;margin-top:12px}
.agri-result-card h4{font-size:.95rem;font-weight:800;color:#065f46;margin-bottom:12px}
.agri-result-item{display:flex;justify-content:space-between;padding:8px 12px;background:#fff;border:1px solid #d1fae5;border-radius:8px;margin-bottom:6px;font-size:.85rem}

/* ===== Spinner ===== */
.agri-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:agSpin .6s linear infinite}
@keyframes agSpin{to{transform:rotate(360deg)}}

/* ===== Empty state ===== */
.agri-empty{text-align:center;padding:40px 20px;color:#83978b}
.agri-empty svg{margin-bottom:12px;opacity:.5}
.agri-empty p{font-size:.9rem;font-weight:500}
    `;
    document.head.appendChild(s);
  }

  /* ================================================================
     TOAST
     ================================================================ */
  function showToast(msg, type) {
    type = type || 'success';
    var container = document.querySelector('.agri-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'agri-toast-container';
      document.body.appendChild(container);
    }
    var icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    var t = document.createElement('div');
    t.className = 'agri-toast ' + type;
    t.innerHTML = (icons[type] || icons.info) + '<span>' + msg + '</span>';
    container.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(100%)';
      setTimeout(function () { t.remove(); }, 300);
    }, 4000);
  }

  /* ================================================================
     MODAL SYSTEM
     ================================================================ */
  function openModal(title, bodyHtml, footerHtml) {
    closeModal();
    var ov = document.createElement('div');
    ov.className = 'agri-modal-overlay';
    ov.innerHTML =
      '<div class="agri-modal">' +
        '<div class="agri-modal-header">' +
          '<h3 class="agri-modal-title">' + title + '</h3>' +
          '<button class="agri-modal-close" aria-label="Đóng">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div class="agri-modal-body">' + bodyHtml + '</div>' +
        '<div class="agri-modal-footer">' + footerHtml + '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.querySelector('.agri-modal-close').addEventListener('click', closeModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', escHandler);
    return ov;
  }

  function closeModal() {
    var ov = document.querySelector('.agri-modal-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', escHandler);
  }

  function escHandler(e) { if (e.key === 'Escape') closeModal(); }

  /* ================================================================
     DATA LOADING
     ================================================================ */
  async function loadData() {
    try {
      var results = await Promise.all([apiGetIntakes(), apiGetGoods()]);
      lots      = results[0];
      goodsList = results[1];
    } catch (err) {
      showToast('Không thể tải dữ liệu: ' + err.message, 'error');
    }
  }

  /* ================================================================
     UI SETUP
     ================================================================ */
  function setupFilterPills() {
    var pills = document.querySelectorAll('.filter-pill');
    var wrappers = document.querySelectorAll('.batch-box-wrapper');

    pills.forEach(function (pill, i) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentTab = (i === 0) ? 'split' : 'blend';

        /* Highlight card tương ứng */
        if (wrappers.length >= 2) {
          wrappers[0].style.outline = (currentTab === 'split') ? '2px solid #107548' : 'none';
          wrappers[0].style.outlineOffset = '2px';
          wrappers[1].style.outline = (currentTab === 'blend') ? '2px solid #107548' : 'none';
          wrappers[1].style.outlineOffset = '2px';
        }
      });
    });
  }

  function setupButtons() {
    /* Nút "Tạo phiếu mới" */
    var createBtn = document.querySelector('.table-action-group .btn-primary');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        if (currentTab === 'split') openSplitModal();
        else openBlendModal();
      });
    }

    /* Nút "Lịch sử thao tác" */
    var histBtn = document.querySelector('.btn-secondary');
    if (histBtn) {
      histBtn.addEventListener('click', function () {
        showToast('Tính năng lịch sử thao tác sẽ sớm được cập nhật.', 'info');
      });
    }

    /* Nút "Xác nhận tách lô" (static demo card) */
    var wrappers = document.querySelectorAll('.batch-box-wrapper');
    if (wrappers[0]) {
      var splitConfirm = wrappers[0].querySelector('.btn-primary');
      if (splitConfirm) {
        splitConfirm.addEventListener('click', function () {
          openSplitModal();
        });
      }
    }

    /* Nút "Xác nhận gộp lô" (static demo card) */
    if (wrappers[1]) {
      var blendConfirm = wrappers[1].querySelector('.btn-primary');
      if (blendConfirm) {
        blendConfirm.addEventListener('click', function () {
          openBlendModal();
        });
      }
    }
  }

  /* ================================================================
     SPLIT MODAL  (Tách lô)
     ================================================================ */
  function openSplitModal() {
    var lotOpts = '<option value="">— Chọn lô nguồn —</option>';
    lots.forEach(function (l) {
      lotOpts += '<option value="' + l.lot_id + '"' +
        ' data-qty="' + l.quantity + '"' +
        ' data-goods="' + (l.goods_name || '') + '"' +
        ' data-farmer="' + (l.farmer_name || '') + '"' +
        ' data-code="' + l.lot_code + '"' +
        '>' + l.lot_code + ' — ' + (l.goods_name || 'N/A') + ' (' + fmtNum(l.quantity) + ' kg)</option>';
    });

    var body =
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Lô nguồn cần tách</label>' +
        '<select class="agri-form-select" id="split-src">' + lotOpts + '</select>' +
      '</div>' +
      '<div id="split-info" class="agri-lot-info" style="display:none"></div>' +
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Các lô con (ít nhất 2)</label>' +
        '<div id="split-list">' +
          splitItemHtml(1) + splitItemHtml(2) +
        '</div>' +
        '<button class="agri-btn-add" id="split-add">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          ' Thêm lô con' +
        '</button>' +
      '</div>' +
      '<div id="split-bal" class="agri-balance ok" style="display:none"></div>' +
      '<div class="agri-form-group" style="margin-top:16px">' +
        '<label class="agri-form-label">Ghi chú</label>' +
        '<textarea class="agri-form-textarea" id="split-note" rows="2" placeholder="Không bắt buộc"></textarea>' +
      '</div>';

    var footer =
      '<button class="btn-secondary" id="split-cancel">Hủy bỏ</button>' +
      '<button class="btn-primary" id="split-submit">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        ' <span>Xác nhận tách lô</span>' +
      '</button>';

    var ov = openModal('Tách Lô — Chia lô lớn thành nhiều lô nhỏ', body, footer);
    bindSplitEvents(ov);
  }

  function splitItemHtml(n) {
    return '<div class="agri-dyn-item">' +
      '<span style="font-weight:700;color:#107548;min-width:18px">' + n + '</span>' +
      '<input type="text" class="sp-code" placeholder="Mã lô con (VD: LOT-A)" style="flex:1">' +
      '<input type="number" class="sp-qty" placeholder="KL (kg)" style="width:130px" min="0" step="0.01">' +
      '<button class="agri-btn-remove" title="Xóa">✕</button>' +
    '</div>';
  }

  function bindSplitEvents(ov) {
    var srcSelect = ov.querySelector('#split-src');
    var infoBox   = ov.querySelector('#split-info');
    var list      = ov.querySelector('#split-list');
    var addBtn    = ov.querySelector('#split-add');
    var balDiv    = ov.querySelector('#split-bal');
    var cancelBtn = ov.querySelector('#split-cancel');
    var submitBtn = ov.querySelector('#split-submit');

    /* Source lot change → show info */
    srcSelect.addEventListener('change', function () {
      var opt = srcSelect.options[srcSelect.selectedIndex];
      if (srcSelect.value) {
        infoBox.innerHTML = '<strong>' + opt.dataset.code + '</strong> — ' +
          opt.dataset.goods + ' • ' + (opt.dataset.farmer || 'Không rõ nông dân') +
          ' • <strong>' + fmtNum(opt.dataset.qty) + ' kg</strong>';
        infoBox.style.display = 'block';
      } else {
        infoBox.style.display = 'none';
      }
      recalcSplit();
    });

    /* Add row */
    addBtn.addEventListener('click', function () {
      var count = list.querySelectorAll('.agri-dyn-item').length + 1;
      var tmp = document.createElement('div');
      tmp.innerHTML = splitItemHtml(count);
      var item = tmp.firstChild;
      list.appendChild(item);
    });

    /* Delegate: remove row + qty input */
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.agri-btn-remove')) {
        var item = e.target.closest('.agri-dyn-item');
        if (item) { item.remove(); renumber(list); recalcSplit(); }
      }
    });

    ov.addEventListener('input', function (e) {
      if (e.target.classList.contains('sp-qty')) recalcSplit();
    });

    /* Cancel */
    cancelBtn.addEventListener('click', closeModal);

    /* Recalc mass balance */
    function recalcSplit() {
      if (!srcSelect.value) { balDiv.style.display = 'none'; return; }
      var srcQty = parseFloat(srcSelect.options[srcSelect.selectedIndex].dataset.qty) || 0;
      var total  = 0;
      ov.querySelectorAll('.sp-qty').forEach(function (inp) { total += parseFloat(inp.value) || 0; });

      var ok = total <= srcQty * 1.015;
      balDiv.style.display = 'flex';
      balDiv.className = 'agri-balance ' + (ok ? 'ok' : 'bad');

      var icon = ok
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      balDiv.innerHTML = icon + ' <span>Cân bằng: ' + fmtNum(total) + ' / ' + fmtNum(srcQty) + ' kg ' +
        (ok ? '✓ Hợp lệ' : '— Vượt dung sai ±1.5%') + '</span>';
    }

    /* SUBMIT */
    submitBtn.addEventListener('click', async function () {
      if (!srcSelect.value) { showToast('Vui lòng chọn lô nguồn.', 'error'); return; }

      var codes = ov.querySelectorAll('.sp-code');
      var qtys  = ov.querySelectorAll('.sp-qty');
      var outputs = [];

      for (var i = 0; i < codes.length; i++) {
        var code = codes[i].value.trim();
        var qty  = parseFloat(qtys[i].value);
        if (!code) { showToast('Vui lòng nhập mã lô con #' + (i + 1) + '.', 'error'); return; }
        if (!qty || qty <= 0) { showToast('Khối lượng lô con #' + (i + 1) + ' phải > 0.', 'error'); return; }
        outputs.push({ lot_code: code, quantity: qty });
      }

      if (outputs.length < 2) { showToast('Cần ít nhất 2 lô con để tách.', 'error'); return; }

      var note = ov.querySelector('#split-note').value.trim();

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="agri-spinner"></span> Đang xử lý…';

      try {
        var result = await apiSplitLot({
          input_lot_id: srcSelect.value,
          note: note || undefined,
          outputs: outputs
        });

        showToast('Tách lô thành công! Đã tạo ' + result.created_lots.length + ' lô con.', 'success');
        closeModal();
        updateSplitCard(srcSelect.options[srcSelect.selectedIndex], outputs, result);
        await loadData();

      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Xác nhận tách lô</span>';
      }
    });
  }

  /* ================================================================
     BLEND MODAL  (Gộp lô)
     ================================================================ */
  function openBlendModal() {
    var goodsOpts = '<option value="">— Chọn hàng hóa —</option>';
    goodsList.forEach(function (g) {
      goodsOpts += '<option value="' + g.goods_id + '">' + g.goods_name + (g.goods_code ? ' (' + g.goods_code + ')' : '') + '</option>';
    });

    var body =
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Các lô nguồn (ít nhất 2)</label>' +
        '<div id="blend-list">' +
          blendItemHtml(1) + blendItemHtml(2) +
        '</div>' +
        '<button class="agri-btn-add" id="blend-add">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          ' Thêm lô nguồn' +
        '</button>' +
      '</div>' +
      '<div id="blend-total" style="margin:12px 0;font-size:.88rem;font-weight:700;color:#107548;display:none"></div>' +
      '<hr style="border:none;border-top:1px solid #e5ece7;margin:16px 0">' +
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Mã lô đích (lô kết quả gộp)</label>' +
        '<input type="text" class="agri-form-input" id="blend-outcode" placeholder="VD: EXP-CFE-0926-006">' +
      '</div>' +
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Hàng hóa đích</label>' +
        '<select class="agri-form-select" id="blend-goods">' + goodsOpts + '</select>' +
      '</div>' +
      '<div class="agri-form-group">' +
        '<label class="agri-form-label">Ghi chú</label>' +
        '<textarea class="agri-form-textarea" id="blend-note" rows="2" placeholder="Không bắt buộc"></textarea>' +
      '</div>';

    var footer =
      '<button class="btn-secondary" id="blend-cancel">Hủy bỏ</button>' +
      '<button class="btn-primary" id="blend-submit">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        ' <span>Xác nhận gộp lô</span>' +
      '</button>';

    var ov = openModal('Gộp Lô — Gộp nhiều lô thành 1 lô mới', body, footer);
    bindBlendEvents(ov);
  }

  function blendItemHtml(n) {
    var lotOpts = '<option value="">— Chọn lô —</option>';
    lots.forEach(function (l) {
      lotOpts += '<option value="' + l.lot_id + '" data-code="' + l.lot_code + '">' +
        l.lot_code + ' — ' + (l.goods_name || 'N/A') + ' (' + fmtNum(l.quantity) + ' kg)</option>';
    });

    return '<div class="agri-dyn-item">' +
      '<span style="font-weight:700;color:#b45309;min-width:18px">' + n + '</span>' +
      '<select class="bl-lot" style="flex:1">' + lotOpts + '</select>' +
      '<input type="number" class="bl-qty" placeholder="KL (kg)" style="width:130px" min="0" step="0.01">' +
      '<button class="agri-btn-remove" title="Xóa">✕</button>' +
    '</div>';
  }

  function bindBlendEvents(ov) {
    var list      = ov.querySelector('#blend-list');
    var addBtn    = ov.querySelector('#blend-add');
    var totalDiv  = ov.querySelector('#blend-total');
    var cancelBtn = ov.querySelector('#blend-cancel');
    var submitBtn = ov.querySelector('#blend-submit');

    /* Add row */
    addBtn.addEventListener('click', function () {
      var count = list.querySelectorAll('.agri-dyn-item').length + 1;
      var tmp = document.createElement('div');
      tmp.innerHTML = blendItemHtml(count);
      list.appendChild(tmp.firstChild);
    });

    /* Delegate: remove + qty change */
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.agri-btn-remove')) {
        var item = e.target.closest('.agri-dyn-item');
        if (item) { item.remove(); renumber(list); recalcBlend(); }
      }
    });

    ov.addEventListener('input', function (e) {
      if (e.target.classList.contains('bl-qty')) recalcBlend();
    });

    cancelBtn.addEventListener('click', closeModal);

    function recalcBlend() {
      var total = 0;
      ov.querySelectorAll('.bl-qty').forEach(function (inp) { total += parseFloat(inp.value) || 0; });
      if (total > 0) {
        totalDiv.style.display = 'block';
        totalDiv.innerHTML = '📦 Tổng khối lượng gộp: <strong>' + fmtNum(total) + ' kg</strong>';
      } else {
        totalDiv.style.display = 'none';
      }
    }

    /* SUBMIT */
    submitBtn.addEventListener('click', async function () {
      var selects = ov.querySelectorAll('.bl-lot');
      var qtys    = ov.querySelectorAll('.bl-qty');
      var inputs  = [];

      for (var i = 0; i < selects.length; i++) {
        var lotId = selects[i].value;
        var qty   = parseFloat(qtys[i].value);
        if (!lotId) { showToast('Vui lòng chọn lô nguồn #' + (i + 1) + '.', 'error'); return; }
        if (!qty || qty <= 0) { showToast('Khối lượng lô nguồn #' + (i + 1) + ' phải > 0.', 'error'); return; }
        inputs.push({ lot_id: lotId, quantity: qty });
      }

      if (inputs.length < 2) { showToast('Cần ít nhất 2 lô nguồn để gộp.', 'error'); return; }

      var outCode = ov.querySelector('#blend-outcode').value.trim();
      var goodsId = ov.querySelector('#blend-goods').value;
      var note    = ov.querySelector('#blend-note').value.trim();

      if (!outCode) { showToast('Vui lòng nhập mã lô đích.', 'error'); return; }
      if (!goodsId) { showToast('Vui lòng chọn hàng hóa đích.', 'error'); return; }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="agri-spinner"></span> Đang xử lý…';

      try {
        var result = await apiBlendLots({
          output_lot_code: outCode,
          output_goods_id: goodsId,
          note: note || undefined,
          input_lots: inputs
        });

        showToast('Gộp lô thành công! Lô mới: ' + result.output_lot.lot_code, 'success');
        closeModal();
        updateBlendCard(inputs, result);
        await loadData();

      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Xác nhận gộp lô</span>';
      }
    });
  }

  /* ================================================================
     UPDATE PAGE CARDS AFTER OPERATIONS
     ================================================================ */
  function updateSplitCard(srcOpt, outputs, result) {
    var wrapper = document.querySelectorAll('.batch-box-wrapper')[0];
    if (!wrapper) return;

    var srcCode   = srcOpt.dataset.code;
    var srcQty    = parseFloat(srcOpt.dataset.qty);
    var srcGoods  = srcOpt.dataset.goods;
    var srcFarmer = srcOpt.dataset.farmer;

    var childrenHtml = '';
    var colors = ['progress-fill-green', 'progress-fill-orange', 'progress-fill-blue',
                  'progress-fill-green', 'progress-fill-orange'];

    result.created_lots.forEach(function (lot, i) {
      var output  = outputs[i];
      var pct     = ((output.quantity / srcQty) * 100).toFixed(0);
      childrenHtml +=
        '<div class="plan-item-bar">' +
          '<div class="plan-item-header">' +
            '<div><span style="font-weight:700">' + lot.lot_code + '</span>' +
              '<span style="font-size:.78rem;color:var(--text-secondary);margin-left:6px">Lô con #' + (i + 1) + '</span></div>' +
            '<span class="plan-weight-bold">' + fmtNum(output.quantity) + ' kg • ' + pct + '%</span>' +
          '</div>' +
          '<div class="custom-progress"><div class="' + (colors[i] || 'progress-fill-green') + '" style="width:' + pct + '%;height:100%"></div></div>' +
        '</div>';
    });

    var totalOutput = outputs.reduce(function (s, o) { return s + o.quantity; }, 0);

    wrapper.innerHTML =
      '<div class="card-title-row" style="margin-bottom:0">' +
        '<div><h2 class="card-title">✅ Tách lô thành công</h2>' +
        '<span style="font-size:.8rem;color:var(--text-secondary)">Kết quả vừa thực hiện</span></div>' +
      '</div>' +
      '<div class="source-batch-banner">' +
        '<div><span class="kpi-label">Lô nguồn</span>' +
          '<div class="source-code">' + srcCode + '</div>' +
          '<div class="source-meta">' + srcGoods + ' • ' + (srcFarmer || '') + '</div></div>' +
        '<div class="source-total-weight">' + fmtNum(srcQty) + ' kg</div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:.84rem">' +
          '<strong>Kết quả tách</strong>' +
          '<span style="color:var(--text-muted)">' + result.created_lots.length + ' lô con</span>' +
        '</div>' + childrenHtml +
      '</div>' +
      '<div class="balance-check-alert">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        '<span>Cân bằng: <strong>' + fmtNum(srcQty) + ' = ' + outputs.map(function (o) { return fmtNum(o.quantity); }).join(' + ') + ' kg</strong></span>' +
      '</div>';

    /* Update traceability */
    updateTraceabilitySplit(srcCode, result.created_lots);
  }

  function updateBlendCard(inputs, result) {
    var wrapper = document.querySelectorAll('.batch-box-wrapper')[1];
    if (!wrapper) return;

    var totalQty   = inputs.reduce(function (s, inp) { return s + inp.quantity; }, 0);
    var outLot     = result.output_lot;

    /* Tìm tên lô từ danh sách lots */
    var srcListHtml = '';
    inputs.forEach(function (inp, i) {
      var found = lots.find(function (l) { return l.lot_id === inp.lot_id; });
      var code  = found ? found.lot_code : inp.lot_id;
      var info  = found ? (found.farmer_name || found.goods_name || '') : '';
      srcListHtml +=
        '<div class="source-batch-entry">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div class="entry-index-badge">' + (i + 1) + '</div>' +
            '<div>' +
              '<div style="font-weight:700;font-size:.88rem">' + code + '</div>' +
              '<div style="font-size:.74rem;color:var(--text-secondary)">' + info + '</div>' +
            '</div>' +
          '</div>' +
          '<strong style="font-size:.95rem">' + fmtNum(inp.quantity) + ' kg</strong>' +
        '</div>';
    });

    wrapper.innerHTML =
      '<div class="card-title-row" style="margin-bottom:0">' +
        '<div><h2 class="card-title">✅ Gộp lô thành công</h2>' +
        '<span style="font-size:.8rem;color:var(--text-secondary)">Kết quả vừa thực hiện</span></div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.84rem">' +
          '<strong>Các lô nguồn</strong>' +
          '<span style="color:var(--text-muted)">' + inputs.length + ' lô • ' + fmtNum(totalQty) + ' kg</span>' +
        '</div>' +
        '<div class="source-batches-list">' + srcListHtml + '</div>' +
      '</div>' +
      '<div class="target-batch-banner">' +
        '<div><span class="kpi-label" style="color:#b45309">LÔ ĐÍCH MỚI</span>' +
          '<div style="font-size:1.15rem;font-weight:800;color:#78350f">' + outLot.lot_code + '</div>' +
          '<div style="font-size:.78rem;color:#92400e">Trạng thái: ' + outLot.status + '</div></div>' +
        '<div style="font-size:1.5rem;font-weight:800;color:#b45309">' + fmtNum(totalQty) + ' kg</div>' +
      '</div>';

    /* Update traceability */
    var srcCodes = inputs.map(function (inp) {
      var found = lots.find(function (l) { return l.lot_id === inp.lot_id; });
      return found ? found.lot_code : 'Lô';
    });
    updateTraceabilityBlend(srcCodes, outLot.lot_code);
  }

  /* ================================================================
     UPDATE TRACEABILITY FLOW
     ================================================================ */
  function updateTraceabilitySplit(srcCode, childLots) {
    var section = document.querySelector('.traceability-flow-card');
    if (!section) return;

    var nodesHtml = '<div class="trace-node">' + srcCode + '</div>';
    nodesHtml += '<div class="trace-arrow">→</div>';
    nodesHtml += '<div class="trace-node">Tách lô</div>';
    nodesHtml += '<div class="trace-arrow">→</div>';
    childLots.forEach(function (lot, i) {
      nodesHtml += '<div class="trace-node' + (i === 0 ? ' trace-node-highlight' : '') + '">' + lot.lot_code + '</div>';
      if (i < childLots.length - 1) nodesHtml += '<div class="trace-arrow">•</div>';
    });

    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<h2 class="card-title">Chuỗi truy xuất sau tách lô</h2>' +
        '<span style="font-size:.8rem;color:var(--text-muted)">Phả hệ được bảo toàn</span>' +
      '</div>' +
      '<div class="trace-flow-row">' + nodesHtml + '</div>';
  }

  function updateTraceabilityBlend(srcCodes, outCode) {
    var section = document.querySelector('.traceability-flow-card');
    if (!section) return;

    var nodesHtml = '<div class="trace-node">' + srcCodes.length + ' lô nguồn</div>';
    nodesHtml += '<div class="trace-arrow">→</div>';
    srcCodes.forEach(function (code) {
      nodesHtml += '<div class="trace-node">' + code + '</div>';
    });
    nodesHtml += '<div class="trace-arrow">→</div>';
    nodesHtml += '<div class="trace-node">Kiểm nghiệm</div>';
    nodesHtml += '<div class="trace-arrow">→</div>';
    nodesHtml += '<div class="trace-node trace-node-highlight">' + outCode + '</div>';

    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<h2 class="card-title">Chuỗi truy xuất sau gộp lô</h2>' +
        '<span style="font-size:.8rem;color:var(--text-muted)">Mọi lô nguồn được bảo toàn</span>' +
      '</div>' +
      '<div class="trace-flow-row">' + nodesHtml + '</div>';
  }

  /* ================================================================
     UTILITY
     ================================================================ */
  function renumber(container) {
    container.querySelectorAll('.agri-dyn-item').forEach(function (item, i) {
      var span = item.querySelector('span');
      if (span) span.textContent = i + 1;
    });
  }

})();
