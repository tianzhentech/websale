import "server-only";

import {
  isEmailAddress,
  validateBulkAccountText,
  type AccountFormatIssueCode,
  type InvalidBulkAccountLine,
} from "@/lib/account-format";
import {
  readAdminRuntimeConfig,
} from "@/lib/admin-config";
import { readServerEnv } from "@/lib/server-env";

type JsonObject = Record<string, unknown>;

export type RunMode = "extract_link" | "subscription";

type RunModeInfo = {
  run_mode: RunMode;
  label: string;
  price: number;
  enabled: boolean;
  affordable: boolean;
  shortfall: number;
};

type CdkTransaction = {
  kind: string;
  amount: number;
  run_mode: RunMode | null;
  run_mode_label: string | null;
  balance_before: number;
  balance_after: number;
  note: string | null;
  created_at: string | null;
};

type CdkDetail = {
  cdk: {
    code: string;
    status: string;
    remaining_amount: number;
    available_amount: number;
    reserved_amount: number;
    initial_amount: number;
    redeem_count: number;
    note: string | null;
    created_at: string | null;
    last_redeemed_at: string | null;
    last_consumed_at: string | null;
  };
  transactions: CdkTransaction[];
  pricing: Record<RunMode, number>;
  run_modes: RunModeInfo[];
  status_label: string;
  can_exchange: boolean;
};

type QueueTask = {
  id: number;
  email: string;
  run_mode: RunMode | null;
  run_mode_label: string;
  cdk_code: string | null;
  cdk_charge_status: string | null;
  cdk_charge_status_label: string | null;
  cdk_charge_amount: number;
  cdk_charge_error: string | null;
  cdk_charged_at: string | null;
  status: string;
  device_serial: string | null;
  card_id: number | null;
  error_message: string | null;
  success_message: string | null;
  attempt_count: number;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string | null;
  has_twofa: boolean;
};

type QueueExchangeResult = {
  generated_at: string;
  detail: CdkDetail;
  tasks: QueueTask[];
  created: number;
  normalized_lines: string[];
};

type OverviewCounts = {
  tasks_queued: number;
  tasks_running: number;
  tasks_success: number;
  tasks_failed: number;
  tasks_rejected: number;
};

type OverviewActivityDay = {
  date: string;
  queued: number;
  running: number;
  success: number;
  failed: number;
  rejected: number;
  cancelled: number;
  total: number;
  cells: OverviewActivityCell[];
};

type OverviewActivity = {
  window_minutes: number;
  days: OverviewActivityDay[];
  totals: {
    queued: number;
    running: number;
    success: number;
    failed: number;
    rejected: number;
    cancelled: number;
    total: number;
  };
};

type OverviewActivityCellTone = "success" | "failure" | "rejected" | "queued" | "running";

type OverviewActivityCell = {
  task_id: number;
  tone: OverviewActivityCellTone;
};

type RunModeAvailability = Record<RunMode, boolean>;

const BACKEND_API_TIMEOUT_ENV = "PIXEL_WEBSALE_API_TIMEOUT";
const DEFAULT_BACKEND_API_TIMEOUT_MS = 15_000;
const SITE_TITLE_ENV = "PIXEL_WEBSALE_SITE_TITLE";
const BACKEND_ADMIN_PASSWORD_HEADER = "x-pixel-admin-password";
const DEFAULT_SITE_TITLE = "Pixel CDK Exchange";
const OVERVIEW_ACTIVITY_TASK_LIMIT = 500;

const RUN_MODE_LABELS: Record<RunMode, string> = {
  extract_link: "提链模式",
  subscription: "订阅模式",
};

const RUN_MODE_PRICING: Record<RunMode, number> = {
  extract_link: 4,
  subscription: 8,
};

const STATUS_LABELS: Record<string, string> = {
  active: "生效",
  exhausted: "已耗尽",
  merged: "已合并",
};

export class WebSaleApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "WebSaleApiError";
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utcNow() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asInteger(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.trunc(number);
}

