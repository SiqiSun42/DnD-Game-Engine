function getLlmApiOrigin() {
  const { protocol, hostname, port, origin } = window.location;

  if (port === '8000') {
    return origin;
  }

  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return `${protocol}//${hostname}:8000`;
  }

  return origin;
}

const LLM_API_ORIGIN = getLlmApiOrigin();

const LLM_CONFIG = {
  apiOrigin: LLM_API_ORIGIN,
  chatEndpoint: `${LLM_API_ORIGIN}/api/chat`,
  healthEndpoint: `${LLM_API_ORIGIN}/api/health`,
  requestTimeoutMs: 120000,
};
