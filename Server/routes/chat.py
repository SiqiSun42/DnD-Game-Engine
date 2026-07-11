from pydantic import BaseModel, Field

from handlers.registry import get_handler
from services.deepseek import DeepSeekError


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


async def process_chat_request(body: ChatRequest) -> ChatResponse:
    handler = get_handler(body.channel)
    payload = [message.model_dump(exclude_none=True) for message in body.messages]
    context = dict(body.gameContext or {})
    if body.combatContinue:
        context["combatContinue"] = True
    result = await handler(payload, body.saveName, context)
    return ChatResponse(**result)
