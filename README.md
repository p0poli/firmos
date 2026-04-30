# FirmOS

Web-based firm management platform for architectural practices. React + FastAPI + Postgres, with a C# Revit plugin that streams model events and compliance check results into the same backend.

---

## Stack

| Layer        | Tech                                                            | Hosting                |
| ------------ | --------------------------------------------------------------- | ---------------------- |
| Frontend     | React 18, React Router 6, Axios, react-force-graph-2d           | GitHub Pages           |
| Backend      | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, JWT (python-jose)   | Render                 |
| Database     | PostgreSQL 16                                                   | Supabase (prod) / Docker (dev) |
| Revit plugin | .NET Framework 4.8, MEF, Newtonsoft.Json                        | Local install per workstation |
| Local dev    | Docker Compose                                                  | —                      |

---

## Repo layout

```
firmos/
├── backend/
│   ├── main.py                # FastAPI app, router registration
│   ├── config.py              # pydantic-settings (env-driven)
│   ├── database.py            # SQLAlchemy engine + session
│   ├── seed.py                # Idempotent first-run seeder
│   ├── models/                # 12 SQLAlchemy models (UUID PKs)
│   ├── routes/                # 9 router modules
│   ├── schemas/               # Pydantic v2 schemas
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── ai_service.py
│   │   └── knowledge_graph_service.py
│   ├── alembic/               # Migrations
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # HashRouter + route table
│   │   ├── api/index.js       # Axios instance, JWT interceptor, all endpoint helpers
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   └── PrivateRoute.jsx
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Portfolio.jsx
│   │       ├── ProjectDetail.jsx
│   │       ├── Tasks.jsx
│   │       ├── Files.jsx
│   │       └── KnowledgeGraph.jsx
│   ├── public/index.html
│   └── package.json
│
├── revit-plugin/
│   ├── Core/
│   │   ├── FirmOSApp.cs       # IExternalApplication, ribbon, command dispatch
│   │   ├── ApiClient.cs       # HTTP + JWT persistence
│   │   ├── ModuleLoader.cs    # MEF discovery
│   │   └── IFirmOSModule.cs
│   ├── Modules/ComplianceChecker/ComplianceModule.cs
│   ├── FirmOS.addin
│   └── FirmOS.csproj
│
├── docker-compose.yml
├── .github/workflows/
│   ├── deploy-frontend.yml
│   └── deploy-backend.yml
├── .env.example
└── README.md
```

---

## Local development

### Prerequisites

- Docker Desktop
- (Optional, only if running outside containers) Node 20+, Python 3.11+

### 1 — Boot the stack

```bash
cp .env.example .env
docker compose up --build
```

That starts:

| Service  | Port | URL                                           |
| -------- | ---- | --------------------------------------------- |
| Postgres | 5432 | `postgres://firmos:firmos@localhost:5432/firmos` |
| Backend  | 8000 | http://localhost:8000  · docs at `/docs`      |
| Frontend | 3000 | http://localhost:3000                         |

### 2 — Run migrations

```bash
docker compose exec backend alembic upgrade head
```

### 3 — Seed an admin user

```bash
docker compose exec backend python seed.py
```

Default credentials: **`admin@firmos.dev` / `admin`**. Override via env vars:

```bash
docker compose exec \
  -e SEED_FIRM_NAME="Acme Architects" \
  -e SEED_ADMIN_EMAIL="parsa@acme.com" \
  -e SEED_ADMIN_PASSWORD="strongpassword" \
  backend python seed.py
```

### 4 — Smoke test