function resolveSiteTitle() {
  const rawValue = readServerEnv(SITE_TITLE_ENV);
  return rawValue || DEFAULT_SITE_TITLE;
}

async function resolveBackendApiBaseUrl() {
  const configured = await readAdminRuntimeConfig();
  if (!configured.backend_api_base_url) {
    throw new Error("Backend API URL is not configured in .env.local.");
  }

  return configured.backend_api_base_url;
}

function resolveBackendApiTimeoutMs() {
  const rawValue = readServerEnv(BACKEND_API_TIMEOUT_ENV);
  const value = rawValue ? Number(rawValue) : DEFAULT_BACKEND_API_TIMEOUT_MS / 1000;
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_BACKEND_API_TIMEOUT_MS;
  }
  return Math.trunc(value * 1000);
}

async function resolveBackendAdminPassword() {
  const configured = await readAdminRuntimeConfig();
  if (!configured.backend_api_password) {
    throw new Error("Backend API password is not configured in .env.local.");
  }

  return configured.backend_api_password;
}

async function backendUrl(path: string) {
  return `${await resolveBackendApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

function isRunMode(value: unknown): value is RunMode {
  return value === "extract_link" || value === "subscription";
}

function resolveBulkLineIssueLabel(code: AccountFormatIssueCode) {
  switch (code) {
    case "missing_separator":
      return "未使用 Email---Password---2FA密钥 格式";
    case "missing_email":
      return "缺少邮箱";
    case "invalid_email":
      return "邮箱格式不合法";
    case "missing_password":
      return "缺少密码";
    case "missing_twofa":
      return "缺少 2FA 密钥";
    case "invalid_twofa":
      return "2FA 密钥不合法";
    default:
      return "格式不合法";
  }
}

function buildInvalidBulkLinesErrorMessage(invalidLines: InvalidBulkAccountLine[]) {
  const visibleLines = invalidLines.slice(0, 8);
  const details = visibleLines
    .map((line) => `第 ${line.lineNumber} 行（${resolveBulkLineIssueLabel(line.code)}）`)
    .join("；");
  const remainingCount = invalidLines.length - visibleLines.length;
  const suffix = remainingCount > 0 ? `；以及另外 ${remainingCount} 行` : "";
  return `以下行格式不符合要求：${details}${suffix}。请先修正后再提交。`;
}

async function resolveRunModeAvailability(): Promise<RunModeAvailability> {
  const configured = await readAdminRuntimeConfig();
  if (configured.extract_link_enabled === null) {
    throw new Error("Extract link mode switch is not configured in .env.local.");
  }

  if (configured.subscription_enabled === null) {
    throw new Error("Subscription mode switch is not configured in .env.local.");
  }

  return {
    extract_link: configured.extract_link_enabled,
    subscription: configured.subscription_enabled,
  };
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = (await response.text()).trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function responseErrorDetail(payload: unknown, statusCode: number) {
  if (isRecord(payload)) {
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    if (Object.keys(payload).length > 0) {
      return JSON.stringify(payload);
    }
  }

  if (Array.isArray(payload) && payload.length > 0) {
    return JSON.stringify(payload);
  }

  return `Backend API returned HTTP ${statusCode}.`;
}

async function backendRequest(
  method: string,
  path: string,
  payload?: JsonObject
): Promise<JsonObject> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveBackendApiTimeoutMs());

  try {
    const response = await fetch(await backendUrl(path), {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        [BACKEND_ADMIN_PASSWORD_HEADER]: await resolveBackendAdminPassword(),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await responsePayload(response);
    if (!response.ok) {
      const statusCode = response.status < 500 ? response.status : 502;
      throw new WebSaleApiError(statusCode, responseErrorDetail(data, response.status));
    }

    if (!isRecord(data)) {
      throw new WebSaleApiError(502, "Backend API returned an unexpected payload.");
    }

    return data;
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new WebSaleApiError(502, "Failed to reach backend API: request timed out.");
    }
    throw new WebSaleApiError(
      502,
      `Failed to reach backend API: ${error instanceof Error ? error.message : "unknown error"}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePricing(value: unknown): Record<RunMode, number> {
  const pricing: Record<RunMode, number> = { ...RUN_MODE_PRICING };
  if (!isRecord(value)) {
    return pricing;
  }

  for (const runMode of Object.keys(RUN_MODE_LABELS) as RunMode[]) {
    const nextValue = asInteger(value[runMode], pricing[runMode]);
    if (nextValue > 0) {
      pricing[runMode] = nextValue;
    }
  }

  return pricing;
}

async function fetchRemotePricing() {
  const payload = await backendRequest("GET", "/api/settings/pricing");
  return normalizePricing(isRecord(payload.pricing) ? payload.pricing : payload);
}

function normalizeTransactions(value: unknown): CdkTransaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        kind: asString(item.kind),
        amount: asInteger(item.amount),
        run_mode: isRunMode(item.run_mode) ? item.run_mode : null,
        run_mode_label: asOptionalString(item.run_mode_label),
        balance_before: asInteger(item.balance_before),
        balance_after: asInteger(item.balance_after),
        note: asOptionalString(item.note),
        created_at: asOptionalString(item.created_at),
      };
    })
    .filter((item): item is CdkTransaction => Boolean(item && item.kind));
}

