"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  isGmailAddress,
  validateBulkAccountText,
  type AccountFormatIssueCode,
} from "@/lib/account-format";
import { useUiPreferences } from "@/components/ui-preferences-provider";
import { resolveLocale } from "@/lib/ui-language";

type RunMode = "extract_link" | "subscription";
type AccountMode = "single" | "bulk";

type RunModeInfo = {
  run_mode: RunMode;
  label: string;
  price: number;
  enabled: boolean;
  affordable?: boolean;
  shortfall?: number;
};

type CdkTransaction = {
  kind: string;
  amount: number;
  run_mode?: RunMode | null;
  run_mode_label?: string | null;
  balance_before: number;
  balance_after: number;
  note?: string | null;
  created_at?: string | null;
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
    note?: string | null;
    created_at?: string | null;
    last_redeemed_at?: string | null;
    last_consumed_at?: string | null;
  };
  pricing: Record<string, number>;
  transactions: CdkTransaction[];
  run_modes: RunModeInfo[];
  status_label: string;
  can_exchange: boolean;
};

type PreviewResponse = {
  detail: CdkDetail;
};

type QueueTask = {
  id: number;
  email: string;
  run_mode: RunMode | null;
  run_mode_label: string;
  cdk_code?: string | null;
  cdk_charge_status?: string | null;
  cdk_charge_status_label?: string | null;
  cdk_charge_amount: number;
  cdk_charge_error?: string | null;
  cdk_charged_at?: string | null;
  status: string;
  device_serial?: string | null;
  card_id?: number | null;
  error_message?: string | null;
  success_message?: string | null;
  attempt_count: number;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  has_twofa: boolean;
};

type ExchangeResponse = {
  detail: CdkDetail;
  tasks: QueueTask[];
  created: number;
  normalized_lines: string[];
};

type TaskStatusResponse = {
  detail?: CdkDetail | null;
  task: QueueTask;
};

type TaskLookupResponse = {
  generated_at?: string;
  tasks: QueueTask[];
};

type TaskStreamResponse = {
  generated_at?: string;
  tasks: QueueTask[];
};

type ConfigResponse = {
  site_title: string;
  backend_api_base_url: string;
  pricing: Record<string, number>;
  run_modes: RunModeInfo[];
};

type FormatConvertResponse = {
  normalizedLines: string[];
  normalizedText: string;
  lineCount: number;
  validLineCount: number;
  invalidLines: Array<{
    lineNumber: number;
    code: AccountFormatIssueCode;
  }>;
  allValid: boolean;
};

const CDK_STORAGE_KEY = "pixel-websale-cdk-code";
const BULK_TEXT_PLACEHOLDER = "demo.user@gmail.com---Passw0rd!---JBSWY3DPEHPK3PXP";
const TASK_LIST_PAGE_SIZE = 10;
const transactionGridTemplate =
  "minmax(10rem,1.7fr) minmax(8rem,1.1fr) minmax(4.5rem,0.7fr) minmax(5.5rem,0.9fr) minmax(4.5rem,0.8fr) minmax(4.5rem,0.8fr) minmax(16rem,4fr)";

