from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router

app = FastAPI(title="Opportunity Radar API", version="1.0.0")

from app.db.database import engine, Base
Base.metadata.create_all(bind=engine)

import os

# Setup CORS to allow Next.js frontend (local or production)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Opportunity Radar API is running"}
