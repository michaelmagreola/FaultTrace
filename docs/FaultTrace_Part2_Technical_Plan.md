Part 2: Technical Plan (FaultTrace)

Application description

FaultTrace is a full-stack retrieval application. A technician types a fault code or describes a symptom. The backend embeds that query, runs a vector search against twenty years of work orders, and passes the top matches to a language model with instructions to summarize the fix and cite the work order IDs it used. If nothing relevant comes back, the app says so instead of generating a procedure. Every close-out writes a new structured record, so the corpus improves with use.

Technology stack and justification

- Frontend: React 18 with Vite and TypeScript. Tablet-first layout, large touch targets, and high contrast, because the user is standing at a machine wearing gloves. TypeScript because a shared API contract is worth the setup cost once a real backend exists.
- Backend: FastAPI on Python. The embedding, retrieval, and prompt orchestration all live server side, and Python has the shortest path to that work. A real REST API this time, not browser-only logic.
- Database: PostgreSQL on Amazon RDS with the pgvector extension. Work orders, assets, parts, and embeddings sit in one database, which avoids running a separate vector store for a corpus this size.
- Auth: Amazon Cognito with technician, planner, and admin roles. Server-enforced, not a client-side check.
- AI: Claude through Amazon Bedrock for generation, with an embedding model for retrieval. Retrieval-grounded, with citations required and a refusal path when confidence is low.
- Ingestion: a one-time normalization and embedding job for the CMMS export, then incremental embedding on each close-out.

Key features and how they solve the problem

Semantic search solves the vocabulary problem directly, since spndl drift and axis wander land in the same neighborhood. The cited summary turns ten prior work orders into one answer a technician can act on in under two minutes. The structured close-out form fixes the root cause of the mess, which is that free-text notes were never captured consistently. The supervisor view converts the same data into downtime by asset and cause, which is what the weekly production meeting actually needs.

AI coding agents

Cursor with Cursor Agent for the application repository, Claude Code for the backend and the infrastructure workflow, and Claude for architecture documentation and for building the retrieval evaluation harness.

What I am doing differently from RouteIQ

- Real backend and shared database from day one. localStorage capped RouteIQ before I noticed.
- Real server-side auth through Cognito instead of demo email validation in the browser.
- A scoped IAM user created before any code, and credentials in AWS Secrets Manager. My first AWS CLI connection on RouteIQ authenticated as the account root user.
- Dockerfile and CI in week one, not week three.
- Playwright smoke tests wired into CI at the first commit, plus a 30-case retrieval evaluation set that runs on every prompt change.
- Amazon ECS Express Mode chosen after verifying availability. App Runner closed to new customers on April 30, 2026, which cost me a full pivot last time.
- Responsible AI built into the product, not disclosed around it: citations on every answer, refusal when no similar history exists, and safety procedures linked to the controlled document rather than generated.
