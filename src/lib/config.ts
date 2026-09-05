import path from "path";

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export type RagProvider = "local" | "openai" | "ollama";

function resolveRagProvider(): RagProvider {
  const explicit = (env("RAG_PROVIDER") || "").toLowerCase();
  if (explicit === "local" || explicit === "openai" || explicit === "ollama") {
    return explicit;
  }
  // auto: OpenAI if key set, else Ollama if base URL set, else fully local
  if (env("OPENAI_API_KEY")) return "openai";
  if (env("OLLAMA_BASE_URL")) return "ollama";
  return "local";
}

export const config = {
  openaiApiKey: env("OPENAI_API_KEY", "")!,
  openaiBaseUrl: env("OPENAI_BASE_URL"),
  openaiModel: env("OPENAI_MODEL", "gpt-4o-mini")!,
  embeddingModel: env("EMBEDDING_MODEL", "text-embedding-3-small")!,
  ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")!,
  ollamaModel: env("OLLAMA_MODEL", "llama3.2")!,
  ollamaEmbeddingModel: env("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")!,
  localEmbeddingDim: Number(env("LOCAL_EMBEDDING_DIM", "384")),
  get ragProvider(): RagProvider {
    return resolveRagProvider();
  },
  githubToken: env("GITHUB_TOKEN") || env("GH_TOKEN") || "",
  githubOwner: env("GITHUB_OWNER", "fitzyracing1")!,
  includeMegaSnapshot: envBool("INCLUDE_MEGA_SNAPSHOT", false),
  megaSnapshotRepo: "fitzyracing1",
  topK: Number(env("TOP_K", "8")),
  chunkSize: Number(env("CHUNK_SIZE", "1200")),
  chunkOverlap: Number(env("CHUNK_OVERLAP", "200")),
  dataDir: path.resolve(env("DATA_DIR", "./data")!),
  get cacheDir() { return path.join(this.dataDir, "cache"); },
  get vectorsDir() { return path.join(this.dataDir, "vectors"); },
  get manifestPath() { return path.join(this.dataDir, "ingest-manifest.json"); },
};

export type Citation = {
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
};

export type ChunkRecord = {
  id: string;
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  vector: number[];
};
