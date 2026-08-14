# FaultTrace infra notes

## Local compose

```bash
docker compose -f infra/docker-compose.yml up -d db
```

Optional full stack (API container + Postgres):

```bash
docker compose -f infra/docker-compose.yml up --build
```

Then seed once against the published DB port:

```bash
cd backend
# with .venv active and .env pointing at localhost:5432
python -m app.seed
```

## ECS Express (workshop)

1. Create ECR repos: `faulttrace-api`, `faulttrace-web`
2. Provision RDS Postgres 16 + pgvector extension
3. Cognito user pool with groups: technician, planner, admin
4. Bedrock model access (Titan Embed + Claude)
5. Store secrets in Secrets Manager; wire GitHub Actions secrets
6. Deploy via `.github/workflows/deploy-ecs-express.yml` (skeleton)

Prefer ECS Express Mode over App Runner for new AWS accounts.
