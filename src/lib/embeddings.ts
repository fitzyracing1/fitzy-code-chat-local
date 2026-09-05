import OpenAI from "openai";
import { config, type RagProvider } from "./config";

let client: OpenAI | null = null;
let clientProvider: RagProvider | null = null;

/** Deterministic local embedder: hashed bag-of-words + char 3-grams → fixed dim, L2-normalized. */
export function localEmbed(text: string, dim = config.localEmbeddingDim): number[] {
  const vec = new Float64Array(dim);
  const lower = text.toLowerCase();

  const addToken = (tok: string) => {
    if (!tok) return;
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = h >>> 0;
    const idx = h % dim;
    const sign = h & 1 ? 1 : -1;
    vec[idx] += sign;
  };

  const words = lower.match(/[a-z0-9_./+-]+/g) || [];
  for (const w of words) addToken(w);

  const compact = lower.replace(/\s+/g, " ");
  for (let i = 0; i + 2 < compact.length; i++) {
    addToken(compact.slice(i, i + 3));
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) out[i] = vec[i] / norm;
  return out;
}

export function getOpenAI(): OpenAI {
  const provider = config.ragProvider;
  if (client && clientProvider === provider) return client;

  if (provider === "local") {
    throw new Error("OpenAI client is not used when RAG_PROVIDER=local");
  }

  if (provider === "ollama") {
    client = new OpenAI({
      apiKey: config.openaiApiKey || "ollama",
      baseURL: config.ollamaBaseUrl,
    });
    clientProvider = "ollama";
    return client;
  }

  // openai
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when RAG_PROVIDER=openai");
  }
  client = new OpenAI({
    apiKey: config.openaiApiKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
  });
  clientProvider = "openai";
  return client;
}

function embeddingModelForProvider(provider: RagProvider): string {
  if (provider === "ollama") return config.ollamaEmbeddingModel;
  return config.embeddingModel;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = config.ragProvider;

  if (provider === "local") {
    return texts.map((t) => localEmbed(t));
  }

  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: embeddingModelForProvider(provider),
    input: texts,
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
