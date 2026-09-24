"""
auth.py - Đăng ký / Đăng nhập / JWT / Decorator phân quyền theo role.

Endpoints:
    POST /api/auth/register  - Đăng ký tài khoản mới
    POST /api/auth/login     - Đăng nhập, trả về JWT access token
    GET  /api/auth/me        - Lấy thông tin tài khoản đang đăng nhập

Dùng werkzeug.security (đã có sẵn trong Flask) để hash mật khẩu,
không cần cài thêm bcrypt/passlib.
"""
from functools import wraps
from datetime import datetime, timedelta, timezone

import jwt
from flask import Blueprint, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from db import fetch_one, execute

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

VALID_ROLE_CODES = [
    "MANAGER", "RECEIVING_STAFF", "PROCESSING_STAFF", "DISPATCH_STAFF", "DRIVER"
]


# --------------------------------------------------------------------------
# Hàm tiện ích: hash / verify mật khẩu, tạo / giải mã JWT
# --------------------------------------------------------------------------
def hash_password(raw_password: str) -> str:
    return generate_password_hash(raw_password)


def verify_password(raw_password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, raw_password)


def generate_token(user: dict) -> str:
    payload = {
        "sub": str(user["user_id"]),
        "username": user["username"],
        "role_code": user["role_code"],
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=Config.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Raise jwt.PyJWTError nếu token không hợp lệ / hết hạn."""
    return jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])


# --------------------------------------------------------------------------
# Decorators dùng ở các route khác (import từ auth.py)
# --------------------------------------------------------------------------
def login_required(fn):
    """Yêu cầu có Authorization: Bearer <token> hợp lệ. Gắn user vào g.current_user."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Thiếu hoặc sai định dạng Authorization header (Bearer <token>)"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token đã hết hạn, vui lòng đăng nhập lại"}), 401
        except jwt.PyJWTError:
            return jsonify({"error": "Token không hợp lệ"}), 401

        user = fetch_one(
            "SELECT user_id, username, full_name, role_code, phone, status "
            "FROM app_user WHERE user_id = %s",
            (payload["sub"],),
        )
        if not user or user["status"] != "active":
            return jsonify({"error": "Tài khoản không tồn tại hoặc đã bị khóa"}), 401

        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def role_required(*allowed_roles):
    """Dùng sau @login_required. VD: @role_required('MANAGER', 'DISPATCH_STAFF')"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not hasattr(g, "current_user"):
                return jsonify({"error": "Chưa xác thực (thiếu @login_required)"}), 401
            if g.current_user["role_code"] not in allowed_roles:
                return jsonify({
                    "error": f"Không đủ quyền. Yêu cầu 1 trong các vai trò: {list(allowed_roles)}"
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@auth_bp.post("/register")
def register():
    """
    Đăng ký tài khoản mới.
    Body: { "username", "password", "full_name", "role_code", "phone"(optional) }
    """
    data = request.get_json(force=True) or {}
    required = ["username", "password", "full_name", "role_code"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Thiếu trường bắt buộc: {', '.join(missing)}"}), 400

    if data["role_code"] not in VALID_ROLE_CODES:
        return jsonify({"error": f"role_code phải là một trong: {VALID_ROLE_CODES}"}), 400

    if len(data["password"]) < 6:
        return jsonify({"error": "Mật khẩu phải có ít nhất 6 ký tự"}), 400

    existing = fetch_one("SELECT user_id FROM app_user WHERE username = %s", (data["username"],))
    if existing:
        return jsonify({"error": "Username đã tồn tại"}), 409

    user = execute(
        """INSERT INTO app_user (username, password_hash, full_name, role_code, phone)
           VALUES (%s, %s, %s, %s, %s)
           RETURNING user_id, username, full_name, role_code, phone, status, created_at""",
        (data["username"], hash_password(data["password"]), data["full_name"],
         data["role_code"], data.get("phone")),
        returning=True,
    )

    # Nếu đăng ký với vai trò DRIVER, tự động tạo luôn hồ sơ driver liên kết
    if user["role_code"] == "DRIVER":
        execute(
            "INSERT INTO driver (user_id, full_name, phone) VALUES (%s, %s, %s)",
            (user["user_id"], user["full_name"], user.get("phone")),
        )

    token = generate_token(user)
    return jsonify({"user": user, "access_token": token}), 201


@auth_bp.post("/login")
def login():
    """Body: { "username", "password" } -> trả về access_token (JWT)."""
    data = request.get_json(force=True) or {}
    if not data.get("username") or not data.get("password"):
        return jsonify({"error": "Thiếu username hoặc password"}), 400

    user = fetch_one(
        "SELECT user_id, username, password_hash, full_name, role_code, phone, status "
        "FROM app_user WHERE username = %s",
        (data["username"],),
    )
    if not user or not verify_password(data["password"], user["password_hash"]):
        return jsonify({"error": "Sai username hoặc password"}), 401

    if user["status"] != "active":
        return jsonify({"error": "Tài khoản đã bị khóa"}), 403

    user.pop("password_hash", None)
    token = generate_token(user)
    return jsonify({"user": user, "access_token": token})


@auth_bp.get("/me")
@login_required
def me():
    return jsonify(g.current_user)
