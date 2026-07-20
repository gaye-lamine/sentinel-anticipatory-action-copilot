"""Database and API models for Sentinel."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class ActionAuditLogDB(Base):
    """A durable record of an action proposed or taken in the field."""

    __tablename__ = "action_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    district_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    action_taken: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


class DistrictStatus(BaseModel):
    district_name: str
    drought_probability: float
    trigger_threshold: float = 15.2
    status: str


class AuditLogCreate(BaseModel):
    district_name: str
    role: str
    action_taken: str
    status: str


class AuditLogResponse(AuditLogCreate):
    id: int
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class BriefRequest(BaseModel):
    """Roles for which Sentinel should produce decision briefs."""

    district_name: str
    roles: list[str] = Field(
        default_factory=lambda: [
            "County Drought Coordinator",
            "Water Resources Committee",
            "Community Health Officer",
        ]
    )
