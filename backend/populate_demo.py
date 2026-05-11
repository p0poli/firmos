"""Populate the database with demo data for dashboard / portfolio screenshots.

Idempotent: re-running tops up only the records that are missing — never
duplicates anything. Safe to point at a freshly migrated database or one
that already has prior demo runs.

Usage (local):
    docker compose exec backend python populate_demo.py

Usage (Render shell):
    python populate_demo.py

Env overrides (optional):
    SEED_FIRM_NAME    — firm to attach demo data to (default: "Demo Firm")
    DEMO_PASSWORD     — login password for the demo users (default: "password")
"""
import os
from datetime import date, datetime, timedelta

from database import SessionLocal
from models import (
    CheckResult,
    CheckStatus,
    CheckType,
    File,
    FileSource,
    Firm,
    FirmModule,
    Insight,
    InsightType,
    ModelEvent,
    ModelEventType,
    Project,
    ProjectStatus,
    Task,
    TaskPriority,
    TaskStatus,
    User,
    UserRole,
)
from seed import ensure_firm_modules
from services import knowledge_graph_service as kg
from services.auth_service import hash_password

ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "parsapoladfar93@gmail.com")


# --- helpers ----------------------------------------------------------------


def _get_or_create_user(db, firm, name, email, role, password):
    """Find-or-create a demo user; reconcile role on existing rows.

    The original implementation only created — once a user existed,
    re-running populate_demo wouldn't bring its role back in line with
    the spec. Now if the role drifted (e.g. legacy "member" rows post-
    migration), we update it. Other fields are left alone.
    """
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if existing.role != role:
            existing.role = role
            db.flush()
            return existing, False, True  # found, not created, role-updated
        return existing, False, False
    u = User(
        name=name,
        email=email,
        hashed_password=hash_password(password),
        role=role,
        firm_id=firm.id,
    )
    db.add(u)
    db.flush()
    return u, True, False  # created, role-not-updated (created with the right one)


def _get_or_create_project(db, firm, name, **fields):
    existing = (
        db.query(Project)
        .filter(Project.firm_id == firm.id, Project.name == name)
        .first()
    )
    if existing:
        return existing, False
    p = Project(firm_id=firm.id, name=name, **fields)
    db.add(p)
    db.flush()
    kg.on_project_created(db, p)
    return p, True


def _get_or_create_task(db, project, title, **fields):
    existing = (
        db.query(Task)
        .filter(Task.project_id == project.id, Task.title == title)
        .first()
    )
    if existing:
        return existing, False
    t = Task(project_id=project.id, title=title, **fields)
    db.add(t)
    db.flush()
    kg.on_task_created(db, t)
    return t, True


def _get_or_create_file(db, project, name, url, source, uploader):
    existing = (
        db.query(File)
        .filter(File.project_id == project.id, File.name == name)
        .first()
    )
    if existing:
        return existing, False
    f = File(
        project_id=project.id,
        name=name,
        url=url,
        source=source,
        uploaded_by=uploader.id if uploader else None,
    )
    db.add(f)
    db.flush()
    kg.on_file_registered(db, f)
    return f, True


def _get_or_create_insight(db, project, itype, content, when):
    existing = (
        db.query(Insight)
        .filter(Insight.project_id == project.id, Insight.type == itype)
        .first()
    )
    if existing:
        return existing, False
    i = Insight(
        project_id=project.id,
        type=itype,
        content=content,
        timestamp=when,
    )
    db.add(i)
    db.flush()
    kg.on_insight_generated(db, i)
    return i, True


# --- main -------------------------------------------------------------------


