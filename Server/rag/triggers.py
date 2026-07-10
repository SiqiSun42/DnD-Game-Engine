from rag.policies import CHANNEL_CHECK_TEST, CHANNEL_GAME, CHANNEL_START_GAME, RagPolicy


def should_retrieve(policy: RagPolicy, query: str, context: dict | None) -> bool:
    if policy.mode == "always":
        return True
    if policy.channel in (CHANNEL_GAME, CHANNEL_CHECK_TEST):
        return _game_triggers(query, context or {})
    if policy.channel == CHANNEL_START_GAME:
        return _start_game_triggers(query, context or {})
    return False


def _game_triggers(query: str, context: dict) -> bool:
    if context.get("inCombat"):
        return True
    if context.get("explicitRuleQuery"):
        return True
    return False


def _start_game_triggers(query: str, context: dict) -> bool:
    if context.get("needsRulesLookup"):
        return True
    return False
