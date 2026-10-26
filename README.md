# fitzy-code-chat

RAG chat over **all** GitHub repositories owned by `fitzyracing1` (except the mega-snapshot repo `fitzyracing1/fitzyracing1` by default).

Stack: Next.js App Router + TypeScript, local hashed embeddings + extractive answers by default (no API key), optional OpenAI/Ollama, JSONL vector store, streaming chat UI with citations.

## Setup

```bash
git clone https://github.com/fitzyracing1/fitzy-code-chat.git
cd fitzy-code-chat
cp .env.example .env
# Local mode needs NO OpenAI key. GitHub: set GITHUB_TOKEN/GH_TOKEN or rely on gh auth token
# Optional: OPENAI_API_KEY or OLLAMA_BASE_URL for synthesized answers
npm install
```

## Ingest repositories

List repos (no embeddings):

```bash
npm run ingest:list
```

Dry-run discovery:

```bash
npm run ingest:dry
```

Index all owned repos (skips `fitzyracing1` mega-snapshot unless `INCLUDE_MEGA_SNAPSHOT=true`):

```bash
npm run ingest
```

Useful flags:

```bash
npx tsx scripts/ingest.ts --repo some-repo
npx tsx scripts/ingest.ts --limit 5
npx tsx scripts/ingest.ts --force
```

Cache clones live under `data/cache/`. Vectors under `data/vectors/chunks.jsonl`. Manifest: `data/ingest-manifest.json`.

## Run the chat app

```bash
npm run dev
```

Open http://localhost:3000 — ask questions; citations show repo + file path under each answer.

Production:

```bash
npm run build && npm start
```

## Environment

| Variable | Purpose |
|---|---|
| `RAG_PROVIDER` | `local` (default) / `openai` / `ollama` |
| `OPENAI_API_KEY` | Optional — enables OpenAI mode |
| `OLLAMA_BASE_URL` | Optional — enables Ollama mode |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL |
| `OPENAI_MODEL` | Chat model (default `gpt-4o-mini`) |
| `EMBEDDING_MODEL` | Embedding model (default `text-embedding-3-small`) |
| `GITHUB_TOKEN` / `GH_TOKEN` | GitHub API + clone auth |
| `INCLUDE_MEGA_SNAPSHOT` | Include repo named `fitzyracing1` (default `false`) |
| `GITHUB_OWNER` | Default `fitzyracing1` |
| `TOP_K` / `CHUNK_SIZE` / `CHUNK_OVERLAP` / `DATA_DIR` | Retrieval + chunking knobs |

## Notes

- Ingestion skips build dirs, lockfiles, images, and binaries.
- Upserts are idempotent by chunk id; re-run with `--force` to rebuild a repo.
- Chat API streams NDJSON events: `meta` (citations), `token`, `done`.

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
