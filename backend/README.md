# Backend PostgreSQL – Phân hệ Tiếp nhận / Sơ chế / Gộp-Tách Lô / Vận chuyển

Stack: **Python + Flask + PostgreSQL** (`psycopg2`). Đã test chạy được thật với
`psycopg2-binary` trên Python 3.14 (Windows) — xem `database/README.md` để biết
chi tiết schema.

## 1. Cấu trúc thư mục

```
Agritrace_Platform_Group_1/
├── database/
│   ├── schema.sql         # Toàn bộ DDL: bảng gốc + 3 bảng Gộp/Tách Lô
│   └── README.md          # Đặc tả từng bảng, sơ đồ quan hệ
├── backend/
│   ├── config.py          # Đọc biến môi trường (.env)
│   ├── db.py               # Connection pool psycopg2 + helper query
│   ├── auth.py              # Đăng ký / Đăng nhập / JWT / decorator phân quyền
│   ├── app.py                # Khởi tạo Flask app, đăng ký blueprint
│   ├── routes/
│   │   ├── master_data.py    # CRUD: goods, farmer, driver, vehicle
│   │   ├── intake.py          # Tiếp nhận hàng (intake + tạo lot)
│   │   ├── processing.py      # Sơ chế + Gộp lô (BLEND) + Tách lô (SPLIT)
│   │   ├── transport.py        # Vận đơn, theo dõi hành trình, xác nhận giao hàng
│   │   └── reports.py           # Báo cáo tổng hợp theo ngày
│   ├── requirements.txt
│   └── README.md (file này)
├── frontend/               # (đang phát triển)
├── .env.example            # Mẫu biến môi trường — copy thành .env
└── .gitignore
```

## 2. Cài đặt

```bash
# 1. Tạo database PostgreSQL (không cần PostGIS)
createdb agritrace
psql agritrace -f database/schema.sql

# 2. Cài thư viện Python
cd backend
pip install -r requirements.txt

# 3. Cấu hình — .env.example nằm ở thư mục gốc dự án
cp ../.env.example ../.env
# sửa .env cho đúng thông tin PostgreSQL của máy bạn (PGPASSWORD bắt buộc phải điền,
# app sẽ báo lỗi RuntimeError ngay khi khởi động nếu thiếu)

# 4. Chạy
python3 app.py
```

Server chạy tại `http://localhost:5000`. Kiểm tra nhanh: `curl http://localhost:5000/api/health`.

## 3. Xác thực (auth.py)

Toàn bộ API nghiệp vụ (trừ `/api/auth/register`, `/api/auth/login`, `/api/health`) yêu cầu
header:
```
Authorization: Bearer <access_token>
```

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký: `{username, password, full_name, role_code, phone?}` |
| POST | `/api/auth/login` | Đăng nhập: `{username, password}` → trả `access_token` |
| GET | `/api/auth/me` | Thông tin tài khoản đang đăng nhập |

`role_code` hợp lệ: `MANAGER`, `RECEIVING_STAFF`, `PROCESSING_STAFF`, `DISPATCH_STAFF`, `DRIVER`.
Đăng ký với `role_code = DRIVER` sẽ tự động tạo luôn hồ sơ trong bảng `driver`.

M��t khẩu được hash bằng `werkzeug.security` (PBKDF2/scrypt, có sẵn trong Flask — không cần
cài `bcrypt` riêng). Token là JWT (`PyJWT`), hết hạn sau `JWT_EXPIRE_MINUTES` (mặc định 8 giờ).

M��i route dùng 2 decorator:
```python
@login_required                      # bắt buộc đăng nhập
@role_required("MANAGER", "DRIVER")  # chỉ các role này được gọi
```

## 4. Danh sách API theo từng module

### Danh mục (routes/master_data.py) — xem: mọi role; sửa/xóa: MANAGER
- `GET/POST /api/goods`, `GET/PUT/DELETE /api/goods/<id>`
- `GET/POST /api/farmers`, `GET/PUT/DELETE /api/farmers/<id>`
- `GET/POST /api/drivers`, `GET /api/drivers/<id>`, `PUT /api/drivers/<id>/vehicle`

