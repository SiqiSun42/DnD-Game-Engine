from dataclasses import dataclass
from typing import Literal

RagMode = Literal["always", "conditional"]
RagCorpus = Literal["rules"]

CHANNEL_CONSULT = "consult"
CHANNEL_CHECK_TEST = "check-test"
CHANNEL_GAME = "game"
CHANNEL_START_GAME = "start-game"


@dataclass(frozen=True)
class RagPolicy:
    mode: RagMode
    corpus: RagCorpus
    channel: str


RAG_POLICIES: dict[str, RagPolicy] = {
    CHANNEL_CONSULT: RagPolicy(mode="always", corpus="rules", channel=CHANNEL_CONSULT),
    CHANNEL_CHECK_TEST: RagPolicy(mode="conditional", corpus="rules", channel=CHANNEL_CHECK_TEST),
    CHANNEL_GAME: RagPolicy(mode="conditional", corpus="rules", channel=CHANNEL_GAME),
    CHANNEL_START_GAME: RagPolicy(mode="conditional", corpus="rules", channel=CHANNEL_START_GAME),
}


def get_rag_policy(channel: str) -> RagPolicy | None:
    return RAG_POLICIES.get(channel)
