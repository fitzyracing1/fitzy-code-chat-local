import { config, type Citation } from "./config";
import { embedQuery, getOpenAI } from "./embeddings";
import { search, storeStats } from "./store";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type StreamChunk = {
  choices: Array<{ delta: { content?: string } }>;
};

function buildContext(citations: Citation[]): string {
  if (citations.length === 0) return "No indexed code snippets were retrieved.";
  return citations.map((c, i) => {
    return "[" + (i + 1) + "] " + c.repo + " / " + c.path + ":" + c.startLine + "-" + c.endLine + " (score=" + c.score.toFixed(3) + ")\n" + c.preview;
  }).join("\n\n");
}

export async function retrieve(question: string, topK = config.topK): Promise<Citation[]> {
  const stats = storeStats();
  if (stats.chunks === 0) return [];
  const vector = await embedQuery(question);
  return search(vector, topK);
}

export function systemPrompt(citations: Citation[]): string {
  return [
    "You are Fitzy Code Chat, a RAG assistant over GitHub repos owned by fitzyracing1.",
    "Answer using the retrieved code snippets. Cite sources as [n] with repo and file path.",
    "If context is insufficient, say what is missing. Prefer concrete code references.",
    "",
    "Retrieved context:",
    buildContext(citations),
  ].join("\n");
}

export function buildExtractiveAnswer(question: string, citations: Citation[]): string {
  const lines: string[] = [];
  lines.push("Here is what I found in your repos for: " + question.trim());
  lines.push("");
  lines.push("(Local mode - no external LLM. Showing top matching snippets.)");
  lines.push("");
  if (citations.length === 0) {
    lines.push("No indexed snippets matched. Run ingest first (GitHub auth only).");
    return lines.join("\n");
  }
  for (let i = 0; i < citations.length; i++) {
    const c = citations[i];
    lines.push("### [" + (i + 1) + "] " + c.repo + " / " + c.path + ":" + c.startLine + "-" + c.endLine);
    lines.push("Relevance score: " + c.score.toFixed(3));
    lines.push("");
    lines.push(c.preview.trim());
    lines.push("");
  }
  lines.push("These are the strongest lexical matches. Set OPENAI_API_KEY or OLLAMA_BASE_URL for synthesized answers.");
  return lines.join("\n");
}

async function* streamText(text: string): AsyncGenerator<StreamChunk> {
  const size = 48;
  for (let i = 0; i < text.length; i += size) {
    yield { choices: [{ delta: { content: text.slice(i, i + size) } }] };
  }
}

export async function answerQuestion(question: string, history: ChatMessage[] = []) {
  const citations = await retrieve(question);
  if (config.ragProvider === "local") {
    return { answer: buildExtractiveAnswer(question, citations), citations, stats: storeStats() };
  }
  const openai = getOpenAI();
  const model = config.ragProvider === "ollama" ? config.ollamaModel : config.openaiModel;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(citations) },
    ...history.slice(-8),
    { role: "user", content: question },
  ];
  const completion = await openai.chat.completions.create({ model, messages, temperature: 0.2 });
  const answer = completion.choices[0]?.message?.content || "";
  return { answer, citations, stats: storeStats() };
}

export async function streamAnswer(question: string, history: ChatMessage[] = []) {
  const citations = await retrieve(question);
  if (config.ragProvider === "local") {
    return { stream: streamText(buildExtractiveAnswer(question, citations)), citations, stats: storeStats() };
  }
  const openai = getOpenAI();
  const model = config.ragProvider === "ollama" ? config.ollamaModel : config.openaiModel;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(citations) },
    ...history.slice(-8),
    { role: "user", content: question },
  ];
  const stream = await openai.chat.completions.create({ model, messages, temperature: 0.2, stream: true });
  return { stream, citations, stats: storeStats() };
}
