from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from fastembed import TextEmbedding

from rag.settings import load_rules_kb_config

_model: TextEmbedding | None = None
_model_name: str | None = None


def get_embedding_model() -> TextEmbedding:
    global _model, _model_name
    config = load_rules_kb_config()
    model_name = config.get("embedding_model", "BAAI/bge-small-zh-v1.5")
    if _model is None or _model_name != model_name:
        _model = TextEmbedding(model_name=model_name)
        _model_name = model_name
    return _model


class FastEmbedEmbeddingFunction(EmbeddingFunction):
    def __init__(self) -> None:
        pass

    def __call__(self, input: Documents) -> Embeddings:
        model = get_embedding_model()
        return [vector.tolist() for vector in model.embed(list(input))]
