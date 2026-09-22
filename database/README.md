# ĐẶC TẢ CƠ SỞ DỮ LIỆU (DATABASE SPECIFICATION)

**Hệ thống:** Quản lý Chuỗi cung ứng / Thu mua & Vận chuyển Nông sản  
**Hệ quản trị CSDL:** PostgreSQL 13+ (Hỗ trợ Extensions: `uuid-ossp`, `pgcrypto`, `postgis`)  

---

## I. TỔNG QUAN HỆ THỐNG & QUY TẮC THIẾT KẾ

### 1. Quy tắc đặt tên và Kiểu dữ liệu
* **Khóa chính (PK):** Sử dụng `UUID` tự động sinh bằng `uuid_generate_v4()`.
* **Khóa ngoại (FK):** Tham chiếu đến khóa chính tương ứng, thiết lập ràng buộc xóa (`ON DELETE SET NULL` hoặc `ON DELETE CASCADE`).
* **Thời gian (Timestamp):** Toàn bộ trường chứa mốc thời gian dùng `TIMESTAMP WITH TIME ZONE` (`TIMESTAMPTZ`) để hỗ trợ đa múi giờ. Tất cả các bảng chính đều có trigger tự động cập nhật trường `updated_at`.
* **Phân quyền người dùng:** Được lưu trực tiếp dưới dạng cột `role_code` trong bảng `system_user` với ràng buộc CHECK (`MANAGER`, `RECEIVING_STAFF`, `PROCESSING_STAFF`, `DISPATCH_STAFF`, `DRIVER`).

---

## II. CHI TIẾT CÁC BẢNG DỮ LIỆU (DATABASE TABLES)

### 1. Nhóm Bảng Tài khoản người dùng

#### 1.1. Bảng `system_user` (Người dùng Hệ thống)
* **Mô tả:** Lưu trữ tài khoản đăng nhập và thông tin cá nhân của người dùng.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh người dùng |
| `username` | VARCHAR(50) | **UNIQUE**, NOT NULL | Tên đăng nhập |
| `password_hash` | VARCHAR(255) | NOT NULL | Mật khẩu đã mã hóa |
| `full_name` | VARCHAR(100) | NOT NULL | Họ và tên |
| `role_code` | VARCHAR(30) | NOT NULL, CHECK | Mã vai trò (`MANAGER`, `RECEIVING_STAFF`, `PROCESSING_STAFF`, `DISPATCH_STAFF`, `DRIVER`) |
| `phone` | VARCHAR(20) | NULL | Số điện thoại |
| `status` | VARCHAR(20) | CHECK (`active`, `locked`), DEFAULT `'active'` | Trạng thái tài khoản |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

---

### 2. Nhóm Bảng Danh mục Thực thể (Master Data)

#### 2.1. Bảng `goods` (Danh mục Hàng hóa)
* **Mô tả:** Danh mục các mặt hàng/nông sản được xử lý trong hệ thống.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `goods_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Mã định danh sản phẩm |
| `goods_code` | VARCHAR(50) | **UNIQUE**, NULL | Mã hiển thị/Mã SKUs |
| `goods_name` | VARCHAR(100) | NOT NULL | Tên mặt hàng |
| `unit` | VARCHAR(20) | NULL | Đơn vị tính (Kg, Tấn, Thùng,...) |
| `category` | VARCHAR(50) | NULL | Phân loại nông sản |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 2.2. Bảng `farmer` (Thông tin Nông dân)
* **Mô tả:** Thông tin hộ/đối tác cung cấp hàng hóa đầu vào.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `farmer_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh nông dân |
| `full_name` | VARCHAR(100) | NOT NULL | Họ tên nông dân |
| `phone` | VARCHAR(20) | NULL | Số điện thoại liên hệ |
| `address` | TEXT | NULL | Địa chỉ vườn/trại |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian khởi tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 2.3. Bảng `driver` (Thông tin Tài xế)
* **Mô tả:** Thông tin tài xế thực hiện nhiệm vụ vận chuyển.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `driver_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh tài xế |
| `user_id` | UUID | **FK** (`system_user.user_id`), **UNIQUE**, NULL | Tài khoản hệ thống liên kết |
| `full_name` | VARCHAR(100) | NOT NULL | Họ và tên tài xế |
| `phone` | VARCHAR(20) | NULL | Số điện thoại liên lạc |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian khởi tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 2.4. Bảng `vehicle` (Phương tiện Vận chuyển)
* **Mô tả:** Quản lý thông tin xe tải / phương tiện giao hàng.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `vehicle_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh xe |
| `driver_id` | UUID | **FK** (`driver.driver_id`), **UNIQUE**, NOT NULL | Tài xế phụ trách trực tiếp |
| `license_plate` | VARCHAR(20) | **UNIQUE**, NOT NULL | Biển kiểm soát |
| `vehicle_type` | VARCHAR(50) | NULL | Loại xe (Xe đông lạnh, Xe tải,...) |
| `capacity` | NUMERIC(10,2)| NULL | Tải trọng tối đa (Tấn) |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian khởi tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

