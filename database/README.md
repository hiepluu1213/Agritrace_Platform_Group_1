# ĐẶC TẢ CƠ SỞ DỮ LIỆU (DATABASE SPECIFICATION)

Hệ thống Quản lý Tiếp nhận - Sơ chế - Vận chuyển hàng hóa.

---

## 1. Bảng `system_user` (Tài khoản hệ thống)
Lưu trữ thông tin tài khoản người dùng và phân quyền truy cập hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `user_id` | VARCHAR(20) | PRIMARY KEY | Mã người dùng |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Tên đăng nhập |
| `password_hash` | VARCHAR(255) | NOT NULL | Mật khẩu đã mã hóa |
| `full_name` | NVARCHAR(100) | NOT NULL | Họ và tên |
| `role_code` | VARCHAR(30) | NOT NULL | Mã vai trò (REC_STAFF, DISPATCHER, PROC_STAFF, DRIVER, MANAGER) |
| `phone` | VARCHAR(15) | NULL | Số điện thoại |
| `is_active` | BOOLEAN | DEFAULT TRUE | Trạng thái hoạt động |
| `created_at` | TIMESTAMP | DEFAULT now() | Thời gian tạo |

---

## 2. Bảng `goods` (Danh mục hàng hóa)
Lưu trữ danh mục các loại hàng hóa.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `goods_id` | VARCHAR(20) | PRIMARY KEY | Mã hàng hóa |
| `goods_name` | NVARCHAR(100) | NOT NULL | Tên hàng hóa |
| `unit` | NVARCHAR(20) | NULL | Đơn vị tính (kg, thùng, bao...) |
| `category` | NVARCHAR(50) | NULL | Loại hàng hóa |
| `created_at` | TIMESTAMP | DEFAULT now() | Thời gian tạo |

---

## 3. Bảng `driver` (Thông tin tài xế)
Lưu trữ hồ sơ tài xế, liên kết trực tiếp với tài khoản hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `driver_id` | VARCHAR(20) | PRIMARY KEY | Mã tài xế |
| `user_id` | VARCHAR(20) | UNIQUE, FK -> `system_user` | Mã tài khoản hệ thống tương ứng |
| `full_name` | NVARCHAR(100) | NOT NULL | Họ tên tài xế |
| `phone` | VARCHAR(15) | NULL | Số điện thoại |

---

## 4. Bảng `vehicle` (Thông tin phương tiện)
Lưu trữ danh sách phương tiện vận chuyển (quan hệ 1-1 với tài xế).

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `vehicle_id` | VARCHAR(20) | PRIMARY KEY | Mã xe |
| `driver_id` | VARCHAR(20) | UNIQUE, NOT NULL, FK -> `driver` | Mã tài xế phụ trách xe |
| `license_plate` | VARCHAR(20) | NOT NULL | Biển số xe |
| `vehicle_type` | NVARCHAR(50) | NULL | Loại xe (xe tải, xe đông lạnh...) |
| `capacity` | DECIMAL(10, 2) | NULL | Tải trọng tối đa |

---

## 5. Bảng `intake` (Tiếp nhận hàng hóa)
Ghi nhận thông tin tiếp nhận lô hàng vào hệ thống.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `intake_id` | VARCHAR(20) | PRIMARY KEY | Mã đợt tiếp nhận |
| `goods_id` | VARCHAR(20) | NOT NULL, FK -> `goods` | Mã hàng hóa tiếp nhận |
| `received_by` | VARCHAR(20) | FK -> `system_user` | Nhân viên thực hiện tiếp nhận |
| `intake_date` | TIMESTAMP | DEFAULT now() | Thời gian tiếp nhận |
| `status` | NVARCHAR(50) | DEFAULT 'RECEIVED' | Trạng thái đợt tiếp nhận |
| `quantity` | INT | NOT NULL | Số lượng hàng nhập |

---

## 6. Bảng `processing` (Sơ chế hàng hóa)
Ghi nhận thông tin sau khi hàng hóa trải qua công đoạn sơ chế.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `processing_id` | VARCHAR(20) | PRIMARY KEY | Mã công đoạn sơ chế |
| `intake_id` | VARCHAR(20) | NOT NULL, FK -> `intake` | Mã đợt tiếp nhận tương ứng |
| `processed_by` | VARCHAR(20) | FK -> `system_user` | Nhân viên thực hiện sơ chế |
| `processing_date` | TIMESTAMP | DEFAULT now() | Thời gian thực hiện |
| `processing_type` | NVARCHAR(50) | NULL | Loại sơ chế (làm sạch, đóng gói...) |
| `processed_quantity` | INT | NOT NULL | Số lượng thành phẩm sau sơ chế |
| `status` | NVARCHAR(50) | DEFAULT 'COMPLETED' | Trạng thái sơ chế |

