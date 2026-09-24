"""
routes/reports.py - Báo cáo tổng hợp số liệu theo ngày (daily_report).
"""
from datetime import date as date_cls

from flask import Blueprint, request, jsonify, g

from auth import login_required, role_required
from db import fetch_all, fetch_one, execute

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@reports_bp.post("/daily/generate")
@login_required
@role_required("MANAGER")
def generate_daily_report():
    """
    Tổng hợp số liệu 1 ngày từ intake/processing/waybill rồi lưu (upsert) vào daily_report.
    Body: { "report_date": "YYYY-MM-DD" } (mặc định = hôm nay)
    """
    data = request.get_json(silent=True) or {}
    report_date = data.get("report_date") or date_cls.today().isoformat()

    intake_sum = fetch_one(
        "SELECT COALESCE(SUM(quantity), 0) AS total FROM intake WHERE intake_date::date = %s",
        (report_date,))["total"]
    processed_sum = fetch_one(
        "SELECT COALESCE(SUM(processed_quantity), 0) AS total FROM processing "
        "WHERE processing_date::date = %s", (report_date,))["total"]
    shipment_count = fetch_one(
        "SELECT COUNT(*) AS total FROM waybill WHERE shipping_date::date = %s",
        (report_date,))["total"]

    existing = fetch_one("SELECT report_id FROM daily_report WHERE report_date = %s", (report_date,))
    if existing:
        row = execute(
            """UPDATE daily_report
               SET total_intake_qty=%s, total_processed_qty=%s, total_shipments=%s, created_by=%s
               WHERE report_date=%s RETURNING *""",
            (intake_sum, processed_sum, shipment_count, g.current_user["user_id"], report_date),
            returning=True,
        )
    else:
        row = execute(
            """INSERT INTO daily_report
               (report_date, total_intake_qty, total_processed_qty, total_shipments, created_by)
               VALUES (%s, %s, %s, %s, %s) RETURNING *""",
            (report_date, intake_sum, processed_sum, shipment_count, g.current_user["user_id"]),
            returning=True,
        )
    return jsonify(row), 201


@reports_bp.get("/daily")
@login_required
def list_daily_reports():
    q = "SELECT * FROM daily_report"
    params = []
    if request.args.get("from"):
        q += " WHERE report_date >= %s"
        params.append(request.args["from"])
    q += " ORDER BY report_date DESC"
    return jsonify(fetch_all(q, params))


@reports_bp.get("/daily/<report_date>")
@login_required
def get_daily_report(report_date):
    row = fetch_one("SELECT * FROM daily_report WHERE report_date = %s", (report_date,))
    if not row:
        return jsonify({"error": "Chưa có báo cáo cho ngày này"}), 404
    return jsonify(row)