---

### 3. Nhóm Bảng Quy trình Xử lý & Truy xuất Nguồn gốc (Process & Traceability)

#### 3.1. Bảng `intake` (Phiếu Tiếp nhận / Thu mua)
* **Mô tả:** Ghi nhận thông tin hàng hóa nhập vào từ nông dân.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `intake_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh phiếu tiếp nhận |
| `goods_id` | UUID | **FK** (`goods.goods_id`), NOT NULL | Loại hàng hóa nhập |
| `farmer_id` | UUID | **FK** (`farmer.farmer_id`), NULL | Nông dân cung cấp |
| `received_by` | UUID | **FK** (`system_user.user_id`), NULL | Nhân viên tiếp nhận |
| `intake_date` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian tiếp nhận |
| `status` | VARCHAR(30) | CHECK (`received`, `processing`, `completed`, `cancelled`) | Trạng thái phiếu |
| `quantity` | NUMERIC(10,2)| NOT NULL, CHECK (`quantity > 0`) | Số lượng nhập |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian khởi tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 3.2. Bảng `lot` (Quản lý Lô hàng Truy xuất)
* **Mô tả:** Mã hóa thông tin lô hàng phục vụ việc quét QR / Truy xuất nguồn gốc (Quan hệ 1-1 với `intake`).
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `lot_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh lô |
| `lot_code` | VARCHAR(50) | **UNIQUE**, NOT NULL | Mã định danh lô (Gắn trên QR) |
| `intake_id` | UUID | **FK** (`intake.intake_id`), **UNIQUE**, NOT NULL | Phiếu tiếp nhận tương ứng |
| `goods_id` | UUID | **FK** (`goods.goods_id`), NOT NULL | Sản phẩm |
| `farmer_id` | UUID | **FK** (`farmer.farmer_id`), NULL | Nông dân gốc |
| `status` | VARCHAR(30) | CHECK (`active`, `processed`, `shipped`, `delivered`, `closed`) | Trạng thái vòng đời lô |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian tạo lô |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 3.3. Bảng `processing` (Công đoạn Sơ chế)
* **Mô tả:** Ghi nhận hoạt động sơ chế, đóng gói hàng hóa trước khi phân phối.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `processing_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh công đoạn sơ chế |
| `intake_id` | UUID | **FK** (`intake.intake_id`), NOT NULL | Phiếu thu mua gốc |
| `lot_id` | UUID | **FK** (`lot.lot_id`), NOT NULL | Mã lô tương ứng |
| `processed_by` | UUID | **FK** (`system_user.user_id`), NULL | Nhân viên sơ chế |
| `processing_date`| TIMESTAMPTZ | DEFAULT `now()` | Thời điểm bắt đầu sơ chế |
| `processing_type`| VARCHAR(50) | NULL | Loại sơ chế (Phân loại, Đóng gói,...) |
| `processed_quantity`| NUMERIC(10,2)| NOT NULL, CHECK (`>= 0`) | Số lượng đầu ra sau sơ chế |
| `status` | VARCHAR(30) | CHECK (`in_progress`, `completed`, `failed`) | Trạng thái xử lý |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

#### 3.4. Bảng `waybill` (Vận đơn / Điều phối)
* **Mô tả:** Quản lý thông tin vận chuyển lô hàng đã qua sơ chế.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `waybill_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh vận đơn |
| `processing_id` | UUID | **FK** (`processing.processing_id`), NOT NULL| Công đoạn sơ chế gốc |
| `lot_id` | UUID | **FK** (`lot.lot_id`), NOT NULL | Lô hàng vận chuyển |
| `vehicle_id` | UUID | **FK** (`vehicle.vehicle_id`), NOT NULL | Xe vận chuyển |
| `created_by` | UUID | **FK** (`system_user.user_id`), NULL | Nhân viên điều phối |
| `status` | VARCHAR(30) | CHECK (`assigned`, `in_transit`, `delivered`, `cancelled`) | Trạng thái vận đơn |
| `origin` | TEXT | NULL | Điểm đi |
| `destination` | TEXT | NULL | Điểm đến |
| `shipping_date` | TIMESTAMPTZ | DEFAULT `now()` | Thời điểm xuất phát |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian lập đơn |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |

