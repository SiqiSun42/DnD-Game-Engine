import random
import re
from dataclasses import dataclass

import httpx

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_THINKING_ENABLED,
    DEEPSEEK_USER_PROMPT_PATCH,
)


@dataclass(frozen=True)
class ChatCompletionResult:
    content: str
    reasoning_content: str = ""


class DeepSeekError(Exception):
    pass


class DeepSeekClient:
    def __init__(self) -> None:
        self._api_key = DEEPSEEK_API_KEY
        self._base_url = DEEPSEEK_BASE_URL
        self._model = DEEPSEEK_MODEL
        self._thinking_enabled = DEEPSEEK_THINKING_ENABLED
        self._attach_user_prompt_patch = DEEPSEEK_USER_PROMPT_PATCH
        self._dice_roll_pattern = re.compile(r'\[DICE_ROLL:(\w+)\](d\d+)\[/DICE_ROLL:\1\]', re.IGNORECASE)
        self._dice_ref_pattern = re.compile(r'\[ROLL:(\w+)\]', re.IGNORECASE)

    def _ensure_configured(self) -> None:
        if not self._api_key:
            raise DeepSeekError("DEEPSEEK_API_KEY is not configured")

    def _roll_dice(self, dice_spec: str) -> int:
        """Roll a dice specified by format like 'd20', 'd6', 'd100'."""
        match = re.match(r'd(\d+)', dice_spec.lower())
        if not match:
            return 0
        sides = int(match.group(1))
        if sides <= 0:
            return 0
        return random.randint(1, sides)

    def _expand_dice_rolls(self, text: str) -> str:
        roll_cache: dict[str, int] = {}

        def ensure_roll(dice_id: str, dice_spec: str) -> int:
            if dice_id not in roll_cache:
                roll_cache[dice_id] = self._roll_dice(dice_spec)
            return roll_cache[dice_id]

        def replace_dice_block(match: re.Match[str]) -> str:
            dice_id = match.group(1)
            dice_spec = match.group(2)
            return str(ensure_roll(dice_id, dice_spec))

        def replace_roll_ref(match: re.Match[str]) -> str:
            dice_id = match.group(1)
            return str(ensure_roll(dice_id, 'd20'))

        text = self._dice_roll_pattern.sub(replace_dice_block, text)
        text = self._dice_ref_pattern.sub(replace_roll_ref, text)
        return text

    def _build_payload_messages(
        self,
        messages: list[dict[str, str]],
        system: str | None,
        *,
        user_patch: str | None = None,
        attach_user_patch: bool | None = None,
    ) -> list[dict[str, str]]:
        use_patch = self._attach_user_prompt_patch if attach_user_patch is None else attach_user_patch
        payload_messages = [dict(message) for message in messages]

        if use_patch and user_patch and user_patch.strip():
            if payload_messages and payload_messages[-1].get("role") == "user":
                user_content = payload_messages[-1]["content"]
                patched_content = f"{user_patch.rstrip()}\n\n---\n\n{user_content}"
                payload_messages[-1] = {"role": "user", "content": patched_content}

        if system:
            return [{"role": "system", "content": system}, *payload_messages]
        return payload_messages

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        user_patch: str | None = None,
        temperature: float = 0.7,
        thinking: bool | None = None,
        attach_user_patch: bool | None = None,
    ) -> ChatCompletionResult:
        self._ensure_configured()

        payload_messages = self._build_payload_messages(
            messages,
            system,
            user_patch=user_patch,
            attach_user_patch=attach_user_patch,
        )

        use_thinking = self._thinking_enabled if thinking is None else thinking

        payload: dict = {
            "model": self._model,
            "messages": payload_messages,
        }

        if use_thinking:
            payload["reasoning_effort"] = "high"
            payload["thinking"] = {"type": "enabled"}
        else:
            payload["temperature"] = temperature

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code >= 400:
            raise DeepSeekError(f"DeepSeek API error {response.status_code}: {response.text}")

        data = response.json()
        try:
            message = data["choices"][0]["message"]
            content = str(message.get("content") or "").strip()
            reasoning_content = str(message.get("reasoning_content") or "").strip()
            content = self._expand_dice_rolls(content)
            return ChatCompletionResult(
                content=content,
                reasoning_content=reasoning_content,
            )
        except (KeyError, IndexError, TypeError) as exc:
            raise DeepSeekError("Unexpected DeepSeek API response format") from exc

    def to_handler_response(
        self,
        result: ChatCompletionResult,
        *,
        role: str = "dm",
        label: str = "DM",
    ) -> dict:
        response = {
            "text": result.content,
            "role": role,
            "label": label,
        }
        if result.reasoning_content:
            response["reasoning"] = result.reasoning_content
        return response


deepseek_client = DeepSeekClient()