function normalizeOverviewCounts(value: unknown): OverviewCounts {
  if (!isRecord(value)) {
    return {
      tasks_queued: 0,
      tasks_running: 0,
      tasks_success: 0,
      tasks_failed: 0,
      tasks_rejected: 0,
    };
  }

  return {
    tasks_queued: asInteger(value.tasks_queued),
    tasks_running: asInteger(value.tasks_running),
    tasks_success: asInteger(value.tasks_success),
    tasks_failed: asInteger(value.tasks_failed),
    tasks_rejected: asInteger(value.tasks_rejected),
  };
}

function normalizeTaskPayload(value: unknown): QueueTask {
  if (!isRecord(value)) {
    throw new WebSaleApiError(502, "Backend task response is missing task data.");
  }

  return {
    id: asInteger(value.id),
    email: asString(value.email),
    run_mode: isRunMode(value.run_mode) ? value.run_mode : null,
    run_mode_label: asString(value.run_mode_label, "未指定"),
    cdk_code: asOptionalString(value.cdk_code),
    cdk_charge_status: asOptionalString(value.cdk_charge_status),
    cdk_charge_status_label: asOptionalString(value.cdk_charge_status_label),
    cdk_charge_amount: asInteger(value.cdk_charge_amount),
    cdk_charge_error: asOptionalString(value.cdk_charge_error),
    cdk_charged_at: asOptionalString(value.cdk_charged_at),
    status: asString(value.status),
    device_serial: asOptionalString(value.device_serial),
    card_id: value.card_id == null ? null : asInteger(value.card_id),
    error_message: asOptionalString(value.error_message),
    success_message: asOptionalString(value.success_message),
    attempt_count: asInteger(value.attempt_count),
    created_at: asOptionalString(value.created_at),
    started_at: asOptionalString(value.started_at),
    finished_at: asOptionalString(value.finished_at),
    updated_at: asOptionalString(value.updated_at),
    has_twofa: Boolean(value.has_twofa),
  };
}

function normalizeTaskListPayload(value: unknown): QueueTask[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      try {
        return normalizeTaskPayload(item);
      } catch {
        return null;
      }
    })
    .filter((item): item is QueueTask => Boolean(item));
}

function utcDayKeyFromTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString().slice(0, 10);
}

function emptyOverviewActivityDay(date: string): OverviewActivityDay {
  return {
    date,
    queued: 0,
    running: 0,
    success: 0,
    failed: 0,
    rejected: 0,
    cancelled: 0,
    total: 0,
    cells: [],
  };
}

