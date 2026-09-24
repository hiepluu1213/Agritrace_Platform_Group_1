# ĐẶC TẢ CƠ SỞ DỮ LIỆU (DATABASE SPECIFICATION)

**Hệ thống:** Quản lý Chuỗi cung ứng / Thu mua & Vận chuyển Nông sản (AgriTrace - Phân hệ Tiếp nhận / Sơ chế / Gộp-Tách lô / Vận chuyển)  
**Hệ quản trị CSDL:** PostgreSQL 14+ (Hỗ trợ Extensions: `uuid-ossp`, `pgcrypto`)  

---

## I. TỔNG QUAN HỆ THỐNG & QUY TẮC THIẾT KẾ

### 1. Quy tắc đặt tên và Kiểu dữ liệu
* **Khóa chính (PK):** Sử dụng `UUID` tự động sinh bằng hàm `uuid_generate_v4()`.
* **Khóa ngoại (FK):** Tham chiếu đến khóa chính tương ứng, thiết lập ràng buộc xóa (`ON DELETE SET NULL` hoặc `ON DELETE CASCADE`) để đảm bảo tính toàn vẹn dữ liệu.
* **Thời gian (Timestamp):** Toàn bộ trường chứa mốc thời gian dùng `TIMESTAMP WITH TIME ZONE` (`TIMESTAMPTZ`) để hỗ trợ chuẩn hóa đa múi giờ. Tất cả các bảng chính đều có trigger tự động cập nhật trường `updated_at`.
* **Kiểu dữ liệu đặc thù:** Sử dụng `NUMERIC(10, 2)` cho khối lượng/sản lượng để đảm bảo độ chính xác tính toán, `VARCHAR` và `TEXT` cho dữ liệu văn bản.

---

## II. CHI TIẾT CÁC BẢNG DỮ LIỆU (DATABASE TABLES)

### 1. Nhóm Bảng Danh mục Vai trò & Phân quyền

#### 1.1. Bảng `role` (Danh mục Vai trò)
* **Mô tả:** Quản lý các nhóm quyền truy cập trong hệ thống.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `role_code` | `VARCHAR(30)` | Primary Key | Mã định danh vai trò (`MANAGER`, `RECEIVING_STAFF`, `PROCESSING_STAFF`, `DISPATCH_STAFF`, `DRIVER`) |
| `role_name` | `VARCHAR(100)` | Not Null | Tên hiển thị đầy đủ của vai trò (Quản lý, Nhân viên tiếp nhận,...) |
| `description` | `TEXT` | Nullable | Mô tả chi tiết chức năng và quyền hạn |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 1.2. Bảng `app_user` (Người dùng Hệ thống)
* **Mô tả:** Lưu trữ tài khoản đăng nhập và thông tin cá nhân của người dùng.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | Primary Key | Định danh người dùng (tự sinh UUID) |
| `username` | `VARCHAR(50)` | Unique, Not Null | Tên đăng nhập hệ thống |
| `password_hash`| `VARCHAR(255)` | Not Null | Mật khẩu đã mã hóa (hash) |
| `full_name` | `VARCHAR(100)` | Not Null | Họ và tên đầy đủ của người dùng |
| `role_code` | `VARCHAR(30)` | Foreign Key, Not Null | Tham chiếu tới `role(role_code)` |
| `phone` | `VARCHAR(20)` | Nullable | Số điện thoại liên hệ |
| `status` | `VARCHAR(20)` | Check (`active`, `locked`), Not Null | Trạng thái tài khoản (Mặc định: `'active'`) |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

---

### 2. Nhóm Bảng Danh mục Thực thể (Master Data)

