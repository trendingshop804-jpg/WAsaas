from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from pathlib import Path
import os

app = FastAPI()

# Define the directory containing the built frontend assets (relative to this file)
static_dir = Path(__file__).resolve().parent.parent / "frontend" / "build"

# Mount static files with custom Cache-Control headers to prevent caching stale assets
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response: Response = await super().get_response(path, scope)
        # Apply no‑cache headers for all static assets
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

# Only mount if the build directory exists
if static_dir.is_dir():
    app.mount("/", NoCacheStaticFiles(directory=str(static_dir), html=True))
else:
    @app.get("/")
    async def missing_build():
        return {
            "error": "Frontend build directory not found. Run 'npm run build' in the frontend folder."
        }

# Health endpoint (already exists in main.py, but expose here for completeness)
@app.get("/health")
async def health():
    return {"status": "ok"}
