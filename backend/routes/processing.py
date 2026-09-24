"""
routes/processing.py - Sơ chế 1 lô (processing) và Gộp/Tách Lô (lot_operation).

Gộp (BLEND): N lô nguyên liệu -> 1 lô thành phẩm mới.
Tách (SPLIT): 1 lô -> M lô nhỏ.
Phả hệ được lưu qua lot_operation_input / lot_operation_output,
tra cứu % đóng góp qua view lot_genealogy_view (xem sql/schema.sql).
"""
from flask import Blueprint, request, jsonify, g

from auth import login_required, role_required
from db import fetch_all, fetch_one, execute, transaction

processing_bp = Blueprint("processing", __name__, url_prefix="/api")

BLEND_SPLIT_TOLERANCE_PCT = 1.5  # Dung sai Mass Balance mặc định ±1.5%


# --------------------------------------------------------------------------
# SƠ CHẾ 1 LÔ (không đổi số lượng lô, VD: sấy, rang, phân loại 1 lô riêng lẻ)
# --------------------------------------------------------------------------
@processing_bp.post("/processing")
@login_required
@role_required("MANAGER", "PROCESSING_STAFF")
def create_processing():
    data = request.get_json(force=True) or {}
    required = ["intake_id", "lot_id", "processed_quantity"]
    missing = [f for f in required if data.get(f) is None]
    if missing:
        return jsonify({"error": f"Thiếu trường bắt buộc: {', '.join(missing)}"}), 400

    row = execute(
        """INSERT INTO processing (intake_id, lot_id, processed_by, processing_type, processed_quantity)
           VALUES (%s, %s, %s, %s, %s) RETURNING *""",
        (data["intake_id"], data["lot_id"], g.current_user["user_id"],
         data.get("processing_type"), data["processed_quantity"]),
        returning=True,
    )
    return jsonify(row), 201


@processing_bp.get("/processing")
@login_required
def list_processing():
    rows = fetch_all(
        """SELECT p.*, l.lot_code
           FROM processing p JOIN lot l ON l.lot_id = p.lot_id
           ORDER BY p.processing_date DESC"""
    )
    return jsonify(rows)


# --------------------------------------------------------------------------
# GỘP LÔ (BLEND) - N lô nguyên liệu -> 1 lô thành phẩm mới
# --------------------------------------------------------------------------
@processing_bp.post("/lot-operations/blend")
@login_required
@role_required("MANAGER", "PROCESSING_STAFF")
def blend_lots():
    """
    Body: {
      "output_lot_code": "LOT-BLEND-0001",
      "output_goods_id": "<uuid goods thành phẩm>",
      "note": "Gộp mẻ sấy sáng 23/9",
      "input_lots": [{"lot_id": "...", "quantity": 200}, {"lot_id": "...", "quantity": 300}]
    }
    """
    data = request.get_json(force=True) or {}
    inputs = data.get("input_lots", [])
    if not data.get("output_lot_code") or not data.get("output_goods_id") or len(inputs) < 2:
        return jsonify({
            "error": "Cần output_lot_code, output_goods_id và ít nhất 2 input_lots để gộp"
        }), 400

    with transaction() as cur:
        # Kiểm tra các lô đầu vào tồn tại và còn active
        input_lots = []
        for item in inputs:
            cur.execute("SELECT * FROM lot WHERE lot_id = %s", (item["lot_id"],))
            lot = cur.fetchone()
            if not lot:
                raise ValueError(f"Không tìm thấy lot_id={item['lot_id']}")
            if lot["status"] not in ("active",):
                raise ValueError(f"Lô {lot['lot_code']} đang ở trạng thái '{lot['status']}', không thể gộp")
            input_lots.append((lot, float(item["quantity"])))

        total_qty = sum(q for _, q in input_lots)
        if total_qty <= 0:
            raise ValueError("Tổng khối lượng gộp phải > 0")

        # Tạo intake giả lập cho lô kết quả không cần - lot.intake_id NOT NULL nên
        # ta tái sử dụng cách khác: tạo 1 "intake nội bộ" đại diện cho việc gộp
        # (received_by = người thực hiện, farmer_id = NULL vì không phải từ nông dân).
        cur.execute(
            """INSERT INTO intake (goods_id, farmer_id, received_by, status, quantity)
               VALUES (%s, NULL, %s, 'completed', %s) RETURNING intake_id""",
            (data["output_goods_id"], g.current_user["user_id"], total_qty),
        )
        internal_intake_id = cur.fetchone()["intake_id"]

        cur.execute(
            """INSERT INTO lot (lot_code, intake_id, goods_id, status)
               VALUES (%s, %s, %s, 'active') RETURNING *""",
            (data["output_lot_code"], internal_intake_id, data["output_goods_id"]),
        )
        output_lot = cur.fetchone()

        cur.execute(
            """INSERT INTO lot_operation (operation_type, performed_by, note)
               VALUES ('BLEND', %s, %s) RETURNING operation_id""",
            (g.current_user["user_id"], data.get("note")),
        )
        operation_id = cur.fetchone()["operation_id"]

        for lot, qty in input_lots:
            cur.execute(
                "INSERT INTO lot_operation_input (operation_id, lot_id, quantity) VALUES (%s, %s, %s)",
                (operation_id, lot["lot_id"], qty),
            )
            cur.execute("UPDATE lot SET status='processed' WHERE lot_id = %s", (lot["lot_id"],))

        cur.execute(
            "INSERT INTO lot_operation_output (operation_id, lot_id, quantity) VALUES (%s, %s, %s)",
            (operation_id, output_lot["lot_id"], total_qty),
        )

        cur.execute(
            "SELECT * FROM lot_genealogy_view WHERE operation_id = %s", (operation_id,)
        )
        genealogy = cur.fetchall()

    return jsonify({"output_lot": output_lot, "genealogy": genealogy}), 201