#### 2.1. Bảng `goods` (Danh mục Hàng hóa)
* **Mô tả:** Danh mục các mặt hàng / nông sản được xử lý trong hệ thống.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `goods_id` | `UUID` | Primary Key | Mã định danh duy nhất của danh mục hàng hóa |
| `goods_code` | `VARCHAR(50)` | Unique, Nullable | Mã quản lý sản phẩm / hàng hóa |
| `goods_name` | `VARCHAR(100)` | Not Null | Tên sản phẩm / chủng loại nông sản |
| `unit` | `VARCHAR(20)` | Nullable | Đơn vị tính cơ sở (Kg, Tấn, Bao, Két...) |
| `category` | `VARCHAR(50)` | Nullable | Phân loại nhóm hàng hóa |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 2.2. Bảng `farmer` (Thông tin Nông dân)
* **Mô tả:** Quản lý thông tin các hộ nông dân cung cấp nông sản đầu vào.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `farmer_id` | `UUID` | Primary Key | Định danh nông dân |
| `full_name` | `VARCHAR(100)` | Not Null | Họ tên đầy đủ của nông dân |
| `phone` | `VARCHAR(20)` | Nullable | Số điện thoại liên hệ |
| `address` | `TEXT` | Nullable | Địa chỉ vườn / khu vực sản xuất |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 2.3. Bảng `driver` (Thông tin Tài xế)
* **Mô tả:** Lưu trữ thông tin tài xế phục vụ vận chuyển.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `driver_id` | `UUID` | Primary Key | Định danh tài xế |
| `user_id` | `UUID` | Foreign Key, Unique, Nullable | Liên kết 1-1 với tài khoản `app_user` |
| `full_name` | `VARCHAR(100)` | Not Null | Họ tên tài xế |
| `phone` | `VARCHAR(20)` | Nullable | Số điện thoại di động |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 2.4. Bảng `vehicle` (Phương tiện Vận chuyển)
* **Mô tả:** Quản lý xe tải và phương tiện vận chuyển hàng hóa.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `vehicle_id` | `UUID` | Primary Key | Định danh phương tiện |
| `driver_id` | `UUID` | Foreign Key, Unique, Not Null | Tài xế phụ trách phương tiện |
| `license_plate` | `VARCHAR(20)` | Unique, Not Null | Biển số xe |
| `vehicle_type` | `VARCHAR(50)` | Nullable | Loại xe (Xe tải lạnh, xe tải thường...) |
| `capacity` | `NUMERIC(10,2)`| Nullable | Tải trọng tối đa (tấn hoặc kg) |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

---

### 3. Nhóm Bảng Quy trình Xử lý & Lô hàng (Process & Traceability)

#### 3.1. Bảng `intake` (Phiếu Tiếp nhận / Thu mua)
* **Mô tả:** Ghi nhận đợt tiếp nhận nông sản từ nông dân.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `intake_id` | `UUID` | Primary Key | Định danh phiếu tiếp nhận |
| `goods_id` | `UUID` | Foreign Key, Not Null | Loại hàng hóa thu mua |
| `farmer_id` | `UUID` | Foreign Key, Nullable | Nông dân cung cấp |
| `received_by` | `UUID` | Foreign Key, Nullable | Nhân viên tiếp nhận (`app_user`) |
| `intake_date` | `TIMESTAMPTZ` | Nullable | Thời gian tiếp nhận thực tế |
| `status` | `VARCHAR(30)` | Check (`received`, `processing`, `completed`, `cancelled`) | Trạng thái phiếu tiếp nhận |
| `quantity` | `NUMERIC(10,2)`| Check (`quantity > 0`), Not Null | Khối lượng tiếp nhận |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 3.2. Bảng `lot` (Quản lý Lô hàng Truy xuất)
* **Mô tả:** Quản lý mã lô định danh phục vụ quét mã QR truy xuất nguồn gốc (Quan hệ 1-1 với `intake`).
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `lot_id` | `UUID` | Primary Key | Định danh lô hàng |
| `lot_code` | `VARCHAR(50)` | Unique, Not Null | Mã lô hiển thị (In trên mã QR) |
| `intake_id` | `UUID` | Foreign Key, Unique, Not Null | Phiếu tiếp nhận sinh ra lô này |
| `goods_id` | `UUID` | Foreign Key, Not Null | Loại hàng hóa của lô |
| `farmer_id` | `UUID` | Foreign Key, Nullable | Nông dân gốc |
| `status` | `VARCHAR(30)` | Check (`active`, `processed`, `shipped`, `delivered`, `closed`) | Vòng đời hiện tại của lô |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 3.3. Bảng `processing` (Công đoạn Sơ chế)
* **Mô tả:** Ghi nhận công đoạn sơ chế lô hàng (không đổi số lượng lô trực tiếp).
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `processing_id` | `UUID` | Primary Key | Định danh công đoạn sơ chế |
| `intake_id` | `UUID` | Foreign Key, Not Null | Phiếu tiếp nhận gốc |
| `lot_id` | `UUID` | Foreign Key, Not Null | Mã lô hàng xử lý |
| `processed_by` | `UUID` | Foreign Key, Nullable | Nhân viên sơ chế thực hiện |
| `processing_date`| `TIMESTAMPTZ` | Nullable | Thời điểm sơ chế |
| `processing_type`| `VARCHAR(50)` | Nullable | Loại hình sơ chế (Gọt vỏ, rửa, đóng gói...) |
| `processed_quantity`| `NUMERIC(10,2)`| Check (`>= 0`), Not Null | Khối lượng đầu ra sau sơ chế |
| `status` | `VARCHAR(30)` | Check (`in_progress`, `completed`, `failed`) | Trạng thái công đoạn sơ chế |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

