# FaultTrace — Development Report (Workshop App #2)

**Student:** Michael Magreola  
**App:** FaultTrace (Cardinal Precision maintenance knowledge system)  
**AI assistant:** Cursor (AI-powered IDE)  
**Local stack:** React 18 + Vite + TypeScript · FastAPI · SQLite (local) / Postgres+pgvector (planned)

## Which AI assistant and prompts I used

Primary assistant: **Cursor Agent** in the FaultTrace workspace.

Example prompts that drove the build:

1. “Build a full-stack web application based on these [5.2 use case + Part 2 technical plan] specifications…”
2. “Scaffold FastAPI + Vite React TS monorepo with semantic search, cited summaries, close-out, asset history, supervisor recurring faults.”
3. “Run this application locally — show setup for backend and frontend.”
4. “Add input validation, loading states, tablet-first UI, and a demo login with roles.”
5. “Fix retrieval so embeddings are stable across restarts and ‘spndl drift’ matches prior work orders.”
6. “Add Mark useful feedback and downtime-by-asset for the planner/admin view.”

## How the approach differed from App #1 (RouteIQ)

| | RouteIQ (App #1) | FaultTrace (App #2) |
|--|------------------|---------------------|
| Architecture | SPA-only, logic in the browser | Real REST API (FastAPI) + React client |
| Data | `localStorage` seed JSON | SQLAlchemy models, seed job, re-embed on close-out |
| Auth | Client-side demo validation | Server-enforced roles (dev headers now; Cognito planned) |
| AI | Transparent greedy heuristic in JS | Retrieval + grounded summary (local embeddings now; Bedrock later) |
| Prompting | Many small iterative fixes | Spec-first scaffold, then harden with lessons from App #1 |

I started from the written use case and technical plan instead of discovering architecture mid-build. I asked for error handling, validation, and role checks up front because those were late additions on RouteIQ.

## Most helpful AI prompts

- Spec dump of the full 5.2 use case + technical plan in one message (best structure).
- “Apply lessons from RouteIQ: real API, server auth stub, refusal path, no invented safety steps.”
- “Make retrieval demo the vocabulary problem (spndl / SPIN-DRFT / axis wander).”
- “Organize with clean folders, `.env.example`, README, Docker/CI skeleton.”

## Key features implemented and how AI helped

1. **Semantic / hybrid search** — AI generated tokenization, synonym map, stable embeddings, FastAPI `/api/search`.
2. **Grounded summary with citations + refusal** — template generator cites WO IDs; refuses below score threshold.
3. **Structured close-out** — form validation + `/api/work-orders/close-out` that re-embeds the new record.
4. **Per-asset history** — `/api/assets/{code}/history` + tablet UI tab.
5. **Supervisor view** — recurring faults and downtime-by-asset for planner/admin.
6. **Useful feedback** — `/api/feedback/useful` supports the “marked useful” success metric.
7. **Demo auth** — login screen with technician / planner / admin; headers enforced server-side.

## Challenges and solutions

| Challenge | Solution |
|-----------|----------|
| Python `hash()` changes every process → stored vectors went stale | Switched to MD5 bucket hashing + `reembed` script |
| Docker not available on the build machine | SQLite local default; Postgres compose kept for later |
| Short fault-code queries scored poorly | Hybrid score (embedding + Jaccard token overlap) |
| Need glove-friendly UI | Large touch targets, high-contrast industrial theme, few cards |

## App #1 vs App #2 — what was easier / faster

FaultTrace was faster to reach a demoable MVP because:

- The 5.2 document already fixed stack and MVP scope.
- RouteIQ taught me to ask for validation, loading states, and honest AI limits early.
- Monorepo + seed data + `/docs` API meant I could smoke-test the backend without waiting on the UI.

What still takes time: polishing retrieval quality and writing the assignment report — not inventing folder structure.

## Time spent (approximate)

| Activity | Hours |
|----------|------:|
| Spec review + scaffold prompts | 0.5 |
| Backend API, seed, retrieval | 1.5 |
| Frontend tablet UI + login | 1.0 |
| Local run, bugfixes, re-embed | 0.75 |
| README / report | 0.5 |
| **Total** | **~4.25** |

## How to run locally (for graders / screenshots)

```bash
# Terminal 1 — API
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000

# Terminal 2 — UI
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173  
- API docs: http://localhost:8000/docs  
- Demo: `tech@cardinal.local` (technician) or `planner@cardinal.local` (supervisor)

**Screenshot tips:** Capture (1) Cursor with the `FaultTrace` tree open and system clock visible, (2) browser at `localhost:5173` showing search results with citations and the clock/date visible.