function resolveActivityDateKey(task: QueueTask) {
  const timestamp = resolveActivityTimelineTimestamp(task);
  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function resolveActivityTimelineTimestamp(task: QueueTask) {
  if (
    task.status === "success"
    || task.status === "failed"
    || task.status === "rejected"
    || task.status === "refunded"
    || task.status === "cancelled"
  ) {
    return (
      timestampMs(task.finished_at) ??
      timestampMs(task.updated_at) ??
      timestampMs(task.created_at) ??
      timestampMs(task.started_at)
    );
  }

  return (
    timestampMs(task.created_at) ??
    timestampMs(task.updated_at) ??
    timestampMs(task.started_at) ??
    timestampMs(task.finished_at)
  );
}

function timestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveActivitySequenceTimestamp(task: QueueTask) {
  return resolveActivityTimelineTimestamp(task);
}

function compareActivitySequence(a: QueueTask, b: QueueTask) {
  return a.id - b.id;
}

function resolveActivityCellTone(task: QueueTask): OverviewActivityCellTone {
  if (task.status === "success") {
    return "success";
  }
  if (task.status === "queued" || task.status === "pending") {
    return "queued";
  }
  if (task.status === "running" || task.status === "processing") {
    return "running";
  }
  if (task.status === "rejected") {
    return "rejected";
  }
  return "failure";
}

function resolveActivityCell(task: QueueTask): OverviewActivityCell {
  return {
    task_id: task.id,
    tone: resolveActivityCellTone(task),
  };
}

function buildOverviewActivity(tasks: QueueTask[], windowMinutes: number): OverviewActivity {
  const endTimestamp = Date.now();
  const startTimestamp = endTimestamp - windowMinutes * 60 * 1000;
  const dayMap = new Map<string, OverviewActivityDay>();
  const orderedTasks = [...tasks].sort(compareActivitySequence);

  for (const task of orderedTasks) {
    const timelineTimestamp = resolveActivityTimelineTimestamp(task);
    if (timelineTimestamp === null || timelineTimestamp < startTimestamp || timelineTimestamp > endTimestamp) {
      continue;
    }

    const dayKey = resolveActivityDateKey(task);
    if (!dayKey) {
      continue;
    }

    let day = dayMap.get(dayKey);
    if (!day) {
      day = emptyOverviewActivityDay(dayKey);
      dayMap.set(dayKey, day);
    }

    day.total += 1;
    day.cells.push(resolveActivityCell(task));
    if (task.status === "success") {
      day.success += 1;
    } else if (task.status === "failed" || task.status === "refunded") {
      day.failed += 1;
    } else if (task.status === "rejected") {
      day.rejected += 1;
    } else if (task.status === "cancelled") {
      day.cancelled += 1;
    } else if (task.status === "running" || task.status === "processing") {
      day.running += 1;
    } else if (task.status === "queued" || task.status === "pending") {
      day.queued += 1;
    } else {
      day.failed += 1;
    }
  }

  const days = Array.from(dayMap.values());
  const totals = days.reduce(
    (summary, day) => ({
      queued: summary.queued + day.queued,
      running: summary.running + day.running,
      success: summary.success + day.success,
      failed: summary.failed + day.failed,
      rejected: summary.rejected + day.rejected,
      cancelled: summary.cancelled + day.cancelled,
      total: summary.total + day.total,
    }),
    {
      queued: 0,
      running: 0,
      success: 0,
      failed: 0,
      rejected: 0,
      cancelled: 0,
      total: 0,
    }
  );

  return {
    window_minutes: windowMinutes,
    days: days.sort((left, right) => left.date.localeCompare(right.date)),
    totals,
  };
}

function buildAffordableModes(
  cdk: CdkDetail["cdk"],
  pricing: Record<RunMode, number>,
  availability: RunModeAvailability
): RunModeInfo[] {
  const canExchange = cdk.status === "active" && cdk.available_amount > 0;

  return (Object.keys(RUN_MODE_LABELS) as RunMode[]).map((runMode) => {
    const price = pricing[runMode];
    const affordable = canExchange && price > 0 && cdk.available_amount >= price;

    return {
      run_mode: runMode,
      label: RUN_MODE_LABELS[runMode],
      price,
      enabled: availability[runMode],
      affordable,
      shortfall: Math.max(0, price - cdk.available_amount),
    };
  });
}

function normalizeDetailPayload(
  detail: JsonObject,
  availability: RunModeAvailability
): CdkDetail {
  const rawCdk = detail.cdk;
  if (!isRecord(rawCdk)) {
    throw new WebSaleApiError(502, "Backend detail response is missing CDK data.");
  }

  const cdk: CdkDetail["cdk"] = {
    code: asString(rawCdk.code),
    status: asString(rawCdk.status),
    remaining_amount: asInteger(rawCdk.remaining_amount),
    available_amount: asInteger(detail.available_amount, asInteger(rawCdk.remaining_amount)),
    reserved_amount: asInteger(detail.reserved_amount),
    initial_amount: asInteger(rawCdk.initial_amount),
    redeem_count: asInteger(rawCdk.redeem_count),
    note: asOptionalString(rawCdk.note),
    created_at: asOptionalString(rawCdk.created_at),
    last_redeemed_at: asOptionalString(rawCdk.last_redeemed_at),
    last_consumed_at: asOptionalString(rawCdk.last_consumed_at),
  };

  const pricing = normalizePricing(detail.pricing);
  const transactions = normalizeTransactions(detail.transactions);
  const canExchange = cdk.status === "active" && cdk.available_amount > 0;

  return {
    cdk,
    transactions,
    pricing,
    run_modes: buildAffordableModes(cdk, pricing, availability),
    status_label: STATUS_LABELS[cdk.status] || cdk.status || "未知状态",
    can_exchange: canExchange,
  };
}

async function fetchRemoteCdkDetail(
  code: string,
  availability?: RunModeAvailability
) {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new WebSaleApiError(400, "CDK code is required.");
  }

  const detail = await backendRequest("GET", `/api/cdks/${encodeURIComponent(normalizedCode)}`);
  return normalizeDetailPayload(detail, availability || (await resolveRunModeAvailability()));
}