#### 3.4. Bảng `waybill` (Vận đơn / Điều phối)
* **Mô tả:** Quản lý thông tin vận chuyển lô hàng đã qua xử lý.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `waybill_id` | `UUID` | Primary Key | Định danh vận đơn |
| `processing_id` | `UUID` | Foreign Key, Not Null | Công đoạn sơ chế liên quan |
| `lot_id` | `UUID` | Foreign Key, Not Null | Mã lô hàng được vận chuyển |
| `vehicle_id` | `UUID` | Foreign Key, Not Null | Phương tiện vận chuyển |
| `created_by` | `UUID` | Foreign Key, Nullable | Nhân viên điều phối tạo vận đơn |
| `status` | `VARCHAR(30)` | Check (`assigned`, `in_transit`, `delivered`, `cancelled`) | Trạng thái vận đơn |
| `destination` | `TEXT` | Nullable | Địa chỉ điểm đến |
| `origin` | `TEXT` | Nullable | Địa chỉ điểm đi |
| `shipping_date` | `TIMESTAMPTZ` | Nullable | Thời điểm xuất phát giao hàng |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

---

### 4. Nhóm Bảng Giám sát & Báo cáo (Tracking & Reporting)

#### 4.1. Bảng `shipment_tracking` (Lịch trình Vận chuyển)
* **Mô tả:** Nhật ký theo dõi vị trí và trạng thái của chuyến xe theo thời gian thực.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `tracking_id` | `UUID` | Primary Key | Định danh bản ghi vết |
| `waybill_id` | `UUID` | Foreign Key, Not Null | Thuộc vận đơn nào |
| `updated_by` | `UUID` | Foreign Key, Nullable | Người cập nhật trạng thái |
| `status` | `VARCHAR(50)` | Not Null | Trạng thái cập nhật trên đường đi |
| `current_location`| `TEXT` | Nullable | Vị trí hiện tại (mô tả địa danh) |
| `update_time` | `TIMESTAMPTZ` | Nullable | Mốc thời gian cập nhật |
| `note` | `TEXT` | Nullable | Ghi chú thêm |

#### 4.2. Bảng `delivery_confirmation` (Xác nhận Giao hàng)
* **Mô tả:** Biên bản/chứng từ xác nhận giao hàng thành công từ tài xế.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `confirmation_id`| `UUID` | Primary Key | Định danh phiếu xác nhận |
| `waybill_id` | `UUID` | Foreign Key, Unique, Not Null | Vận đơn được xác nhận hoàn thành |
| `driver_id` | `UUID` | Foreign Key, Not Null | Tài xế thực hiện giao hàng |
| `recipient_name` | `VARCHAR(100)` | Not Null | Tên người nhận hàng |
| `recipient_phone`| `VARCHAR(20)` | Nullable | Số điện thoại người nhận |
| `delivered_at` | `TIMESTAMPTZ` | Nullable | Thời điểm bàn giao thành công |
| `proof_image_url`| `VARCHAR(500)` | Nullable | Đường dẫn ảnh chụp biên bản/hàng hóa |
| `notes` | `TEXT` | Nullable | Ghi chú từ người nhận |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |

