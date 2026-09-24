"""
routes/master_data.py - CRUD Danh mục: Hàng hóa (goods), Nông dân (farmer),
Tài xế (driver), Xe (vehicle).
Ai đăng nhập cũng xem được (GET); chỉ MANAGER được tạo/sửa/xóa.
"""
from flask import Blueprint, request, jsonify, g

from auth import login_required, role_required
from db import fetch_all, fetch_one, execute

master_bp = Blueprint("master_data", __name__, url_prefix="/api")


# --------------------------------------------------------------------------
# GOODS - Danh mục hàng hóa / nông sản
# --------------------------------------------------------------------------
@master_bp.get("/goods")
@login_required
def list_goods():
    return jsonify(fetch_all("SELECT * FROM goods ORDER BY goods_name"))


@master_bp.get("/goods/<goods_id>")
@login_required
def get_goods(goods_id):
    row = fetch_one("SELECT * FROM goods WHERE goods_id = %s", (goods_id,))
    if not row:
        return jsonify({"error": "Không tìm thấy hàng hóa"}), 404
    return jsonify(row)


@master_bp.post("/goods")
@login_required
@role_required("MANAGER")
def create_goods():
    data = request.get_json(force=True) or {}
    if not data.get("goods_name"):
        return jsonify({"error": "Thiếu goods_name"}), 400
    row = execute(
        """INSERT INTO goods (goods_code, goods_name, unit, category)
           VALUES (%s, %s, %s, %s) RETURNING *""",
        (data.get("goods_code"), data["goods_name"], data.get("unit"), data.get("category")),
        returning=True,
    )
    return jsonify(row), 201


@master_bp.put("/goods/<goods_id>")
@login_required
@role_required("MANAGER")
def update_goods(goods_id):
    data = request.get_json(force=True) or {}
    row = execute(
        """UPDATE goods SET goods_code=%s, goods_name=%s, unit=%s, category=%s
           WHERE goods_id=%s RETURNING *""",
        (data.get("goods_code"), data.get("goods_name"), data.get("unit"),
         data.get("category"), goods_id),
        returning=True,
    )
    if not row:
        return jsonify({"error": "Không tìm thấy hàng hóa"}), 404
    return jsonify(row)


@master_bp.delete("/goods/<goods_id>")
@login_required
@role_required("MANAGER")
def delete_goods(goods_id):
    n = execute("DELETE FROM goods WHERE goods_id=%s", (goods_id,))
    if n == 0:
        return jsonify({"error": "Không tìm thấy hàng hóa"}), 404
    return jsonify({"deleted": goods_id})


# --------------------------------------------------------------------------
# FARMER - Nông dân
# --------------------------------------------------------------------------
@master_bp.get("/farmers")
@login_required
def list_farmers():
    return jsonify(fetch_all("SELECT * FROM farmer ORDER BY full_name"))


@master_bp.get("/farmers/<farmer_id>")
@login_required
def get_farmer(farmer_id):
    row = fetch_one("SELECT * FROM farmer WHERE farmer_id = %s", (farmer_id,))
    if not row:
        return jsonify({"error": "Không tìm thấy nông dân"}), 404
    return jsonify(row)


@master_bp.post("/farmers")
@login_required
@role_required("MANAGER", "RECEIVING_STAFF")
def create_farmer():
    data = request.get_json(force=True) or {}
    if not data.get("full_name"):
        return jsonify({"error": "Thiếu full_name"}), 400
    row = execute(
        "INSERT INTO farmer (full_name, phone, address) VALUES (%s, %s, %s) RETURNING *",
        (data["full_name"], data.get("phone"), data.get("address")),
        returning=True,
    )
    return jsonify(row), 201


