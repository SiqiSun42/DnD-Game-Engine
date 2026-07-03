async function llmChat(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_CONFIG.requestTimeoutMs);

  try {
    const response = await fetch(LLM_CONFIG.chatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      let detail = data.detail || data.message || `HTTP ${response.status}`;
      if (response.status === 405) {
        detail = 'API server not reachable (HTTP 405). Start Server with: cd Server && uvicorn main:app --reload --port 8000, then open http://127.0.0.1:8000/UI/';
      }
      throw new Error(typeof detail === 'string' ? detail : 'LLM request failed');
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkLlmHealth() {
  const response = await fetch(LLM_CONFIG.healthEndpoint);
  return response.ok;
}
