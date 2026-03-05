from fastapi import APIRouter, HTTPException, Query

from app.schemas.logs import SystemAlertClearOut, SystemAlertPageOut
from app.services.system_alerts import clear_system_alerts, list_system_alerts_page


router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/system-alerts", response_model=SystemAlertPageOut)
def get_system_alerts(
    limit: int = Query(default=50, ge=1, le=50),
    cursor: str | None = Query(default=None),
):
    try:
        return list_system_alerts_page(limit=limit, cursor=cursor)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/system-alerts", response_model=SystemAlertClearOut)
def delete_system_alerts():
    return {"cleared_count": clear_system_alerts()}
