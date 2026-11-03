from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.api.deps import get_current_user, get_file_key
from app.db.session import get_db
from app.models import Analysis, User
from app.schemas.analysis import AnalysisCreate, AnalysisOut, AnalysisSummary
from app.services.analysis_engine import AnalysisInputError, run_analysis
from app.services import stats
from app.services.symptoms import LABELS

router = APIRouter(prefix="/analyses", tags=["analysis"])


@router.get("/symptoms")
def symptom_catalog():
    """Symptom vocabulary used by the screening engine."""
    return [{"key": k, "label": v} for k, v in LABELS.items()]


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
def create_analysis(body: AnalysisCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                    file_key: bytes | None = Depends(get_file_key)):
    try:
        result = run_analysis(db, user, body, file_key)
    except AnalysisInputError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    a = Analysis(
        user_id=user.id, status="completed", inputs=body.model_dump(), result=result,
        urgency=result["urgency"], provider=result["provenance"]["explanation_provider"], is_mock=result["is_mock"],
    )
    db.add(a)
    stats.count_analysis(db, a)  # anonymous counters for team reports
    db.commit()
    db.refresh(a)
    return a


@router.get("", response_model=list[AnalysisSummary])
def list_analyses(
    limit: int | None = Query(None, ge=1, le=500, description="Optional page size; omit to return all"),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (select(Analysis).where(Analysis.user_id == user.id)
         .order_by(Analysis.created_at.desc(), Analysis.id.desc()).offset(offset))
    if limit is not None:
        q = q.limit(limit)
    rows = db.scalars(q).all()
    out = []
    for a in rows:
        s = AnalysisSummary.model_validate(a)
        conds = (a.result or {}).get("conditions") or []
        s.top_condition = conds[0]["name"] if conds else None
        s.symptom_preview = [x["label"] for x in (a.result or {}).get("symptoms", [])][:4]
        out.append(s)
    return out


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Analysis, analysis_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return a


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(analysis_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Analysis, analysis_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    db.delete(a)
    db.commit()