@master_bp.put("/farmers/<farmer_id>")
@login_required
@role_required("MANAGER", "RECEIVING_STAFF")
def update_farmer(farmer_id):
    data = request.get_json(force=True) or {}
    row = execute(
        "UPDATE farmer SET full_name=%s, phone=%s, address=%s WHERE farmer_id=%s RETURNING *",
        (data.get("full_name"), data.get("phone"), data.get("address"), farmer_id),
        returning=True,
    )
    if not row:
        return jsonify({"error": "Không tìm thấy nông dân"}), 404
    return jsonify(row)


@master_bp.delete("/farmers/<farmer_id>")
@login_required
@role_required("MANAGER")
def delete_farmer(farmer_id):
    n = execute("DELETE FROM farmer WHERE farmer_id=%s", (farmer_id,))
    if n == 0:
        return jsonify({"error": "Không tìm thấy nông dân"}), 404
    return jsonify({"deleted": farmer_id})


# --------------------------------------------------------------------------
# DRIVER + VEHICLE - Tài xế & Xe (1-1: mỗi tài xế gắn 1 xe theo schema hiện tại)
# --------------------------------------------------------------------------
@master_bp.get("/drivers")
@login_required
def list_drivers():
    rows = fetch_all(
        """SELECT d.*, v.vehicle_id, v.license_plate, v.vehicle_type, v.capacity
           FROM driver d LEFT JOIN vehicle v ON v.driver_id = d.driver_id
           ORDER BY d.full_name"""
    )
    return jsonify(rows)


@master_bp.get("/drivers/<driver_id>")
@login_required
def get_driver(driver_id):
    row = fetch_one(
        """SELECT d.*, v.vehicle_id, v.license_plate, v.vehicle_type, v.capacity
           FROM driver d LEFT JOIN vehicle v ON v.driver_id = d.driver_id
           WHERE d.driver_id = %s""", (driver_id,))
    if not row:
        return jsonify({"error": "Không tìm thấy tài xế"}), 404
    return jsonify(row)


@master_bp.post("/drivers")
@login_required
@role_required("MANAGER", "DISPATCH_STAFF")
def create_driver():
    """Tạo hồ sơ tài xế thủ công (không qua đăng ký tài khoản). Có thể kèm xe luôn."""
    data = request.get_json(force=True) or {}
    if not data.get("full_name"):
        return jsonify({"error": "Thiếu full_name"}), 400
    driver = execute(
        "INSERT INTO driver (user_id, full_name, phone) VALUES (%s, %s, %s) RETURNING *",
        (data.get("user_id"), data["full_name"], data.get("phone")),
        returning=True,
    )
    if data.get("license_plate"):
        execute(
            """INSERT INTO vehicle (driver_id, license_plate, vehicle_type, capacity)
               VALUES (%s, %s, %s, %s)""",
            (driver["driver_id"], data["license_plate"], data.get("vehicle_type"),
             data.get("capacity")),
        )
    return jsonify(driver), 201


@master_bp.put("/drivers/<driver_id>/vehicle")
@login_required
@role_required("MANAGER", "DISPATCH_STAFF")
def upsert_vehicle(driver_id):
    """Gán / cập nhật xe cho 1 tài xế."""
    data = request.get_json(force=True) or {}
    if not data.get("license_plate"):
        return jsonify({"error": "Thiếu license_plate"}), 400
    existing = fetch_one("SELECT vehicle_id FROM vehicle WHERE driver_id=%s", (driver_id,))
    if existing:
        row = execute(
            """UPDATE vehicle SET license_plate=%s, vehicle_type=%s, capacity=%s
               WHERE driver_id=%s RETURNING *""",
            (data["license_plate"], data.get("vehicle_type"), data.get("capacity"), driver_id),
            returning=True,
        )
    else:
        row = execute(
            """INSERT INTO vehicle (driver_id, license_plate, vehicle_type, capacity)
               VALUES (%s, %s, %s, %s) RETURNING *""",
            (driver_id, data["license_plate"], data.get("vehicle_type"), data.get("capacity")),
            returning=True,
        )
    return jsonify(row)