1. Open http://localhost:3000 → log in with seeded credentials.
2. The Dashboard loads (empty cards on first run — that's expected).
3. Hit http://localhost:8000/docs to play with the API directly. Use the `Authorize` button with the token from `POST /auth/login`.
4. Create a project via the API, then visit Portfolio in the UI to see it.
5. Visit Knowledge Graph — it fills in as you create entities (auto-tagging hooks fire on every create).

---

## Deployment

### Backend → Render

1. Create a new Web Service on Render pointing at the repo root.
2. Set **Root Directory** to `backend`, **Build Command** to `pip install -r requirements.txt`, **Start Command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Configure environment variables on Render:
   - `DATABASE_URL` — Supabase connection string (see below)
   - `JWT_SECRET` — long random string
   - `CORS_ORIGINS` — `https://<your-github-username>.github.io`
4. Copy the **deploy hook URL** from Render → settings → deploy hook.
5. In the GitHub repo settings → Secrets → Actions, add `RENDER_DEPLOY_HOOK_URL`.
6. Push to `main`. The workflow [`deploy-backend.yml`](.github/workflows/deploy-backend.yml) calls the hook.
7. After the first deploy, run migrations + seed once via the Render shell:
   ```bash
   alembic upgrade head
   python seed.py
   ```

### Database → Supabase

1. Create a Supabase project. Copy the connection string from **Project Settings → Database → Connection string → URI** (use the *direct* connection, not the pooler, for SQLAlchemy).
2. Convert it to SQLAlchemy form:
   `postgresql+psycopg2://postgres:<pwd>@db.<project>.supabase.co:5432/postgres`
3. Set this as `DATABASE_URL` on Render.

### Frontend → GitHub Pages

1. In the repo settings → Pages → Source: **GitHub Actions**.
2. Add a repo secret: `REACT_APP_API_URL` = your Render backend URL (e.g. `https://firmos-api.onrender.com`).
3. Push to `main`. [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml) builds and publishes.
4. The site will be at `https://<user>.github.io/<repo>/`. The `homepage: "."` in `package.json` and the use of `HashRouter` mean it works under any subpath without rewrite rules.

---

## Revit plugin

### Build

Requires Visual Studio 2022 or `dotnet` CLI with MSBuild on Windows. Revit 2024 install assumed; override with `RevitInstallDir`.

```powershell
cd revit-plugin
msbuild FirmOS.csproj /p:Configuration=Release /p:Platform=x64 `
  /p:RevitInstallDir="C:\Program Files\Autodesk\Revit 2024\"
```

Output lands in `revit-plugin\bin\x64\Release\`.

### Install

Copy the build output and the `.addin` manifest to:

```
%AppData%\Autodesk\Revit\Addins\2024\
```

Layout there:

```
Addins\2024\
├── FirmOS.addin
├── FirmOS.dll
├── Newtonsoft.Json.dll
└── Modules\
    └── (drop-in module DLLs go here)
```

Set `FIRMOS_API_URL` as a user environment variable (default: `http://localhost:8000`). On first run the plugin reads `%AppData%\FirmOS\token.json` for its JWT — generate this by logging in via the web UI and copying the token from `localStorage.firmos_token`, or build a small login dialog into the plugin.

**Before shipping**: regenerate the `ClientId` GUID in `FirmOS.addin` — it's currently a placeholder.

---

## API surface

Spec routes (all firm-scoped):

```
POST   /auth/login              → JWT + opens Session
POST   /auth/logout              → closes Session, calculates duration

GET    /users/me
GET    /users/                   admin
POST   /users/                   admin

GET    /projects/?status=…       Portfolio listing
POST   /projects/
GET    /projects/{id}
PATCH  /projects/{id}
GET    /projects/{id}/tasks
GET    /projects/{id}/files
GET    /projects/{id}/insights

POST   /tasks/
PATCH  /tasks/{id}
DELETE /tasks/{id}

POST   /files/                   register link, not upload
GET    /files/{id}

GET    /sessions/me
PATCH  /sessions/{id}/project

POST   /revit/event              from plugin
POST   /revit/check              from plugin

GET    /knowledge/nodes
GET    /knowledge/edges
GET    /knowledge/graph

GET    /insights/{project_id}
POST   /insights/generate/{project_id}
```

Helper endpoints added during scaffolding (needed by the Dashboard spec):

```
GET    /sessions/active          firm-wide open sessions, joined with user/project names
GET    /revit/checks/recent      ?limit=N
GET    /insights/recent          ?limit=N
```

Full interactive docs at `<backend>/docs`.

---

## Notes for future work

- **AI insights** — `services/ai_service.py` is a deterministic stub generating a `progress_summary` and a conditional `delay_risk`. Swap in an LLM call (OpenAI/Anthropic) when ready; the route contract stays the same.
- **Revit plugin** — `ComplianceModule.Execute` is a TODO. The detailed comment in that file shows the exact payload shape for `/revit/event` and `/revit/check`.
- **Knowledge graph node types** — `CheckResult`s are stored as nodes of type `regulation` since the spec's `NodeType` enum doesn't include a `check_result` value. If you'd rather have a dedicated type, add it to `models/knowledge_node.py` (and write a migration).
- **Sub-spec naming** — `KnowledgeNode.metadata` is mapped to a Python attribute named `node_metadata` because `metadata` is reserved on SQLAlchemy `Base`. The DB column is still `metadata`. The API serializes it back to `metadata` in JSON.
- **CheckStatus enum values** — `pass` / `fail` are Python keywords, so the Python attributes are `passed` / `failed` / `warning`, but the persisted DB strings (and JSON values) match the spec exactly: `"pass"` / `"fail"` / `"warning"`.
- **First admin user** — there's no public signup endpoint by design. Use `seed.py` (or call the DB directly) to bootstrap; subsequent users come in through `POST /users/` (admin-only).