### Tiếp nhận (routes/intake.py) — MANAGER, RECEIVING_STAFF
- `POST /api/intakes` — tạo phiếu tiếp nhận **và** lô mới cùng lúc
- `GET /api/intakes` (lọc `?status=`), `GET /api/intakes/<id>`
- `PATCH /api/intakes/<id>/status`

### Sơ chế & Gộp/Tách Lô (routes/processing.py) — MANAGER, PROCESSING_STAFF
- `POST/GET /api/processing` — sơ chế 1 lô đơn lẻ
- `POST /api/lot-operations/blend` — **Gộp N lô → 1 lô mới**, tự ghi phả hệ
- `POST /api/lot-operations/split` — **Tách 1 lô → M lô**, kiểm tra Mass Balance ±1.5%
- `GET /api/lots/<id>/genealogy` — truy vết phả hệ 2 chiều của 1 lô

### Vận chuyển (routes/transport.py) — MANAGER, DISPATCH_STAFF, DRIVER
- `POST/GET /api/waybills`, `GET /api/waybills/<id>`
- `PATCH /api/waybills/<id>/status` — tài xế chỉ sửa được vận đơn của mình
- `POST/GET /api/waybills/<id>/tracking` — ghi nhận vị trí/trạm dừng (dạng text)
- `POST /api/waybills/<id>/delivery-confirmation` — xác nhận giao hàng

### Báo cáo (routes/reports.py) — MANAGER
- `POST /api/reports/daily/generate` — tổng hợp số liệu 1 ngày
- `GET /api/reports/daily`, `GET /api/reports/daily/<date>`

## 5. Luồng demo gợi ý (curl)

```bash
# 1. Đăng ký quản lý
curl -X POST localhost:5000/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"manager1","password":"123456","full_name":"Nguyen Van Quan","role_code":"MANAGER"}'

# 2. Đăng nhập lấy token
TOKEN=$(curl -s -X POST localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"manager1","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 3. Tạo hàng hóa
curl -X POST localhost:5000/api/goods -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"goods_name":"Ca phe tuoi","unit":"kg"}'

# 4. Tiếp nhận hàng (thay goods_id lấy từ bước 3)
curl -X POST localhost:5000/api/intakes -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"goods_id":"<uuid>","quantity":200}'

# 5. Gộp 2 lô (thay lot_id thật)
curl -X POST localhost:5000/api/lot-operations/blend -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"output_lot_code":"LOT-BLEND-001","output_goods_id":"<uuid>","input_lots":[{"lot_id":"<uuid1>","quantity":200},{"lot_id":"<uuid2>","quantity":300}]}'
```

## 6. Điểm cần lưu ý khi triển khai thật

1. Không dùng PostGIS — `shipment_tracking.current_location` là TEXT thường. Nếu sau này
   cần tọa độ GPS chính xác để vẽ bản đồ, thêm 2 cột `latitude`/`longitude` kiểu `NUMERIC`
   là đủ, không cần cài thêm extension.
2. `JWT_SECRET` và `PGPASSWORD` trong `.env` **phải tự điền, không có giá trị mặc định**
   trong code — app sẽ báo lỗi ngay khi khởi động nếu thiếu `PGPASSWORD`, để tránh
   commit nhầm mật khẩu thật lên git.
3. Chưa có refresh token / logout blacklist — token chỉ hết hạn theo thời gian
   (`JWT_EXPIRE_MINUTES`). Nếu cần thu hồi token sớm, cần thêm bảng lưu token đã revoke.
4. View `lot_genealogy_view` tính đúng % cho gộp thuần N-to-1 hoặc tách thuần 1-to-M;
   trường hợp gộp rồi tách lẫn lộn (N-to-M) trong cùng 1 lần thao tác chưa được hỗ trợ.
5. **Trước khi push code**: đảm bảo `.venv/` và `__pycache__/` không nằm trong git
   (`.gitignore` ở gốc dự án đã khai báo sẵn — nếu trước đó lỡ commit, chạy
   `git rm -r --cached .venv **/__pycache__` một lần rồi commit lại).
