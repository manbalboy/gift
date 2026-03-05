from fastapi import APIRouter, Query

from app.schemas.logs import SystemAlertOut
from app.services.system_alerts import list_system_alerts


router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/system-alerts", response_model=list[SystemAlertOut])
def get_system_alerts(limit: int = Query(default=50, ge=1, le=50)):
    return list_system_alerts(limit)
