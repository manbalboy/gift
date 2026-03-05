from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Index, JSON, String, Text, desc
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class SystemAlertLog(Base):
    __tablename__ = "system_alert_logs"
    __table_args__ = (
        Index("ix_system_alert_logs_created_at_desc", desc("created_at"), desc("id")),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: f"alert-{uuid4().hex[:12]}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    level: Mapped[str] = mapped_column(String(16), default="warning", nullable=False)
    code: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    context: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
