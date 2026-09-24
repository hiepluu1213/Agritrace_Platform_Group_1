"""
config.py - Cấu hình ứng dụng, đọc từ biến môi trường (.env)
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv là optional; nếu không có thì dùng biến môi trường hệ thốngi


class Config:
    # --- PostgreSQL ---
    PGHOST = os.getenv("PGHOST", "localhost")
    PGPORT = int(os.getenv("PGPORT", "5432"))
    PGDATABASE = os.getenv("PGDATABASE", "agritrace")
    PGUSER = os.getenv("PGUSER", "postgres")
    # Mặc định "123456" chỉ để chạy nhanh lúc dev. Nếu mật khẩu Postgres máy bạn
    # khác, có 2 cách sửa (ưu tiên cách 1 để khỏi lộ mật khẩu thật lên git):
    #   1. Tạo file .env (copy từ .env.example) rồi thêm dòng: PGPASSWORD=matkhaucuaban
    #   2. Hoặc sửa trực tiếp giá trị "123456" bên dưới thành mật khẩu của bạn
    PGPASSWORD = os.getenv("PGPASSWORD", "123456")

    DB_POOL_MIN_CONN = int(os.getenv("DB_POOL_MIN_CONN", "1"))
    DB_POOL_MAX_CONN = int(os.getenv("DB_POOL_MAX_CONN", "10"))

    # --- Auth / JWT ---
    JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # 8 giờ

    # --- Flask ---
    DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    PORT = int(os.getenv("PORT", "5000"))
