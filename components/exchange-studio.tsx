"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  isEmailAddress,
  validateBulkAccountLine,
  validateBulkAccountText,
  type AccountFormatIssueCode,
} from "@/lib/account-format";
import {
  OverviewActivityCard,
  useExchangeOverviewSnapshot,
} from "@/components/exchange-overview-shared";
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
  generated_at?: string;
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

type EnqueueHistoryItem = {
  task_id: number;
  raw_account: string;
  task: QueueTask;
};

type EnqueueHistoryRecord = {
  id: string;
  created_at: string;
  cdk_code: string;
  run_mode: RunMode;
  account_mode: AccountMode;
  items: EnqueueHistoryItem[];
};

type EnqueueHistoryCopyFeedback = {
  recordId: string;
  column: "success" | "failed";
  status: "copied" | "failed";
};

type RetryConfirmationItem = {
  taskId: number;
  email: string;
  taskLabel: string;
  rawAccountLine: string;
  formattedAccountLine: string | null;
  cdkCode: string | null;
  runMode: RunMode | null;
  taskError: string | null;
  chargeError: string | null;
  taskStatusLabel: string;
  selected: boolean;
  selectable: boolean;
  unavailableReason: string | null;
};

type RetryConfirmationState = {
  scope: "single" | "batch";
  failedCount: number;
  items: RetryConfirmationItem[];
};

type RetrySource = {
  cdkCode: string;
  runMode: RunMode;
  accountMode: AccountMode;
  rawAccountLine: string;
  formattedAccountLine: string;
};

type RetryExecutionPlan = {
  scope: "single" | "batch";
  cdkCode: string;
  runMode: RunMode;
  accountMode: AccountMode;
  rawAccountLines: string[];
  failedCount: number;
  taskLabel?: string;
};

type RetryConfirmationEvaluation = {
  selectedCount: number;
  selectableCount: number;
  error: string | null;
  plan: RetryExecutionPlan | null;
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
const ENQUEUE_HISTORY_STORAGE_KEY = "pixel-websale-enqueue-history";
const MAX_ENQUEUE_HISTORY_RECORDS = 48;
const BULK_TEXT_PLACEHOLDER = "demo.user@example.com---Passw0rd!---JBSWY3DPEHPK3PXP";
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
    invalidEmail: "邮箱格式不合法。",
    enterPassword: "请输入密码。",
    enterTotp: "请输入 2FA 密钥。",
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
    totpKey: "2FA 密钥",
    emailPlaceholder: "输入谷歌个人账号邮箱",
    passwordPlaceholder: "输入密码",
    totpPlaceholder: "输入 2FA 密钥",
    bulkHelp: "每行 1 个账号，必须使用 ",
    bulkContent: "批量账号内容",
    bulkFormat: "格式转换",
    bulkFormatting: "转换中...",
    bulkFormatApplied: "已转换并写回 {count} 条账号。",
    bulkFormatPartial: "已成功转换 {count} 条账号，仍有格式不合规的行需要手动修正。",
    bulkFormatNoMatch: "没有识别到可转换的邮箱账号，已保留原始输入。",
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
    queueHistory: "入队记录",
    queueHistoryLocalHint: "仅保存在当前浏览器",
    queueHistoryEmpty: "当前浏览器里还没有保存过入队记录。",
    queueHistoryTime: "入队时间",
    queueHistorySummary: "{mode} · {count} 条",
    queueHistoryDetailTitle: "原始账号记录",
    queueHistoryTaskCount: "共 {count} 条账号",
    queueHistoryCodeInfo: "卡密信息",
    queueHistoryPendingHint: "还有 {count} 条任务仍在排队或处理中。",
    queueHistorySuccess: "成功记录",
    queueHistoryFailed: "失败记录",
    queueHistoryNoSuccess: "暂无成功记录。",
    queueHistoryNoFailed: "暂无失败记录。",
    queueHistoryCopy: "复制账号",
    queueHistoryCopied: "已复制",
    queueHistoryCopyFailed: "复制失败，请手动选中账号内容。",
    retryTask: "重排",
    retryAllFailed: "一键重排",
    retryConfirmTitleSingle: "确认重排失败任务",
    retryConfirmTitleBatch: "确认一键重排失败任务",
    retryConfirmDescriptionSingle: "将使用当前浏览器保存的原始账号记录，重新提交这个失败任务。",
    retryConfirmDescriptionBatch: "将使用当前浏览器保存的原始账号记录，重新提交本次所有失败任务。",
    retryConfirmTaskLabel: "任务",
    retryConfirmFailedCountLabel: "失败数量",
    retryConfirmSelectedCountLabel: "已选数量",
    retryConfirmModeLabel: "模式",
    retryConfirmCdkLabel: "卡密",
    retryConfirmSelectionLabel: "可重排账号",
    retryConfirmAccountLabel: "账号记录",
    retryConfirmFailureLabel: "失败记录",
    retryConfirmSelectAll: "全选可重排",
    retryConfirmClearAll: "清空选择",
    retryConfirmUnavailable: "当前不可重排",
    retryConfirmSelectAtLeastOne: "请至少选择 1 个可重排的失败账号。",
    retryConfirmAction: "确认重排",
    cancel: "取消",
    retryNoFailedTasks: "当前没有可重排的失败任务。",
    retryMissingTaskSource: "找不到这个失败任务的原始账号记录，暂时无法重排。",
    retryMissingBatchSource: "本次失败任务缺少原始账号记录，暂时无法一键重排。",
    retrySourceMismatch: "失败任务的卡密或模式不一致，暂时无法一起重排。",
    retryQueuedSingle: "已重新入队 1 个失败任务。后端执行成功后会自动从 CDK 中扣除 {amount} 额度。",
    retryQueuedBatch: "已重新入队 {count} 个失败任务。后端每成功执行 1 个 {mode} 任务，就会自动从 CDK 中扣除 {amount} 额度。",
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
      missing_separator: "未使用 Email---Password---2FA密钥 格式",
      missing_email: "缺少邮箱",
      invalid_email: "邮箱格式不合法",
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
    invalidEmail: "Please enter a valid email address.",
    enterPassword: "Please enter a password.",
    enterTotp: "Please enter a 2FA key.",
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
    totpKey: "2FA Key",
    emailPlaceholder: "Enter your Google account email",
    passwordPlaceholder: "Enter password",
    totpPlaceholder: "Enter 2FA key",
    bulkHelp: "Each line must use ",
    bulkContent: "Bulk Accounts",
    bulkFormat: "Format",
    bulkFormatting: "Formatting...",
    bulkFormatApplied: "Normalized {count} account(s) and filled the input.",
    bulkFormatPartial: "Normalized {count} account(s), but some lines still need manual fixes.",
    bulkFormatNoMatch: "No convertible email accounts were found. The original input was kept.",
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
    queueHistory: "Queue History",
    queueHistoryLocalHint: "Saved in this browser only",
    queueHistoryEmpty: "No queue history has been saved in this browser yet.",
    queueHistoryTime: "Queued At",
    queueHistorySummary: "{mode} · {count} accounts",
    queueHistoryDetailTitle: "Original Accounts",
    queueHistoryTaskCount: "{count} account(s)",
    queueHistoryCodeInfo: "CDK Info",
    queueHistoryPendingHint: "{count} task(s) are still queued or running.",
    queueHistorySuccess: "Successful",
    queueHistoryFailed: "Failed",
    queueHistoryNoSuccess: "No successful records yet.",
    queueHistoryNoFailed: "No failed records yet.",
    queueHistoryCopy: "Copy Accounts",
    queueHistoryCopied: "Copied",
    queueHistoryCopyFailed: "Copy failed. Please select the account lines manually.",
    retryTask: "Retry",
    retryAllFailed: "Retry Failed",
    retryConfirmTitleSingle: "Retry this failed task",
    retryConfirmTitleBatch: "Retry all failed tasks",
    retryConfirmDescriptionSingle: "This will re-submit the failed task using the original account record saved in this browser.",
    retryConfirmDescriptionBatch: "This will re-submit all failed tasks from this batch using the original account records saved in this browser.",
    retryConfirmTaskLabel: "Task",
    retryConfirmFailedCountLabel: "Failed",
    retryConfirmSelectedCountLabel: "Selected",
    retryConfirmModeLabel: "Mode",
    retryConfirmCdkLabel: "CDK",
    retryConfirmSelectionLabel: "Retry Accounts",
    retryConfirmAccountLabel: "Account Record",
    retryConfirmFailureLabel: "Failure Record",
    retryConfirmSelectAll: "Select All",
    retryConfirmClearAll: "Clear Selection",
    retryConfirmUnavailable: "Unavailable",
    retryConfirmSelectAtLeastOne: "Select at least one retryable failed account.",
    retryConfirmAction: "Confirm Retry",
    cancel: "Cancel",
    retryNoFailedTasks: "There are no failed tasks to retry right now.",
    retryMissingTaskSource: "The original account record for this failed task is unavailable, so it cannot be retried yet.",
    retryMissingBatchSource: "Some failed tasks in this batch are missing original account records, so bulk retry is unavailable.",
    retrySourceMismatch: "The failed tasks do not share the same CDK or mode, so they cannot be retried together.",
    retryQueuedSingle: "Re-queued 1 failed task. After the backend succeeds, {amount} credits will be charged from the CDK automatically.",
    retryQueuedBatch: "Re-queued {count} failed tasks. Each successful {mode} task will automatically deduct {amount} credits from the CDK.",
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
      missing_separator: "must use the Email---Password---2FA key format",
      missing_email: "missing email address",
      invalid_email: "invalid email address",
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function asOptionalStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeStoredQueueTask(value: unknown): QueueTask | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const taskId = Number(value.id);
  const email = typeof value.email === "string" ? value.email.trim() : "";
  if (!Number.isFinite(taskId) || taskId <= 0 || !email) {
    return null;
  }

  return {
    id: Math.trunc(taskId),
    email,
    run_mode: value.run_mode === "extract_link" || value.run_mode === "subscription" ? value.run_mode : null,
    run_mode_label:
      typeof value.run_mode_label === "string" && value.run_mode_label.trim()
        ? value.run_mode_label
        : "未指定",
    cdk_code: asOptionalStringValue(value.cdk_code),
    cdk_charge_status: asOptionalStringValue(value.cdk_charge_status),
    cdk_charge_status_label: asOptionalStringValue(value.cdk_charge_status_label),
    cdk_charge_amount: Number.isFinite(Number(value.cdk_charge_amount))
      ? Math.trunc(Number(value.cdk_charge_amount))
      : 0,
    cdk_charge_error: asOptionalStringValue(value.cdk_charge_error),
    cdk_charged_at: asOptionalStringValue(value.cdk_charged_at),
    status: typeof value.status === "string" && value.status.trim() ? value.status : "queued",
    device_serial: asOptionalStringValue(value.device_serial),
    card_id:
      value.card_id == null || !Number.isFinite(Number(value.card_id))
        ? null
        : Math.trunc(Number(value.card_id)),
    error_message: asOptionalStringValue(value.error_message),
    success_message: asOptionalStringValue(value.success_message),
    attempt_count: Number.isFinite(Number(value.attempt_count))
      ? Math.trunc(Number(value.attempt_count))
      : 0,
    created_at: asOptionalStringValue(value.created_at),
    started_at: asOptionalStringValue(value.started_at),
    finished_at: asOptionalStringValue(value.finished_at),
    updated_at: asOptionalStringValue(value.updated_at),
    has_twofa: Boolean(value.has_twofa),
  };
}

