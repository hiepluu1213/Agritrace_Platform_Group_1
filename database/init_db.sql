CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- TRIGGER FUNCTION CHUNG: Tự động cập nhật updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 0. DANH MỤC VAI TRÒ
-- =========================================================
CREATE TABLE role (
    role_code   VARCHAR(30) PRIMARY KEY,
    role_name   VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE role IS 'Danh mục vai trò người dùng trong hệ thống';

CREATE TRIGGER set_updated_at_role
    BEFORE UPDATE ON role
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

INSERT INTO role (role_code, role_name, description) VALUES
    ('MANAGER',          'Quản lý',              'Theo dõi lô hàng, xem thống kê báo cáo'),
    ('RECEIVING_STAFF',  'Nhân viên tiếp nhận',   'Tiếp nhận hàng hóa, quản lý thông tin nông dân'),
    ('PROCESSING_STAFF', 'Nhân viên sơ chế',      'Thực hiện sơ chế hàng hóa'),
    ('DISPATCH_STAFF',   'Nhân viên điều phối',   'Quản lý tài xế, xe, vận đơn'),
    ('DRIVER',           'Tài xế',                'Nhận lệnh vận chuyển, cập nhật trạng thái, xác nhận giao hàng');

-- =========================================================
-- 1. TÀI KHOẢN & PHÂN QUYỀN
-- =========================================================
CREATE TABLE system_user (
    user_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role_code     VARCHAR(30) NOT NULL REFERENCES role(role_code),
    phone         VARCHAR(20),
    status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_system_user_username UNIQUE (username)
);

COMMENT ON TABLE system_user IS 'Người dùng hệ thống (Tài khoản đăng nhập)';
COMMENT ON COLUMN system_user.status IS 'Trạng thái tài khoản: active | locked';

CREATE INDEX idx_system_user_role ON system_user(role_code);

CREATE TRIGGER set_updated_at_system_user
    BEFORE UPDATE ON system_user
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =========================================================
-- 2. DANH MỤC HÀNG HÓA, NÔNG DÂN & TÀI XẾ
-- =========================================================
CREATE TABLE goods (
    goods_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goods_code VARCHAR(50) UNIQUE,
    goods_name VARCHAR(100) NOT NULL,
    unit       VARCHAR(20),
    category   VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE goods IS 'Danh mục mặt hàng / nông sản';

CREATE TRIGGER set_updated_at_goods
    BEFORE UPDATE ON goods
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE farmer (
    farmer_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name  VARCHAR(100) NOT NULL,
    phone      VARCHAR(20),
    address    TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE farmer IS 'Thông tin nông dân cung cấp hàng hóa';

CREATE TRIGGER set_updated_at_farmer
    BEFORE UPDATE ON farmer
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE driver (
    driver_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID UNIQUE REFERENCES system_user(user_id) ON DELETE SET NULL,
    full_name  VARCHAR(100) NOT NULL,
    phone      VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE driver IS 'Thông tin tài xế vận chuyển';

CREATE TRIGGER set_updated_at_driver
    BEFORE UPDATE ON driver
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE vehicle (
    vehicle_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id     UUID UNIQUE NOT NULL REFERENCES driver(driver_id) ON DELETE CASCADE,
    license_plate VARCHAR(20) NOT NULL UNIQUE,
    vehicle_type  VARCHAR(50),
    capacity      NUMERIC(10, 2),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE vehicle IS 'Thông tin phương tiện vận chuyển';

CREATE TRIGGER set_updated_at_vehicle
    BEFORE UPDATE ON vehicle
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =========================================================
-- 3. CÁC CÔNG ĐOẠN XỬ LÝ (TIẾP NHẬN - SƠ CHẾ - VẬN CHUYỂN)
-- =========================================================
CREATE TABLE intake (
    intake_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goods_id     UUID NOT NULL REFERENCES goods(goods_id),
    farmer_id    UUID REFERENCES farmer(farmer_id) ON DELETE SET NULL,
    received_by  UUID REFERENCES system_user(user_id) ON DELETE SET NULL,
    intake_date  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status       VARCHAR(30) DEFAULT 'received' CHECK (status IN ('received', 'processing', 'completed', 'cancelled')),
    quantity     NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE intake IS 'Phiếu tiếp nhận nông sản từ nông dân';

CREATE INDEX idx_intake_goods ON intake(goods_id);
CREATE INDEX idx_intake_farmer ON intake(farmer_id);

CREATE TRIGGER set_updated_at_intake
    BEFORE UPDATE ON intake
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE lot (
    lot_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_code   VARCHAR(50) UNIQUE NOT NULL,
    intake_id  UUID UNIQUE NOT NULL REFERENCES intake(intake_id) ON DELETE CASCADE,
    goods_id   UUID NOT NULL REFERENCES goods(goods_id),
    farmer_id  UUID REFERENCES farmer(farmer_id) ON DELETE SET NULL,
    status     VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'processed', 'shipped', 'delivered', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE lot IS 'Lô hàng phục vụ truy xuất nguồn gốc QR code';

CREATE INDEX idx_lot_goods ON lot(goods_id);
CREATE INDEX idx_lot_farmer ON lot(farmer_id);

CREATE TRIGGER set_updated_at_lot
    BEFORE UPDATE ON lot
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE processing (
    processing_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intake_id          UUID NOT NULL REFERENCES intake(intake_id),
    lot_id             UUID NOT NULL REFERENCES lot(lot_id),
    processed_by       UUID REFERENCES system_user(user_id) ON DELETE SET NULL,
    processing_date    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_type    VARCHAR(50),
    processed_quantity NUMERIC(10, 2) NOT NULL CHECK (processed_quantity >= 0),
    status             VARCHAR(30) DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'failed')),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE processing IS 'Công đoạn sơ chế lô hàng';

CREATE INDEX idx_processing_lot ON processing(lot_id);
CREATE INDEX idx_processing_intake ON processing(intake_id);

CREATE TRIGGER set_updated_at_processing
    BEFORE UPDATE ON processing
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE waybill (
    waybill_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processing_id UUID NOT NULL REFERENCES processing(processing_id),
    lot_id        UUID NOT NULL REFERENCES lot(lot_id),
    vehicle_id    UUID NOT NULL REFERENCES vehicle(vehicle_id),
    created_by    UUID REFERENCES system_user(user_id) ON DELETE SET NULL,
    status        VARCHAR(30) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_transit', 'delivered', 'cancelled')),
    destination   TEXT,
    origin        TEXT,
    shipping_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE waybill IS 'Vận đơn giao hàng / Điều phối vận chuyển';

CREATE INDEX idx_waybill_lot ON waybill(lot_id);
CREATE INDEX idx_waybill_vehicle ON waybill(vehicle_id);

CREATE TRIGGER set_updated_at_waybill
    BEFORE UPDATE ON waybill
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =========================================================
-- 4. TƯƠNG TÁC TÀI XẾ & BÁO CÁO GIÁM SÁT
-- =========================================================
CREATE TABLE shipment_tracking (
    tracking_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    waybill_id       UUID NOT NULL REFERENCES waybill(waybill_id) ON DELETE CASCADE,
    updated_by       UUID REFERENCES system_user(user_id) ON DELETE SET NULL,
    status           VARCHAR(50) NOT NULL,
    current_location TEXT,
    location_point   GEOMETRY(Point, 4326),
    update_time      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    note             TEXT
);

COMMENT ON TABLE shipment_tracking IS 'Lịch trình / Nhật ký vị trí vận chuyển lô hàng';

CREATE INDEX idx_shipment_tracking_waybill ON shipment_tracking(waybill_id);

CREATE TABLE delivery_confirmation (
    confirmation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    waybill_id      UUID UNIQUE NOT NULL REFERENCES waybill(waybill_id) ON DELETE CASCADE,
    driver_id       UUID NOT NULL REFERENCES driver(driver_id),
    recipient_name  VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(20),
    delivered_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    proof_image_url VARCHAR(500),
    notes           TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE delivery_confirmation IS 'Xác nhận đã giao hàng thành công từ tài xế';

CREATE TABLE daily_report (
    report_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date         DATE NOT NULL UNIQUE,
    total_intake_qty    NUMERIC(10, 2) DEFAULT 0,
    total_processed_qty NUMERIC(10, 2) DEFAULT 0,
    total_shipments     INTEGER DEFAULT 0,
    created_by          UUID REFERENCES system_user(user_id) ON DELETE SET NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE daily_report IS 'Báo cáo tổng hợp số liệu theo ngày';

CREATE TRIGGER set_updated_at_daily_report
    BEFORE UPDATE ON daily_report
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();