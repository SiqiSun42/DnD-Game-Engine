from pydantic import BaseModel, Field

from handlers.registry import get_handler
from services.deepseek import DeepSeekError
from services.save_files import load_save_json_files


class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    text: str | None = None
    label: str | None = None


class ChatRequest(BaseModel):
    channel: str = "adventure"
    messages: list[ChatMessage] = Field(default_factory=list)
    saveName: str | None = None
    gameContext: dict | None = None
    combatContinue: bool = False
    combatStateUpdate: bool = False
    combatActorId: str | None = None


class PipelineMessage(BaseModel):
    text: str
    label: str = "DM"
    role: str = "dm"
    reasoning: str | None = None


class ChatResponse(BaseModel):
    text: str
    role: str = "dm"
    label: str = "DM"
    reasoning: str | None = None
    judgeResult: str | None = None
    statusSync: dict | None = None
    pipelineMessages: list[PipelineMessage] | None = None
    battleState: str | None = None
    combatAutoContinue: bool = False
    combatStateUpdate: bool = False
    combatActorId: str | None = None
    suppressDisplay: bool = False


def _should_mount_save_json_files(context: dict) -> bool:
    settings = context.get("settingsGame") or {}
    mode = settings.get("panelMount", "all")
    if isinstance(mode, str) and mode.strip().lower() == "auto":
        return False
    return True


def _enrich_context_with_save_files(context: dict, save_name: str | None) -> dict:
    if not save_name or not _should_mount_save_json_files(context):
        return context
    save_json = load_save_json_files(save_name)
    if not save_json:
        return context
    enriched = dict(context)
    enriched["saveJsonFiles"] = save_json
    return enriched


async def process_chat_request(body: ChatRequest) -> ChatResponse:
    handler = get_handler(body.channel)
    payload = [message.model_dump(exclude_none=True) for message in body.messages]
    context = dict(body.gameContext or {})
    context = _enrich_context_with_save_files(context, body.saveName)
    if body.combatContinue:
        context["combatContinue"] = True
    if body.combatStateUpdate:
        context["combatStateUpdate"] = True
    if body.combatActorId:
        context["combatActorId"] = body.combatActorId
    result = await handler(payload, body.saveName, context)
    return ChatResponse(**result)