function ensureRunModeEnabled(runMode: RunMode, availability: RunModeAvailability) {
  if (availability[runMode]) {
    return;
  }

  throw new WebSaleApiError(
    503,
    `Run mode ${RUN_MODE_LABELS[runMode]} is under maintenance.`
  );
}

export async function buildConfigPayload() {
  const [backendApiBaseUrl, availability, pricing] = await Promise.all([
    resolveBackendApiBaseUrl(),
    resolveRunModeAvailability(),
    fetchRemotePricing(),
  ]);
  return {
    generated_at: utcNow(),
    site_title: resolveSiteTitle(),
    backend_api_base_url: backendApiBaseUrl,
    pricing,
    run_modes: (Object.keys(RUN_MODE_LABELS) as RunMode[]).map((runMode) => ({
      run_mode: runMode,
      label: RUN_MODE_LABELS[runMode],
      price: pricing[runMode],
      enabled: availability[runMode],
      affordable: false,
      shortfall: 0,
    })),
  };
}

export async function buildHealthPayload() {
  const backendApiBaseUrl = await resolveBackendApiBaseUrl();
  return {
    status: "ok",
    generated_at: utcNow(),
    backend_api_base_url: backendApiBaseUrl,
  };
}

export async function buildOverviewPayload() {
  const [overview, tasksPayload, backendApiBaseUrl, adminConfig] = await Promise.all([
    backendRequest("GET", "/api/overview?task_limit=1&device_limit=1&card_limit=1&attempt_limit=1"),
    backendRequest(
      "GET",
      `/api/tasks?limit=${OVERVIEW_ACTIVITY_TASK_LIMIT}&page_size=${OVERVIEW_ACTIVITY_TASK_LIMIT}`
    ).catch(() => ({ tasks: [] })),
    resolveBackendApiBaseUrl(),
    readAdminRuntimeConfig(),
  ]);

  if (adminConfig.overview_activity_window_minutes === null) {
    throw new Error("Overview activity window is not configured in .env.local.");
  }

  const activity = buildOverviewActivity(
    normalizeTaskListPayload(tasksPayload.tasks),
    adminConfig.overview_activity_window_minutes
  );

  return {
    generated_at: asOptionalString(overview.generated_at) || utcNow(),
    counts: normalizeOverviewCounts(overview.counts),
    activity,
    backend_api_base_url: backendApiBaseUrl,
  };
}

