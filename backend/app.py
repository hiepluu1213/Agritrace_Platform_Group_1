"""
app.py - Điểm khởi động ứng dụng Flask.
Đăng ký các blueprint (mỗi domain nghiệp vụ 1 file trong routes/),
cấu hình JSON encoder để serialize được UUID/Decimal/datetime từ PostgreSQL.

Chạy: python3 app.py
"""
import uuid
import decimal
import datetime

from flask import Flask, jsonify
from flask.json.provider import DefaultJSONProvider

from config import Config
from db import init_pool, close_pool
from auth import auth_bp
from routes.master_data import master_bp
from routes.intake import intake_bp
from routes.processing import processing_bp
from routes.transport import transport_bp
from routes.reports import reports_bp


class CustomJSONProvider(DefaultJSONProvider):
    """psycopg2 trả về UUID/Decimal/date - JSONProvider mặc định của Flask không
    tự serialize được các kiểu này, nên override default() để xử lý."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return super().default(obj)


def create_app():
    app = Flask(__name__)
    app.json = CustomJSONProvider(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(master_bp)
    app.register_blueprint(intake_bp)
    app.register_blueprint(processing_bp)
    app.register_blueprint(transport_bp)
    app.register_blueprint(reports_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "agritrace-backend"})

    @app.errorhandler(ValueError)
    def handle_value_error(e):
        return jsonify({"error": str(e)}), 400

    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({"error": "Không tìm thấy endpoint"}), 404

    @app.errorhandler(500)
    def handle_500(e):
        return jsonify({"error": "Lỗi hệ thống, vui lòng thử lại sau"}), 500

    @app.teardown_appcontext
    def _teardown(exception=None):
        pass  # connection đã tự trả về pool trong từng hàm db.py, không cần xử lý thêm

    return app


app = create_app()

if __name__ == "__main__":
    init_pool()
    try:
        app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
    finally:
        close_pool()
