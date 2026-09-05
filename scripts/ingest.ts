#!/usr/bin/env node
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { config } from "../src/lib/config";
import { chunkId, chunkText, shouldIndexFile, shouldSkipDir, type RawChunk } from "../src/lib/chunk";
import { listOwnerRepos, shallowClone } from "../src/lib/github";
import { embedTexts } from "../src/lib/embeddings";
import { deleteRepoChunks, storeStats, upsertChunks } from "../src/lib/store";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type Manifest = Record<string, { updatedAt: string; files: number; chunks: number }>;

function loadManifest(): Manifest {
  if (!fs.existsSync(config.manifestPath)) return {};
  return JSON.parse(fs.readFileSync(config.manifestPath, "utf8")) as Manifest;
}

function saveManifest(m: Manifest): void {
  fs.mkdirSync(path.dirname(config.manifestPath), { recursive: true });
  fs.writeFileSync(config.manifestPath, JSON.stringify(m, null, 2));
}

function walkFiles(root: string, rel = ""): string[] {
  const dir = path.join(root, rel);
  const out: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (ent.name === ".git") continue;
    const childRel = rel ? rel + "/" + ent.name : ent.name;
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      out.push(...walkFiles(root, childRel));
    } else if (ent.isFile()) {
      if (shouldIndexFile(childRel)) out.push(childRel);
    }
  }
  return out;
}

function readFileSafe(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.includes(0)) return null;
    if (buf.length > 1_500_000) return null;
    return buf.toString("utf8");
  } catch { return null; }
}

async function embedBatched(chunks: RawChunk[]) {
  const batchSize = 32;
  const records = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await embedTexts(batch.map((c) => c.text.slice(0, 8000)));
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      records.push({
        id: chunkId(c.repo, c.path, c.startLine, c.endLine),
        repo: c.repo,
        path: c.path,
        startLine: c.startLine,
        endLine: c.endLine,
        text: c.text,
        vector: vectors[j],
      });
    }
    process.stdout.write("  embedded " + Math.min(i + batchSize, chunks.length) + "/" + chunks.length + "\r");
  }
  if (chunks.length) process.stdout.write("\n");
  return records;
}

async function ingestRepo(repo: Awaited<ReturnType<typeof listOwnerRepos>>[number], dryRun: boolean, force: boolean, manifest: Manifest) {
  console.log("Cloning " + repo.fullName + " ...");
  if (dryRun) { console.log("  dry-run: skip clone/embed"); return; }
  const root = shallowClone(repo);
  const files = walkFiles(root);
  console.log("  files to index: " + files.length);
  const chunks: RawChunk[] = [];
  for (const rel of files) {
    const text = readFileSafe(path.join(root, rel));
    if (!text) continue;
    chunks.push(...chunkText(repo.name, rel, text));
  }
  console.log("  chunks: " + chunks.length);
  if (!force && manifest[repo.name]?.chunks === chunks.length && chunks.length > 0) {
    console.log("  unchanged per manifest; skip (use --force)");
    return;
  }
  deleteRepoChunks(repo.name);
  if (chunks.length === 0) {
    manifest[repo.name] = { updatedAt: new Date().toISOString(), files: files.length, chunks: 0 };
    saveManifest(manifest);
    return;
  }
  const records = await embedBatched(chunks);
  upsertChunks(records);
  manifest[repo.name] = { updatedAt: new Date().toISOString(), files: files.length, chunks: records.length };
  saveManifest(manifest);
  console.log("  upserted " + records.length + " chunks");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const listOnly = args.includes("--list");
  const repoIdx = args.indexOf("--repo");
  const onlyRepo = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

  console.log("Owner: " + config.githubOwner);
  console.log("Include mega snapshot: " + config.includeMegaSnapshot);
  console.log("Data dir: " + config.dataDir);

  const repos = await listOwnerRepos();
  console.log("Repos discovered: " + repos.length);
  if (listOnly || dryRun && !onlyRepo) {
    for (const r of repos.slice(0, limit || repos.length)) console.log(" - " + r.fullName);
    if (listOnly) return;
  }

  console.log("RAG provider: " + config.ragProvider);
  if (!dryRun && config.ragProvider === "openai" && !config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY required when RAG_PROVIDER=openai (or use local mode / --dry-run / --list)");
  }

  const selected = onlyRepo ? repos.filter((r) => r.name === onlyRepo) : repos;
  if (onlyRepo && selected.length === 0) throw new Error("Repo not found: " + onlyRepo);
  const targets = typeof limit === "number" ? selected.slice(0, limit) : selected;
  const manifest = loadManifest();

  let i = 0;
  for (const repo of targets) {
    i++;
    console.log("[" + i + "/" + targets.length + "] " + repo.fullName);
    try {
      await ingestRepo(repo, dryRun, force, manifest);
    } catch (err) {
      console.error("  FAILED:", err instanceof Error ? err.message : err);
    }
  }

  const stats = storeStats();
  console.log("Done. Store: " + stats.chunks + " chunks across " + stats.repos + " repos");
}

main().catch((err) => { console.error(err); process.exit(1); });
