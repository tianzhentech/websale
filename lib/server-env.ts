import "server-only";

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_ENV_FILE = path.resolve(process.cwd(), ".env.local");
const ROOT_ENV_FILE = path.resolve(process.cwd(), "..", "..", ".env");

function parseEnvValue(value: string) {
  const normalized = value.trim();
  if (
    normalized.length >= 2 &&
    normalized.startsWith("\"") &&
    normalized.endsWith("\"")
  ) {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      return typeof parsed === "string" ? parsed : normalized.slice(1, -1);
    } catch {
      return normalized.slice(1, -1);
    }
  }

  if (
    normalized.length >= 2 &&
    normalized.startsWith("'") &&
    normalized.endsWith("'")
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function parseEnvText(source: string) {
  const loaded: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    loaded[key] = parseEnvValue(value);
  }

  return loaded;
}

function readEnvFile(filePath: string) {
  try {
    return parseEnvText(readFileSync(filePath, "utf8"));
  } catch {
    return {} as Record<string, string>;
  }
}

export function readLocalEnv() {
  return readEnvFile(LOCAL_ENV_FILE);
}

function readRootEnvFile() {
  return readEnvFile(ROOT_ENV_FILE);
}

export function readLocalEnvValue(name: string) {
  const fileValue = readLocalEnv()[name]?.trim();
  return fileValue || undefined;
}

export function readServerEnv(name: string) {
  const localFileValue = readLocalEnv()[name]?.trim();
  if (localFileValue) {
    return localFileValue;
  }

  const processValue = process.env[name]?.trim();
  if (processValue) {
    return processValue;
  }

  const fileValue = readRootEnvFile()[name]?.trim();
  return fileValue || undefined;
}

function serializeEnvValue(value: string) {
  return JSON.stringify(value);
}

export async function writeLocalEnvValues(
  updates: Record<string, string | null | undefined>
) {
  let lines: string[];

  try {
    const existing = await readFile(LOCAL_ENV_FILE, "utf8");
    lines = existing.replace(/\r\n?/g, "\n").split("\n");
  } catch {
    lines = [];
  }

  const pendingKeys = new Set(Object.keys(updates));
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];
    if (!pendingKeys.has(key)) {
      nextLines.push(line);
      continue;
    }

    pendingKeys.delete(key);
    const value = updates[key];
    if (!value) {
      continue;
    }

    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  for (const key of pendingKeys) {
    const value = updates[key];
    if (!value) {
      continue;
    }

    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
    nextLines.pop();
  }

  await writeFile(LOCAL_ENV_FILE, `${nextLines.join("\n")}\n`, "utf8");
}
