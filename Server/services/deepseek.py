from typing import Any

import httpx

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


class DeepSeekError(Exception):
    pass


class DeepSeekClient:
    def __init__(self) -> None:
        self._api_key = DEEPSEEK_API_KEY
        self._base_url = DEEPSEEK_BASE_URL
        self._model = DEEPSEEK_MODEL

    def _ensure_configured(self) -> None:
        if not self._api_key:
            raise DeepSeekError("DEEPSEEK_API_KEY is not configured")

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        self._ensure_configured()

        payload_messages: list[dict[str, str]] = []
        if system:
            payload_messages.append({"role": "system", "content": system})
        payload_messages.extend(messages)

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": payload_messages,
            "temperature": temperature,
        }

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code >= 400:
            raise DeepSeekError(f"DeepSeek API error {response.status_code}: {response.text}")

        data = response.json()
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise DeepSeekError("Unexpected DeepSeek API response format") from exc


deepseek_client = DeepSeekClient()