const LANGUAGE_COPY = {
  zh: {
    requestFailed: "请求失败",
    loadConfigFailed: "加载配置失败。",
    cdkAutoFailed: "CDK 自动校验失败。",
    taskRefreshFailed: "任务状态刷新失败。",
    enterCdk: "请输入 CDK。",
    cdkChecking: "CDK 正在自动检测，请稍等。",
    validCdkRequired: "请输入有效的 CDK 后再提交任务。",
    enterEmail: "请输入邮箱。",
    gmailOnly: "目前仅支持 Gmail 邮箱。",
    enterPassword: "请输入密码。",
    enterTotp: "请输入 TOTP 密钥。",
    enterBulk: "请输入批量账号内容。",
    submitFailed: "提交任务失败。",
    step1: "Step 1",
    step2: "Step 2",
    step3: "Step 3",
    taskKicker: "Task",
    detailKicker: "Detail",
    title: "检查 CDK 并入队",
    accountInfo: "账号信息",
    cdkPlaceholder: "输入你的 CDK",
    checkingCdkHint: "正在自动检测 CDK 的有效性和余额...",
    cdkHint: "输入 CDK 后会自动校验有效性和当前余额。",
    viewCdkDetail: "查看 CDK 明细",
    singleEntry: "单个录入",
    bulkEntry: "批量录入",
    email: "邮箱",
    password: "密码",
    totpKey: "TOTP 密钥",
    emailPlaceholder: "输入 Gmail 邮箱",
    passwordPlaceholder: "输入密码",
    totpPlaceholder: "输入 TOTP 密钥",
    bulkHelp: "每行 1 个账号，必须使用 ",
    bulkContent: "批量账号内容",
    bulkFormat: "格式转换",
    bulkFormatting: "转换中...",
    bulkFormatApplied: "已转换并写回 {count} 条账号。",
    bulkFormatPartial: "已成功转换 {count} 条账号，仍有格式不合规的行需要手动修正。",
    bulkFormatNoMatch: "没有识别到可转换的 Gmail 账号，已保留原始输入。",
    bulkFormatFailed: "格式转换失败。",
    bulkSubmitInvalid: "以下行格式不符合要求：{lines}。请先修正后再提交。",
    expandBulkEditor: "放大编辑",
    bulkEditorTitle: "批量账号编辑器",
    bulkEditorDescription: "这里可以用更大的编辑窗口整理批量账号内容，修改会实时同步回表单。",
    modePriceUnit: "Credit",
    joinQueue: "加入队列",
    maintenance: "正在维护",
    modeMaintenanceHint: "当前正在维护，暂不可提交此模式任务。",
    modeMaintenanceError: "该模式当前正在维护，暂不可提交。",
    working: "处理中...",
    taskStatusTitle: "任务状态",
    chargeStatus: "扣费状态",
    mailbox: "邮箱",
    expectedCharge: "预计扣费",
    createdAt: "创建时间",
    taskListTitle: "任务列表",
    previousPage: "上一页",
    nextPage: "下一页",
    taskListPage: "第 {current} / {total} 页",
    bulkTaskList: "批量任务列表",
    chargeStatusPrefix: "扣费状态：",
    taskQueuedNotice: "任务已经进入后端队列。后端成功执行后，系统会自动扣费并在这里更新结果。",
    successResult: "成功结果：",
    taskError: "任务错误：",
    chargeError: "扣费错误：",
    businessResult: "业务结果",
    extractResult: "提链结果",
    extractReady: "提链已生成",
    extractDescription: "后端已经完成实际提链流程。下面展示的是本次任务提取到的真实结果，可直接复制或打开。",
    redeemLink: "兑换链接",
    linkCopied: "链接已复制",
    copyLink: "复制链接",
    openLink: "打开链接",
    noLinkResult: "任务已经成功完成，但当前没有拿到可直接打开的链接结果。",
    copyFailed: "复制失败，请手动选中上面的提链结果。",
    subscriptionResult: "订阅结果",
    subscriptionReady: "订阅开通成功",
    subscriptionDescription: "后端已经完成订阅模式的实际处理。请使用当前提交的账号登录对应服务，查看订阅权益是否已经生效。",
    businessMode: "业务模式",
    finishedAt: "完成时间",
    accountEmail: "账号邮箱",
    chargeAmount: "扣费额度",
    extraResult: "补充结果：",
    genericSuccessResult: "当前任务已经成功完成，业务结果已写回系统。",
    chargeSyncHint: "业务已经完成，CDK 扣费结果正在同步，请稍等页面自动刷新。",
    waitingBusinessHint: "任务完成后，这里会直接显示本次真实业务结果。提链模式会展示实际链接，订阅模式会展示完成结果与账号信息。",
    noBusinessResult: "当前任务尚未成功，因此还没有可展示的业务结果。请先处理任务失败原因，再决定是否重新排队。",
    waitingBusiness: "等待业务结果生成。",
    emptyTaskState: "提交任务后，这里会显示排队状态、后端执行结果，以及成功后的自动扣费情况。",
    cdkDetailTitle: "CDK 明细",
    close: "关闭",
    cdkSummary: "总剩余额度 {remaining}，当前可用额度 {available}，已预留 {reserved}，已兑换 {redeemCount} 次。",
    initialAmount: "初始额度",
    totalRemaining: "总剩余额度",
    availableAmount: "当前可用额度",
    reservedAmount: "已预留额度",
    lastRedeem: "上次兑换",
    lastCharge: "上次扣费",
    time: "时间",
    type: "类型",
    amount: "额度",
    mode: "模式",
    beforeChange: "变动前",
    afterChange: "变动后",
    note: "备注",
    noTransactions: "这个 CDK 还没有交易记录。",
    unbound: "未绑定",
    unsupportedState: "未知状态",
    notSpecified: "未指定",
    emDash: "—",
    runModeLabels: {
      extract_link: "提链模式",
      subscription: "订阅模式",
    },
    runModeDescriptions: {
      extract_link: "成功后返回兑换链接。",
      subscription: "成功后返回订阅结果。",
    },
    transactionKinds: {
      redeem: "兑换校验",
      consume: "额度扣费",
      merge_in: "合并转入",
      merge_out: "合并转出",
    },
    taskStatuses: {
      queued: "排队中",
      running: "运行中",
      success: "已成功",
      failed: "失败",
      cancelled: "已取消",
    },
    chargeStatuses: {
      pending: "待扣费",
      charged: "已扣费",
      charge_failed: "扣费失败",
      skipped: "未扣费",
    },
    cdkStatuses: {
      active: "生效",
      exhausted: "已耗尽",
      merged: "已合并",
    },
    bulkIssueLine: "第 {line} 行：{reason}",
    bulkIssueMore: "以及另外 {count} 行",
    bulkIssueLabels: {
      missing_separator: "未使用 Gmail---Password---2fa密钥 格式",
      missing_gmail: "缺少 Gmail 邮箱",
      invalid_gmail: "Gmail 邮箱不合法",
      missing_password: "缺少密码",
      missing_twofa: "缺少 2FA 密钥",
      invalid_twofa: "2FA 密钥不合法",
    },
  },
  en: {
    requestFailed: "Request failed",
    loadConfigFailed: "Failed to load config.",
    cdkAutoFailed: "Automatic CDK validation failed.",
    taskRefreshFailed: "Failed to refresh task status.",
    enterCdk: "Please enter a CDK.",
    cdkChecking: "CDK validation is in progress. Please wait.",
    validCdkRequired: "Please enter a valid CDK before submitting.",
    enterEmail: "Please enter an email.",
    gmailOnly: "Only Gmail accounts are supported right now.",
    enterPassword: "Please enter a password.",
    enterTotp: "Please enter a TOTP key.",
    enterBulk: "Please enter bulk account content.",
    submitFailed: "Failed to submit the task.",
    step1: "Step 1",
    step2: "Step 2",
    step3: "Step 3",
    taskKicker: "Task",
    detailKicker: "Detail",
    title: "Check CDK and queue tasks",
    accountInfo: "Account Info",
    cdkPlaceholder: "Enter your CDK",
    checkingCdkHint: "Checking CDK validity and balance automatically...",
    cdkHint: "Enter a CDK and the system will validate its availability and balance automatically.",
    viewCdkDetail: "View CDK Details",
    singleEntry: "Single Entry",
    bulkEntry: "Bulk Entry",
    email: "Email",
    password: "Password",
    totpKey: "TOTP Key",
    emailPlaceholder: "Enter a Gmail address",
    passwordPlaceholder: "Enter password",
    totpPlaceholder: "Enter TOTP key",
    bulkHelp: "Each line must use ",
    bulkContent: "Bulk Accounts",
    bulkFormat: "Format",
    bulkFormatting: "Formatting...",
    bulkFormatApplied: "Normalized {count} account(s) and filled the input.",
    bulkFormatPartial: "Normalized {count} account(s), but some lines still need manual fixes.",
    bulkFormatNoMatch: "No convertible Gmail accounts were found. The original input was kept.",
    bulkFormatFailed: "Format conversion failed.",
    bulkSubmitInvalid: "These lines are not in a valid format: {lines}. Please fix them before submitting.",
    expandBulkEditor: "Expand Editor",
    bulkEditorTitle: "Bulk Account Editor",
    bulkEditorDescription: "Use this larger editor to organize bulk account lines. Changes sync back to the form immediately.",
    modePriceUnit: "Credit",
    joinQueue: "Join Queue",
    maintenance: "Under Maintenance",
    modeMaintenanceHint: "This mode is under maintenance and is temporarily unavailable.",
    modeMaintenanceError: "This mode is currently under maintenance.",
    working: "Processing...",
    taskStatusTitle: "Task Status",
    chargeStatus: "Charge Status",
    mailbox: "Email",
    expectedCharge: "Expected Charge",
    createdAt: "Created At",
    taskListTitle: "Task List",
    previousPage: "Previous",
    nextPage: "Next",
    taskListPage: "Page {current} / {total}",
    bulkTaskList: "Bulk Task List",
    chargeStatusPrefix: "Charge status: ",
    taskQueuedNotice: "The task has entered the backend queue. After the backend succeeds, the system will charge the CDK automatically and update the result here.",
    successResult: "Success Result: ",
    taskError: "Task Error: ",
    chargeError: "Charge Error: ",
    businessResult: "Business Result",
    extractResult: "Redeem Result",
    extractReady: "Redeem link ready",
    extractDescription: "The backend has completed the real redeem flow. The actual redeem result for this task is shown below and can be copied or opened directly.",
    redeemLink: "Redeem Link",
    linkCopied: "Link Copied",
    copyLink: "Copy Link",
    openLink: "Open Link",
    noLinkResult: "The task finished successfully, but there is no directly openable link result yet.",
    copyFailed: "Copy failed. Please select the redeem result manually.",
    subscriptionResult: "Subscription Result",
    subscriptionReady: "Subscription activated",
    subscriptionDescription: "The backend has completed the real subscription flow. Please sign in with the submitted account and verify whether the subscription benefit is active.",
    businessMode: "Business Mode",
    finishedAt: "Finished At",
    accountEmail: "Account Email",
    chargeAmount: "Charge Amount",
    extraResult: "Additional Result: ",
    genericSuccessResult: "The task finished successfully and the business result has been written back.",
    chargeSyncHint: "The business task is complete. CDK charging is still syncing, so please wait for the page to refresh automatically.",
    waitingBusinessHint: "Once the task is done, the real business result will appear here. Redeem mode shows the actual link, and subscription mode shows the final result with account details.",
    noBusinessResult: "This task has not succeeded yet, so there is no business result to show. Please review the failure reason before requeueing it.",
    waitingBusiness: "Waiting for the business result.",
    emptyTaskState: "After you submit a task, queue status, backend execution results, and post-success charging details will appear here.",
    cdkDetailTitle: "CDK Details",
    close: "Close",
    cdkSummary: "Total balance {remaining}, available {available}, reserved {reserved}, redeemed {redeemCount} time(s).",
    initialAmount: "Initial Amount",
    totalRemaining: "Total Balance",
    availableAmount: "Available",
    reservedAmount: "Reserved",
    lastRedeem: "Last Redeem",
    lastCharge: "Last Charge",
    time: "Time",
    type: "Type",
    amount: "Amount",
    mode: "Mode",
    beforeChange: "Before",
    afterChange: "After",
    note: "Note",
    noTransactions: "This CDK has no transaction records yet.",
    unbound: "Unbound",
    unsupportedState: "Unknown",
    notSpecified: "Not Set",
    emDash: "—",
    runModeLabels: {
      extract_link: "Redeem Mode",
      subscription: "Subscription Mode",
    },
    runModeDescriptions: {
      extract_link: "Returns the redeem link after success.",
      subscription: "Returns the subscription result after success.",
    },
    transactionKinds: {
      redeem: "Redeem Check",
      consume: "Charge",
      merge_in: "Merge In",
      merge_out: "Merge Out",
    },
    taskStatuses: {
      queued: "Queued",
      running: "Running",
      success: "Success",
      failed: "Failed",
      cancelled: "Cancelled",
    },
    chargeStatuses: {
      pending: "Pending",
      charged: "Charged",
      charge_failed: "Charge Failed",
      skipped: "Skipped",
    },
    cdkStatuses: {
      active: "Active",
      exhausted: "Exhausted",
      merged: "Merged",
    },
    bulkIssueLine: "Line {line}: {reason}",
    bulkIssueMore: "and {count} more line(s)",
    bulkIssueLabels: {
      missing_separator: "must use the Gmail---Password---2fa key format",
      missing_gmail: "missing Gmail address",
      invalid_gmail: "invalid Gmail address",
      missing_password: "missing password",
      missing_twofa: "missing 2FA key",
      invalid_twofa: "invalid 2FA key",
    },
  },
} as const;