---

### 4. Nhóm Bảng Giám sát & Báo cáo (Tracking & Reporting)

#### 4.1. Bảng `shipment_tracking` (Lịch trình Vận chuyển)
* **Mô tả:** Nhật ký vị trí và trạng thái chi tiết của chuyến xe theo thời gian thực.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `tracking_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh bản ghi vết |
| `waybill_id` | UUID | **FK** (`waybill.waybill_id`), NOT NULL | Thuộc vận đơn |
| `updated_by` | UUID | **FK** (`system_user.user_id`), NULL | Người cập nhật |
| `status` | VARCHAR(50) | NOT NULL | Trạng thái cập nhật |
| `current_location`| TEXT | NULL | Tên địa danh/Địa chỉ |
| `location_point` | GEOMETRY(Point, 4326) | NULL | Tọa độ GPS (Kinh độ, Vĩ độ) |
| `update_time` | TIMESTAMPTZ | DEFAULT `now()` | Mốc thời gian cập nhật |
| `note` | TEXT | NULL | Ghi chú thêm |

#### 4.2. Bảng `delivery_confirmation` (Xác nhận Giao hàng)
* **Mô tả:** Chứng từ bàn giao hàng hóa thành công giữa tài xế và người nhận.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `confirmation_id`| UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh xác nhận |
| `waybill_id` | UUID | **FK** (`waybill.waybill_id`), **UNIQUE**, NOT NULL | Vận đơn hoàn thành |
| `driver_id` | UUID | **FK** (`driver.driver_id`), NOT NULL | Tài xế bàn giao |
| `recipient_name` | VARCHAR(100) | NOT NULL | Tên người nhận |
| `recipient_phone`| VARCHAR(20) | NULL | SĐT người nhận |
| `delivered_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời điểm giao thành công |
| `proof_image_url`| VARCHAR(500) | NULL | Ảnh chụp chữ ký/hóa đơn xác nhận |
| `notes` | TEXT | NULL | Ghi chú từ người nhận |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian lưu |

#### 4.3. Bảng `daily_report` (Báo cáo Tổng hợp Ngày)
* **Mô tả:** Thống kê các chỉ số kinh doanh/vận hành quan trọng gom nhóm theo ngày.
* **Cấu trúc:**

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `report_id` | UUID | **PK**, DEFAULT `uuid_generate_v4()` | Định danh báo cáo |
| `report_date` | DATE | **UNIQUE**, NOT NULL | Ngày báo cáo |
| `total_intake_qty`| NUMERIC(10,2)| DEFAULT `0` | Tổng khối lượng thu mua |
| `total_processed_qty`| NUMERIC(10,2)| DEFAULT `0` | Tổng khối lượng đã sơ chế |
| `total_shipments`| INTEGER | DEFAULT `0` | Tổng số chuyến vận chuyển |
| `created_by` | UUID | **FK** (`system_user.user_id`), NULL | Người chốt báo cáo |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian lập |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()` | Thời gian cập nhật |