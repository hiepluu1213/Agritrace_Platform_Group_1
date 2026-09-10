CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- 1. Table: GOODS
CREATE TABLE goods (
    goods_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_name  VARCHAR(150) NOT NULL,
    unit        VARCHAR(20),
    category    VARCHAR(50),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- 2. Table: INTAKE (TIẾP NHẬN)
CREATE TABLE intake (
    intake_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_id     UUID NOT NULL REFERENCES goods(goods_id),
    intake_date  TIMESTAMP NOT NULL DEFAULT now(),
    status       VARCHAR(30) NOT NULL DEFAULT 'received',
    quantity     NUMERIC(10,2) NOT NULL
);

-- 3. Table: PROCESSING (SƠ CHẾ)
CREATE TABLE processing (
    processing_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intake_id            UUID NOT NULL REFERENCES intake(intake_id),
    processing_date      TIMESTAMP NOT NULL DEFAULT now(),
    processing_type      VARCHAR(50),
    processed_quantity   NUMERIC(10,2),
    status               VARCHAR(30) NOT NULL DEFAULT 'in_progress'
);

-- 4. Table: DRIVER
CREATE TABLE driver (
    driver_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name    VARCHAR(150) NOT NULL,
    phone        VARCHAR(20),
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- 5. Table: VEHICLE
CREATE TABLE vehicle (
    vehicle_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id     UUID UNIQUE NOT NULL REFERENCES driver(driver_id), -- 1-1 relationship
    license_plate VARCHAR(20) NOT NULL,
    vehicle_type  VARCHAR(50),
    capacity      NUMERIC(10,2)
);

-- 6. Table: SHIPMENT / WAYBILL (VẬN ĐƠN)
CREATE TABLE shipment (
    shipment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_id     UUID NOT NULL REFERENCES processing(processing_id),
    vehicle_id        UUID NOT NULL REFERENCES vehicle(vehicle_id),
    status            VARCHAR(30) NOT NULL DEFAULT 'pending',
    destination       VARCHAR(255),
    origin            VARCHAR(255),
    shipping_date     TIMESTAMP NOT NULL DEFAULT now()
);