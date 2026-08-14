from dataclasses import dataclass

from fastapi import Header, HTTPException

from app.security import verify_session_token


@dataclass
class Principal:
    sub: str
    role: str  # technician | planner | admin
    email: str


def get_principal(
    authorization: str | None = Header(default=None),
    x_faulttrace_session: str | None = Header(default=None, alias="X-FaultTrace-Session"),
) -> Principal:
    """
    Require a signed session token from POST /api/auth/login.
    Accepts Authorization: Bearer <token> or X-FaultTrace-Session.
    Role/email headers alone are no longer trusted (spoofing fix).
    """
    from app.config import settings

    if settings.auth_mode == "cognito":
        raise HTTPException(
            status_code=501,
            detail="Cognito mode selected but JWT validation is not wired yet. Use AUTH_MODE=dev.",
        )

    token: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_faulttrace_session:
        token = x_faulttrace_session.strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Sign in to obtain a session token.",
        )

    payload = verify_session_token(token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session. Sign in again.",
        )

    return Principal(
        sub=f"session:{payload['email']}",
        role=payload["role"],
        email=payload["email"],
    )


def require_roles(*roles: str):
    def _dep(principal: Principal = None):  # type: ignore
        return principal

    return _dep