function buildRawAccountLine(email: string, password: string, twofaKey: string) {
  return `${email}---${password}---${twofaKey}`;
}

function buildFallbackHistoryRawAccount(task: QueueTask) {
  return task.email ? `${task.email}` : `#${task.id}`;
}

function createHistoryRecordId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `queue-record-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStreamingTask(task: QueueTask) {
  return (
    task.status === "queued" ||
    task.status === "running" ||
    task.cdk_charge_status === "pending"
  );
}

function isFailedTaskStatus(status: string) {
  return !["queued", "running", "success"].includes(status);
}

function getTaskStatusLabel(copy: ExchangeStudioCopy, status: string) {
  return copy.taskStatuses[status as keyof typeof copy.taskStatuses] || status;
}

function mergeTaskSnapshots(currentTasks: QueueTask[], refreshedTasks: QueueTask[]) {
  if (!refreshedTasks.length) {
    return currentTasks;
  }

  const refreshedById = new Map(refreshedTasks.map((task) => [task.id, task]));
  return currentTasks.map((task) => refreshedById.get(task.id) || task);
}

function mergeEnqueueHistoryRecords(
  currentRecords: EnqueueHistoryRecord[],
  refreshedTasks: QueueTask[]
) {
  if (!refreshedTasks.length) {
    return currentRecords;
  }

  const refreshedById = new Map(refreshedTasks.map((task) => [task.id, task]));
  return currentRecords.map((record) => ({
    ...record,
    items: record.items.map((item) => {
      const nextTask = refreshedById.get(item.task.id) || item.task;
      return {
        ...item,
        task_id: nextTask.id,
        task: nextTask,
      };
    }),
  }));
}

function normalizeStoredEnqueueHistoryRecord(value: unknown): EnqueueHistoryRecord | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => {
          if (!isObjectRecord(item)) {
            return null;
          }

          const task = normalizeStoredQueueTask(item.task);
          if (!task) {
            return null;
          }

          const rawAccount =
            typeof item.raw_account === "string" && item.raw_account.trim()
              ? item.raw_account
              : buildFallbackHistoryRawAccount(task);

          return {
            task_id: task.id,
            raw_account: rawAccount,
            task,
          } satisfies EnqueueHistoryItem;
        })
        .filter((item): item is EnqueueHistoryItem => Boolean(item))
    : [];

  if (!items.length) {
    return null;
  }

  const runMode =
    value.run_mode === "extract_link" || value.run_mode === "subscription"
      ? value.run_mode
      : items.find((item) => item.task.run_mode)?.task.run_mode ?? null;
  if (!runMode) {
    return null;
  }

  return {
    id:
      (typeof value.id === "string" && value.id.trim()) ||
      createHistoryRecordId(),
    created_at:
      (typeof value.created_at === "string" && value.created_at) ||
      items[0]?.task.created_at ||
      new Date().toISOString(),
    cdk_code:
      (typeof value.cdk_code === "string" && value.cdk_code.trim()) ||
      items[0]?.task.cdk_code ||
      "",
    run_mode: runMode,
    account_mode: value.account_mode === "bulk" ? "bulk" : "single",
    items,
  };
}

function buildEnqueueHistoryRecord({
  createdAt,
  cdkCode,
  runMode,
  accountMode,
  tasks,
  rawAccounts,
  normalizedLines,
}: {
  createdAt?: string;
  cdkCode: string;
  runMode: RunMode;
  accountMode: AccountMode;
  tasks: QueueTask[];
  rawAccounts: string[];
  normalizedLines: string[];
}) {
  const items = tasks
    .map((task, index) => {
      const rawAccount =
        rawAccounts[index]?.trim() ||
        normalizedLines[index]?.trim() ||
        buildFallbackHistoryRawAccount(task);
      return {
        task_id: task.id,
        raw_account: rawAccount,
        task,
      } satisfies EnqueueHistoryItem;
    })
    .filter((item) => item.task_id > 0);

  if (!items.length) {
    return null;
  }

  return {
    id: createHistoryRecordId(),
    created_at: createdAt || new Date().toISOString(),
    cdk_code: cdkCode,
    run_mode: runMode,
    account_mode: accountMode,
    items,
  } satisfies EnqueueHistoryRecord;
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

function buildRetryConfirmationItem(
  task: QueueTask,
  source: RetrySource | null,
  copy: ExchangeStudioCopy
): RetryConfirmationItem {
  return {
    taskId: task.id,
    email: task.email,
    taskLabel: `#${task.id} ${task.email}`,
    rawAccountLine: source?.rawAccountLine || buildFallbackHistoryRawAccount(task),
    formattedAccountLine: source?.formattedAccountLine || null,
    cdkCode: source?.cdkCode || null,
    runMode: source?.runMode || null,
    taskError: task.error_message?.trim() || null,
    chargeError: task.cdk_charge_error?.trim() || null,
    taskStatusLabel: getTaskStatusLabel(copy, task.status),
    selected: Boolean(source),
    selectable: Boolean(source),
    unavailableReason: source ? null : copy.retryMissingTaskSource,
  };
}

