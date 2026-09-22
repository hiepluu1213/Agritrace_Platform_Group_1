CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Trigger function dùng chung: tự động cập nhật cột updated_at
-- (dùng lại nếu schema này được gộp chung với schema AgriTrace gốc)
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- MODULE 1. ORGANIZATIONS & MASTER DATA MODULE
-- =========================================================

-- 1. ORGANIZATIONS (Tổ Chức)
CREATE TABLE organizations (
    org_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gln_code            VARCHAR(13),                    -- GS1 GLN
    org_name            VARCHAR(255) NOT NULL,
    org_type            VARCHAR(20) NOT NULL CHECK (org_type IN ('FARM', 'FACTORY', 'CARRIER')),
    tax_code            VARCHAR(50),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

COMMENT ON TABLE organizations IS 'Tổ chức tham gia chuỗi cung ứng (Nông trại / Nhà máy / Đơn vị vận chuyển)';
COMMENT ON COLUMN organizations.gln_code IS 'Global Location Number theo chuẩn GS1';
COMMENT ON COLUMN organizations.org_type IS 'FARM | FACTORY | CARRIER';

CREATE UNIQUE INDEX uq_organizations_gln_code ON organizations(gln_code) WHERE gln_code IS NOT NULL;

-- 2. FACILITIES_LOCATIONS (Địa Điểm/Kho)
CREATE TABLE facilities_locations (
    location_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id               UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    gln_location_code    VARCHAR(13),                   -- GS1 GLN
    location_name        VARCHAR(255) NOT NULL,
    location_type        VARCHAR(20) NOT NULL CHECK (location_type IN ('FIELD', 'WAREHOUSE', 'PLANT')),
    gps_coordinates      GEOMETRY(Point, 4326),
    polygon_geo_json      JSONB                          -- EUDR Plot (ranh giới thửa đất theo EUDR)
);

COMMENT ON TABLE facilities_locations IS 'Địa điểm / Kho / Thửa đất thuộc một tổ chức';
COMMENT ON COLUMN facilities_locations.location_type IS 'FIELD | WAREHOUSE | PLANT';
COMMENT ON COLUMN facilities_locations.polygon_geo_json IS 'Ranh giới thửa đất (GeoJSON Polygon) phục vụ khai báo EUDR';

-- Cần UNIQUE để EPCIS_EVENTS (module 5) tham chiếu FK theo gln_location_code
CREATE UNIQUE INDEX uq_facilities_locations_gln ON facilities_locations(gln_location_code) WHERE gln_location_code IS NOT NULL;
CREATE INDEX idx_facilities_locations_org ON facilities_locations(org_id);

-- 3. CERTIFICATES (Chứng Nhận)
CREATE TABLE certificates (
    certificate_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    cert_type           VARCHAR(20) NOT NULL CHECK (cert_type IN ('ORGANIC', 'EUDR', 'VIETGAP')),
    cert_number         VARCHAR(100),
    issuer_name         VARCHAR(255),
    valid_from          DATE,
    valid_to            DATE,

    CONSTRAINT chk_certificates_valid_range CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE certificates IS 'Chứng nhận (Hữu cơ / EUDR / VietGAP) cấp cho một tổ chức';
COMMENT ON COLUMN certificates.cert_type IS 'ORGANIC | EUDR | VIETGAP';

CREATE INDEX idx_certificates_org ON certificates(org_id);

-- 4. PRODUCTS_MASTER (Sản Phẩm)
CREATE TABLE products_master (
    product_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gtin_code           VARCHAR(14),                    -- GS1 GTIN
    product_name         VARCHAR(255) NOT NULL,
    crop_type            VARCHAR(100),                  -- VD: Coffee, Rice
    grade_standard        VARCHAR(50),
    uom                  VARCHAR(20)                     -- VD: KG, TON
);

COMMENT ON TABLE products_master IS 'Danh mục sản phẩm/nông sản gốc';
COMMENT ON COLUMN products_master.gtin_code IS 'Global Trade Item Number theo chuẩn GS1';
COMMENT ON COLUMN products_master.uom IS 'Đơn vị tính: KG | TON | ...';

CREATE UNIQUE INDEX uq_products_master_gtin ON products_master(gtin_code) WHERE gtin_code IS NOT NULL;

-- =========================================================
-- MODULE 2. AGRICULTURAL LOTS & GENEALOGY MODULE
-- =========================================================

-- 5. AGRICULTURAL_LOTS (Lô Nông Sản)
CREATE TABLE agricultural_lots (
    lot_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tlc_code             VARCHAR(50),                    -- GS1 TLC (Traceability Lot Code)
    product_id           UUID NOT NULL REFERENCES products_master(product_id),
    current_location_id  UUID REFERENCES facilities_locations(location_id),
    owner_org_id         UUID NOT NULL REFERENCES organizations(org_id),
    initial_quantity     NUMERIC(12,2) NOT NULL CHECK (initial_quantity >= 0),
    current_quantity     NUMERIC(12,2) NOT NULL CHECK (current_quantity >= 0),
    moisture_percentage  NUMERIC(5,2),
    impurity_percentage  NUMERIC(5,2),
    quality_grade        VARCHAR(50),
    certification_status VARCHAR(50),
    harvest_date         TIMESTAMP WITH TIME ZONE,
    lot_status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (lot_status IN ('ACTIVE', 'BLENDED', 'SPLIT'))
);

COMMENT ON TABLE agricultural_lots IS 'Lô nông sản - đơn vị truy xuất nguồn gốc trung tâm của hệ thống';
COMMENT ON COLUMN agricultural_lots.tlc_code IS 'Traceability Lot Code theo chuẩn GS1';
COMMENT ON COLUMN agricultural_lots.lot_status IS 'ACTIVE | BLENDED | SPLIT';

CREATE UNIQUE INDEX uq_agricultural_lots_tlc ON agricultural_lots(tlc_code) WHERE tlc_code IS NOT NULL;
CREATE INDEX idx_agricultural_lots_product ON agricultural_lots(product_id);
CREATE INDEX idx_agricultural_lots_location ON agricultural_lots(current_location_id);
CREATE INDEX idx_agricultural_lots_owner ON agricultural_lots(owner_org_id);
CREATE INDEX idx_agricultural_lots_status ON agricultural_lots(lot_status);

-- 6. LOT_GENEALOGY (Phả Hệ Lô)
CREATE TABLE lot_genealogy (
    genealogy_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_lot_id         UUID NOT NULL REFERENCES agricultural_lots(lot_id),
    child_lot_id          UUID NOT NULL REFERENCES agricultural_lots(lot_id),
    action_type           VARCHAR(20) NOT NULL CHECK (action_type IN ('BLEND', 'SPLIT', 'REWORK')),
    contributed_quantity  NUMERIC(12,2),
    contribution_percentage NUMERIC(5,2),
    action_timestamp      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Giả định: FK tới bảng users của schema AgriTrace gốc (không nằm trong 5 module ERD này)
    performed_by_user_id  UUID REFERENCES users(user_id),

    CONSTRAINT chk_lot_genealogy_no_self_link CHECK (parent_lot_id <> child_lot_id)
);

COMMENT ON TABLE lot_genealogy IS 'Phả hệ lô: ghi lại quan hệ cha-con khi trộn (blend) / tách (split) / gia công lại (rework) lô';
COMMENT ON COLUMN lot_genealogy.action_type IS 'BLEND | SPLIT | REWORK';

-- Tra cứu 1:N theo chiều cha ("lô này sinh ra những lô con nào")
CREATE INDEX idx_lot_genealogy_parent ON lot_genealogy(parent_lot_id);
-- Tra cứu 1:N theo chiều con ("lô này được tạo ra từ những lô cha nào")
CREATE INDEX idx_lot_genealogy_child ON lot_genealogy(child_lot_id);

-- 7. MASS_BALANCE_LOGS (Cân Bằng Mass Balance)
CREATE TABLE mass_balance_logs (
    log_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id                UUID NOT NULL REFERENCES agricultural_lots(lot_id) ON DELETE CASCADE,
    input_qty_sum         NUMERIC(12,2),
    output_qty_sum        NUMERIC(12,2),
    actual_loss_qty       NUMERIC(12,2),
    standard_loss_rate    NUMERIC(5,2),
    variance_percentage   NUMERIC(5,2),
    is_anomaly_flag       BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_time      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE mass_balance_logs IS 'Nhật ký đối chiếu cân bằng khối lượng (mass balance) của một lô, dùng để phát hiện gian lận/thất thoát bất thường';
COMMENT ON COLUMN mass_balance_logs.is_anomaly_flag IS 'TRUE nếu chênh lệch vượt ngưỡng tiêu chuẩn';

CREATE INDEX idx_mass_balance_logs_lot ON mass_balance_logs(lot_id);
-- Phục vụ dashboard lọc nhanh các bản ghi bất thường
CREATE INDEX idx_mass_balance_logs_anomaly ON mass_balance_logs(is_anomaly_flag) WHERE is_anomaly_flag = TRUE;

-- =========================================================
-- MODULE 3. PROCESSING & TRANSFORMATION MODULE
-- =========================================================

-- 8. PROCESSING_BATCHES (Mẻ Chế Biến)
CREATE TABLE processing_batches (
    batch_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_code            VARCHAR(50) UNIQUE,
    facility_id           UUID NOT NULL REFERENCES facilities_locations(location_id),
    processing_type       VARCHAR(30) CHECK (processing_type IN ('DRYING', 'HULLING')),
    start_time            TIMESTAMP WITH TIME ZONE,
    end_time              TIMESTAMP WITH TIME ZONE,
    total_input_weight    NUMERIC(12,2),
    total_output_weight   NUMERIC(12,2),
    yield_rate_percentage NUMERIC(5,2),
    status                VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),

    CONSTRAINT chk_processing_batches_time_range CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time)
);

COMMENT ON TABLE processing_batches IS 'Mẻ chế biến (VD: sấy, xay xát) diễn ra tại một cơ sở/kho';
COMMENT ON COLUMN processing_batches.processing_type IS 'DRYING | HULLING | ... (mở rộng thêm khi cần)';
COMMENT ON COLUMN processing_batches.status IS 'IN_PROGRESS | COMPLETED';

CREATE INDEX idx_processing_batches_facility ON processing_batches(facility_id);
CREATE INDEX idx_processing_batches_status ON processing_batches(status);

-- 9. PROCESSING_INPUT_LOTS (Trung gian Mẻ Chế Biến ↔ Lô đầu vào)
CREATE TABLE processing_input_lots (
    batch_id             UUID NOT NULL REFERENCES processing_batches(batch_id) ON DELETE CASCADE,
    input_lot_id         UUID NOT NULL REFERENCES agricultural_lots(lot_id),
    quantity_used        NUMERIC(12,2),
    input_moisture       NUMERIC(5,2),
    PRIMARY KEY (batch_id, input_lot_id)
);

COMMENT ON TABLE processing_input_lots IS 'Bảng trung gian: các lô nông sản được đưa vào làm nguyên liệu cho một mẻ chế biến';

-- Tra cứu ngược theo lô ("lô này đã được dùng làm đầu vào cho mẻ nào")
CREATE INDEX idx_processing_input_lots_lot ON processing_input_lots(input_lot_id);

-- 10. PROCESSING_OUTPUT_LOTS (Trung gian Mẻ Chế Biến ↔ Lô đầu ra)
CREATE TABLE processing_output_lots (
    batch_id             UUID NOT NULL REFERENCES processing_batches(batch_id) ON DELETE CASCADE,
    output_lot_id        UUID NOT NULL REFERENCES agricultural_lots(lot_id),
    quantity_produced    NUMERIC(12,2),
    output_grade         VARCHAR(50),
    PRIMARY KEY (batch_id, output_lot_id)
);

COMMENT ON TABLE processing_output_lots IS 'Bảng trung gian: các lô nông sản được tạo ra từ một mẻ chế biến';

-- Tra cứu ngược theo lô ("lô này được sinh ra từ mẻ chế biến nào")
CREATE INDEX idx_processing_output_lots_lot ON processing_output_lots(output_lot_id);

-- =========================================================
-- MODULE 4. LOGISTICS & COLD CHAIN MODULE
-- =========================================================

-- 11. SHIPMENTS (Chuyến Vận Chuyển)
CREATE TABLE shipments (
    shipment_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sscc_code              VARCHAR(18),                  -- GS1 SSCC
    shipper_org_id         UUID NOT NULL REFERENCES organizations(org_id),
    carrier_org_id         UUID REFERENCES organizations(org_id),
    receiver_org_id        UUID NOT NULL REFERENCES organizations(org_id),
    origin_location_id     UUID REFERENCES facilities_locations(location_id),
    dest_location_id       UUID REFERENCES facilities_locations(location_id),
    vehicle_plate_number   VARCHAR(50),
    eseal_number           VARCHAR(100),
    dispatch_time          TIMESTAMP WITH TIME ZONE,
    estimated_arrival_time TIMESTAMP WITH TIME ZONE,
    shipment_status        VARCHAR(20) NOT NULL DEFAULT 'IN_TRANSIT' CHECK (shipment_status IN ('IN_TRANSIT', 'DELIVERED'))
);

COMMENT ON TABLE shipments IS 'Chuyến vận chuyển hàng hóa giữa các tổ chức/địa điểm';
COMMENT ON COLUMN shipments.sscc_code IS 'Serial Shipping Container Code theo chuẩn GS1';
COMMENT ON COLUMN shipments.shipment_status IS 'IN_TRANSIT | DELIVERED';

CREATE UNIQUE INDEX uq_shipments_sscc ON shipments(sscc_code) WHERE sscc_code IS NOT NULL;
CREATE INDEX idx_shipments_shipper ON shipments(shipper_org_id);
CREATE INDEX idx_shipments_carrier ON shipments(carrier_org_id);
CREATE INDEX idx_shipments_receiver ON shipments(receiver_org_id);
CREATE INDEX idx_shipments_origin ON shipments(origin_location_id);
CREATE INDEX idx_shipments_dest ON shipments(dest_location_id);

-- 12. SHIPMENT_LOT_ITEMS (Trung gian Chuyến Vận Chuyển ↔ Lô)
CREATE TABLE shipment_lot_items (
    shipment_id           UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    lot_id                UUID NOT NULL REFERENCES agricultural_lots(lot_id),
    shipped_quantity      NUMERIC(12,2),
    received_quantity     NUMERIC(12,2),
    discrepancy_qty       NUMERIC(12,2),
    item_status           VARCHAR(20) NOT NULL DEFAULT 'LOADED' CHECK (item_status IN ('LOADED', 'DELIVERED')),
    PRIMARY KEY (shipment_id, lot_id)
);

COMMENT ON TABLE shipment_lot_items IS 'Bảng trung gian: các lô nông sản được chở trong một chuyến vận chuyển';
COMMENT ON COLUMN shipment_lot_items.discrepancy_qty IS 'Chênh lệch giữa số lượng giao và số lượng nhận thực tế';

-- Tra cứu ngược theo lô ("lô này đã được vận chuyển trong những chuyến nào")
CREATE INDEX idx_shipment_lot_items_lot ON shipment_lot_items(lot_id);

-- 13. COLD_CHAIN_SENSOR_LOGS (IoT)
CREATE TABLE cold_chain_sensor_logs (
    sensor_log_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id          UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    device_imei          VARCHAR(50),
    temperature          NUMERIC(4,2),                  -- °C
    humidity              NUMERIC(4,2),                  -- %
    gps_location          GEOMETRY(Point, 4326),
    ambient_light_lux     NUMERIC(6,2),                  -- dùng phát hiện mở container trái phép (e-Seal)
    recorded_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE cold_chain_sensor_logs IS 'Dữ liệu cảm biến IoT (nhiệt độ, độ ẩm, ánh sáng, vị trí) ghi nhận dọc theo chuyến vận chuyển chuỗi lạnh';
COMMENT ON COLUMN cold_chain_sensor_logs.ambient_light_lux IS 'Cường độ ánh sáng môi trường bên trong container - dùng để phát hiện mở niêm phong (e-Seal) trái phép';

CREATE INDEX idx_cold_chain_sensor_logs_shipment ON cold_chain_sensor_logs(shipment_id);
CREATE INDEX idx_cold_chain_sensor_logs_time ON cold_chain_sensor_logs(recorded_at DESC);

-- =========================================================
-- MODULE 5. GS1 EPCIS 2.0 & EUDR COMPLIANCE MODULE
-- =========================================================

-- 14. EUDR_DDS_DOSSIERS (Thẩm Định EUDR)
CREATE TABLE eudr_dds_dossiers (
    dds_id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id                    UUID NOT NULL REFERENCES agricultural_lots(lot_id) ON DELETE CASCADE,
    reference_number          VARCHAR(100),              -- Mã tham chiếu trên hệ thống TRACES (EU)
    deforestation_risk_score  VARCHAR(10) CHECK (deforestation_risk_score IN ('LOW', 'HIGH')),
    geolocation_polygon_json  JSONB,
    country_of_production     VARCHAR(50),
    harvest_period_start      DATE,
    harvest_period_end        DATE,
    verification_status       VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (verification_status IN ('APPROVED', 'REJECTED')),

    CONSTRAINT chk_eudr_dds_harvest_range CHECK (harvest_period_end IS NULL OR harvest_period_start IS NULL OR harvest_period_end >= harvest_period_start)
);

COMMENT ON TABLE eudr_dds_dossiers IS 'Hồ sơ thẩm định chuỗi cung ứng (Due Diligence Statement) theo Quy định Chống Phá Rừng của EU (EUDR)';
COMMENT ON COLUMN eudr_dds_dossiers.reference_number IS 'Mã tham chiếu tương ứng trên hệ thống TRACES của EU';
COMMENT ON COLUMN eudr_dds_dossiers.deforestation_risk_score IS 'LOW | HIGH';

-- Mỗi lô tương ứng 1 hồ sơ DDS (quan hệ 1:1 theo ERD)
CREATE UNIQUE INDEX uq_eudr_dds_dossiers_lot ON eudr_dds_dossiers(lot_id);

-- 15. EPCIS_EVENTS (Sự Kiện EPCIS 2.0)
CREATE TABLE epcis_events (
    event_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type            VARCHAR(20) NOT NULL CHECK (event_type IN ('Object', 'Aggregation', 'Transformation')),
    action                VARCHAR(10) NOT NULL CHECK (action IN ('ADD', 'OBSERVE', 'DELETE')),
    biz_step              VARCHAR(100),                  -- CBV Business Step (GS1 Core Business Vocabulary)
    disposition           VARCHAR(100),                  -- CBV Disposition
    -- Giả định: chỉ tham chiếu GLN thuộc các địa điểm trong hệ thống.
    -- Nếu event có thể liên quan tới GLN của đối tác bên ngoài hệ thống, bỏ FK này và giữ lại cột dạng tự do.
    read_point_gln        VARCHAR(13) REFERENCES facilities_locations(gln_location_code),
    biz_location_gln       VARCHAR(13) REFERENCES facilities_locations(gln_location_code),
    associated_lot_id      UUID REFERENCES agricultural_lots(lot_id),
    associated_shipment_id UUID REFERENCES shipments(shipment_id),
    event_time             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE epcis_events IS 'Sự kiện chuẩn GS1 EPCIS 2.0, ghi nhận mọi thay đổi/di chuyển trạng thái của lô và chuyến vận chuyển để phục vụ truy xuất nguồn gốc liên tổ chức';
COMMENT ON COLUMN epcis_events.event_type IS 'Object | Aggregation | Transformation';
COMMENT ON COLUMN epcis_events.action IS 'ADD | OBSERVE | DELETE';
COMMENT ON COLUMN epcis_events.biz_step IS 'Business Step theo chuẩn GS1 CBV, VD: harvesting, receiving, shipping';
COMMENT ON COLUMN epcis_events.disposition IS 'Disposition theo chuẩn GS1 CBV, VD: in_transit, in_progress';

CREATE INDEX idx_epcis_events_lot ON epcis_events(associated_lot_id);
CREATE INDEX idx_epcis_events_shipment ON epcis_events(associated_shipment_id);
CREATE INDEX idx_epcis_events_time ON epcis_events(event_time DESC);
CREATE INDEX idx_epcis_events_biz_step ON epcis_events(biz_step);
