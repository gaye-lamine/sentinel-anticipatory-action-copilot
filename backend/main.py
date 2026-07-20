"""FastAPI application for Sentinel's data and accountability services."""

from collections.abc import Generator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .agent import (
    DistrictBriefResponse,
    GeminiConfigurationError,
    GeminiGenerationError,
    generate_decision_briefs,
)
from .database import Base, engine, get_db
from .models import ActionAuditLogDB, AuditLogCreate, AuditLogResponse, BriefRequest, DistrictStatus
from .services import get_district_status, load_district_geojson, load_district_statuses


app = FastAPI(title="Sentinel API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_database_tables() -> None:
    """Create the audit-log table before requests are served."""
    Base.metadata.create_all(bind=engine)


@app.get("/api/v1/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/api/v1/districts/status", response_model=list[DistrictStatus])
def district_statuses() -> list[DistrictStatus]:
    return load_district_statuses()


@app.get("/api/v1/districts/geojson")
def district_geojson() -> dict:
    return load_district_geojson()


@app.post("/api/v1/agent/generate-briefs", response_model=DistrictBriefResponse)
def generate_briefs(payload: BriefRequest) -> DistrictBriefResponse:
    district = get_district_status(payload.district_name)
    if district is None:
        raise HTTPException(status_code=404, detail="District not found in the ICPAC results CSV.")

    try:
        return generate_decision_briefs(
            district_name=district.district_name,
            drought_prob=district.drought_probability,
            roles=payload.roles,
        )
    except GeminiConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Gemini is not configured. Set GEMINI_API_KEY.") from exc
    except GeminiGenerationError as exc:
        raise HTTPException(status_code=502, detail="Gemini could not generate decision briefs.") from exc


@app.post("/api/v1/audit/logs", response_model=AuditLogResponse, status_code=201)
def create_audit_log(payload: AuditLogCreate, db: Session = Depends(get_db)) -> ActionAuditLogDB:
    audit_log = ActionAuditLogDB(**payload.model_dump())
    db.add(audit_log)
    db.commit()
    db.refresh(audit_log)
    return audit_log


@app.get("/api/v1/audit/logs", response_model=list[AuditLogResponse])
def list_audit_logs(db: Session = Depends(get_db)) -> list[ActionAuditLogDB]:
    statement = select(ActionAuditLogDB).order_by(ActionAuditLogDB.timestamp.desc())
    return list(db.scalars(statement))