function evaluateRetryConfirmation(
  confirmation: RetryConfirmationState | null,
  copy: ExchangeStudioCopy
): RetryConfirmationEvaluation {
  if (!confirmation) {
    return {
      selectedCount: 0,
      selectableCount: 0,
      error: null,
      plan: null,
    };
  }

  const selectableItems = confirmation.items.filter((item) => item.selectable);
  const selectedItems = selectableItems.filter(
    (item) =>
      item.selected &&
      Boolean(item.formattedAccountLine) &&
      Boolean(item.cdkCode) &&
      Boolean(item.runMode)
  );

  if (!selectedItems.length) {
    return {
      selectedCount: 0,
      selectableCount: selectableItems.length,
      error: copy.retryConfirmSelectAtLeastOne,
      plan: null,
    };
  }

  const firstItem = selectedItems[0];
  if (
    selectedItems.some(
      (item) => item.cdkCode !== firstItem.cdkCode || item.runMode !== firstItem.runMode
    )
  ) {
    return {
      selectedCount: selectedItems.length,
      selectableCount: selectableItems.length,
      error: copy.retrySourceMismatch,
      plan: null,
    };
  }

  return {
    selectedCount: selectedItems.length,
    selectableCount: selectableItems.length,
    error: null,
    plan: {
      scope: selectedItems.length === 1 ? "single" : "batch",
      cdkCode: firstItem.cdkCode || "",
      runMode: firstItem.runMode || "extract_link",
      accountMode: selectedItems.length === 1 ? "single" : "bulk",
      rawAccountLines: selectedItems
        .map((item) => item.formattedAccountLine || "")
        .filter(Boolean),
      failedCount: selectedItems.length,
      taskLabel: selectedItems.length === 1 ? selectedItems[0].taskLabel : undefined,
    },
  };
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
  const overviewSnapshot = useExchangeOverviewSnapshot(language);
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
  const [enqueueHistory, setEnqueueHistory] = useState<EnqueueHistoryRecord[]>([]);
  const [hasLoadedEnqueueHistory, setHasLoadedEnqueueHistory] = useState(false);
  const [isQueueHistoryOpen, setIsQueueHistoryOpen] = useState(false);
  const [selectedQueueHistoryId, setSelectedQueueHistoryId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [currentTaskPage, setCurrentTaskPage] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const [queueHistoryCopyFeedback, setQueueHistoryCopyFeedback] =
    useState<EnqueueHistoryCopyFeedback | null>(null);
  const [retryConfirmation, setRetryConfirmation] =
    useState<RetryConfirmationState | null>(null);
  const taskListRef = useRef<QueueTask[]>([]);
  const taskDetailSyncKeyRef = useRef("");
  const [isPending, startTransition] = useTransition();
  const isChinese = language === "zh";
  const copy = isChinese ? LANGUAGE_COPY.zh : LANGUAGE_COPY.en;
  const locale = resolveLocale(language);
  const overviewItems = [
    {
      label: overviewSnapshot.copy.runningLegend,
      value: overviewSnapshot.taskCounts.running,
    },
    {
      label: overviewSnapshot.copy.queuedLegend,
      value: overviewSnapshot.taskCounts.queued,
    },
    {
      label: overviewSnapshot.copy.successLegend,
      value: overviewSnapshot.taskCounts.success,
    },
    {
      label: overviewSnapshot.copy.failureLegend,
      value: overviewSnapshot.taskCounts.failed,
    },
  ];

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
  const selectedQueueHistory = useMemo(() => {
    if (!enqueueHistory.length) {
      return null;
    }
    if (selectedQueueHistoryId) {
      const matchedRecord = enqueueHistory.find((record) => record.id === selectedQueueHistoryId);
      if (matchedRecord) {
        return matchedRecord;
      }
    }
    return enqueueHistory[0] ?? null;
  }, [enqueueHistory, selectedQueueHistoryId]);
  const retrySourceByTaskId = useMemo(() => {
    const nextLookup = new Map<number, RetrySource>();

    for (const record of enqueueHistory) {
      for (const item of record.items) {
        const rawAccountLine = item.raw_account.trim();
        const validation = validateBulkAccountLine(rawAccountLine, 1);
        if (!validation.ok) {
          continue;
        }

        const cdkCode = record.cdk_code.trim() || item.task.cdk_code?.trim() || "";
        if (!cdkCode) {
          continue;
        }

        nextLookup.set(item.task.id, {
          cdkCode,
          runMode: record.run_mode,
          accountMode: record.account_mode,
          rawAccountLine,
          formattedAccountLine: validation.formatted,
        });
      }
    }

    return nextLookup;
  }, [enqueueHistory]);
  const failedTasks = useMemo(
    () => taskList.filter((item) => isFailedTaskStatus(item.status)),
    [taskList]
  );
  const hasRetriableFailedTasks = useMemo(
    () => failedTasks.some((item) => retrySourceByTaskId.has(item.id)),
    [failedTasks, retrySourceByTaskId]
  );
  const retrySelection = useMemo(
    () => evaluateRetryConfirmation(retryConfirmation, copy),
    [copy, retryConfirmation]
  );
  const normalizedCode = code.trim();

  useEffect(() => {
    taskListRef.current = taskList;
  }, [taskList]);

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
    try {
      const rawValue = window.localStorage.getItem(ENQUEUE_HISTORY_STORAGE_KEY);
      if (!rawValue) {
        setEnqueueHistory([]);
        return;
      }

      const parsedValue = JSON.parse(rawValue) as unknown;
      const records = Array.isArray(parsedValue)
        ? parsedValue
            .map((record) => normalizeStoredEnqueueHistoryRecord(record))
            .filter((record): record is EnqueueHistoryRecord => Boolean(record))
            .slice(0, MAX_ENQUEUE_HISTORY_RECORDS)
        : [];

      setEnqueueHistory(records);
      setSelectedQueueHistoryId(records[0]?.id ?? null);
    } catch {
      setEnqueueHistory([]);
    } finally {
      setHasLoadedEnqueueHistory(true);
    }
  }, []);

  useEffect(() => {
    setCurrentTaskPage((currentPage) => Math.min(Math.max(1, currentPage), totalTaskPages));
  }, [totalTaskPages]);

  useEffect(() => {
    setSelectedQueueHistoryId((currentId) => {
      if (currentId && enqueueHistory.some((record) => record.id === currentId)) {
        return currentId;
      }
      return enqueueHistory[0]?.id ?? null;
    });
  }, [enqueueHistory]);

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
    if (!hasLoadedEnqueueHistory) {
      return;
    }

    try {
      if (enqueueHistory.length) {
        window.localStorage.setItem(
          ENQUEUE_HISTORY_STORAGE_KEY,
          JSON.stringify(enqueueHistory.slice(0, MAX_ENQUEUE_HISTORY_RECORDS))
        );
      } else {
        window.localStorage.removeItem(ENQUEUE_HISTORY_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage access errors in restricted browser modes.
    }
  }, [enqueueHistory, hasLoadedEnqueueHistory]);

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

  const historyLookupKey = useMemo(
    () =>
      Array.from(
        new Set(
          enqueueHistory.flatMap((record) => record.items.map((item) => item.task.id))
        )
      ).join(","),
    [enqueueHistory]
  );
  const hasCurrentStreamingTasks = useMemo(
    () => taskList.some((item) => isStreamingTask(item)),
    [taskList]
  );
  const currentTaskIds = useMemo(
    () =>
      taskList
        .map((item) => item.id)
        .filter((taskId) => Number.isFinite(taskId) && taskId > 0),
    [taskList]
  );
  const currentTaskIdsKey = useMemo(() => currentTaskIds.join(","), [currentTaskIds]);
  const historyStreamingTaskIds = useMemo(
    () =>
      Array.from(
        new Set(
          enqueueHistory.flatMap((record) =>
            record.items
              .filter((item) => isStreamingTask(item.task))
              .map((item) => item.task.id)
          )
        )
      ),
    [enqueueHistory]
  );
  const trackedTaskStreamKey = useMemo(
    () =>
      Array.from(
        new Set([
          ...(hasCurrentStreamingTasks ? currentTaskIds : []),
          ...historyStreamingTaskIds,
        ])
      ).join(","),
    [currentTaskIds, hasCurrentStreamingTasks, historyStreamingTaskIds]
  );

  useEffect(() => {
    if (!hasLoadedEnqueueHistory || !historyLookupKey) {
      return;
    }

    let cancelled = false;
    const taskIds = historyLookupKey
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!taskIds.length) {
      return;
    }

    void (async () => {
      try {
        const payload = await request<TaskLookupResponse>("/api/tasks/lookup", {
          method: "POST",
          body: JSON.stringify({ task_ids: taskIds }),
        });
        if (cancelled || !payload.tasks.length) {
          return;
        }
        setEnqueueHistory((currentRecords) =>
          mergeEnqueueHistoryRecords(currentRecords, payload.tasks)
        );
        setTaskList((currentTasks) => mergeTaskSnapshots(currentTasks, payload.tasks));
      } catch {
        // Keep the browser snapshot if lookup fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasLoadedEnqueueHistory, historyLookupKey]);

  useEffect(() => {
    if (!trackedTaskStreamKey) {
      return;
    }

    let cancelled = false;
    const eventSource = new EventSource(
      `/api/tasks/stream?${new URLSearchParams(
        trackedTaskStreamKey.split(",").map((taskId) => ["task_id", taskId])
      ).toString()}`
    );

    const syncActiveTaskDetail = async (refreshedCurrentTasks: QueueTask[]) => {
      const activeTaskId =
        selectedTaskId !== null && refreshedCurrentTasks.some((item) => item.id === selectedTaskId)
          ? selectedTaskId
          : (refreshedCurrentTasks[0]?.id ?? null);

      if (activeTaskId !== null && activeTaskId !== selectedTaskId) {
        setSelectedTaskId(activeTaskId);
      }

      const activeTask =
        activeTaskId !== null
          ? refreshedCurrentTasks.find((item) => item.id === activeTaskId) || null
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
        if (hasCurrentStreamingTasks && currentTaskIds.length) {
          setTaskList((currentTasks) => mergeTaskSnapshots(currentTasks, refreshedTasks));
        }
        setEnqueueHistory((currentRecords) =>
          mergeEnqueueHistoryRecords(currentRecords, refreshedTasks)
        );
        setError(null);
        if (hasCurrentStreamingTasks && currentTaskIds.length) {
          const nextCurrentTasks = mergeTaskSnapshots(taskListRef.current, refreshedTasks);
          void syncActiveTaskDetail(nextCurrentTasks);
        }
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
  }, [
    copy.taskRefreshFailed,
    currentTaskIds.length,
    currentTaskIdsKey,
    hasCurrentStreamingTasks,
    selectedTaskId,
    trackedTaskStreamKey,
  ]);

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
    if (!queueHistoryCopyFeedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setQueueHistoryCopyFeedback(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [queueHistoryCopyFeedback]);

  useEffect(() => {
    if (accountMode !== "bulk") {
      setIsBulkEditorOpen(false);
      setBulkFormatMessage(null);
      setBulkFormatError(null);
    }
  }, [accountMode]);

  const hasModalOpen =
    isDetailDialogOpen || isBulkEditorOpen || isQueueHistoryOpen || retryConfirmation !== null;

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
        setIsQueueHistoryOpen(false);
        setRetryConfirmation(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasModalOpen, retryConfirmation]);

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

  const applyQueuedExchangeResult = ({
    response,
    cdkCode,
    runMode,
    accountMode,
    rawAccountLines,
    messageKind,
  }: {
    response: ExchangeResponse;
    cdkCode: string;
    runMode: RunMode;
    accountMode: AccountMode;
    rawAccountLines: string[];
    messageKind: "initial" | "retrySingle" | "retryBatch";
  }) => {
    setCode(cdkCode);
    setTaskList(response.tasks);
    setSelectedTaskId(response.tasks[0]?.id ?? null);
    setCurrentTaskPage(1);
    setDetail(response.detail);

    const nextHistoryRecord = buildEnqueueHistoryRecord({
      createdAt: response.generated_at,
      cdkCode,
      runMode,
      accountMode,
      tasks: response.tasks,
      rawAccounts: rawAccountLines,
      normalizedLines: response.normalized_lines,
    });
    if (nextHistoryRecord) {
      setEnqueueHistory((currentRecords) =>
        [nextHistoryRecord, ...currentRecords].slice(0, MAX_ENQUEUE_HISTORY_RECORDS)
      );
      setSelectedQueueHistoryId(nextHistoryRecord.id);
    }

    const localizedRunModeLabel =
      response.tasks[0]?.run_mode && copy.runModeLabels[response.tasks[0].run_mode]
        ? copy.runModeLabels[response.tasks[0].run_mode as RunMode]
        : (response.tasks[0]?.run_mode_label || copy.notSpecified);
    const chargeAmount = response.tasks[0]?.cdk_charge_amount ?? 0;

    if (messageKind === "retrySingle") {
      setMessage(copy.retryQueuedSingle.replace("{amount}", String(chargeAmount)));
      return;
    }

    if (messageKind === "retryBatch") {
      setMessage(
        copy.retryQueuedBatch
          .replace("{count}", String(response.created))
          .replace("{mode}", localizedRunModeLabel)
          .replace("{amount}", String(chargeAmount))
      );
      return;
    }

    if (response.tasks.length === 1) {
      setMessage(
        isChinese
          ? `${localizedRunModeLabel} 任务已加入队列。后端执行成功后会自动从 CDK 中扣除 ${chargeAmount} 额度。`
          : `${localizedRunModeLabel} task queued. After the backend succeeds, ${chargeAmount} credits will be charged from the CDK automatically.`
      );
      return;
    }

    setMessage(
      isChinese
        ? `已批量加入队列 ${response.created} 个任务。后端每成功执行 1 个 ${localizedRunModeLabel} 任务，就会自动从 CDK 中扣除 ${chargeAmount} 额度。`
        : `${response.created} tasks were queued in bulk. Each successful ${localizedRunModeLabel} task will automatically deduct ${chargeAmount} credits from the CDK.`
    );
  };

  const queueRetryTasks = async (plan: RetryExecutionPlan) => {
    const normalizedCode = plan.cdkCode.trim();
    const normalizedLines = plan.rawAccountLines.map((line) => line.trim()).filter(Boolean);

    if (!normalizedLines.length) {
      throw new Error(
        plan.scope === "single" ? copy.retryMissingTaskSource : copy.retryMissingBatchSource
      );
    }

    if (plan.accountMode === "single") {
      const validation = validateBulkAccountLine(normalizedLines[0] || "", 1);
      if (!validation.ok) {
        throw new Error(copy.retryMissingTaskSource);
      }

      const response = await request<ExchangeResponse>("/api/exchange", {
        method: "POST",
        body: JSON.stringify({
          code: normalizedCode,
          run_mode: plan.runMode,
          account_mode: "single",
          email: validation.record.email,
          password: validation.record.password,
          twofa_url: validation.record.twofaSecret,
          bulk_text: "",
        }),
      });

      applyQueuedExchangeResult({
        response,
        cdkCode: normalizedCode,
        runMode: plan.runMode,
        accountMode: "single",
        rawAccountLines: [validation.formatted],
        messageKind: "retrySingle",
      });
      return;
    }

    const bulkValidation = validateBulkAccountText(normalizedLines.join("\n"));
    if (!bulkValidation.validLines.length) {
      throw new Error(copy.retryMissingBatchSource);
    }
    if (bulkValidation.invalidLines.length) {
      throw new Error(
        copy.bulkSubmitInvalid.replace(
          "{lines}",
          formatInvalidBulkLinesMessage(copy, bulkValidation.invalidLines)
        )
      );
    }

    const response = await request<ExchangeResponse>("/api/exchange", {
      method: "POST",
      body: JSON.stringify({
        code: normalizedCode,
        run_mode: plan.runMode,
        account_mode: "bulk",
        email: "",
        password: "",
        twofa_url: "",
        bulk_text: bulkValidation.validLines.join("\n"),
      }),
    });

    applyQueuedExchangeResult({
      response,
      cdkCode: normalizedCode,
      runMode: plan.runMode,
      accountMode: "bulk",
      rawAccountLines: bulkValidation.validLines,
      messageKind: "retryBatch",
    });
  };

  const buildSingleRetryConfirmation = (targetTask: QueueTask) => {
    if (!isFailedTaskStatus(targetTask.status)) {
      setError(copy.retryNoFailedTasks);
      return;
    }

    const source = retrySourceByTaskId.get(targetTask.id);
    if (!source) {
      setError(copy.retryMissingTaskSource);
      return;
    }

    setError(null);
    setMessage(null);
    setRetryConfirmation({
      scope: "single",
      failedCount: 1,
      items: [buildRetryConfirmationItem(targetTask, source, copy)],
    });
  };

  const buildBatchRetryConfirmation = () => {
    if (!failedTasks.length) {
      setError(copy.retryNoFailedTasks);
      return;
    }

    const items = failedTasks.map((item) =>
      buildRetryConfirmationItem(item, retrySourceByTaskId.get(item.id) || null, copy)
    );
    const firstSelectableItem = items.find(
      (item) => item.selectable && item.cdkCode && item.runMode
    );

    if (!items.some((item) => item.selectable)) {
      setError(copy.retryMissingBatchSource);
      return;
    }

    setError(null);
    setMessage(null);
    setRetryConfirmation({
      scope: "batch",
      failedCount: failedTasks.length,
      items: firstSelectableItem
        ? items.map((item) =>
            item.selectable
              ? {
                  ...item,
                  selected:
                    item.cdkCode === firstSelectableItem.cdkCode &&
                    item.runMode === firstSelectableItem.runMode,
                }
              : item
          )
        : items,
    });
  };

  const handleConfirmRetry = () => {
    if (!retryConfirmation || !retrySelection.plan) {
      setError(retrySelection.error || copy.retryConfirmSelectAtLeastOne);
      return;
    }
    const retryPlan = retrySelection.plan;

    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);
        await queueRetryTasks(retryPlan);
        setRetryConfirmation(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.submitFailed);
      }
    });
  };

  const handleRetryItemSelectionChange = (taskId: number, selected: boolean) => {
    setRetryConfirmation((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) =>
          item.taskId === taskId && item.selectable
            ? { ...item, selected }
            : item
        ),
      };
    });
  };

  const handleSelectAllRetryItems = () => {
    setRetryConfirmation((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) =>
          item.selectable ? { ...item, selected: true } : item
        ),
      };
    });
  };

  const handleClearRetryItems = () => {
    setRetryConfirmation((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) =>
          item.selectable ? { ...item, selected: false } : item
        ),
      };
    });
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
      if (!isEmailAddress(normalizedEmail)) {
        setError(copy.invalidEmail);
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
        const rawAccountLines =
          accountMode === "bulk"
            ? validatedBulkText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
            : [buildRawAccountLine(normalizedEmail, normalizedPassword, normalizedTwofaUrl)];
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
        applyQueuedExchangeResult({
          response,
          cdkCode: normalizedCode,
          runMode,
          accountMode,
          rawAccountLines,
          messageKind: "initial",
        });
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

  const handleCopyQueueHistoryColumn = async (
    record: EnqueueHistoryRecord,
    column: "success" | "failed"
  ) => {
    const lines = record.items
      .filter((item) =>
        column === "success"
          ? item.task.status === "success"
          : isFailedTaskStatus(item.task.status)
      )
      .map((item) => item.raw_account.trim())
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setQueueHistoryCopyFeedback({
        recordId: record.id,
        column,
        status: "copied",
      });
    } catch {
      setQueueHistoryCopyFeedback({
        recordId: record.id,
        column,
        status: "failed",
      });
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
                  <span className="font-mono">
                    {isChinese ? "Email---Password---2FA密钥" : "Email---Password---2FA key"}
                  </span>
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
          <div className="grid gap-3 xl:grid-cols-[11.25rem_minmax(0,1fr)] xl:items-start">
            <div className="grid auto-rows-max content-start gap-2 sm:grid-cols-2 xl:grid-cols-2">
              {overviewItems.map((item) => (
                <article
                  key={item.label}
                  className="surface-card aspect-square rounded-[0.95rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,246,0.74)] p-2.25"
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="text-xs font-semibold tracking-[0.03em] text-[var(--muted)]">
                      {item.label}
                    </div>
                    <div className="text-[1.55rem] font-semibold leading-none tracking-[-0.06em] text-[var(--accent-deep)] sm:text-[1.7rem]">
                      {typeof item.value === "number" ? item.value : "—"}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <OverviewActivityCard
              snapshot={overviewSnapshot}
              rows={4}
              compact
              className="min-h-[10.5rem] xl:h-[11.25rem]"
            />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">{copy.taskKicker}</p>
              <h2 className="section-title">{copy.taskStatusTitle}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:mt-2">
              <button
                type="button"
                onClick={buildBatchRetryConfirmation}
                disabled={!hasRetriableFailedTasks || isPending}
                className={classNames(
                  !hasRetriableFailedTasks || isPending
                    ? "theme-button-disabled"
                    : "theme-button-secondary"
                )}
              >
                {copy.retryAllFailed}
              </button>
              <button
                type="button"
                onClick={() => setIsQueueHistoryOpen(true)}
                className="theme-button-surface"
              >
                {copy.queueHistory}
              </button>
            </div>
          </div>

          {task ? (
            <div className="grid gap-3">
              <div className="surface-card grid gap-2 rounded-[1.35rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.78)] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  {copy.taskListTitle}
                </div>
                {paginatedTaskList.map((item) => {
                  const isSelected = item.id === task.id;
                  const isFailedItem = isFailedTaskStatus(item.status);
                  const canRetryItem = isFailedItem && retrySourceByTaskId.has(item.id);
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
                    <div
                      key={item.id}
                      className={classNames(
                        "surface-card rounded-[1rem] border transition",
                        isSelected
                          ? "border-[rgba(18,92,95,0.24)] bg-[rgba(18,92,95,0.08)]"
                          : "border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)] hover:border-[rgba(18,92,95,0.16)]"
                      )}
                    >
                      <div className="flex items-start gap-3 px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(item.id)}
                          className="min-w-0 flex-1 grid gap-1 text-left"
                        >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--ink)]">
                            #{item.id} {item.email}
                          </span>
                          <span className="sr-only">{itemTaskStatusLabel}</span>
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

                        <div className="flex shrink-0 items-start gap-2">
                          {isFailedItem ? (
                            <button
                              type="button"
                              onClick={() => buildSingleRetryConfirmation(item)}
                              disabled={!canRetryItem || isPending}
                              className={classNames(
                                "min-w-[3.75rem] rounded-full px-3 py-1.5 text-xs font-semibold",
                                !canRetryItem || isPending
                                  ? "theme-button-disabled"
                                  : "theme-button-secondary"
                              )}
                            >
                              {copy.retryTask}
                            </button>
                          ) : null}
                          <span className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
                            {itemTaskStatusLabel}
                          </span>
                        </div>
                      </div>
                    </div>
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
      <QueueHistoryDialog
        open={isQueueHistoryOpen}
        onClose={() => setIsQueueHistoryOpen(false)}
        copy={copy}
        locale={locale}
        records={enqueueHistory}
        selectedRecordId={selectedQueueHistory?.id ?? null}
        onSelectRecord={setSelectedQueueHistoryId}
        onCopyColumn={handleCopyQueueHistoryColumn}
        copyFeedback={queueHistoryCopyFeedback}
      />
      <RetryConfirmDialog
        open={retryConfirmation !== null}
        confirmation={retryConfirmation}
        copy={copy}
        isPending={isPending}
        selection={retrySelection}
        onClose={() => setRetryConfirmation(null)}
        onToggleItem={handleRetryItemSelectionChange}
        onSelectAll={handleSelectAllRetryItems}
        onClearAll={handleClearRetryItems}
        onConfirm={handleConfirmRetry}
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

function QueueHistoryDialog({
  open,
  onClose,
  copy,
  locale,
  records,
  selectedRecordId,
  onSelectRecord,
  onCopyColumn,
  copyFeedback,
}: {
  open: boolean;
  onClose: () => void;
  copy: ExchangeStudioCopy;
  locale: string;
  records: EnqueueHistoryRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  onCopyColumn: (record: EnqueueHistoryRecord, column: "success" | "failed") => void;
  copyFeedback: EnqueueHistoryCopyFeedback | null;
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
        className="panel modal-panel-enter mx-auto flex h-[calc(100dvh-2rem)] max-h-[56rem] w-full max-w-6xl min-h-0 flex-col overflow-hidden p-4 md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="theme-button-surface"
          >
            {copy.close}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <EnqueueHistoryPanel
            copy={copy}
            locale={locale}
            records={records}
            selectedRecordId={selectedRecordId}
            onSelectRecord={onSelectRecord}
            onCopyColumn={onCopyColumn}
            copyFeedback={copyFeedback}
          />
        </div>
      </div>
    </div>
  );
}

function EnqueueHistoryPanel({
  copy,
  locale,
  records,
  selectedRecordId,
  onSelectRecord,
  onCopyColumn,
  copyFeedback,
}: {
  copy: ExchangeStudioCopy;
  locale: string;
  records: EnqueueHistoryRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  onCopyColumn: (record: EnqueueHistoryRecord, column: "success" | "failed") => void;
  copyFeedback: EnqueueHistoryCopyFeedback | null;
}) {
  const orderedRecords = [...records].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);

    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return right.id.localeCompare(left.id);
    }
    if (Number.isNaN(leftTime)) {
      return 1;
    }
    if (Number.isNaN(rightTime)) {
      return -1;
    }
    return rightTime - leftTime;
  });

  const selectedRecord =
    orderedRecords.find((record) => record.id === selectedRecordId) || orderedRecords[0] || null;

  if (!records.length) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {copy.queueHistory}
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {copy.queueHistoryLocalHint}
          </div>
        </div>
        <div className="empty-panel min-h-[10rem]">{copy.queueHistoryEmpty}</div>
      </div>
    );
  }

  const successItems = selectedRecord
    ? selectedRecord.items.filter((item) => item.task.status === "success")
    : [];
  const failedItems = selectedRecord
    ? selectedRecord.items.filter((item) => isFailedTaskStatus(item.task.status))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {copy.queueHistory}
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {copy.queueHistoryLocalHint}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-[minmax(14rem,0.62fr)_minmax(0,1.38fr)]">
        <div
          className="grid min-h-0 h-full xl:border-r xl:pr-4"
          style={{ borderColor: "var(--surface-border)" }}
        >
          <div className="min-h-0 h-full overflow-y-auto pr-1">
            <div className="grid gap-2">
              {orderedRecords.map((record) => {
                const isSelected = selectedRecord?.id === record.id;
                const recordRunModeLabel =
                  copy.runModeLabels[record.run_mode] || record.run_mode;
                const recordPendingCount = record.items.filter(
                  (item) => item.task.status !== "success" && !isFailedTaskStatus(item.task.status)
                ).length;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => onSelectRecord(record.id)}
                    style={{
                      borderColor: isSelected ? "rgba(18,92,95,0.24)" : "var(--surface-border)",
                    }}
                    className={classNames(
                      "grid gap-0.5 rounded-[0.85rem] border px-3 py-2.5 text-left transition",
                      isSelected
                        ? "bg-[rgba(18,92,95,0.08)]"
                        : "bg-transparent hover:bg-[rgba(18,92,95,0.04)]"
                    )}
                  >
                    <div className="text-sm font-semibold text-[var(--ink)]">
                      {formatDate(record.created_at, locale, copy.emDash)}
                    </div>
                    <div className="text-xs leading-6 text-[var(--muted)]">
                      {copy.queueHistorySummary
                        .replace("{mode}", recordRunModeLabel)
                        .replace("{count}", String(record.items.length))}
                    </div>
                    {recordPendingCount ? (
                      <div className="text-xs leading-6 text-[var(--teal)]">
                        {copy.queueHistoryPendingHint.replace(
                          "{count}",
                          String(recordPendingCount)
                        )}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 gap-3 [grid-template-rows:auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="surface-soft rounded-[1rem] border border-[rgba(18,92,95,0.14)] bg-[rgba(18,92,95,0.08)] px-3.5 py-2.5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
              {copy.queueHistoryCodeInfo}
            </div>
            <div className="mt-1.5 break-all font-mono text-sm leading-6 text-[var(--ink)]">
              {selectedRecord?.cdk_code || copy.unbound}
            </div>
          </div>

          {([
            ["success", copy.queueHistorySuccess, successItems, copy.queueHistoryNoSuccess],
            ["failed", copy.queueHistoryFailed, failedItems, copy.queueHistoryNoFailed],
          ] as const).map(([column, title, items, emptyLabel]) => {
              const copied =
                copyFeedback?.recordId === selectedRecord?.id &&
                copyFeedback.column === column &&
                copyFeedback.status === "copied";
              const copyFailed =
                copyFeedback?.recordId === selectedRecord?.id &&
                copyFeedback.column === column &&
                copyFeedback.status === "failed";

              return (
                <div
                  key={column}
                  className="flex min-h-0 flex-col gap-2 rounded-[1rem] border p-3"
                  style={{ borderColor: "var(--surface-border)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                        {title}
                      </div>
                      <div className="text-sm font-semibold text-[var(--ink)]">
                        {items.length}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedRecord && onCopyColumn(selectedRecord, column)}
                      disabled={!selectedRecord || !items.length}
                      className={classNames(
                        !selectedRecord || !items.length
                          ? "theme-button-disabled"
                          : "theme-button-secondary"
                      )}
                    >
                      {copied ? copy.queueHistoryCopied : copy.queueHistoryCopy}
                    </button>
                  </div>

                  {copyFailed ? (
                    <div className="notice notice-error">{copy.queueHistoryCopyFailed}</div>
                  ) : null}

                  <div
                    className="surface-ghost min-h-0 flex-1 overflow-hidden rounded-[1rem] border px-3.5 pt-1 pb-2"
                    style={{ borderColor: "var(--surface-border-strong)" }}
                  >
                    {items.length ? (
                      <div className="h-full overflow-y-auto">
                        <div className="grid content-start gap-0">
                          {items.map((item, index) => (
                            <div
                              key={`${column}-${item.task_id}`}
                              className={classNames(
                                "text-left",
                                index === 0 ? "pt-1 pb-2" : "py-2 border-t"
                              )}
                              style={index > 0 ? { borderColor: "var(--surface-border)" } : undefined}
                            >
                              <div className="break-all font-mono text-xs leading-6 text-[var(--ink)] whitespace-pre-wrap">
                                {item.raw_account}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-0 items-center justify-center text-center text-[var(--muted)] leading-8">
                        {emptyLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function RetryConfirmDialog({
  open,
  confirmation,
  copy,
  isPending,
  selection,
  onClose,
  onToggleItem,
  onSelectAll,
  onClearAll,
  onConfirm,
}: {
  open: boolean;
  confirmation: RetryConfirmationState | null;
  copy: ExchangeStudioCopy;
  isPending: boolean;
  selection: RetryConfirmationEvaluation;
  onClose: () => void;
  onToggleItem: (taskId: number, selected: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onConfirm: () => void;
}) {
  if (!open || !confirmation) {
    return null;
  }

  const title =
    confirmation.scope === "single" ? copy.retryConfirmTitleSingle : copy.retryConfirmTitleBatch;
  const description =
    confirmation.scope === "single"
      ? copy.retryConfirmDescriptionSingle
      : copy.retryConfirmDescriptionBatch;
  const runModeLabel = selection.plan
    ? copy.runModeLabels[selection.plan.runMode] || selection.plan.runMode
    : copy.emDash;
  const taskLabel =
    confirmation.scope === "single"
      ? selection.plan?.taskLabel || confirmation.items[0]?.taskLabel || null
      : null;
  const canConfirm = Boolean(selection.plan) && !isPending;

  return (
    <div
      className="modal-overlay-enter fixed inset-0 z-[60] overflow-y-auto overscroll-none bg-[rgba(29,34,29,0.48)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel modal-panel-enter mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-5 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-kicker">{copy.detailKicker}</p>
            <h2 className="section-title">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-button-surface"
          >
            {copy.close}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4">
            <div className="text-sm leading-7 text-[var(--muted)]">
              {description}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {taskLabel ? (
                <div className="surface-card rounded-[1.2rem] border p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.retryConfirmTaskLabel}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                    {taskLabel}
                  </div>
                </div>
              ) : null}
              <div className="surface-card rounded-[1.2rem] border p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {copy.retryConfirmFailedCountLabel}
                </div>
                <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                  {confirmation.failedCount}
                </div>
              </div>
              {confirmation.scope === "batch" ? (
                <div className="surface-card rounded-[1.2rem] border p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.retryConfirmSelectedCountLabel}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                    {selection.selectedCount}
                  </div>
                </div>
              ) : null}
              <div className="surface-card rounded-[1.2rem] border p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {copy.retryConfirmModeLabel}
                </div>
                <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                  {runModeLabel}
                </div>
              </div>
              <div className="surface-card rounded-[1.2rem] border p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {copy.retryConfirmCdkLabel}
                </div>
                <div className="mt-2 break-all font-mono text-sm font-semibold text-[var(--ink)]">
                  {selection.plan?.cdkCode || copy.emDash}
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.2rem] border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {copy.retryConfirmSelectionLabel}
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {confirmation.scope === "batch"
                      ? `${selection.selectedCount} / ${selection.selectableCount}`
                      : confirmation.items[0]?.email || copy.emDash}
                  </div>
                </div>

                {confirmation.scope === "batch" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onSelectAll}
                      disabled={isPending || selection.selectableCount === 0}
                      className={classNames(
                        isPending || selection.selectableCount === 0
                          ? "theme-button-disabled"
                          : "theme-button-surface"
                      )}
                    >
                      {copy.retryConfirmSelectAll}
                    </button>
                    <button
                      type="button"
                      onClick={onClearAll}
                      disabled={isPending || selection.selectableCount === 0}
                      className={classNames(
                        isPending || selection.selectableCount === 0
                          ? "theme-button-disabled"
                          : "theme-button-surface"
                      )}
                    >
                      {copy.retryConfirmClearAll}
                    </button>
                  </div>
                ) : null}
              </div>

              {selection.error ? (
                <div className="notice notice-error">{selection.error}</div>
              ) : null}

              <div
                className="surface-ghost rounded-[1rem] border p-2.5"
                style={{ borderColor: "var(--surface-border-strong)" }}
              >
                <div className="grid gap-2">
                  {confirmation.items.map((item) => {
                    const itemHasFailureDetail = Boolean(item.taskError || item.chargeError);
                    return (
                      <label
                        key={item.taskId}
                        className={classNames(
                          "surface-card grid gap-3 rounded-[1rem] border p-3 transition",
                          item.selected && item.selectable
                            ? "border-[rgba(18,92,95,0.28)] bg-[rgba(18,92,95,0.08)]"
                            : "border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)]",
                          item.selectable && !isPending ? "cursor-pointer" : "cursor-default"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {confirmation.scope === "batch" ? (
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={!item.selectable || isPending}
                              onChange={(event) =>
                                onToggleItem(item.taskId, event.target.checked)
                              }
                              className="mt-1 h-4 w-4 accent-[var(--teal)]"
                            />
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-[var(--ink)]">
                                {item.taskLabel}
                              </div>
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
                                {item.taskStatusLabel}
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded-[0.9rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)] p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                  {copy.retryConfirmAccountLabel}
                                </div>
                                <div className="mt-2 break-all font-mono text-xs leading-6 text-[var(--ink)] whitespace-pre-wrap">
                                  {item.rawAccountLine}
                                </div>
                              </div>

                              <div className="rounded-[0.9rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.72)] p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                                  {copy.retryConfirmFailureLabel}
                                </div>
                                <div className="mt-2 grid gap-1.5 text-xs leading-6 text-[#973d2c]">
                                  {item.taskError ? (
                                    <div>
                                      {copy.taskError}
                                      {item.taskError}
                                    </div>
                                  ) : null}
                                  {item.chargeError ? (
                                    <div>
                                      {copy.chargeError}
                                      {item.chargeError}
                                    </div>
                                  ) : null}
                                  {!itemHasFailureDetail ? (
                                    <div className="text-[var(--muted)]">
                                      {item.taskStatusLabel}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {!item.selectable && item.unavailableReason ? (
                              <div className="mt-3 notice notice-error">
                                {copy.retryConfirmUnavailable}
                                {" · "}
                                {item.unavailableReason}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-[rgba(31,35,28,0.08)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={classNames(
              isPending ? "theme-button-disabled" : "theme-button-surface"
            )}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={classNames(
              !canConfirm ? "theme-button-disabled" : "theme-button-primary"
            )}
          >
            {isPending ? copy.working : copy.retryConfirmAction}
          </button>
        </div>
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
