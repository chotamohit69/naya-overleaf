import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException, status

AI_INTERNAL_SECRET = os.getenv("AI_INTERNAL_SECRET", "")


async def require_internal_secret(
    x_ai_internal_secret: Optional[str] = Header(default=None),
    x_internal_secret: Optional[str] = Header(default=None),
) -> None:
    secret = x_ai_internal_secret or x_internal_secret

    if not AI_INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI_INTERNAL_SECRET not configured",
        )

    if not secret or not hmac.compare_digest(secret, AI_INTERNAL_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal secret",
        )