#### 4.3. Bảng `daily_report` (Báo cáo Tổng hợp Ngày)
* **Mô tả:** Thống kê tổng hợp số liệu vận hành theo ngày.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `report_id` | `UUID` | Primary Key | Định danh báo cáo |
| `report_date` | `DATE` | Unique, Not Null | Ngày báo cáo thống kê |
| `total_intake_qty`| `NUMERIC(10,2)`| Nullable | Tổng khối lượng thu mua trong ngày |
| `total_processed_qty`| `NUMERIC(10,2)`| Nullable | Tổng khối lượng đã sơ chế trong ngày |
| `total_shipments`| `INTEGER` | Nullable | Tổng số chuyến vận chuyển khởi hành |
| `created_by` | `UUID` | Foreign Key, Nullable | Người lập báo cáo |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm khởi tạo bản ghi dữ liệu |
| `updated_at` | `TIMESTAMPTZ` | Nullable | Thời điểm cập nhật thông tin gần nhất |

---

### 5. Nhóm Bảng Gộp / Tách Lô (Lot Operation & Genealogy)

#### 5.1. Bảng `lot_operation` (Đầu phiếu Gộp / Tách Lô)
* **Mô tả:** Ghi nhận nghiệp vụ gộp lô (N-to-1) hoặc tách lô (1-to-M).
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `operation_id` | `UUID` | Primary Key | Định danh phiếu gộp/tách lô |
| `operation_type`| `VARCHAR(10)` | Check (`BLEND`, `SPLIT`), Not Null | Loại thao tác: `'BLEND'` (Gộp) hoặc `'SPLIT'` (Tách) |
| `processing_id` | `UUID` | Foreign Key, Nullable | Công đoạn sơ chế gắn liền (nếu có) |
| `performed_by` | `UUID` | Foreign Key, Nullable | Người thực hiện thao tác (`app_user`) |
| `note` | `TEXT` | Nullable | Ghi chú nghiệp vụ |
| `created_at` | `TIMESTAMPTZ` | Nullable | Thời điểm thực hiện thao tác |

#### 5.2. Bảng `lot_operation_input` (Lô đầu vào)
* **Mô tả:** Danh sách các lô tham gia làm đầu vào cho nghiệp vụ Gộp hoặc Tách.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Primary Key | Định danh chi tiết đầu vào |
| `operation_id` | `UUID` | Foreign Key, Not Null | Thuộc phiếu gộp/tách lô |
| `lot_id` | `UUID` | Foreign Key, Not Null | Mã lô nguồn đầu vào |
| `quantity` | `NUMERIC(10,2)`| Check (`quantity > 0`), Not Null | Khối lượng lấy ra từ lô nguồn |

#### 5.3. Bảng `lot_operation_output` (Lô đầu ra)
* **Mô tả:** Danh sách các lô kết quả thu được sau khi Gộp hoặc Tách.
* **Cấu trúc:**

| Tên thuộc tính | Kiểu dữ liệu | Ràng buộc | Mô tả & Quy tắc nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Primary Key | Định danh chi tiết đầu ra |
| `operation_id` | `UUID` | Foreign Key, Not Null | Thuộc phiếu gộp/tách lô |
| `lot_id` | `UUID` | Foreign Key, Not Null | Mã lô kết quả đầu ra |
| `quantity` | `NUMERIC(10,2)`| Check (`quantity > 0`), Not Null | Khối lượng đóng góp vào lô kết quả |

---

### 6. View Phả hệ Truy xuất Nguồn gốc

#### View `lot_genealogy_view`
* **Mô tả:** View tính toán tỷ lệ phần trăm phả hệ đóng góp giữa lô nguồn (`source_lot`) và lô kết quả (`result_lot`) sau các thao tác Gộp/Tách.
* **Các trường dữ liệu:** `operation_id`, `operation_type`, `source_lot_id`, `source_quantity`, `result_lot_id`, `result_quantity`, `genealogy_share_pct`, `created_at`.