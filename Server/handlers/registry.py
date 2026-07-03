from collections.abc import Awaitable, Callable

from handlers.consult import handle_consult
from handlers.game import handle_game
from handlers.passthrough import handle_passthrough

ChatHandler = Callable[
    [list[dict], str | None, dict | None],
    Awaitable[dict],
]

HANDLERS: dict[str, ChatHandler] = {
    "consult": handle_consult,
    "game": handle_game,
    "start-game": handle_passthrough,
    "conversation": handle_passthrough,
    "adventure": handle_passthrough,
}

DEFAULT_CHANNEL = "adventure"


def get_handler(channel: str) -> ChatHandler:
    return HANDLERS.get(channel, handle_passthrough)
