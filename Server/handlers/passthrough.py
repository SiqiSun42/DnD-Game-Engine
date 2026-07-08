from services.deepseek import deepseek_client


def to_llm_messages(messages: list[dict]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role", "user")
        if role in ("dm", "assistant"):
            llm_role = "assistant"
        else:
            llm_role = "user"
        content = str(message.get("content") or message.get("text") or "").strip()
        if content:
            result.append({"role": llm_role, "content": content})
    return result


async def handle_passthrough(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    result = await deepseek_client.chat(
        llm_messages,
        system="You are a helpful assistant. Reply in the same language as the user.",
    )
    return deepseek_client.to_handler_response(result)