export async function previewExchange(code: string) {
  const availability = await resolveRunModeAvailability();
  return {
    generated_at: utcNow(),
    detail: await fetchRemoteCdkDetail(code, availability),
  };
}

export async function fetchQueuedTask(taskId: number) {
  const payload = await backendRequest("GET", `/api/tasks/${taskId}`);
  return {
    generated_at: asOptionalString(payload.generated_at) || utcNow(),
    task: normalizeTaskPayload(payload.task),
  };
}

export async function fetchQueuedTasks(taskIds: number[]) {
  const normalizedTaskIds = taskIds.filter((taskId) => Number.isFinite(taskId) && taskId > 0);
  if (!normalizedTaskIds.length) {
    return {
      generated_at: utcNow(),
      tasks: [] as QueueTask[],
    };
  }

  const payload = await backendRequest("POST", "/api/tasks/lookup", {
    task_ids: normalizedTaskIds,
  });

  const tasks = Array.isArray(payload.tasks)
    ? payload.tasks.map((item) => normalizeTaskPayload(item))
    : [];

  return {
    generated_at: asOptionalString(payload.generated_at) || utcNow(),
    tasks,
  };
}

export async function openQueuedTaskStream(taskIds: number[], signal?: AbortSignal) {
  const normalizedTaskIds = taskIds.filter((taskId) => Number.isFinite(taskId) && taskId > 0);
  if (!normalizedTaskIds.length) {
    throw new WebSaleApiError(400, "At least one task id is required.");
  }

  const response = await fetch(
    await backendUrl(`/api/tasks/stream?task_ids=${encodeURIComponent(normalizedTaskIds.join(","))}`),
    {
      method: "GET",
      headers: {
        [BACKEND_ADMIN_PASSWORD_HEADER]: await resolveBackendAdminPassword(),
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal,
    }
  );

  if (!response.ok) {
    const payload = await responsePayload(response);
    const statusCode = response.status < 500 ? response.status : 502;
    throw new WebSaleApiError(statusCode, responseErrorDetail(payload, response.status));
  }

  if (!response.body) {
    throw new WebSaleApiError(502, "Backend task stream returned an empty body.");
  }

  return response;
}

export async function queueExchangeTask({
  code,
  runMode,
  email,
  password,
  twofaUrl,
}: {
  code: string;
  runMode: RunMode;
  email: string;
  password: string;
  twofaUrl: string;
}) {
  const normalizedCode = code.trim();
  const normalizedEmail = email.trim();
  const normalizedPassword = password.trim();
  const normalizedTwofaUrl = twofaUrl.trim();

  if (!normalizedCode) {
    throw new WebSaleApiError(400, "CDK code is required.");
  }
  if (!normalizedEmail) {
    throw new WebSaleApiError(400, "Email is required.");
  }
  if (!isEmailAddress(normalizedEmail)) {
    throw new WebSaleApiError(400, "邮箱格式不合法。");
  }
  if (!normalizedPassword) {
    throw new WebSaleApiError(400, "Password is required.");
  }
  if (!normalizedTwofaUrl) {
    throw new WebSaleApiError(400, "2FA 密钥不能为空。");
  }

  if (!isRunMode(runMode)) {
    throw new WebSaleApiError(400, `Unsupported run mode: ${String(runMode)}`);
  }

  const availability = await resolveRunModeAvailability();
  ensureRunModeEnabled(runMode, availability);

  const preview = await fetchRemoteCdkDetail(normalizedCode, availability);
  const price = preview.pricing[runMode] ?? 0;

  if (preview.cdk.status !== "active" || preview.cdk.remaining_amount <= 0) {
    throw new WebSaleApiError(409, "This CDK is not available for exchange.");
  }

  if (price <= 0) {
    throw new WebSaleApiError(400, `No pricing configured for ${runMode}.`);
  }

  if (preview.cdk.available_amount < price) {
    throw new WebSaleApiError(
      409,
      `Insufficient balance for ${RUN_MODE_LABELS[runMode]} (requires ${price}, available ${preview.cdk.available_amount}).`
    );
  }

  const created = await backendRequest("POST", "/api/tasks", {
    email: normalizedEmail,
    password: normalizedPassword,
    twofa_url: normalizedTwofaUrl,
    run_mode: runMode,
    cdk_code: normalizedCode,
  });
  const updatedDetail = await fetchRemoteCdkDetail(normalizedCode, availability);
  const task = normalizeTaskPayload(created.task);

  return {
    generated_at: utcNow(),
    tasks: [task],
    created: 1,
    normalized_lines: [],
    detail: updatedDetail,
  } satisfies QueueExchangeResult;
}

export async function queueBatchExchangeTasks({
  code,
  runMode,
  bulkText,
}: {
  code: string;
  runMode: RunMode;
  bulkText: string;
}) {
  const normalizedCode = code.trim();
  const normalizedBulkText = bulkText.trim();

  if (!normalizedCode) {
    throw new WebSaleApiError(400, "CDK code is required.");
  }
  if (!normalizedBulkText) {
    throw new WebSaleApiError(400, "Bulk account text is required.");
  }
  if (!isRunMode(runMode)) {
    throw new WebSaleApiError(400, `Unsupported run mode: ${String(runMode)}`);
  }

  const bulkValidation = validateBulkAccountText(normalizedBulkText);
  if (!bulkValidation.validLines.length) {
    throw new WebSaleApiError(400, "Bulk account text is required.");
  }
  if (bulkValidation.invalidLines.length) {
    throw new WebSaleApiError(400, buildInvalidBulkLinesErrorMessage(bulkValidation.invalidLines));
  }

  const normalizedValidatedBulkText = bulkValidation.validLines.join("\n");

  const availability = await resolveRunModeAvailability();
  ensureRunModeEnabled(runMode, availability);

  const preview = await fetchRemoteCdkDetail(normalizedCode, availability);
  const price = preview.pricing[runMode] ?? 0;
  if (preview.cdk.status !== "active" || preview.cdk.remaining_amount <= 0) {
    throw new WebSaleApiError(409, "This CDK is not available for exchange.");
  }
  if (price <= 0) {
    throw new WebSaleApiError(400, `No pricing configured for ${runMode}.`);
  }

  const requiredAmount = bulkValidation.validLines.length * price;
  if (preview.cdk.available_amount < requiredAmount) {
    throw new WebSaleApiError(
      409,
      `Insufficient balance for batch ${RUN_MODE_LABELS[runMode]} tasks (requires ${requiredAmount}, available ${preview.cdk.available_amount}).`
    );
  }

  const created = await backendRequest("POST", "/api/tasks/bulk", {
    text: normalizedValidatedBulkText,
    run_mode: runMode,
    cdk_code: normalizedCode,
  });
  const updatedDetail = await fetchRemoteCdkDetail(normalizedCode, availability);
  const tasks = Array.isArray(created.tasks)
    ? created.tasks.map((item) => normalizeTaskPayload(item))
    : [];
  const normalizedLines = Array.isArray(created.normalized_lines)
    ? created.normalized_lines
        .map((line) => asString(line).trim())
        .filter(Boolean)
    : bulkValidation.validLines;

  return {
    generated_at: utcNow(),
    created: asInteger(created.created, tasks.length),
    tasks,
    normalized_lines: normalizedLines,
    detail: updatedDetail,
  } satisfies QueueExchangeResult;
}
