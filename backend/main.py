import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from config import settings
from database import SessionLocal
from models import Project, User
from populate_demo import populate as populate_demo
from routes import (
    auth,
    files,
    insights,
    knowledge,
    modules,
    projects,
    revit,
    sessions,
    tasks,
    users,
)
from seed import seed

# Reuse uvicorn's logger so our messages share its formatter / handlers and
# show up in the same place as the regular server logs (locally + on Render).
logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """First-boot bootstrap.

    Two idempotent steps run before the first request is served:

    1. If the users table is empty, run seed() so the system is immediately
       loggable-into.
    2. If the projects table is empty, run populate_demo() so the dashboard
       and portfolio pages have realistic data on a first deploy.

    Both seed() and populate_demo() re-check for existing rows before
    inserting, so this is safe even under a race between two workers.
    """
    try:
        db = SessionLocal()
        try:
            user_count = db.query(User).count()
            project_count = db.query(Project).count()
        finally:
            db.close()

        if user_count == 0:
            logger.info("No users found — running first-boot seed.")
            seed()
        else:
            logger.info("Users present (%d) — skipping seed.", user_count)

        if project_count == 0:
            logger.info("No projects found — running first-boot demo populator.")
            populate_demo()
        else:
            logger.info(
                "Projects present (%d) — skipping demo populator.", project_count
            )
    except SQLAlchemyError as exc:
        # Don't crash the app if the DB isn't reachable or migrations haven't
        # run yet; the operator can still hit /health and investigate.
        logger.warning("Skipping first-boot bootstrap: %s", exc)

    yield


app = FastAPI(title="FirmOS API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(files.router)
app.include_router(sessions.router)
app.include_router(revit.router)
app.include_router(knowledge.router)
app.include_router(insights.router)
app.include_router(modules.router)


@app.get("/")
def root():
    return {"service": "FirmOS API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}
