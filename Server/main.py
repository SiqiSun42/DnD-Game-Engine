from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from config import UI_ROOT, PROJECT_ROOT
from routes.chat import ChatRequest, ChatResponse, process_chat_request
from services.deepseek import DeepSeekError

app = FastAPI(title="DnD Game Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> RedirectResponse:
    return RedirectResponse(url="/UI/")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(body: ChatRequest) -> ChatResponse:
    try:
        return await process_chat_request(body)
    except DeepSeekError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Chat request failed") from exc


if UI_ROOT.is_dir():
    app.mount("/UI", StaticFiles(directory=str(UI_ROOT), html=True), name="ui")

DATA_ROOT = PROJECT_ROOT / "Data"
if DATA_ROOT.is_dir():
    app.mount("/Data", StaticFiles(directory=str(DATA_ROOT)), name="data")