---

## 7. Bảng `waybill` (Vận đơn vận chuyển)
Quản lý các lệnh vận chuyển hàng hóa sau sơ chế.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `waybill_id` | VARCHAR(20) | PRIMARY KEY | Mã vận đơn |
| `processing_id` | VARCHAR(20) | NOT NULL, FK -> `processing` | Mã lô hàng đã sơ chế |
| `vehicle_id` | VARCHAR(20) | NOT NULL, FK -> `vehicle` | Mã xe phân công vận chuyển |
| `created_by` | VARCHAR(20) | FK -> `system_user` | Nhân viên điều phối tạo đơn |
| `status` | NVARCHAR(50) | DEFAULT 'ASSIGNED' | Trạng thái vận đơn |
| `destination` | NVARCHAR(200) | NULL | Điểm đến |
| `origin` | NVARCHAR(200) | NULL | Điểm xuất phát |
| `shipping_date` | TIMESTAMP | DEFAULT now() | Thời gian khởi hành |

---

## 8. Bảng `shipment_tracking` (Lịch sử hành trình)
Lưu nhật ký cập nhật trạng thái vận chuyển theo thời gian thực từ tài xế/điều phối.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `tracking_id` | VARCHAR(20) | PRIMARY KEY | Mã bản ghi theo dõi |
| `waybill_id` | VARCHAR(20) | NOT NULL, FK -> `waybill` | Mã vận đơn theo dõi |
| `updated_by` | VARCHAR(20) | FK -> `system_user` | Người cập nhật trạng thái |
| `status` | NVARCHAR(50) | NOT NULL | Trạng thái vận chuyển hiện tại |
| `current_location` | NVARCHAR(255) | NULL | Tọa độ/Vị trí hiện tại |
| `update_time` | TIMESTAMP | DEFAULT now() | Thời điểm cập nhật |
| `note` | NVARCHAR(255) | NULL | Ghi chú thêm |

---

## 9. Bảng `delivery_confirmation` (Xác nhận giao hàng)
Ghi nhận bằng chứng và thông tin xác nhận khi giao hàng thành công.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `confirmation_id` | VARCHAR(20) | PRIMARY KEY | Mã xác nhận giao hàng |
| `waybill_id` | VARCHAR(20) | UNIQUE, NOT NULL, FK -> `waybill` | Mã vận đơn hoàn thành |
| `driver_id` | VARCHAR(20) | NOT NULL, FK -> `driver` | Tài xế hoàn thành giao hàng |
| `recipient_name` | NVARCHAR(100) | NOT NULL | Tên người nhận hàng |
| `recipient_phone` | VARCHAR(15) | NULL | Số điện thoại người nhận |
| `delivered_at` | TIMESTAMP | DEFAULT now() | Thời gian giao thành công |
| `proof_image_url` | VARCHAR(255) | NULL | Link ảnh chụp chứng minh |
| `notes` | NVARCHAR(255) | NULL | Ghi chú giao hàng |

---

## 10. Bảng `daily_report` (Báo cáo tổng hợp hàng ngày)
Lưu trữ số liệu thống kê tổng hợp phục vụ màn hình báo cáo của Quản lý.

| Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `report_id` | VARCHAR(20) | PRIMARY KEY | Mã báo cáo |
| `report_date` | DATE | UNIQUE, NOT NULL | Ngày báo cáo |
| `total_intake_qty` | DECIMAL(10, 2) | DEFAULT 0 | Tổng lượng hàng tiếp nhận |
| `total_processed_qty` | DECIMAL(10, 2) | DEFAULT 0 | Tổng lượng hàng sơ chế |
| `total_shipments` | INT | DEFAULT 0 | Tổng số chuyến xe phát sinh |
| `created_by` | VARCHAR(20) | FK -> `system_user` | Quản lý chốt báo cáo |
| `created_at` | TIMESTAMP | DEFAULT now() | Thời gian tạo báo cáo |