type ExchangeStudioCopy = (typeof LANGUAGE_COPY)["zh"] | (typeof LANGUAGE_COPY)["en"];

function formatDate(value: string | null | undefined, locale: string, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isHttpUrl(value?: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatInvalidBulkLinesMessage(
  copy: ExchangeStudioCopy,
  invalidLines: Array<{ lineNumber: number; code: AccountFormatIssueCode }>
) {
  const visibleLines = invalidLines.slice(0, 6);
  const details = visibleLines
    .map((line) =>
      copy.bulkIssueLine
        .replace("{line}", String(line.lineNumber))
        .replace("{reason}", copy.bulkIssueLabels[line.code])
    )
    .join("；");
  const remainingCount = invalidLines.length - visibleLines.length;
  const suffix =
    remainingCount > 0
      ? `；${copy.bulkIssueMore.replace("{count}", String(remainingCount))}`
      : "";
  return `${details}${suffix}`;
}

function buildTaskDetailSyncKey(task?: QueueTask | null) {
  if (!task) {
    return "";
  }

  return [
    task.id,
    task.status,
    task.cdk_charge_status || "",
    task.cdk_charged_at || "",
    task.finished_at || "",
    task.updated_at || "",
    task.success_message || "",
    task.error_message || "",
  ].join("|");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string };
  if (!response.ok) {
    throw new Error(payload.detail || `Request failed (HTTP ${response.status})`);
  }
  return payload as T;
}

export function ExchangeStudio() {
  const { language } = useUiPreferences();
  const [accountMode, setAccountMode] = useState<AccountMode>("single");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twofaUrl, setTwofaUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [hasLoadedStoredCode, setHasLoadedStoredCode] = useState(false);
  const [isCdkChecking, setIsCdkChecking] = useState(false);
  const [cdkValidationError, setCdkValidationError] = useState<string | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);
  const [isBulkFormatting, setIsBulkFormatting] = useState(false);
  const [bulkFormatMessage, setBulkFormatMessage] = useState<string | null>(null);
  const [bulkFormatError, setBulkFormatError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [detail, setDetail] = useState<CdkDetail | null>(null);
  const [taskList, setTaskList] = useState<QueueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [currentTaskPage, setCurrentTaskPage] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const taskDetailSyncKeyRef = useRef("");
  const [isPending, startTransition] = useTransition();
  const isChinese = language === "zh";
  const copy = isChinese ? LANGUAGE_COPY.zh : LANGUAGE_COPY.en;
  const locale = resolveLocale(language);

  const defaultRunModes: RunModeInfo[] = [
    { run_mode: "extract_link", label: copy.runModeLabels.extract_link, price: 5, enabled: true },
    { run_mode: "subscription", label: copy.runModeLabels.subscription, price: 8, enabled: true },
  ];

  const task = useMemo(() => {
    if (!taskList.length) {
      return null;
    }
    if (selectedTaskId !== null) {
      const selectedTask = taskList.find((item) => item.id === selectedTaskId);
      if (selectedTask) {
        return selectedTask;
      }
    }
    return taskList[0] ?? null;
  }, [selectedTaskId, taskList]);
  const totalTaskPages = Math.max(1, Math.ceil(taskList.length / TASK_LIST_PAGE_SIZE));
  const paginatedTaskList = useMemo(() => {
    const pageStart = (currentTaskPage - 1) * TASK_LIST_PAGE_SIZE;
    return taskList.slice(pageStart, pageStart + TASK_LIST_PAGE_SIZE);
  }, [currentTaskPage, taskList]);
  const normalizedCode = code.trim();

  useEffect(() => {
    startTransition(async () => {
      try {
        const nextConfig = await request<ConfigResponse>("/api/config");
        setConfig(nextConfig);
        document.title = nextConfig.site_title || "Pixel CDK Exchange";
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.loadConfigFailed);
      }
    });
  }, [copy.loadConfigFailed]);

  useEffect(() => {
    try {
      const storedCode = window.localStorage.getItem(CDK_STORAGE_KEY) || "";
      if (storedCode.trim()) {
        setCode(storedCode.trim());
      }
    } catch {
      // Ignore localStorage access errors in restricted browser modes.
    } finally {
      setHasLoadedStoredCode(true);
    }
  }, []);

  useEffect(() => {
    setCurrentTaskPage((currentPage) => Math.min(Math.max(1, currentPage), totalTaskPages));
  }, [totalTaskPages]);

  useEffect(() => {
    if (selectedTaskId === null) {
      return;
    }

    const selectedIndex = taskList.findIndex((item) => item.id === selectedTaskId);
    if (selectedIndex < 0) {
      return;
    }

    const selectedPage = Math.floor(selectedIndex / TASK_LIST_PAGE_SIZE) + 1;
    setCurrentTaskPage((currentPage) => (currentPage === selectedPage ? currentPage : selectedPage));
  }, [selectedTaskId, taskList]);

  useEffect(() => {
    if (!hasLoadedStoredCode) {
      return;
    }

    try {
      if (normalizedCode) {
        window.localStorage.setItem(CDK_STORAGE_KEY, normalizedCode);
      } else {
        window.localStorage.removeItem(CDK_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage access errors in restricted browser modes.
    }
  }, [hasLoadedStoredCode, normalizedCode]);

  useEffect(() => {
    if (!hasLoadedStoredCode) {
      return;
    }
    if (!normalizedCode) {
      setDetail(null);
      setCdkValidationError(null);
      setIsCdkChecking(false);
      setIsDetailDialogOpen(false);
      return;
    }

    let cancelled = false;
    setIsCdkChecking(true);
    setCdkValidationError(null);
    setDetail((currentDetail) =>
      currentDetail?.cdk.code === normalizedCode ? currentDetail : null
    );

    const timer = window.setTimeout(async () => {
      try {
        const response = await request<PreviewResponse>("/api/preview", {
          method: "POST",
          body: JSON.stringify({ code: normalizedCode }),
        });
        if (cancelled) {
          return;
        }
        setDetail(response.detail);
        setCdkValidationError(null);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setCdkValidationError(
          nextError instanceof Error ? nextError.message : copy.cdkAutoFailed
        );
      } finally {
        if (!cancelled) {
          setIsCdkChecking(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [copy.cdkAutoFailed, hasLoadedStoredCode, normalizedCode]);

  const hasStreamingTasks = useMemo(
    () =>
      taskList.some(
        (item) =>
          item.status === "queued" || item.status === "running" || item.cdk_charge_status === "pending"
      ),
    [taskList]
  );
  const taskStreamKey = useMemo(
    () =>
      taskList
        .map((item) => item.id)
        .filter((taskId) => Number.isFinite(taskId) && taskId > 0)
        .join(","),
    [taskList]
  );

  useEffect(() => {
    if (!hasStreamingTasks || !taskStreamKey) {
      return;
    }

    let cancelled = false;
    const eventSource = new EventSource(
      `/api/tasks/stream?${new URLSearchParams(
        taskStreamKey.split(",").map((taskId) => ["task_id", taskId])
      ).toString()}`
    );

    const syncActiveTaskDetail = async (refreshedTasks: QueueTask[]) => {
      const activeTaskId =
        selectedTaskId !== null && refreshedTasks.some((item) => item.id === selectedTaskId)
          ? selectedTaskId
          : (refreshedTasks[0]?.id ?? null);

      if (activeTaskId !== null && activeTaskId !== selectedTaskId) {
        setSelectedTaskId(activeTaskId);
      }

      const activeTask =
        activeTaskId !== null
          ? refreshedTasks.find((item) => item.id === activeTaskId) || null
          : null;
      const nextSyncKey = buildTaskDetailSyncKey(activeTask);
      if (!activeTask || nextSyncKey === taskDetailSyncKeyRef.current) {
        return;
      }

      taskDetailSyncKeyRef.current = nextSyncKey;

      try {
        const payload = await request<TaskStatusResponse>(`/api/tasks/${activeTaskId}`);
        if (cancelled) {
          return;
        }
        setTaskList((currentTasks) =>
          currentTasks.map((item) => (item.id === payload.task.id ? payload.task : item))
        );
        if (payload.detail) {
          setDetail(payload.detail);
        }
        setError(null);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : copy.taskRefreshFailed);
      }
    };

    eventSource.onmessage = (event) => {
      if (cancelled) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as TaskStreamResponse;
        const refreshedTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
        setTaskList(refreshedTasks);
        setError(null);
        void syncActiveTaskDetail(refreshedTasks);
      } catch {
        setError(copy.taskRefreshFailed);
      }
    };

    eventSource.onerror = () => {
      if (cancelled) {
        return;
      }
      // Let EventSource reconnect automatically.
    };

    return () => {
      cancelled = true;
      eventSource.close();
    };
  }, [copy.taskRefreshFailed, hasStreamingTasks, selectedTaskId, taskStreamKey]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyFeedback(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copyFeedback]);

  useEffect(() => {
    if (accountMode !== "bulk") {
      setIsBulkEditorOpen(false);
      setBulkFormatMessage(null);
      setBulkFormatError(null);
    }
  }, [accountMode]);

  const hasModalOpen = isDetailDialogOpen || isBulkEditorOpen;

  useEffect(() => {
    if (!hasModalOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDetailDialogOpen(false);
        setIsBulkEditorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasModalOpen]);

  const modeFallback = useMemo(
    () => (config?.run_modes?.length ? config.run_modes : defaultRunModes),
    [config]
  );

  const runModes = detail?.run_modes?.length ? detail.run_modes : modeFallback;

  const handleCodeChange = (nextCode: string) => {
    setCode(nextCode);
    setTaskList([]);
    setSelectedTaskId(null);
    setCurrentTaskPage(1);
    setMessage(null);
    setError(null);
    setIsDetailDialogOpen(false);
    setIsBulkEditorOpen(false);
  };

  const handleTaskPageChange = (nextPage: number) => {
    const normalizedPage = Math.min(Math.max(1, nextPage), totalTaskPages);
    const pageStart = (normalizedPage - 1) * TASK_LIST_PAGE_SIZE;
    const nextSelectedTask = taskList[pageStart] ?? null;

    setCurrentTaskPage(normalizedPage);
    setSelectedTaskId(nextSelectedTask?.id ?? null);
  };

  const handleBulkFormat = async () => {
    const normalizedBulkText = bulkText.trim();

    if (!normalizedBulkText) {
      setBulkFormatMessage(null);
      setBulkFormatError(copy.enterBulk);
      return;
    }

    setBulkFormatMessage(null);
    setBulkFormatError(null);
    setError(null);
    setMessage(null);
    setIsBulkFormatting(true);

    try {
      const response = await request<FormatConvertResponse>("/api/format-convert", {
        method: "POST",
        headers: {
          "x-ui-language": language,
        },
        body: JSON.stringify({ input: normalizedBulkText }),
      });

      setBulkText(response.normalizedText);

      if (response.invalidLines.length > 0) {
        setBulkFormatError(
          copy.bulkSubmitInvalid.replace(
            "{lines}",
            formatInvalidBulkLinesMessage(copy, response.invalidLines)
          )
        );
        setBulkFormatMessage(
          response.validLineCount > 0
            ? copy.bulkFormatPartial.replace("{count}", String(response.validLineCount))
            : null
        );
        return;
      }

      if (response.normalizedText.trim()) {
        setBulkFormatMessage(
          copy.bulkFormatApplied.replace(
            "{count}",
            String(response.validLineCount || response.lineCount || response.normalizedLines.length || 0)
          )
        );
        return;
      }

      setBulkFormatMessage(copy.bulkFormatNoMatch);
    } catch (nextError) {
      setBulkFormatError(
        nextError instanceof Error ? nextError.message : copy.bulkFormatFailed
      );
    } finally {
      setIsBulkFormatting(false);
    }
  };

  const handleQueueSubmit = (runMode: RunMode) => {
    const selectedMode = runModes.find((mode) => mode.run_mode === runMode);
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    const normalizedTwofaUrl = twofaUrl.trim();
    const normalizedBulkText = bulkText.trim();
    let validatedBulkText = "";

    if (selectedMode && !selectedMode.enabled) {
      setError(copy.modeMaintenanceError);
      return;
    }

    if (!normalizedCode) {
      setError(copy.enterCdk);
      return;
    }
    if (isCdkChecking) {
      setError(copy.cdkChecking);
      return;
    }
    if (!detail) {
      setError(cdkValidationError || copy.validCdkRequired);
      return;
    }
    if (accountMode === "single") {
      if (!normalizedEmail) {
        setError(copy.enterEmail);
        return;
      }
      if (!isGmailAddress(normalizedEmail)) {
        setError(copy.gmailOnly);
        return;
      }
      if (!normalizedPassword) {
        setError(copy.enterPassword);
        return;
      }
      if (!normalizedTwofaUrl) {
        setError(copy.enterTotp);
        return;
      }
    } else {
      if (!normalizedBulkText) {
        setBulkFormatMessage(null);
        setBulkFormatError(copy.enterBulk);
        setError(null);
        return;
      }

      const bulkValidation = validateBulkAccountText(bulkText);
      if (!bulkValidation.validLines.length) {
        setBulkFormatMessage(null);
        setBulkFormatError(copy.enterBulk);
        setError(null);
        return;
      }
      if (bulkValidation.invalidLines.length) {
        setBulkFormatMessage(null);
        setBulkFormatError(
          copy.bulkSubmitInvalid.replace(
            "{lines}",
            formatInvalidBulkLinesMessage(copy, bulkValidation.invalidLines)
          )
        );
        setError(null);
        return;
      }

      validatedBulkText = bulkValidation.validLines.join("\n");
    }

    setError(null);
    setMessage(null);
    setBulkFormatError(null);
    startTransition(async () => {
      try {
        const requestBody =
          accountMode === "bulk"
            ? {
                code: normalizedCode,
                run_mode: runMode,
                account_mode: accountMode,
                email: "",
                password: "",
                twofa_url: "",
                bulk_text: validatedBulkText,
              }
            : {
                code: normalizedCode,
                run_mode: runMode,
                account_mode: accountMode,
                email: normalizedEmail,
                password: normalizedPassword,
                twofa_url: normalizedTwofaUrl,
                bulk_text: "",
              };

        const response = await request<ExchangeResponse>("/api/exchange", {
          method: "POST",
          body: JSON.stringify(requestBody),
        });
        setTaskList(response.tasks);
        setSelectedTaskId(response.tasks[0]?.id ?? null);
        setDetail(response.detail);
        if (response.tasks.length === 1) {
          const task = response.tasks[0];
          const localizedRunModeLabel =
            task.run_mode && copy.runModeLabels[task.run_mode]
              ? copy.runModeLabels[task.run_mode]
              : task.run_mode_label;
          setMessage(
            isChinese
              ? `${localizedRunModeLabel} 任务已加入队列。后端执行成功后会自动从 CDK 中扣除 ${task.cdk_charge_amount} 额度。`
              : `${localizedRunModeLabel} task queued. After the backend succeeds, ${task.cdk_charge_amount} credits will be charged from the CDK automatically.`
          );
        } else {
          const chargeAmount = response.tasks[0]?.cdk_charge_amount ?? 0;
          const localizedRunModeLabel =
            response.tasks[0]?.run_mode && copy.runModeLabels[response.tasks[0].run_mode]
              ? copy.runModeLabels[response.tasks[0].run_mode as RunMode]
              : (response.tasks[0]?.run_mode_label || "");
          setMessage(
            isChinese
              ? `已批量加入队列 ${response.created} 个任务。后端每成功执行 1 个 ${localizedRunModeLabel} 任务，就会自动从 CDK 中扣除 ${chargeAmount} 额度。`
              : `${response.created} tasks were queued in bulk. Each successful ${localizedRunModeLabel} task will automatically deduct ${chargeAmount} credits from the CDK.`
          );
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.submitFailed);
      }
    });
  };

  const successResultLink =
    task?.status === "success" && task.run_mode === "extract_link" && isHttpUrl(task.success_message)
      ? task.success_message
      : null;
  const showBusinessResultPanel = task?.run_mode === "extract_link" && task.status === "success";
  const cdkSummaryText = detail
    ? isChinese
      ? `${copy.cdkStatuses[detail.cdk.status as keyof typeof copy.cdkStatuses] || detail.status_label} · 可用 ${detail.cdk.available_amount} · 预留 ${detail.cdk.reserved_amount} · 总余额 ${detail.cdk.remaining_amount}`
      : `${copy.cdkStatuses[detail.cdk.status as keyof typeof copy.cdkStatuses] || detail.cdk.status} · Available ${detail.cdk.available_amount} · Reserved ${detail.cdk.reserved_amount} · Total ${detail.cdk.remaining_amount}`
    : null;

  const handleCopySuccessLink = async () => {
    if (!successResultLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(successResultLink);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("failed");
    }
  };

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
      <article className="panel p-5 md:p-6">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">{copy.step1}</p>
              <h2 className="section-title">{copy.title}</h2>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                CDK
              </span>
              <input
                value={code}
                onChange={(event) => handleCodeChange(event.target.value)}
                placeholder={copy.cdkPlaceholder}
                className="rounded-[1.1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
              />
            </label>
          </div>

          <div className="grid gap-2">
            {normalizedCode ? (
              <div className="surface-card rounded-[1.2rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
                {isCdkChecking ? (
                  <div className="text-sm leading-7 text-[var(--muted)]">
                    {copy.checkingCdkHint}
                  </div>
                ) : cdkValidationError ? (
                  <div className="text-sm leading-7 text-[#973d2c]">{cdkValidationError}</div>
                ) : detail && cdkSummaryText ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm leading-7 text-[var(--teal)]">{cdkSummaryText}</div>
                    <button
                      type="button"
                      onClick={() => setIsDetailDialogOpen(true)}
                      className="theme-button-secondary"
                    >
                      {copy.viewCdkDetail}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm leading-7 text-[var(--muted)]">
                    {copy.cdkHint}
                  </div>
                )}
              </div>
            ) : null}
            {message ? <div className="notice notice-success">{message}</div> : null}
            {error ? <div className="notice notice-error">{error}</div> : null}
          </div>

          <div className="surface-soft grid gap-4 rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-kicker">{copy.step2}</p>
                <h3 className="text-xl font-semibold tracking-[-0.03em]">{copy.accountInfo}</h3>
              </div>

              <div className="surface-card relative grid min-w-[16rem] grid-cols-2 rounded-full border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.74)] p-1">
                <span
                  aria-hidden="true"
                  className={classNames(
                    "segmented-control-indicator pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full transition-transform duration-300 ease-out",
                    accountMode === "bulk" ? "translate-x-full" : "translate-x-0"
                  )}
                />
                {([
                  ["single", copy.singleEntry],
                  ["bulk", copy.bulkEntry],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAccountMode(mode)}
                    className={classNames(
                      "relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300",
                      accountMode === mode
                        ? "segmented-control-button-active"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {accountMode === "single" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.email}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={copy.emailPlaceholder}
                    required
                    className="rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.password}
                  </span>
                  <input
                    type="text"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    required
                    className="rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                  />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.totpKey}
                  </span>
                  <input
                    value={twofaUrl}
                    onChange={(event) => setTwofaUrl(event.target.value)}
                    placeholder={copy.totpPlaceholder}
                    required
                    className="rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-[1.2rem] border border-[rgba(18,92,95,0.14)] bg-[rgba(18,92,95,0.08)] px-4 py-3 text-sm leading-7 text-[var(--teal)]">
                  {copy.bulkHelp}
                  <span className="font-mono">Gmail---Password---TOTP</span>
                  {isChinese ? " 格式。" : " format."}
                </div>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.bulkContent}
                  </span>
                  {bulkFormatMessage ? (
                    <div className="notice notice-success">{bulkFormatMessage}</div>
                  ) : null}
                  {bulkFormatError ? (
                    <div className="notice notice-error">{bulkFormatError}</div>
                  ) : null}
                  <div className="relative">
                    <textarea
                      value={bulkText}
                      onChange={(event) => {
                        setBulkText(event.target.value);
                        if (bulkFormatMessage) {
                          setBulkFormatMessage(null);
                        }
                        if (bulkFormatError) {
                          setBulkFormatError(null);
                        }
                      }}
                      placeholder={BULK_TEXT_PLACEHOLDER}
                      rows={7}
                      className="min-h-[13rem] w-full resize-none rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 pb-16 text-sm leading-7 outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleBulkFormat()}
                      disabled={isBulkFormatting}
                      className={classNames(
                        "absolute bottom-3 left-3",
                        isBulkFormatting ? "theme-button-disabled" : "theme-button-secondary"
                      )}
                    >
                      {isBulkFormatting ? copy.bulkFormatting : copy.bulkFormat}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBulkEditorOpen(true)}
                      className="theme-button-surface absolute bottom-3 right-3"
                    >
                      {copy.expandBulkEditor}
                    </button>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {runModes.map((mode) => {
              const modeEnabled = mode.enabled !== false;
              const disabled = !modeEnabled || !detail?.can_exchange || !mode.affordable || isPending;
              const description = modeEnabled
                ? copy.runModeDescriptions[mode.run_mode]
                : copy.modeMaintenanceHint;

              return (
                <article
                  key={mode.run_mode}
                  className={classNames(
                    "surface-card rounded-[1.6rem] border p-5 transition",
                    modeEnabled && mode.affordable
                      ? "border-[rgba(18,92,95,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(238,247,244,0.84))]"
                      : "border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,247,0.7)] opacity-80"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-semibold tracking-[-0.03em]">
                          {copy.runModeLabels[mode.run_mode] || mode.label}
                        </h3>
                        {!modeEnabled ? (
                          <span className="inline-flex rounded-full bg-[rgba(151,61,44,0.12)] px-3 py-1 text-xs font-semibold text-[#973d2c]">
                            {copy.maintenance}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-[var(--muted)]">{description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[2.4rem] font-semibold leading-none tracking-[-0.05em] text-[var(--accent-deep)]">
                        {mode.price}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        {copy.modePriceUnit}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {mode.run_mode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQueueSubmit(mode.run_mode)}
                      disabled={disabled}
                      className={classNames(
                        "",
                        disabled
                          ? "theme-button-disabled"
                          : "theme-button-primary"
                      )}
                    >
                      {!modeEnabled ? copy.maintenance : isPending ? copy.working : copy.joinQueue}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </article>

      <article className="panel p-5 md:p-6">
        <div className="grid gap-4">
          <div>
            <p className="section-kicker">{copy.taskKicker}</p>
            <h2 className="section-title">{copy.taskStatusTitle}</h2>
          </div>

          {task ? (
            <div className="grid gap-3">
              <div className="surface-card grid gap-2 rounded-[1.35rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.78)] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  {copy.taskListTitle}
                </div>
                {paginatedTaskList.map((item) => {
                  const isSelected = item.id === task.id;
                  const itemTaskStatusLabel =
                    copy.taskStatuses[item.status as keyof typeof copy.taskStatuses] || item.status;
                  const itemChargeStatusLabel =
                    item.cdk_charge_status_label ||
                    (item.cdk_charge_status
                      ? copy.chargeStatuses[item.cdk_charge_status as keyof typeof copy.chargeStatuses] || item.cdk_charge_status
                      : copy.unbound);
                  const itemTaskError = item.error_message?.trim() || null;
                  const itemChargeError = item.cdk_charge_error?.trim() || null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedTaskId(item.id)}
                      className={classNames(
                        "surface-card grid gap-1 rounded-[1rem] border px-3 py-3 text-left transition",
                        isSelected
                          ? "border-[rgba(18,92,95,0.24)] bg-[rgba(18,92,95,0.08)]"
                          : "border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)] hover:border-[rgba(18,92,95,0.16)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[var(--ink)]">
                          #{item.id} {item.email}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
                          {itemTaskStatusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {copy.chargeStatusPrefix}
                        {itemChargeStatusLabel}
                      </div>
                      {itemTaskError ? (
                        <div className="text-xs leading-6 text-[#973d2c]">
                          {copy.taskError}
                          {itemTaskError}
                        </div>
                      ) : null}
                      {itemChargeError ? (
                        <div className="text-xs leading-6 text-[#973d2c]">
                          {copy.chargeError}
                          {itemChargeError}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
                {totalTaskPages > 1 ? (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleTaskPageChange(currentTaskPage - 1)}
                      disabled={currentTaskPage <= 1}
                      className={classNames(
                        currentTaskPage <= 1 ? "theme-button-disabled" : "theme-button-surface"
                      )}
                    >
                      {copy.previousPage}
                    </button>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {copy.taskListPage
                        .replace("{current}", String(currentTaskPage))
                        .replace("{total}", String(totalTaskPages))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTaskPageChange(currentTaskPage + 1)}
                      disabled={currentTaskPage >= totalTaskPages}
                      className={classNames(
                        currentTaskPage >= totalTaskPages ? "theme-button-disabled" : "theme-button-surface"
                      )}
                    >
                      {copy.nextPage}
                    </button>
                  </div>
                ) : null}
              </div>

              {showBusinessResultPanel ? (
                <div className="surface-card grid gap-4 rounded-[1.5rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.78)] p-4">
                  <div>
                    <p className="section-kicker">{copy.step3}</p>
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">{copy.businessResult}</h3>
                  </div>

                  {task.status === "success" ? (
                    <div className="grid gap-4">
                      <div className="surface-soft rounded-[1.35rem] border border-[rgba(18,92,95,0.14)] bg-[linear-gradient(180deg,rgba(238,247,244,0.92),rgba(255,255,255,0.88))] p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                          {copy.extractResult}
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                          {copy.extractReady}
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                          {copy.extractDescription}
                        </p>
                      </div>

                      {successResultLink ? (
                        <>
                          <div className="surface-card rounded-[1.35rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(250,246,240,0.92)] p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                              {copy.redeemLink}
                            </div>
                            <div className="mt-3 break-all font-mono text-sm leading-7 text-[var(--ink)]">
                              {successResultLink}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleCopySuccessLink()}
                              className="theme-button-primary"
                            >
                              {copyFeedback === "copied" ? copy.linkCopied : copy.copyLink}
                            </button>
                            <a
                              href={successResultLink}
                              target="_blank"
                              rel="noreferrer"
                              className="theme-button-secondary"
                            >
                              {copy.openLink}
                            </a>
                          </div>
                        </>
                      ) : (
                        <div className="notice notice-success">
                          {copy.noLinkResult}
                        </div>
                      )}

                      {copyFeedback === "failed" ? (
                        <div className="notice notice-error">
                          {copy.copyFailed}
                        </div>
                      ) : null}

                    {task.cdk_charge_status === "pending" ? (
                      <div className="notice notice-success">
                        {copy.chargeSyncHint}
                      </div>
                    ) : null}

                      {task.success_message && !successResultLink ? (
                        <div className="notice notice-success">
                          {copy.successResult}
                          {task.success_message}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-panel">
              {copy.emptyTaskState}
            </div>
          )}
        </div>
      </article>
      </section>

      <CdkDetailDialog
        detail={detail}
        open={isDetailDialogOpen}
        onClose={() => setIsDetailDialogOpen(false)}
      />
      <BulkTextEditorDialog
        value={bulkText}
        open={isBulkEditorOpen}
        onChange={setBulkText}
        onClose={() => setIsBulkEditorOpen(false)}
        closeLabel={copy.close}
      />
    </>
  );
}

function MetricCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="surface-card rounded-[1.35rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.78)] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </div>
      <div
        className={classNames("mt-3 text-base font-semibold leading-7", mono && "font-mono break-all")}
      >
        {value}
      </div>
    </div>
  );
}

function CdkDetailDialog({
  detail,
  open,
  onClose,
}: {
  detail: CdkDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const { language } = useUiPreferences();
  const isChinese = language === "zh";
  const copy = isChinese ? LANGUAGE_COPY.zh : LANGUAGE_COPY.en;
  const locale = resolveLocale(language);

  if (!open || !detail) {
    return null;
  }

  return (
    <div
      className="modal-overlay-enter fixed inset-0 z-50 overflow-hidden overscroll-none bg-[rgba(29,34,29,0.48)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel modal-panel-enter mx-auto flex h-[calc(100dvh-2rem)] max-h-[56rem] w-full max-w-5xl min-h-0 flex-col gap-4 overflow-hidden p-5 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid shrink-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">{copy.detailKicker}</p>
              <h2 className="section-title">{copy.cdkDetailTitle}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="status-pill">
                {copy.cdkStatuses[detail.cdk.status as keyof typeof copy.cdkStatuses] || detail.status_label}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="theme-button-surface"
              >
                {copy.close}
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="surface-card rounded-[1.6rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,247,0.78)] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                CDK
              </div>
              <div className="mt-3 break-all font-mono text-xl leading-8">{detail.cdk.code}</div>
              <div className="mt-4 text-sm leading-7 text-[var(--muted)]">
                {(copy.cdkStatuses[detail.cdk.status as keyof typeof copy.cdkStatuses] || detail.status_label)}
                {isChinese ? "，" : ". "}
                {copy.cdkSummary
                  .replace("{remaining}", String(detail.cdk.remaining_amount))
                  .replace("{available}", String(detail.cdk.available_amount))
                  .replace("{reserved}", String(detail.cdk.reserved_amount))
                  .replace("{redeemCount}", String(detail.cdk.redeem_count))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <MetricCard label={copy.initialAmount} value={String(detail.cdk.initial_amount)} />
              <MetricCard label={copy.totalRemaining} value={String(detail.cdk.remaining_amount)} />
              <MetricCard label={copy.availableAmount} value={String(detail.cdk.available_amount)} />
              <MetricCard label={copy.reservedAmount} value={String(detail.cdk.reserved_amount)} />
              <MetricCard label={copy.lastRedeem} value={formatDate(detail.cdk.last_redeemed_at, locale, copy.emDash)} />
              <MetricCard label={copy.lastCharge} value={formatDate(detail.cdk.last_consumed_at, locale, copy.emDash)} />
            </div>
          </div>
        </div>

        <div className="surface-card min-h-0 flex-1 overflow-hidden rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)]">
          {detail.transactions.length ? (
            <div className="flex h-full min-h-0 overflow-x-auto overscroll-contain">
              <div className="flex min-w-[58rem] flex-1 flex-col">
                <div className="surface-card shrink-0 border-b border-[rgba(31,35,28,0.08)] bg-[rgba(250,247,242,0.96)]">
                  <div
                    className="grid text-xs uppercase tracking-[0.18em] text-[var(--muted)]"
                    style={{ gridTemplateColumns: transactionGridTemplate }}
                  >
                    <div className="px-4 py-4">{copy.time}</div>
                    <div className="px-4 py-4">{copy.type}</div>
                    <div className="px-4 py-4">{copy.amount}</div>
                    <div className="px-4 py-4">{copy.mode}</div>
                    <div className="px-4 py-4">{copy.beforeChange}</div>
                    <div className="px-4 py-4">{copy.afterChange}</div>
                    <div className="px-4 py-4">{copy.note}</div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  {detail.transactions.map((transaction, index) => (
                    <div
                      key={`${transaction.kind}-${transaction.created_at ?? "row"}-${index}`}
                      className="grid border-b border-[rgba(31,35,28,0.06)] last:border-b-0"
                      style={{ gridTemplateColumns: transactionGridTemplate }}
                    >
                      <div className="px-4 py-4 text-sm">{formatDate(transaction.created_at, locale, copy.emDash)}</div>
                      <div className="px-4 py-4">
                        <span className="inline-flex rounded-full bg-[rgba(201,110,69,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                          {copy.transactionKinds[transaction.kind as keyof typeof copy.transactionKinds] || transaction.kind}
                        </span>
                      </div>
                      <div className="px-4 py-4 text-sm font-semibold">{transaction.amount}</div>
                      <div className="px-4 py-4 text-sm">
                        {(transaction.run_mode && copy.runModeLabels[transaction.run_mode]) || transaction.run_mode_label || copy.emDash}
                      </div>
                      <div className="px-4 py-4 text-sm">{transaction.balance_before}</div>
                      <div className="px-4 py-4 text-sm">{transaction.balance_after}</div>
                      <div className="px-4 py-4 text-sm text-[var(--muted)] break-words">
                        {transaction.note || copy.emDash}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-panel h-full min-h-[14rem]">{copy.noTransactions}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkTextEditorDialog({
  value,
  open,
  onChange,
  onClose,
  closeLabel,
}: {
  value: string;
  open: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  closeLabel: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay-enter fixed inset-0 z-50 overflow-hidden overscroll-none bg-[rgba(29,34,29,0.48)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel modal-panel-enter mx-auto flex h-[calc(100dvh-2rem)] max-h-[56rem] w-full max-w-6xl min-h-0 flex-col overflow-hidden p-5 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="theme-button-surface"
          >
            {closeLabel}
          </button>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={BULK_TEXT_PLACEHOLDER}
          aria-label="Bulk account editor"
          className="min-h-0 w-full flex-1 resize-none rounded-[1.5rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.9)] px-5 py-5 font-mono text-sm leading-7 outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
        />
      </div>
    </div>
  );
}
