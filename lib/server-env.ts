import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT_ENV_FILE = path.resolve(process.cwd(), "..", "..", ".env");

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
    let value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (
      value.length >= 2 &&
      ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
  }

  return loaded;
}

function readRootEnvFile() {
  try {
    return parseEnvText(readFileSync(ROOT_ENV_FILE, "utf8"));
  } catch {
    return {} as Record<string, string>;
  }
}

export function readServerEnv(name: string) {
  const processValue = process.env[name]?.trim();
  if (processValue) {
    return processValue;
  }

  const fileValue = readRootEnvFile()[name]?.trim();
  return fileValue || undefined;
}
