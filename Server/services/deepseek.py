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
    OLLAMA_MAX_TOKENS,
)

_THINKING_TAG = r"(?:think(?:ing)?|redacted_thinking|redacted_reasoning)"
_THINKING_BLOCK_PATTERN = re.compile(
    rf"<{_THINKING_TAG}>([\s\S]*?)</{_THINKING_TAG}>",
    re.IGNORECASE,
)
_UNCLOSED_THINKING_PATTERN = re.compile(
    rf"<{_THINKING_TAG}>([\s\S]*)$",
    re.IGNORECASE,
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
        self._is_local = "localhost" in self._base_url or "127.0.0.1" in self._base_url

    def _ensure_configured(self) -> None:
        if not self._api_key and not self._is_local:
            raise DeepSeekError("DEEPSEEK_API_KEY is not configured")

    def _get_api_url(self) -> str:
        """获取API端点URL"""
        if self._is_local:
            # Ollama兼容OpenAI API，端点是 /v1/chat/completions
            return f"{self._base_url}/v1/chat/completions"
        else:
            # Deepseek官方API
            return f"{self._base_url}/chat/completions"

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

    def _split_thinking_from_content(self, raw_content: str) -> tuple[str, str]:
        raw = raw_content or ""
        reasoning_parts: list[str] = []

        def collect_block(match: re.Match[str]) -> str:
            block = (match.group(1) or "").strip()
            if block:
                reasoning_parts.append(block)
            return ""

        visible = _THINKING_BLOCK_PATTERN.sub(collect_block, raw).strip()
        if not reasoning_parts:
            unclosed = _UNCLOSED_THINKING_PATTERN.search(raw)
            if unclosed:
                block = (unclosed.group(1) or "").strip()
                if block:
                    reasoning_parts.append(block)
                visible = _UNCLOSED_THINKING_PATTERN.sub("", raw).strip()

        reasoning = "\n\n".join(reasoning_parts).strip()
        return visible, reasoning

    def _normalize_completion_text(
        self,
        raw_content: str,
        reasoning_content: str,
    ) -> tuple[str, str]:
        content = raw_content or ""
        reasoning = (reasoning_content or "").strip()
        if _THINKING_BLOCK_PATTERN.search(content) or _UNCLOSED_THINKING_PATTERN.search(content):
            parsed_content, parsed_reasoning = self._split_thinking_from_content(content)
            content = parsed_content
            if not reasoning:
                reasoning = parsed_reasoning
        else:
            content = content.strip()
        content = self._expand_dice_rolls(content.strip())
        return content, reasoning

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
        model: str | None = None,
        response_format: dict | None = None,
        max_tokens: int | None = None,
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
            "model": model or self._model,
            "messages": payload_messages,
        }

        if self._is_local:
            payload["temperature"] = temperature
        elif use_thinking:
            payload["reasoning_effort"] = "high"
            payload["thinking"] = {"type": "enabled"}
        else:
            payload["temperature"] = temperature
        if response_format:
            payload["response_format"] = response_format
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        elif self._is_local and OLLAMA_MAX_TOKENS is not None:
            payload["max_tokens"] = OLLAMA_MAX_TOKENS

        url = self._get_api_url()
        headers = {"Content-Type": "application/json"}

        if not self._is_local:
            headers["Authorization"] = f"Bearer {self._api_key}"

        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code >= 400:
            raise DeepSeekError(f"DeepSeek API error {response.status_code}: {response.text}")

        data = response.json()
        try:
            message = data["choices"][0]["message"]
            raw_content = str(message.get("content") or "")
            reasoning_content = str(
                message.get("reasoning_content")
                or message.get("reasoning")
                or ""
            )
            content, reasoning_content = self._normalize_completion_text(
                raw_content,
                reasoning_content,
            )
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
