import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import fix_error, chat, complete
from utils.auth import require_internal_secret

if not os.getenv("AI_INTERNAL_SECRET"):
    raise RuntimeError(
        "AI_INTERNAL_SECRET must be configured before starting the AI service"
    )

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app = FastAPI(
    title="Naya Overleaf AI Service",
    description="AI microservice for LaTeX assistance",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

protected_ai_route = [Depends(require_internal_secret)]

app.include_router(fix_error.router, prefix="/ai", tags=["fix-error"], dependencies=protected_ai_route)
app.include_router(chat.router, prefix="/ai", tags=["chat"], dependencies=protected_ai_route)
app.include_router(complete.router, prefix="/ai", tags=["complete"], dependencies=protected_ai_route)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
