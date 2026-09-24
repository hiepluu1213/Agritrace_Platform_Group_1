"""
routes/intake.py - Tiếp nhận nông sản từ nông dân (Intake) và tạo Lô (Lot).

1 phiếu tiếp nhận (intake) luôn sinh ra đúng 1 lô ban đầu (lot) - quan hệ 1-1
theo đúng schema. Việc gộp/tách lô sau này nằm ở routes/processing.py.
"""
import random
import string
from datetime import date

from flask import Blueprint, request, jsonify, g

from auth import login_required, role_required
from db import fetch_all, fetch_one, transaction

intake_bp = Blueprint("intake", __name__, url_prefix="/api")


def _generate_lot_code():
    today = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.digits, k=4))
    return f"LOT-{today}-{suffix}"


@intake_bp.post("/intakes")
@login_required
@role_required("MANAGER", "RECEIVING_STAFF")
def create_intake():
    """
    Tạo phiếu tiếp nhận + lô mới trong 1 giao dịch.
    Body: { "goods_id", "farmer_id"(optional), "quantity", "lot_code"(optional) }
    """
    data = request.get_json(force=True) or {}
    if not data.get("goods_id") or not data.get("quantity"):
        return jsonify({"error": "Thiếu goods_id hoặc quantity"}), 400
    if float(data["quantity"]) <= 0:
        return jsonify({"error": "quantity phải > 0"}), 400

    lot_code = data.get("lot_code") or _generate_lot_code()

    with transaction() as cur:
        cur.execute(
            """INSERT INTO intake (goods_id, farmer_id, received_by, quantity)
               VALUES (%s, %s, %s, %s)
               RETURNING *""",
            (data["goods_id"], data.get("farmer_id"), g.current_user["user_id"],
             data["quantity"]),
        )
        intake = cur.fetchone()

        cur.execute(
            """INSERT INTO lot (lot_code, intake_id, goods_id, farmer_id)
               VALUES (%s, %s, %s, %s)
               RETURNING *""",
            (lot_code, intake["intake_id"], data["goods_id"], data.get("farmer_id")),
        )
        lot = cur.fetchone()

    return jsonify({"intake": intake, "lot": lot}), 201


@intake_bp.get("/intakes")
@login_required
def list_intakes():
    q = "SELECT i.*, l.lot_id, l.lot_code, g.goods_name, f.full_name AS farmer_name " \
        "FROM intake i " \
        "JOIN lot l ON l.intake_id = i.intake_id " \
        "JOIN goods g ON g.goods_id = i.goods_id " \
        "LEFT JOIN farmer f ON f.farmer_id = i.farmer_id "
    params = []
    if request.args.get("status"):
        q += " WHERE i.status = %s"
        params.append(request.args["status"])
    q += " ORDER BY i.intake_date DESC"
    return jsonify(fetch_all(q, params))


@intake_bp.get("/intakes/<intake_id>")
@login_required
def get_intake(intake_id):
    row = fetch_one(
        "SELECT i.*, l.lot_id, l.lot_code, l.status AS lot_status "
        "FROM intake i JOIN lot l ON l.intake_id = i.intake_id "
        "WHERE i.intake_id = %s", (intake_id,))
    if not row:
        return jsonify({"error": "Không tìm thấy phiếu tiếp nhận"}), 404
    return jsonify(row)


@intake_bp.patch("/intakes/<intake_id>/status")
@login_required
@role_required("MANAGER", "RECEIVING_STAFF")
def update_intake_status(intake_id):
    from db import execute
    data = request.get_json(force=True) or {}
    valid = ["received", "processing", "completed", "cancelled"]
    if data.get("status") not in valid:
        return jsonify({"error": f"status phải là một trong: {valid}"}), 400
    row = execute(
        "UPDATE intake SET status=%s WHERE intake_id=%s RETURNING *",
        (data["status"], intake_id), returning=True,
    )
    if not row:
        return jsonify({"error": "Không tìm thấy phiếu tiếp nhận"}), 404
    return jsonify(row)
