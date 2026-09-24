"""
db.py - Quản lý kết nối PostgreSQL (psycopg2 connection pool) và các hàm
tiện ích để chạy query, trả kết quả dạng dict (RealDictCursor).

Yêu cầu: pip install psycopg2-binary
"""
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

from config import Config

_pool = None


def init_pool():
    """Khởi tạo connection pool. Gọi 1 lần khi ứng dụng start."""
    global _pool
    if _pool is not None:
        return
    _pool = psycopg2.pool.ThreadedConnectionPool(
        Config.DB_POOL_MIN_CONN,
        Config.DB_POOL_MAX_CONN,
        host=Config.PGHOST,
        port=Config.PGPORT,
        dbname=Config.PGDATABASE,
        user=Config.PGUSER,
        password=Config.PGPASSWORD,
    )


def close_pool():
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


@contextmanager
def get_conn():
    """Lấy 1 connection từ pool, tự động trả lại pool khi xong (kể cả khi lỗi)."""
    if _pool is None:
        init_pool()
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


def fetch_all(sql, params=None):
    """Chạy SELECT, trả về list[dict]."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]


def fetch_one(sql, params=None):
    """Chạy SELECT, trả về 1 dict hoặc None."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None


def execute(sql, params=None, returning=False):
    """
    Chạy INSERT/UPDATE/DELETE.
    - returning=True: dùng khi câu SQL có mệnh đề `RETURNING ...`,
      trả về dict của dòng vừa RETURNING (thường dùng lấy id vừa tạo).
    - returning=False: trả về số dòng bị ảnh hưởng (rowcount).
    Tự commit; tự rollback nếu có lỗi.
    """
    with get_conn() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params or ())
                if returning:
                    row = cur.fetchone()
                    conn.commit()
                    return dict(row) if row else None
                conn.commit()
                return cur.rowcount
        except Exception:
            conn.rollback()
            raise


@contextmanager
def transaction():
    """
    Context manager cho các thao tác cần nhiều câu SQL trong 1 giao dịch
    (VD: Gộp lô = tạo lot_operation + nhiều input + 1 output + update status).
    Dùng: 
        with transaction() as cur:
            cur.execute(...)
            cur.execute(...)
    Tự commit khi thoát khối `with` thành công, tự rollback nếu có exception.
    """
    if _pool is None:
        init_pool()
    conn = _pool.getconn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        _pool.putconn(conn)
