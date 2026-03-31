export type AccountFormatIssueCode =
  | "missing_separator"
  | "missing_gmail"
  | "invalid_gmail"
  | "missing_password"
  | "missing_twofa"
  | "invalid_twofa";

export type BulkAccountInputLine = {
  lineNumber: number;
  raw: string;
  trimmed: string;
  isEmpty: boolean;
};

export type NormalizedAccountRecord = {
  gmail: string;
  password: string;
  twofaSecret: string;
};

export type ValidBulkAccountLine = {
  ok: true;
  formatted: string;
  lineNumber: number;
  raw: string;
  record: NormalizedAccountRecord;
};

export type InvalidBulkAccountLine = {
  ok: false;
  code: AccountFormatIssueCode;
  lineNumber: number;
  raw: string;
};

export type BulkAccountLineValidation = ValidBulkAccountLine | InvalidBulkAccountLine;

export function splitBulkAccountInputLines(text: string): BulkAccountInputLine[] {
  return text.split(/\r?\n/).map((raw, index) => {
    const trimmed = raw.trim();
    return {
      lineNumber: index + 1,
      raw,
      trimmed,
      isEmpty: !trimmed,
    };
  });
}

export function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function isGmailAddress(value: string) {
  return /^[^@\s]+@gmail\.com$/i.test(value.trim());
}

export function normalizeGmail(value: string) {
  const candidate = stripOuterQuotes(value);
  const match = candidate.match(/[A-Z0-9._%+-]+@gmail\.com/gi);
  return match?.[0]?.toLowerCase() || "";
}

export function normalizePassword(value: string) {
  return stripOuterQuotes(value);
}

export function extractSecretFromOtpauthUrl(value: string) {
  const secretMatch = value.match(/[?&]secret=([^&]+)/i);
  if (!secretMatch?.[1]) {
    return "";
  }

  try {
    return decodeURIComponent(secretMatch[1]);
  } catch {
    return secretMatch[1];
  }
}

export function normalizeTwofaSecret(value: string) {
  const trimmed = stripOuterQuotes(value);
  if (!trimmed) {
    return "";
  }

  const fromUrl =
    trimmed.includes("otpauth://") || trimmed.includes("secret=")
      ? extractSecretFromOtpauthUrl(trimmed)
      : "";
  const candidate = stripOuterQuotes(fromUrl || trimmed);
  const compact = candidate.replace(/[\s-]+/g, "");

  if (/^[A-Z2-7]+=*$/i.test(compact)) {
    return compact.toUpperCase();
  }

  return candidate;
}

export function isValidTwofaSecret(value: string) {
  const normalized = normalizeTwofaSecret(value);
  if (!normalized) {
    return false;
  }

  return /^[A-Z2-7]+=*$/i.test(normalized) && normalized.replace(/=+$/g, "").length >= 8;
}

export function formatNormalizedAccountRecord(record: NormalizedAccountRecord) {
  return `${record.gmail}---${record.password}---${record.twofaSecret}`;
}

export function validateBulkAccountLine(
  line: string,
  lineNumber: number
): BulkAccountLineValidation {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "missing_separator",
      lineNumber,
      raw: line,
    };
  }

  const match = trimmed.match(/^(.*?)\s*---\s*(.*?)\s*---\s*(.*)$/);
  if (!match) {
    return {
      ok: false,
      code: "missing_separator",
      lineNumber,
      raw: line,
    };
  }

  const gmail = normalizeGmail(match[1] || "");
  if (!(match[1] || "").trim()) {
    return {
      ok: false,
      code: "missing_gmail",
      lineNumber,
      raw: line,
    };
  }
  if (!gmail || !isGmailAddress(gmail)) {
    return {
      ok: false,
      code: "invalid_gmail",
      lineNumber,
      raw: line,
    };
  }

  const password = normalizePassword(match[2] || "");
  if (!password) {
    return {
      ok: false,
      code: "missing_password",
      lineNumber,
      raw: line,
    };
  }

  const twofaRaw = match[3] || "";
  if (!twofaRaw.trim()) {
    return {
      ok: false,
      code: "missing_twofa",
      lineNumber,
      raw: line,
    };
  }

  const twofaSecret = normalizeTwofaSecret(twofaRaw);
  if (!isValidTwofaSecret(twofaSecret)) {
    return {
      ok: false,
      code: "invalid_twofa",
      lineNumber,
      raw: line,
    };
  }

  const record = {
    gmail,
    password,
    twofaSecret,
  };

  return {
    ok: true,
    formatted: formatNormalizedAccountRecord(record),
    lineNumber,
    raw: line,
    record,
  };
}

export function validateBulkAccountText(text: string) {
  const sourceLines = splitBulkAccountInputLines(text);
  const validLines: string[] = [];
  const invalidLines: InvalidBulkAccountLine[] = [];

  for (const line of sourceLines) {
    if (line.isEmpty) {
      continue;
    }

    const validation = validateBulkAccountLine(line.trimmed, line.lineNumber);
    if (validation.ok) {
      validLines.push(validation.formatted);
      continue;
    }

    invalidLines.push(validation);
  }

  return {
    sourceLines,
    validLines,
    invalidLines,
  };
}
