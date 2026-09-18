CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TÀI KHOẢN & PHÂN QUYỀN (Actors / Đăng nhập)
CREATE TABLE system_user (
    user_id       VARCHAR(20) PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     NVARCHAR(100) NOT NULL,
    role_code     VARCHAR(30) NOT NULL,
    phone         VARCHAR(15),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT now()
);

-- 2. DANH MỤC HÀNG HÓA & TÀI XẾ
CREATE TABLE goods (
    goods_id    VARCHAR(20) PRIMARY KEY,
    goods_name  NVARCHAR(100) NOT NULL,
    unit        NVARCHAR(20),
    category    NVARCHAR(50),
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE driver (
    driver_id   VARCHAR(20) PRIMARY KEY,
    user_id     VARCHAR(20) UNIQUE REFERENCES system_user(user_id),
    full_name   NVARCHAR(100) NOT NULL,
    phone       VARCHAR(15)
);

CREATE TABLE vehicle (
    vehicle_id    VARCHAR(20) PRIMARY KEY,
    driver_id     VARCHAR(20) UNIQUE NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    vehicle_type  NVARCHAR(50),
    capacity      DECIMAL(10, 2),
    CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id)
);

-- 3. CÁC CÔNG ĐOẠN XỬ LÝ (TIẾP NHẬN - SƠ CHẾ - VẬN CHUYỂN)
CREATE TABLE intake (
    intake_id    VARCHAR(20) PRIMARY KEY,
    goods_id     VARCHAR(20) NOT NULL,
    received_by  VARCHAR(20) REFERENCES system_user(user_id),
    intake_date  TIMESTAMP DEFAULT now(),
    status       NVARCHAR(50) DEFAULT 'RECEIVED',
    quantity     INT NOT NULL,
    CONSTRAINT fk_intake_goods FOREIGN KEY (goods_id) REFERENCES goods(goods_id)
);

CREATE TABLE processing (
    processing_id      VARCHAR(20) PRIMARY KEY,
    intake_id          VARCHAR(20) NOT NULL,
    processed_by       VARCHAR(20) REFERENCES system_user(user_id),
    processing_date    TIMESTAMP DEFAULT now(),
    processing_type    NVARCHAR(50),
    processed_quantity INT NOT NULL,
    status             NVARCHAR(50) DEFAULT 'COMPLETED',
    CONSTRAINT fk_processing_intake FOREIGN KEY (intake_id) REFERENCES intake(intake_id)
);

CREATE TABLE waybill (
    waybill_id    VARCHAR(20) PRIMARY KEY,
    processing_id VARCHAR(20) NOT NULL,
    vehicle_id    VARCHAR(20) NOT NULL,
    created_by    VARCHAR(20) REFERENCES system_user(user_id),
    status        NVARCHAR(50) DEFAULT 'ASSIGNED',
    destination   NVARCHAR(200),
    origin        NVARCHAR(200),
    shipping_date TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_waybill_processing FOREIGN KEY (processing_id) REFERENCES processing(processing_id),
    CONSTRAINT fk_waybill_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id)
);

-- 4. TƯƠNG TÁC TÀI XẾ & BÁO CÁO GIÁM SÁT
CREATE TABLE shipment_tracking (
    tracking_id      VARCHAR(20) PRIMARY KEY,
    waybill_id       VARCHAR(20) NOT NULL REFERENCES waybill(waybill_id),
    updated_by       VARCHAR(20) REFERENCES system_user(user_id),
    status           NVARCHAR(50) NOT NULL,
    current_location NVARCHAR(255),
    update_time      TIMESTAMP DEFAULT now(),
    note             NVARCHAR(255)
);

CREATE TABLE delivery_confirmation (
    confirmation_id VARCHAR(20) PRIMARY KEY,
    waybill_id      VARCHAR(20) UNIQUE NOT NULL REFERENCES waybill(waybill_id),
    driver_id       VARCHAR(20) NOT NULL REFERENCES driver(driver_id),
    recipient_name  NVARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(15),
    delivered_at    TIMESTAMP DEFAULT now(),
    proof_image_url VARCHAR(255),
    notes           NVARCHAR(255)
);

CREATE TABLE daily_report (
    report_id           VARCHAR(20) PRIMARY KEY,
    report_date         DATE NOT NULL UNIQUE,
    total_intake_qty    DECIMAL(10, 2) DEFAULT 0,
    total_processed_qty DECIMAL(10, 2) DEFAULT 0,
    total_shipments     INT DEFAULT 0,
    created_by          VARCHAR(20) REFERENCES system_user(user_id),
    created_at          TIMESTAMP DEFAULT now()
);