def populate() -> None:
    today = date.today()
    now = datetime.utcnow()
    firm_name = os.getenv("SEED_FIRM_NAME", "Demo Firm")
    demo_password = os.getenv("DEMO_PASSWORD", "password")
    counts = {
        "users": 0,
        "projects": 0,
        "memberships": 0,
        "tasks": 0,
        "files": 0,
        "model_events": 0,
        "checks": 0,
        "insights": 0,
    }

    db = SessionLocal()
    try:
        # 1. Firm ----------------------------------------------------------
        firm = db.query(Firm).filter(Firm.name == firm_name).first()
        if firm is None:
            firm = Firm(name=firm_name, created_at=now)
            db.add(firm)
            db.flush()
            print(f"[firm] created: {firm.name}")
        else:
            print(f"[firm] using existing: {firm.name}")

        # 1a. Modules ------------------------------------------------------
        # Ensure all four module rows exist for the demo firm, and flip
        # revit_connect on so the per-role dashboard can demo the gated
        # "Recent checks" section. Other modules stay inactive so the
        # LockedModule UI has something to render.
        added = ensure_firm_modules(db, firm)
        if added > 0:
            counts["modules_seeded"] = added
            print(f"[modules] seeded {added} module row(s)")
        revit = (
            db.query(FirmModule)
            .filter(
                FirmModule.firm_id == firm.id,
                FirmModule.module_key == "revit_connect",
            )
            .first()
        )
        if revit and not revit.is_active:
            revit.is_active = True
            revit.activated_at = now
            counts["modules_activated"] = counts.get("modules_activated", 0) + 1
            print("[modules] revit_connect activated")

        # 2. Users ---------------------------------------------------------
        # One representative of each non-admin role so the dashboard
        # selector has something to demo.
        users_def = [
            ("Jane Cooper", "jane@firmos.dev", UserRole.project_manager),
            ("Mike Chen",   "mike@firmos.dev", UserRole.architect),
            ("Lina Park",   "lina@firmos.dev", UserRole.architect),
        ]
        users = {}
        for name, email, role in users_def:
            u, created, role_updated = _get_or_create_user(
                db, firm, name, email, role, demo_password
            )
            users[email] = u
            if created:
                counts["users"] += 1
                print(f"[user] created: {email} as {role.value}")
            elif role_updated:
                counts["roles_updated"] = counts.get("roles_updated", 0) + 1
                print(f"[user] role updated: {email} -> {role.value}")

        # Look up the admin user (registered via the app); add to users dict
        # so tasks can be assigned to them by ADMIN_EMAIL key.
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if admin:
            users[ADMIN_EMAIL] = admin
        else:
            print(f"[admin] {ADMIN_EMAIL} not found — tasks assigned to admin will be skipped")

        A = ADMIN_EMAIL  # shorthand used in tasks_def below

        # 3. Projects ------------------------------------------------------
        projects_def = [
            dict(
                name="Bryggen Hospital — Renovation",
                description=(
                    "Phase 2 renovation of west wing: HVAC replacement, "
                    "structural reinforcement, and accessibility upgrades."
                ),
                status=ProjectStatus.active,
                start_date=today - timedelta(days=120),
                deadline=today + timedelta(days=200),
            ),
            dict(
                name="Kvartal 7 — Office Tower",
                description="14-storey commercial tower in central Oslo.",
                status=ProjectStatus.active,
                start_date=today - timedelta(days=300),
                deadline=today + timedelta(days=420),
            ),
            dict(
                name="The Tower",
                description=(
                    "High-rise mixed-use tower — residential floors 1-20, "
                    "commercial podium, and rooftop terrace."
                ),
                status=ProjectStatus.active,
                start_date=today - timedelta(days=30),
                deadline=today + timedelta(days=90),
            ),
            dict(
                name="Riverside Tram Depot",
                description=(
                    "Depot facility for 60 trams — roof structure, "
                    "maintenance halls, and civil infrastructure."
                ),
                status=ProjectStatus.active,
                start_date=today - timedelta(days=180),
                deadline=today + timedelta(days=150),
            ),
            dict(
                name="Sundby School Extension",
                description="Two new classroom blocks and a sports hall.",
                status=ProjectStatus.on_hold,
                start_date=today - timedelta(days=60),
                deadline=today + timedelta(days=540),
            ),
            dict(
                name="Aspely Library Refurbishment",
                description="Heritage interior preservation with seismic upgrade.",
                status=ProjectStatus.completed,
                start_date=today - timedelta(days=600),
                deadline=today - timedelta(days=30),
            ),
        ]
        projects = {}
        for spec in projects_def:
            name = spec.pop("name")
            p, created = _get_or_create_project(db, firm, name, **spec)
            projects[name] = p
            if created:
                counts["projects"] += 1
                print(f"[project] created: {p.name} ({p.status.value})")

        # Riverside Tram Depot may exist as `archived` from a prior run —
        # flip it to active so the in-progress tasks make sense on the dashboard.
        depot = projects.get("Riverside Tram Depot")
        if depot and depot.status == ProjectStatus.archived:
            depot.status = ProjectStatus.active
            db.flush()
            print("[project] Riverside Tram Depot status → active")

        # 4. Memberships --------------------------------------------------
        member_assignments = {
            "Bryggen Hospital — Renovation": ["jane@firmos.dev", "mike@firmos.dev", "lina@firmos.dev", A],
            "Kvartal 7 — Office Tower":      ["jane@firmos.dev", "mike@firmos.dev", "lina@firmos.dev", A],
            "The Tower":                     ["jane@firmos.dev", "mike@firmos.dev", "lina@firmos.dev", A],
            "Riverside Tram Depot":          ["jane@firmos.dev", "mike@firmos.dev", "lina@firmos.dev", A],
            "Sundby School Extension":       ["jane@firmos.dev", "mike@firmos.dev", "lina@firmos.dev", A],
            "Aspely Library Refurbishment":  ["jane@firmos.dev", "mike@firmos.dev"],
        }
        for proj_name, emails in member_assignments.items():
            p = projects.get(proj_name)
            if p is None:
                continue
            existing_ids = {m.id for m in p.members}
            for email in emails:
                u = users.get(email)
                if u and u.id not in existing_ids:
                    p.members.append(u)
                    counts["memberships"] += 1

        # 5. Tasks --------------------------------------------------------
        # Tuple: (title, status, priority, due_date, assignee_email)
        #
        # Due-date strategy (mirrors real dashboard urgency indicators):
        #   done tasks      → past dates
        #   overdue active  → 1–3 weeks in the past
        #   due soon        → 2–7 days from now
        #   normal          → 2–8 weeks from now
        tasks_def = {
            # ── Bryggen Hospital — Renovation (10 tasks) ─────────────────
            "Bryggen Hospital — Renovation": [
                ("Structural drawings review — West wing",
                    TaskStatus.in_progress, TaskPriority.high,
                    today + timedelta(days=5),   "jane@firmos.dev"),
                ("MEP coordination meeting",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=21),  "mike@firmos.dev"),
                ("Fire safety compliance check",
                    TaskStatus.in_progress, TaskPriority.high,
                    today + timedelta(days=3),   A),
                ("Accessibility audit — Ground floor",
                    TaskStatus.review,       TaskPriority.medium,
                    today + timedelta(days=7),   "lina@firmos.dev"),
                ("Facade material specification",
                    TaskStatus.done,         TaskPriority.low,
                    today - timedelta(days=30),  "jane@firmos.dev"),
                ("Building permit documentation",
                    TaskStatus.in_progress, TaskPriority.high,
                    today - timedelta(days=10),  A),          # overdue
                ("HVAC system layout approval",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=28),  "mike@firmos.dev"),
                ("Interior finish schedule",
                    TaskStatus.todo,         TaskPriority.low,
                    today + timedelta(days=42),  "lina@firmos.dev"),
                ("Structural calculations sign-off",
                    TaskStatus.review,       TaskPriority.high,
                    today - timedelta(days=7),   "jane@firmos.dev"),  # overdue
                ("Client presentation — Phase 2",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=6),   A),
            ],

            # ── Kvartal 7 — Office Tower (9 tasks) ───────────────────────
            "Kvartal 7 — Office Tower": [
                ("Site analysis report",
                    TaskStatus.done,         TaskPriority.medium,
                    today - timedelta(days=45),  "mike@firmos.dev"),
                ("Zoning regulation review",
                    TaskStatus.done,         TaskPriority.high,
                    today - timedelta(days=60),  A),
                ("Concept design — Block A",
                    TaskStatus.in_progress, TaskPriority.high,
                    today + timedelta(days=21),  "jane@firmos.dev"),
                ("Parking layout optimization",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today + timedelta(days=30),  "lina@firmos.dev"),
                ("Sustainability assessment",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=35),  "mike@firmos.dev"),
                ("Stakeholder presentation prep",
                    TaskStatus.review,       TaskPriority.high,
                    today + timedelta(days=4),   A),           # due soon
                ("Landscape design coordination",
                    TaskStatus.todo,         TaskPriority.low,
                    today + timedelta(days=56),  "lina@firmos.dev"),
                ("Structural grid finalization",
                    TaskStatus.in_progress, TaskPriority.high,
                    today - timedelta(days=14),  "jane@firmos.dev"),  # overdue
                ("Cost estimation review",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=14),  "mike@firmos.dev"),
            ],

            # ── The Tower (12 tasks) ──────────────────────────────────────
            "The Tower": [
                ("Structural review — Tower facade",
                    TaskStatus.in_progress, TaskPriority.high,
                    today + timedelta(days=14),  A),
                ("Wind load analysis",
                    TaskStatus.in_progress, TaskPriority.high,
                    today - timedelta(days=7),   "jane@firmos.dev"),  # overdue
                ("Curtain wall system specification",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=21),  "mike@firmos.dev"),
                ("Foundation design approval",
                    TaskStatus.review,       TaskPriority.high,
                    today + timedelta(days=5),   "jane@firmos.dev"),  # due soon
                ("Elevator core coordination",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today + timedelta(days=28),  "lina@firmos.dev"),
                ("Floor plate efficiency analysis",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=35),  A),
                ("Fire egress planning",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=7),   "mike@firmos.dev"),  # due soon
                ("MEP shaft coordination",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today - timedelta(days=3),   "lina@firmos.dev"),  # overdue
                ("Client design review meeting",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=6),   A),           # due soon
                ("Planning permission submission",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=42),  "jane@firmos.dev"),
                ("Structural steel specification",
                    TaskStatus.review,       TaskPriority.high,
                    today - timedelta(days=10),  "mike@firmos.dev"),  # overdue
                ("Facade panel detail drawings",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today + timedelta(days=28),  "lina@firmos.dev"),
            ],

            # ── Riverside Tram Depot (8 tasks) ────────────────────────────
            "Riverside Tram Depot": [
                ("Civil engineering coordination",
                    TaskStatus.done,         TaskPriority.high,
                    today - timedelta(days=90),  "mike@firmos.dev"),
                ("Track layout approval",
                    TaskStatus.done,         TaskPriority.high,
                    today - timedelta(days=75),  A),
                ("Roof structure design",
                    TaskStatus.in_progress, TaskPriority.high,
                    today - timedelta(days=14),  "jane@firmos.dev"),  # overdue
                ("Maintenance facility layout",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today - timedelta(days=7),   "lina@firmos.dev"),  # overdue
                ("Drainage system design",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=21),  "mike@firmos.dev"),
                ("Electrical infrastructure plan",
                    TaskStatus.todo,         TaskPriority.high,
                    today + timedelta(days=14),  A),
                ("Environmental impact assessment",
                    TaskStatus.review,       TaskPriority.high,
                    today - timedelta(days=3),   "jane@firmos.dev"),  # overdue
                ("Construction phasing plan",
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=35),  "lina@firmos.dev"),
            ],

            # ── Sundby School Extension (6 tasks) ─────────────────────────
            "Sundby School Extension": [
                ("Initial brief review",
                    TaskStatus.done,         TaskPriority.medium,
                    today - timedelta(days=50),  A),
                ("Site survey coordination",
                    TaskStatus.done,         TaskPriority.low,
                    today - timedelta(days=40),  "mike@firmos.dev"),
                ("Concept sketches — Main building",
                    TaskStatus.in_progress, TaskPriority.medium,
                    today + timedelta(days=30),  "jane@firmos.dev"),
                ("Budget feasibility study",           # waiting on client sign-off
                    TaskStatus.todo,         TaskPriority.medium,
                    today + timedelta(days=21),  A),
                ("Classroom acoustic requirements",
                    TaskStatus.todo,         TaskPriority.low,
                    today + timedelta(days=45),  "lina@firmos.dev"),
                ("Playground safety standards review",
                    TaskStatus.todo,         TaskPriority.low,
                    today + timedelta(days=45),  "mike@firmos.dev"),
            ],

            # ── Aspely Library Refurbishment (completed project) ──────────
            "Aspely Library Refurbishment": [
                ("Final handover walkthrough",
                    TaskStatus.done, TaskPriority.medium,
                    today - timedelta(days=35),  "jane@firmos.dev"),
                ("Archive as-built drawings",
                    TaskStatus.done, TaskPriority.low,
                    today - timedelta(days=20),  "mike@firmos.dev"),
            ],
        }

        for proj_name, tlist in tasks_def.items():
            project = projects.get(proj_name)
            if project is None:
                continue
            for title, status, priority, due, assignee_email in tlist:
                assignee = users.get(assignee_email)
                if assignee is None:
                    print(f"  [warn] assignee {assignee_email} not found — skipping '{title}'")
                    continue
                _, created = _get_or_create_task(
                    db,
                    project,
                    title=title,
                    description=None,
                    status=status,
                    priority=priority,
                    due_date=due,
                    assigned_user_id=assignee.id,
                )
                if created:
                    counts["tasks"] += 1

        # 6. Files --------------------------------------------------------
        files_def = {
            "Bryggen Hospital — Renovation": [
                ("BRY_west-wing_arch.rvt", "https://example.com/bry/west-wing.rvt", FileSource.bim360),
                ("BRY_HVAC_layout_v3.pdf", "https://example.com/bry/hvac-v3.pdf", FileSource.uploaded),
            ],
            "Kvartal 7 — Office Tower": [
                ("KV7_structural_master.rvt", "https://example.com/kv7/structural.rvt", FileSource.acc),
                ("KV7_facade_renderings.pdf", "https://example.com/kv7/facade.pdf", FileSource.uploaded),
            ],
            "Aspely Library Refurbishment": [
                ("ASP_as-built_final.pdf", "https://example.com/asp/asbuilt.pdf", FileSource.uploaded),
            ],
        }
        uploader = users["jane@firmos.dev"]
        for proj_name, flist in files_def.items():
            p = projects.get(proj_name)
            if p is None:
                continue
            for fname, url, src in flist:
                _, created = _get_or_create_file(db, p, fname, url, src, uploader)
                if created:
                    counts["files"] += 1

        # 7. ModelEvent + CheckResults for one active project ------------
        bry = projects.get("Bryggen Hospital — Renovation")
        if bry:
            ev = (
                db.query(ModelEvent)
                .filter(
                    ModelEvent.project_id == bry.id,
                    ModelEvent.event_type == ModelEventType.synced,
                    ModelEvent.revit_file_name == "BRY_west-wing_arch.rvt",
                )
                .first()
            )
            if ev is None:
                ev = ModelEvent(
                    project_id=bry.id,
                    user_id=uploader.id,
                    event_type=ModelEventType.synced,
                    timestamp=now - timedelta(hours=4),
                    duration=14400,
                    revit_file_name="BRY_west-wing_arch.rvt",
                    revit_version="2024",
                )
                db.add(ev)
                db.flush()
                counts["model_events"] += 1

            checks_def = [
                (CheckType.compliance, CheckStatus.passed, []),
                (
                    CheckType.fire_safety,
                    CheckStatus.warning,
                    [{"element_id": 12345, "issue": "Stairwell door rating below 90 minutes."}],
                ),
                (
                    CheckType.custom,
                    CheckStatus.failed,
                    [
                        {"element_id": 88102, "issue": "Door clearance < 850 mm in corridor C-2."},
                        {"element_id": 88210, "issue": "No tactile signage at lift lobby."},
                    ],
                ),
            ]
            for ctype, cstatus, issues in checks_def:
                exists = (
                    db.query(CheckResult)
                    .filter(
                        CheckResult.model_event_id == ev.id,
                        CheckResult.check_type == ctype,
                    )
                    .first()
                )
                if exists:
                    continue
                cr = CheckResult(
                    model_event_id=ev.id,
                    check_type=ctype,
                    status=cstatus,
                    issues=issues,
                    timestamp=now - timedelta(hours=3),
                    user_id=uploader.id,
                )
                db.add(cr)
                db.flush()
                kg.on_check_result_saved(db, cr, project_id=bry.id)
                counts["checks"] += 1

        # 8. Insights -----------------------------------------------------
        insights_def = [
            (
                "Bryggen Hospital — Renovation",
                InsightType.progress_summary,
                (
                    "2 of 10 tasks complete. Structural drawings and fire safety checks "
                    "are on the critical path — building permit docs are 10 days overdue."
                ),
            ),
            (
                "Bryggen Hospital — Renovation",
                InsightType.delay_risk,
                (
                    "Building permit documentation is 10 days overdue. Structural "
                    "calculations sign-off is in review past its deadline — escalate to Jane."
                ),
            ),
            (
                "Kvartal 7 — Office Tower",
                InsightType.progress_summary,
                (
                    "2 of 9 tasks complete. Structural grid finalization is 14 days "
                    "overdue. Stakeholder presentation is due in 4 days."
                ),
            ),
            (
                "The Tower",
                InsightType.delay_risk,
                (
                    "Wind load analysis and MEP shaft coordination are both overdue. "
                    "Structural steel specification is in review past its deadline — "
                    "foundation approval is due in 5 days."
                ),
            ),
            (
                "Riverside Tram Depot",
                InsightType.bottleneck,
                (
                    "3 tasks are overdue: roof structure, maintenance facility layout, "
                    "and environmental impact assessment. Construction phasing is blocked "
                    "until these clear."
                ),
            ),
            (
                "Sundby School Extension",
                InsightType.bottleneck,
                (
                    "Project is on hold pending client decision. Budget feasibility study "
                    "is waiting on client sign-off — all downstream tasks blocked until resolved."
                ),
            ),
        ]
        for proj_name, itype, content in insights_def:
            p = projects.get(proj_name)
            if p is None:
                continue
            _, created = _get_or_create_insight(db, p, itype, content, when=now)
            if created:
                counts["insights"] += 1

        db.commit()

        print()
        print("--- summary ---")
        for k, v in counts.items():
            print(f"  {k}: +{v}")
        print()
        if any(counts.values()):
            print(f"Demo users (password: {demo_password})")
            print("  - jane@firmos.dev   / Jane Cooper  (project_manager)")
            print("  - mike@firmos.dev   / Mike Chen    (architect)")
            print("  - lina@firmos.dev   / Lina Park    (architect)")
            print(f"  - {ADMIN_EMAIL} (admin — own password)")
        else:
            print("Nothing to do — all demo records already exist.")
        print("Re-run safely: this script only inserts what is missing.")

    finally:
        db.close()


if __name__ == "__main__":
    populate()
