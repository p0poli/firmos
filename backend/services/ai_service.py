"""AI analyst — provider-agnostic insight generation with rich context.

Resolution order for the API key:
  1. Firm's own encrypted key (firm.ai_api_key_encrypted)
  2. System env var (ANTHROPIC_API_KEY / OPENAI_API_KEY)
  3. Stub fallback — deterministic placeholder text prefixed "[stub]"
     so the demo flow works without keys configured.

generate_insight() is type-driven (progress_summary / delay_risk /
bottleneck), persists an Insight row, and fires the knowledge-graph
hook. ask() takes a free-form prompt and returns the answer ephemerally
— it does not pollute the insights table.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable, Optional
from uuid import UUID

import httpx
from sqlalchemy.orm import Session as OrmSession

from config import settings
from models import (
    CheckResult,
    Firm,
    Insight,
    InsightType,
    KnowledgeEdge,
    KnowledgeNode,
    ModelEvent,
    NodeType,
    Project,
    Session,
    Task,
    User,
)
from services import encryption, knowledge_graph_service

logger = logging.getLogger("uvicorn.error")


# --- prompt templates ------------------------------------------------------

INSIGHT_PROMPTS: dict[str, str] = {
    "progress_summary": (
        "Based on the firm context, summarize the current progress of this "
        "project. Highlight what is going well and what needs attention. Be "
        "specific, reference actual task names and team members."
    ),
    "delay_risk": (
        "Based on the firm context, identify any risks of delay. Consider "
        "task due dates, team workload, and incomplete work. Reference similar "
        "past projects if relevant."
    ),
    "bottleneck": (
        "Based on the firm context, identify any bottlenecks blocking progress. "
        "Look at overdue tasks, inactive team members, and pending reviews."
    ),
}

# Models — kept here so swapping a model is a one-line change.
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
OPENAI_MODEL = "gpt-4o"


# --- key + provider resolution ---------------------------------------------


def _resolve_provider_and_key(firm: Firm) -> tuple[str, Optional[str], str]:
    """Pick (provider, api_key, key_source) for a firm.

    key_source ∈ {"firm", "env", "none"} — useful for the API response
    so the frontend can show "Using firm key" vs "Using system key" vs
    "No key configured (stub mode)".
    """
    provider = (firm.ai_provider or "anthropic").lower()
    if provider not in {"anthropic", "openai"}:
        provider = "anthropic"

    firm_key = encryption.decrypt(firm.ai_api_key_encrypted)
    if firm_key:
        return provider, firm_key, "firm"

    env_key = (
        settings.anthropic_api_key
        if provider == "anthropic"
        else settings.openai_api_key
    )
    if env_key:
        return provider, env_key, "env"

    return provider, None, "none"


# --- context assembly ------------------------------------------------------


def _serialize_user(u: Optional[User]) -> dict[str, Any]:
    if u is None:
        return {}
    return {
        "name": u.name,
        "role": u.role.value if u.role else None,
        "email": u.email,
    }


def _serialize_project(p: Project) -> dict[str, Any]:
    return {
        "name": p.name,
        "status": p.status.value if p.status else None,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "deadline": p.deadline.isoformat() if p.deadline else None,
        "description": p.description,
    }


def assemble_context(
    db: OrmSession,
    firm: Firm,
    user: User,
    project: Optional[Project] = None,
) -> dict[str, Any]:
    """Build the context_package the prompt will reference.

    Mirrors the structure called out in the spec:
      firm, user, project (optional), tasks, sessions, check_results,
      knowledge_nodes, similar_projects, recent_insights.
    """
    ctx: dict[str, Any] = {
        "firm": {"name": firm.name},
        "user": _serialize_user(user),
    }

    if project is None:
        return ctx

    ctx["project"] = _serialize_project(project)

    # Tasks for this project, with assignee name when present.
    tasks = (
        db.query(Task, User.name.label("assignee_name"))
        .outerjoin(User, Task.assigned_user_id == User.id)
        .filter(Task.project_id == project.id)
        .all()
    )
    ctx["tasks"] = [
        {
            "title": t.title,
            "status": t.status.value if t.status else None,
            "priority": t.priority.value if t.priority else None,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "assignee": assignee_name,
        }
        for t, assignee_name in tasks
    ]

    # Last 10 sessions on this project.
    sessions = (
        db.query(Session, User.name.label("user_name"))
        .join(User, Session.user_id == User.id)
        .filter(Session.active_project_id == project.id)
        .order_by(Session.login_time.desc())
        .limit(10)
        .all()
    )
    ctx["sessions"] = [
        {
            "user": user_name,
            "duration_seconds": s.duration,
            "date": s.login_time.isoformat() if s.login_time else None,
        }
        for s, user_name in sessions
    ]

    # Last 5 check results — joined through ModelEvent to filter by project.
    checks = (
        db.query(CheckResult)
        .join(ModelEvent, CheckResult.model_event_id == ModelEvent.id)
        .filter(ModelEvent.project_id == project.id)
        .order_by(CheckResult.timestamp.desc())
        .limit(5)
        .all()
    )
    ctx["check_results"] = [
        {
            "check_type": c.check_type.value if c.check_type else None,
            "status": c.status.value if c.status else None,
            "issues_count": len(c.issues or []),
            "first_issue": (c.issues or [{}])[0].get("issue") if c.issues else None,
        }
        for c in checks
    ]

    # KnowledgeNodes connected to the project's KnowledgeNode by any edge.
    project_node = (
        db.query(KnowledgeNode)
        .filter(
            KnowledgeNode.node_type == NodeType.project,
            KnowledgeNode.reference_id == project.id,
        )
        .first()
    )
    related_nodes: list[KnowledgeNode] = []
    project_tag_ids: set[UUID] = set()
    if project_node:
        outbound_target_ids = [
            row[0]
            for row in db.query(KnowledgeEdge.target_node_id)
            .filter(KnowledgeEdge.source_node_id == project_node.id)
            .all()
        ]
        inbound_source_ids = [
            row[0]
            for row in db.query(KnowledgeEdge.source_node_id)
            .filter(KnowledgeEdge.target_node_id == project_node.id)
            .all()
        ]
        connected_ids = list({*outbound_target_ids, *inbound_source_ids})
        if connected_ids:
            related_nodes = (
                db.query(KnowledgeNode)
                .filter(KnowledgeNode.id.in_(connected_ids))
                .all()
            )
            project_tag_ids = {
                n.reference_id
                for n in related_nodes
                if n.node_type == NodeType.tag
            }

    ctx["knowledge_nodes"] = [
        {
            "label": n.label,
            "node_type": n.node_type.value if n.node_type else None,
            "metadata": n.node_metadata or {},
        }
        for n in related_nodes
    ]

    # Similar projects: other projects in the firm that share at least
    # one tag with this one. Up to 3.
    similar: list[Project] = []
    if project_tag_ids and project_node:
        # Find tag KnowledgeNodes for this project's tags, then walk
        # back to the project nodes attached to those tag nodes.
        tag_node_id_rows = (
            db.query(KnowledgeNode.id)
            .filter(
                KnowledgeNode.node_type == NodeType.tag,
                KnowledgeNode.reference_id.in_(project_tag_ids),
            )
            .all()
        )
        tag_node_ids = [row[0] for row in tag_node_id_rows]
        if tag_node_ids:
            sibling_node_id_rows = (
                db.query(KnowledgeEdge.source_node_id)
                .filter(KnowledgeEdge.target_node_id.in_(tag_node_ids))
                .distinct()
                .all()
            )
            sibling_node_ids = [
                row[0]
                for row in sibling_node_id_rows
                if row[0] != project_node.id
            ]
            if sibling_node_ids:
                sibling_project_refs = (
                    db.query(KnowledgeNode.reference_id)
                    .filter(
                        KnowledgeNode.id.in_(sibling_node_ids),
                        KnowledgeNode.node_type == NodeType.project,
                    )
                    .all()
                )
                sibling_project_ids = [r[0] for r in sibling_project_refs]
                if sibling_project_ids:
                    similar = (
                        db.query(Project)
                        .filter(
                            Project.id.in_(sibling_project_ids),
                            Project.firm_id == firm.id,
                            Project.id != project.id,
                        )
                        .limit(3)
                        .all()
                    )
    ctx["similar_projects"] = [
        {
            "name": p.name,
            "status": p.status.value if p.status else None,
            "outcome": "completed"
            if p.status and p.status.value == "completed"
            else "active",
        }
        for p in similar
    ]

    # Last 3 insights already generated for this project.
    recent = (
        db.query(Insight)
        .filter(Insight.project_id == project.id)
        .order_by(Insight.timestamp.desc())
        .limit(3)
        .all()
    )
    ctx["recent_insights"] = [
        {
            "type": i.type.value if i.type else None,
            "content": i.content,
            "timestamp": i.timestamp.isoformat() if i.timestamp else None,
        }
        for i in recent
    ]

    return ctx


def serialize_context(ctx: dict[str, Any]) -> str:
    """Render the context_package as a structured plain-text block.

    Section headings + bullets — easier for an LLM to read than JSON
    and shorter token-wise than pretty-printed JSON.
    """
    lines: list[str] = ["FIRM CONTEXT", "=" * 12, ""]

    firm = ctx.get("firm") or {}
    if firm:
        lines += [f"Firm: {firm.get('name', 'unknown')}", ""]

    u = ctx.get("user") or {}
    if u:
        lines += [
            "Current user:",
            f"  - {u.get('name')} ({u.get('role')}, {u.get('email')})",
            "",
        ]

    p = ctx.get("project")
    if p:
        lines += [
            "Project:",
            f"  - Name: {p.get('name')}",
            f"  - Status: {p.get('status')}",
            f"  - Start: {p.get('start_date') or '—'}",
            f"  - Deadline: {p.get('deadline') or '—'}",
        ]
        if p.get("description"):
            lines.append(f"  - Description: {p['description']}")
        lines.append("")

    tasks = ctx.get("tasks") or []
    if tasks:
        lines.append(f"Tasks ({len(tasks)}):")
        for t in tasks:
            assignee = t.get("assignee") or "unassigned"
            due = t.get("due_date") or "no due date"
            lines.append(
                f"  - [{t.get('status')}] {t.get('title')} "
                f"(priority: {t.get('priority')}, due: {due}, assigned: {assignee})"
            )
        lines.append("")

    sessions = ctx.get("sessions") or []
    if sessions:
        lines.append(f"Recent sessions on this project (last {len(sessions)}):")
        for s in sessions:
            secs = s.get("duration_seconds")
            duration = f"{secs // 60} min" if secs else "active"
            lines.append(
                f"  - {s.get('user')} — {duration} on {s.get('date', '—')}"
            )
        lines.append("")

    checks = ctx.get("check_results") or []
    if checks:
        lines.append(f"Recent compliance checks (last {len(checks)}):")
        for c in checks:
            issue = c.get("first_issue")
            issue_str = f' — first issue: "{issue}"' if issue else ""
            lines.append(
                f"  - {c.get('check_type')}: {c.get('status')} "
                f"({c.get('issues_count')} issues){issue_str}"
            )
        lines.append("")

    nodes = ctx.get("knowledge_nodes") or []
    if nodes:
        lines.append(f"Linked knowledge graph nodes ({len(nodes)}):")
        for n in nodes:
            md = n.get("metadata") or {}
            md_str = ", ".join(
                f"{k}={v}" for k, v in md.items() if v not in (None, "")
            )
            md_part = f" [{md_str}]" if md_str else ""
            lines.append(f"  - {n.get('node_type')}: {n.get('label')}{md_part}")
        lines.append("")

    similar = ctx.get("similar_projects") or []
    if similar:
        lines.append("Similar projects in this firm (up to 3):")
        for sp in similar:
            lines.append(
                f"  - {sp.get('name')} — {sp.get('status')} ({sp.get('outcome')})"
            )
        lines.append("")

    recent = ctx.get("recent_insights") or []
    if recent:
        lines.append(f"Existing insights on this project (last {len(recent)}):")
        for i in recent:
            content = (i.get("content") or "")[:200]
            lines.append(f"  - [{i.get('type')}] {content}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


# --- HTTP layer ------------------------------------------------------------


SYSTEM_PROMPT_BASE = (
    "You are Vitruvius, an AI analyst embedded in an architectural firm "
    "management platform. You read structured firm context and produce "
    "concise, specific insights. Always reference real names from the "
    "context — task names, team members, project titles. Avoid generic "
    "advice. Keep responses to 3–5 sentences unless the user explicitly "
    "asks for a longer breakdown."
)


def _call_anthropic(api_key: str, system: str, prompt: str) -> str:
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 600,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    with httpx.Client(timeout=settings.ai_request_timeout) as client:
        resp = client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    parts = [
        block.get("text", "")
        for block in data.get("content", [])
        if block.get("type") == "text"
    ]
    return "\n\n".join(p for p in parts if p).strip()


def _call_openai(api_key: str, system: str, prompt: str) -> str:
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 600,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "content-type": "application/json",
    }
    with httpx.Client(timeout=settings.ai_request_timeout) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _stub_response(insight_type: str, ctx: dict[str, Any]) -> str:
    """Deterministic placeholder when no API key is configured.

    Prefixed with [stub] so it's obvious the AI didn't actually run.
    """
    p = ctx.get("project") or {}
    tasks = ctx.get("tasks") or []
    total = len(tasks)
    done = sum(1 for t in tasks if t.get("status") == "done")
    pct = round(100 * done / total) if total else 0

    if insight_type == "progress_summary":
        return (
            f"[stub] {p.get('name', 'Project')}: {done}/{total} tasks complete "
            f"({pct}%). This placeholder appears because no AI key is "
            f"configured. Set ANTHROPIC_API_KEY or a per-firm key in Settings "
            f"to enable real summaries."
        )
    if insight_type == "delay_risk":
        if p.get("deadline") and pct < 50:
            return (
                f"[stub] Less than half of tasks complete with deadline "
                f"{p['deadline']} — possible delay risk."
            )
        return "[stub] No obvious delay risk based on task counts alone."
    if insight_type == "bottleneck":
        review_count = sum(1 for t in tasks if t.get("status") == "review")
        if review_count:
            return (
                f"[stub] {review_count} task(s) sitting in review may be a "
                f"bottleneck."
            )
        return "[stub] No bottlenecks detected from task statuses alone."
    return "[stub] No insight generated."


def _run_provider(
    provider: str,
    api_key: Optional[str],
    system: str,
    prompt: str,
) -> Optional[str]:
    """Call the provider; return None on any failure so the caller can stub."""
    if not api_key:
        return None
    try:
        if provider == "anthropic":
            return _call_anthropic(api_key, system, prompt)
        if provider == "openai":
            return _call_openai(api_key, system, prompt)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.warning("AI provider %s call failed: %s", provider, exc)
    return None


# --- public surface --------------------------------------------------------


def generate_insight(
    db: OrmSession,
    firm: Firm,
    user: User,
    project: Project,
    insight_type: str,
) -> Insight:
    """Generate one Insight of the requested type, persist, and return it.

    insight_type is one of the keys of INSIGHT_PROMPTS.
    """
    if insight_type not in INSIGHT_PROMPTS:
        raise ValueError(
            f"Unknown insight type '{insight_type}'. "
            f"Expected one of: {', '.join(INSIGHT_PROMPTS)}"
        )

    ctx = assemble_context(db, firm, user, project)
    rendered_ctx = serialize_context(ctx)
    provider, key, _source = _resolve_provider_and_key(firm)

    system = SYSTEM_PROMPT_BASE + "\n\n" + rendered_ctx
    prompt = INSIGHT_PROMPTS[insight_type]

    answer = _run_provider(provider, key, system, prompt)
    if answer is None:
        answer = _stub_response(insight_type, ctx)

    insight = Insight(
        type=InsightType[insight_type],
        content=answer,
        timestamp=datetime.utcnow(),
        project_id=project.id,
    )
    db.add(insight)
    db.flush()
    knowledge_graph_service.on_insight_generated(db, insight)
    return insight


def ask(
    db: OrmSession,
    firm: Firm,
    user: User,
    prompt: str,
    project_ids: Optional[Iterable[UUID]] = None,
) -> dict[str, Any]:
    """Free-form chat. Not persisted — returned to the caller and
    discarded. Context is firm-wide unless project_ids is provided, in
    which case the first project is fully expanded; the rest are just
    referenced by name in a future iteration."""
    project: Optional[Project] = None
    project_ids = list(project_ids or [])
    if project_ids:
        project = (
            db.query(Project)
            .filter(Project.id == project_ids[0], Project.firm_id == firm.id)
            .first()
        )

    ctx = assemble_context(db, firm, user, project)
    rendered_ctx = serialize_context(ctx)
    provider, key, source = _resolve_provider_and_key(firm)

    system = SYSTEM_PROMPT_BASE + "\n\n" + rendered_ctx
    answer = _run_provider(provider, key, system, prompt)
    if answer is None:
        answer = (
            "[stub] Vitruvius can't answer that without an AI key. Configure "
            "ANTHROPIC_API_KEY (or a firm key in Settings) and try again."
        )

    return {
        "answer": answer,
        "used_provider": provider,
        "used_key_source": source,
    }


# --- legacy compatibility shim --------------------------------------------


def generate_insights(db: OrmSession, project_id: UUID) -> list[Insight]:
    """Back-compat for the old endpoint signature.

    The new typed endpoint lives at POST /insights/generate/{id}?type=...
    — this function fires the progress_summary and delay_risk types so
    that existing callers (the lifespan auto-populator, any old tests)
    keep producing something useful. Bottleneck is omitted to match
    the original behaviour.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return []
    firm = db.query(Firm).filter(Firm.id == project.firm_id).first()
    if not firm:
        return []
    user = (
        db.query(User)
        .filter(User.firm_id == firm.id)
        .order_by(User.email)
        .first()
    )
    out = [generate_insight(db, firm, user, project, "progress_summary")]
    if project.deadline:
        out.append(generate_insight(db, firm, user, project, "delay_risk"))
    return out