# --------------------------------------------------------------------------
# TÁCH LÔ (SPLIT) - 1 lô -> M lô nhỏ
# --------------------------------------------------------------------------
@processing_bp.post("/lot-operations/split")
@login_required
@role_required("MANAGER", "PROCESSING_STAFF")
def split_lot():
    """
    Body: {
      "input_lot_id": "...",
      "note": "Tách theo đơn hàng xuất khẩu",
      "outputs": [{"lot_code": "LOT-A", "quantity": 100}, {"lot_code": "LOT-B", "quantity": 150}]
    }
    Kiểm tra: tổng khối lượng lô con không vượt khối lượng lô gốc quá dung sai ±1.5%.
    """
    data = request.get_json(force=True) or {}
    outputs = data.get("outputs", [])
    if not data.get("input_lot_id") or len(outputs) < 2:
        return jsonify({"error": "Cần input_lot_id và ít nhất 2 outputs để tách"}), 400

    with transaction() as cur:
        cur.execute("SELECT * FROM lot WHERE lot_id = %s", (data["input_lot_id"],))
        parent_lot = cur.fetchone()
        if not parent_lot:
            raise ValueError("Không tìm thấy lô gốc cần tách")
        if parent_lot["status"] != "active":
            raise ValueError(f"Lô {parent_lot['lot_code']} đang ở trạng thái '{parent_lot['status']}', không thể tách")

        # Lấy tổng khối lượng gốc từ intake liên kết (bảng lot không lưu quantity trực tiếp)
        cur.execute("SELECT quantity FROM intake WHERE intake_id = %s", (parent_lot["intake_id"],))
        parent_qty = float(cur.fetchone()["quantity"])

        total_output_qty = sum(float(o["quantity"]) for o in outputs)
        max_allowed = parent_qty * (1 + BLEND_SPLIT_TOLERANCE_PCT / 100)
        if total_output_qty > max_allowed:
            raise ValueError(
                f"Tổng khối lượng lô con ({total_output_qty}) vượt quá khối lượng lô gốc cho phép "
                f"({max_allowed:.2f}, dung sai ±{BLEND_SPLIT_TOLERANCE_PCT}%) - vi phạm Mass Balance"
            )

        cur.execute(
            """INSERT INTO lot_operation (operation_type, performed_by, note)
               VALUES ('SPLIT', %s, %s) RETURNING operation_id""",
            (g.current_user["user_id"], data.get("note")),
        )
        operation_id = cur.fetchone()["operation_id"]

        cur.execute(
            "INSERT INTO lot_operation_input (operation_id, lot_id, quantity) VALUES (%s, %s, %s)",
            (operation_id, parent_lot["lot_id"], parent_qty),
        )

        created_lots = []
        for o in outputs:
            cur.execute(
                """INSERT INTO intake (goods_id, farmer_id, received_by, status, quantity)
                   VALUES (%s, %s, %s, 'completed', %s) RETURNING intake_id""",
                (parent_lot["goods_id"], parent_lot["farmer_id"], g.current_user["user_id"],
                 o["quantity"]),
            )
            child_intake_id = cur.fetchone()["intake_id"]

            cur.execute(
                """INSERT INTO lot (lot_code, intake_id, goods_id, farmer_id, status)
                   VALUES (%s, %s, %s, %s, 'active') RETURNING *""",
                (o["lot_code"], child_intake_id, parent_lot["goods_id"], parent_lot["farmer_id"]),
            )
            child_lot = cur.fetchone()
            created_lots.append(child_lot)

            cur.execute(
                "INSERT INTO lot_operation_output (operation_id, lot_id, quantity) VALUES (%s, %s, %s)",
                (operation_id, child_lot["lot_id"], o["quantity"]),
            )

        cur.execute("UPDATE lot SET status='processed' WHERE lot_id = %s", (parent_lot["lot_id"],))

        cur.execute(
            "SELECT * FROM lot_genealogy_view WHERE operation_id = %s", (operation_id,)
        )
        genealogy = cur.fetchall()

    return jsonify({"parent_lot_id": parent_lot["lot_id"], "created_lots": created_lots,
                     "genealogy": genealogy}), 201


# --------------------------------------------------------------------------
# TRUY VẾT PHẢ HỆ 1 LÔ
# --------------------------------------------------------------------------
@processing_bp.get("/lots/<lot_id>/genealogy")
@login_required
def lot_genealogy(lot_id):
    lot = fetch_one("SELECT * FROM lot WHERE lot_id = %s", (lot_id,))
    if not lot:
        return jsonify({"error": "Không tìm thấy lô"}), 404
    as_result = fetch_all(
        "SELECT * FROM lot_genealogy_view WHERE result_lot_id = %s", (lot_id,))
    as_source = fetch_all(
        "SELECT * FROM lot_genealogy_view WHERE source_lot_id = %s", (lot_id,))
    return jsonify({
        "lot": lot,
        "created_from": as_result,   # lô này là kết quả của (các) lô nào (khi BLEND) hoặc lô gốc nào (khi là output của SPLIT)
        "used_in": as_source,        # lô này đã được dùng làm nguyên liệu cho (các) thao tác nào
    })
