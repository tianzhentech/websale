export type AccountFormatIssueCode =
  | "missing_separator"
  | "missing_email"
  | "invalid_email"
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
  email: string;
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

const EMAIL_CANDIDATE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/i;

function normalizeEmailCandidate(value: string) {
  return stripOuterQuotes(value)
    .replace(/^mailto:/i, "")
    .replace(/^[<(]+/, "")
    .replace(/[)>]+$/, "")
    .replace(/[;:!?]+$/, "")
    .replace(/\.$/, "")
    .trim();
}

function hasValidEmailStructure(value: string) {
  if (!value || value.length > 320 || /\.\./.test(value)) {
    return false;
  }

  const parts = value.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  if (!localPart || !domain || localPart.length > 64 || domain.length > 255) {
    return false;
  }
  if (!/^[A-Z0-9._%+-]+$/i.test(localPart)) {
    return false;
  }
  if (domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return false;
  }
  if (
    labels.some(
      (label) =>
        !label ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[A-Z0-9-]+$/i.test(label)
    )
  ) {
    return false;
  }

  return /^[A-Z]{2,63}$/i.test(labels[labels.length - 1] || "");
}

export function isEmailAddress(value: string) {
  return hasValidEmailStructure(normalizeEmailCandidate(value));
}

export function normalizeEmail(value: string) {
  const candidate = normalizeEmailCandidate(value);
  if (hasValidEmailStructure(candidate)) {
    return candidate;
  }

  const match = candidate.match(EMAIL_CANDIDATE_PATTERN);
  if (!match?.[0]) {
    return "";
  }

  const normalizedMatch = normalizeEmailCandidate(match[0]);
  return hasValidEmailStructure(normalizedMatch) ? normalizedMatch : "";
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
  return `${record.email}---${record.password}---${record.twofaSecret}`;
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

  const email = normalizeEmail(match[1] || "");
  if (!(match[1] || "").trim()) {
    return {
      ok: false,
      code: "missing_email",
      lineNumber,
      raw: line,
    };
  }
  if (!email || !isEmailAddress(email)) {
    return {
      ok: false,
      code: "invalid_email",
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
    email,
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
