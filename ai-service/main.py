from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import fix_error, chat, complete
import os

app = FastAPI(
    title="Naya Overleaf AI Service",
    description="AI microservice for LaTeX assistance",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fix_error.router, prefix="/ai", tags=["fix-error"])
app.include_router(chat.router, prefix="/ai", tags=["chat"])
app.include_router(complete.router, prefix="/ai", tags=["complete"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
