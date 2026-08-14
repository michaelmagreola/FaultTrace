# FaultTrace — single container for ECS Express / App Runner (API + React UI + SQLite)
# cache-bust: login-email-ux-2026-08-14
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    AUTH_MODE=dev \
    AI_MODE=local \
    DATABASE_URL=sqlite:////data/faulttrace.db \
    STATIC_DIR=/app/static

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "uvicorn[standard]==0.34.2"

COPY backend/app ./app
COPY --from=frontend-build /frontend/dist ./static

RUN mkdir -p /data

EXPOSE 8080

# Seed demo data on first boot (non-blocking for /health), then serve API + SPA
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
