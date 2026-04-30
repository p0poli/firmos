from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes import (
    auth,
    files,
    insights,
    knowledge,
    projects,
    revit,
    sessions,
    tasks,
    users,
)

app = FastAPI(title="FirmOS API", version="0.1.0")

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


@app.get("/")
def root():
    return {"service": "FirmOS API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}
