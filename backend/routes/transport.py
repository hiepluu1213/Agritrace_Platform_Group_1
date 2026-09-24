"""
routes/transport.py - Vận đơn (waybill), theo dõi hành trình (shipment_tracking),
xác nhận giao hàng (delivery_confirmation).
"""
from flask import Blueprint, request, jsonify, g

from auth import login_required, role_required
from db import fetch_all, fetch_one, execute

transport_bp = Blueprint("transport", __name__, url_prefix="/api")

VALID_WAYBILL_STATUS = ["assigned", "in_transit", "delivered", "cancelled"]


def _get_driver_id_of_current_user():
    row = fetch_one("SELECT driver_id FROM driver WHERE user_id = %s", (g.current_user["user_id"],))
    return row["driver_id"] if row else None


# --------------------------------------------------------------------------
# WAYBILL - Vận đơn / Điều phối vận chuyển
# --------------------------------------------------------------------------
@transport_bp.post("/waybills")
@login_required
@role_required("MANAGER", "DISPATCH_STAFF")
def create_waybill():
    data = request.get_json(force=True) or {}
    required = ["processing_id", "lot_id", "vehicle_id"]
    missing = [f for f in required if not data.get(f)]

    if missing:
        return jsonify({"error": f"Thiếu trường bắt buộc: {', '.join(missing)}"}), 400

    row = execute(
        """INSERT INTO waybill (processing_id, lot_id, vehicle_id, created_by, origin, destination)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
        (
            data["processing_id"],
            data["lot_id"],
            data["vehicle_id"],
            g.current_user["user_id"],
            data.get("origin"),
            data.get("destination")
        ),
        returning=True,
    )

    return jsonify(row), 201


@transport_bp.get("/waybills")
@login_required
def list_waybills():
    q = """SELECT w.*, l.lot_code, v.license_plate, d.full_name AS driver_name
           FROM waybill w
           JOIN lot l ON l.lot_id = w.lot_id
           JOIN vehicle v ON v.vehicle_id = w.vehicle_id
           JOIN driver d ON d.driver_id = v.driver_id"""

    params = []

    # Tài xế chỉ thấy vận đơn của chính mình; các role khác thấy hết
    if g.current_user["role_code"] == "DRIVER":
        driver_id = _get_driver_id_of_current_user()
        q += " WHERE d.driver_id = %s"
        params.append(driver_id)

    q += " ORDER BY w.shipping_date DESC"

    return jsonify(fetch_all(q, params))


@transport_bp.get("/waybills/<waybill_id>")
@login_required
def get_waybill(waybill_id):
    row = fetch_one(
        """SELECT w.*, l.lot_code, v.license_plate, d.full_name AS driver_name, d.driver_id
           FROM waybill w
           JOIN lot l ON l.lot_id = w.lot_id
           JOIN vehicle v ON v.vehicle_id = w.vehicle_id
           JOIN driver d ON d.driver_id = v.driver_id
           WHERE w.waybill_id = %s""",
        (waybill_id,)
    )

    if not row:
        return jsonify({"error": "Không tìm thấy vận đơn"}), 404

    row["tracking"] = fetch_all(
        "SELECT * FROM shipment_tracking WHERE waybill_id = %s ORDER BY update_time",
        (waybill_id,)
    )

    row["delivery_confirmation"] = fetch_one(
        "SELECT * FROM delivery_confirmation WHERE waybill_id = %s",
        (waybill_id,)
    )

    return jsonify(row)


@transport_bp.patch("/waybills/<waybill_id>/status")
@login_required
@role_required("MANAGER", "DISPATCH_STAFF", "DRIVER")
def update_waybill_status(waybill_id):
    """Cập nhật trạng thái: assigned -> in_transit -> delivered / cancelled."""
    data = request.get_json(force=True) or {}

    if data.get("status") not in VALID_WAYBILL_STATUS:
        return jsonify({
            "error": f"status phải là một trong: {VALID_WAYBILL_STATUS}"
        }), 400

    if g.current_user["role_code"] == "DRIVER":
        driver_id = _get_driver_id_of_current_user()

        owns = fetch_one(
            """SELECT w.waybill_id
               FROM waybill w
               JOIN vehicle v ON v.vehicle_id = w.vehicle_id
               WHERE w.waybill_id = %s
               AND v.driver_id = %s""",
            (waybill_id, driver_id)
        )

        if not owns:
            return jsonify({"error": "Bạn không phụ trách vận đơn này"}), 403

    row = execute(
        "UPDATE waybill SET status=%s WHERE waybill_id=%s RETURNING *",
        (data["status"], waybill_id),
        returning=True
    )

    if not row:
        return jsonify({"error": "Không tìm thấy vận đơn"}), 404

    return jsonify(row)


# --------------------------------------------------------------------------
# SHIPMENT TRACKING - Cập nhật vị trí / trạm dừng trong hành trình
# --------------------------------------------------------------------------
@transport_bp.post("/waybills/<waybill_id>/tracking")
@login_required
@role_required("MANAGER", "DISPATCH_STAFF", "DRIVER")
def add_tracking(waybill_id):
    """
    Body: { "status", "current_location", "note" }
    current_location lưu tên / mô tả trạm dừng dưới dạng TEXT.
    """
    data = request.get_json(force=True) or {}

    if not data.get("status"):
        return jsonify({"error": "Thiếu status"}), 400

    sql = """INSERT INTO shipment_tracking
             (waybill_id, updated_by, status, current_location, note)
             VALUES (%s, %s, %s, %s, %s) RETURNING *"""

    params = (
        waybill_id,
        g.current_user["user_id"],
        data["status"],
        data.get("current_location"),
        data.get("note")
    )

    row = execute(sql, params, returning=True)

    return jsonify(row), 201


@transport_bp.get("/waybills/<waybill_id>/tracking")
@login_required
def list_tracking(waybill_id):
    rows = fetch_all(
        "SELECT * FROM shipment_tracking WHERE waybill_id = %s ORDER BY update_time",
        (waybill_id,)
    )

    return jsonify(rows)


# --------------------------------------------------------------------------
# DELIVERY CONFIRMATION - Xác nhận giao hàng thành công
# --------------------------------------------------------------------------
@transport_bp.post("/waybills/<waybill_id>/delivery-confirmation")
@login_required
@role_required("DRIVER", "MANAGER")
def confirm_delivery(waybill_id):
    data = request.get_json(force=True) or {}

    if not data.get("recipient_name"):
        return jsonify({"error": "Thiếu recipient_name"}), 400

    driver_id = data.get("driver_id")

    if g.current_user["role_code"] == "DRIVER":
        driver_id = _get_driver_id_of_current_user()

        if not driver_id:
            return jsonify({"error": "Tài khoản chưa gắn hồ sơ tài xế"}), 400

    row = execute(
        """INSERT INTO delivery_confirmation
           (waybill_id, driver_id, recipient_name, recipient_phone, proof_image_url, notes)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
        (
            waybill_id,
            driver_id,
            data["recipient_name"],
            data.get("recipient_phone"),
            data.get("proof_image_url"),
            data.get("notes")
        ),
        returning=True
    )

    execute(
        "UPDATE waybill SET status='delivered' WHERE waybill_id=%s",
        (waybill_id,)
    )

    return jsonify(row), 201