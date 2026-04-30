"""AI analyst stub. Step 3 ships a deterministic placeholder generator;
real implementation will call an LLM."""
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session as OrmSession

from models import Insight, InsightType, Project, Task, TaskStatus
from services import knowledge_graph_service


def generate_insights(db: OrmSession, project_id: UUID) -> list[Insight]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return []

    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    total = len(tasks)
    done = sum(1 for t in tasks if t.status == TaskStatus.done)
    in_progress = sum(1 for t in tasks if t.status == TaskStatus.in_progress)
    pct_done = round(100 * done / total) if total else 0

    insights: list[Insight] = []

    summary = Insight(
        type=InsightType.progress_summary,
        content=(
            f"Project '{project.name}': {done}/{total} tasks complete "
            f"({pct_done}%). {in_progress} in progress."
        ),
        timestamp=datetime.utcnow(),
        project_id=project_id,
    )
    db.add(summary)
    insights.append(summary)

    if project.deadline and pct_done < 50:
        risk = Insight(
            type=InsightType.delay_risk,
            content=(
                f"Less than half of tasks complete with deadline {project.deadline}. "
                f"Project at risk of delay."
            ),
            timestamp=datetime.utcnow(),
            project_id=project_id,
        )
        db.add(risk)
        insights.append(risk)

    db.flush()
    for ins in insights:
        knowledge_graph_service.on_insight_generated(db, ins)
    return insights
