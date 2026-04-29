import type { OrderingStatePayload, RuleConfigPayload } from "@photo-grade/shared";
import { Check, Download, GripVertical, Plus, RotateCcw, Save, Shuffle, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  clearMediaData,
  clearScoresData,
  cancelImport,
  confirmImport,
  dryRunImport,
  exportScoresCsv,
  getAdminSheetConfig,
  getActiveImport,
  getImportProgress,
  getJudges,
  getOrdering,
  getRuleConfig,
  saveJudges,
  saveRuleConfig,
  saveAdminSheetConfig,
  setDefaultOrdering
} from "../api/client";
import { onImportProgress, onOrderingChanged } from "../api/socket";
import type {
  AdminClearRequest,
  AdminSheetConfig,
  ImportDryRunResult,
  ImportProgress,
  Judge
} from "../types";

type JudgeDraft = {
  clientId: string;
  id?: string;
  name: string;
};

const IMPORT_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isImportFile(file: File): boolean {
  return /\.(csv|xlsx)$/i.test(file.name);
}

type ActiveBatchMeta = {
  fileName: string;
  createdAt: string;
};

type MaintenanceAction = "clearScores" | "clearMedia";

export function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dryRun, setDryRun] = useState<ImportDryRunResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [activeBatch, setActiveBatch] = useState<ActiveBatchMeta | null>(null);
  const [judges, setJudges] = useState<JudgeDraft[]>([]);
  const [judgeName, setJudgeName] = useState("");
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [draggingJudgeId, setDraggingJudgeId] = useState<string | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRunDialogOpen, setDryRunDialogOpen] = useState(false);
  const [ordering, setOrdering] = useState<OrderingStatePayload | null>(null);
  const [orderingBusy, setOrderingBusy] = useState(false);
  const [orderingNote, setOrderingNote] = useState<string | null>(null);
  const [orderingError, setOrderingError] = useState<string | null>(null);
  const [ruleConfig, setRuleConfigState] = useState<RuleConfigPayload | null>(null);
  const [ruleTopNDraft, setRuleTopNDraft] = useState<string>("");
  const [ruleThresholdAuto, setRuleThresholdAuto] = useState<boolean>(true);
  const [ruleThresholdDraft, setRuleThresholdDraft] = useState<string>("");
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleNote, setRuleNote] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [sheetConfig, setSheetConfig] = useState<AdminSheetConfig | null>(null);
  const [sheetShareLinkDraft, setSheetShareLinkDraft] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceNote, setMaintenanceNote] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<MaintenanceAction | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dryRunAbortRef = useRef<AbortController | null>(null);

  const importId = dryRun?.importId ?? dryRun?.id;
  const dryRunHasErrors = Boolean(dryRun?.errors?.length);
  const canConfirm = Boolean(importId) && !confirmBusy && !dryRunBusy && !cancelBusy && !dryRunHasErrors;
  const total = dryRun?.total ?? dryRun?.items?.length ?? (file ? 1 : 0);
  const isImportActive =
    progress?.status === "running" ||
    (progress?.status === "error" && progress?.workerOnline === false);
  const isImportTerminal =
    Boolean(progress) &&
    (progress?.status === "complete" ||
      progress?.status === "cancelled" ||
      (progress?.status === "error" && progress?.workerOnline !== false));
  const sheetSyncEnabled = sheetConfig?.enabled === true;
  const serviceAccountReady = Boolean(sheetConfig?.serviceAccountEmail);
  const canShowSheetSyncControls = sheetSyncEnabled && serviceAccountReady;

  useEffect(() => {
    return onImportProgress((next) => {
      if (!importId || !next.importId || next.importId === importId) setProgress(next);
    });
  }, [importId]);

  useEffect(() => {
    if (!importId || !progress) return;
    if (progress.phase === "DRY_RUN") return;
    if (progress.status === "complete") return;
    if (progress.status === "cancelled") return;
    if (progress.status === "error" && progress.workerOnline !== false) return;
    const timer = window.setInterval(() => {
      getImportProgress(importId)
        .then(setProgress)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [importId, progress]);

  useEffect(() => {
    void refreshJudges();
  }, []);

  useEffect(() => {
    void hydrateActiveBatch();
    return () => {
      dryRunAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let live = true;
    getOrdering()
      .then((state) => {
        if (live) setOrdering(state);
      })
      .catch(() => undefined);
    const off = onOrderingChanged((state) => {
      if (live) setOrdering(state);
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  useEffect(() => {
    let live = true;
    getRuleConfig()
      .then((config) => {
        if (!live) return;
        setRuleConfigState(config);
        setRuleTopNDraft(String(config.defaultFinalTopN));
        setRuleThresholdAuto(config.defaultSecondaryThreshold === null);
        setRuleThresholdDraft(
          config.defaultSecondaryThreshold === null ? "" : String(config.defaultSecondaryThreshold)
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    getAdminSheetConfig()
      .then((config) => {
        if (!live) return;
        setSheetConfig(config);
        setSheetShareLinkDraft(config.shareLink ?? "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const progressPercent = useMemo(() => {
    if (!progress?.total) return 0;
    return Math.round(((progress.done ?? 0) / progress.total) * 100);
  }, [progress]);

  async function hydrateActiveBatch() {
    try {
      const batch = await getActiveImport();
      if (!batch) return;
      setDryRun({ ...batch.dryRun, importId: batch.id, id: batch.id });
      setActiveBatch({ fileName: batch.fileName, createdAt: batch.createdAt });
      if (batch.status !== "DRY_RUN") {
        const totalFromBatch = batch.totalCount || batch.dryRun.total || 0;
        setProgress({
          importId: batch.id,
          phase: batch.status,
          status:
            batch.status === "COMPLETED"
              ? "complete"
              : batch.status === "FAILED"
                ? "error"
                : "running",
          done: batch.processedCount,
          total: totalFromBatch,
          message: batch.error ?? `${batch.status} ${batch.processedCount}/${totalFromBatch}`
        });
      }
    } catch {
      // 沒有活躍批次或 API 失敗 — 維持空白狀態
    }
  }

  function acceptFile(next: File | null) {
    setError(null);
    setProgress(null);
    setActiveBatch(null);
    setFile(next);
    if (!next) {
      dryRunAbortRef.current?.abort();
      setDryRun(null);
      return;
    }
    if (!isImportFile(next)) {
      setError("請選擇 CSV 或 Excel (.xlsx) 檔案。");
      setDryRun(null);
      return;
    }
    void runDryRun(next);
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) acceptFile(dropped);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  async function refreshJudges() {
    try {
      setJudges((await getJudges()).map(toJudgeDraft));
    } catch {
      setJudges([]);
    }
  }

  async function runDryRun(target: File) {
    dryRunAbortRef.current?.abort();
    const ctrl = new AbortController();
    dryRunAbortRef.current = ctrl;
    setDryRun(null);
    setProgress(null);
    setError(null);
    setDryRunBusy(true);
    try {
      const result = await dryRunImport(target, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setDryRun(result);
      setActiveBatch({ fileName: target.name, createdAt: new Date().toISOString() });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const name = (err as Error)?.name;
      if (name === "AbortError") return;
      setError(err instanceof Error ? err.message : "試跑失敗");
    } finally {
      if (dryRunAbortRef.current === ctrl) {
        dryRunAbortRef.current = null;
        setDryRunBusy(false);
      }
    }
  }

  async function runCancel() {
    if (!importId) return;
    setCancelBusy(true);
    setError(null);
    try {
      await cancelImport(importId);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消失敗");
    } finally {
      setCancelBusy(false);
    }
  }

  async function runConfirm() {
    if (!importId) return;
    setConfirmBusy(true);
    setError(null);
    try {
      const initial = await confirmImport(importId);
      if (initial) setProgress(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認匯入失敗");
    } finally {
      setConfirmBusy(false);
    }
  }

  function resetImport() {
    dryRunAbortRef.current?.abort();
    setFile(null);
    setDryRun(null);
    setProgress(null);
    setActiveBatch(null);
    setError(null);
    setDryRunDialogOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSelectDefaultOrdering(nextDefault: "sequential" | "shuffle") {
    if (orderingBusy) return;
    if (ordering?.defaultMode === nextDefault) return;
    setOrderingBusy(true);
    setOrderingError(null);
    setOrderingNote(null);
    try {
      const next = await setDefaultOrdering({ defaultMode: nextDefault });
      setOrdering(next);
      setOrderingNote(
        nextDefault === "shuffle" ? "已切換為亂序並重新打亂順序" : "已切換為順序排序"
      );
    } catch (err) {
      setOrderingError(err instanceof Error ? err.message : "更新預設排序失敗");
    } finally {
      setOrderingBusy(false);
    }
  }

  async function handleRegenerateShuffle() {
    if (orderingBusy) return;
    setOrderingBusy(true);
    setOrderingError(null);
    setOrderingNote(null);
    try {
      const next = await setDefaultOrdering({ regenerate: true });
      setOrdering(next);
      setOrderingNote("已重新打亂順序");
    } catch (err) {
      setOrderingError(err instanceof Error ? err.message : "重新打亂失敗");
    } finally {
      setOrderingBusy(false);
    }
  }

  async function saveRuleDefaults() {
    setRuleBusy(true);
    setRuleError(null);
    setRuleNote(null);
    try {
      const topN = Number(ruleTopNDraft);
      if (!Number.isInteger(topN) || topN < 1) {
        throw new Error("決評入圍人數需為正整數。");
      }
      let threshold: number | null;
      if (ruleThresholdAuto) {
        threshold = null;
      } else {
        const parsed = Number(ruleThresholdDraft);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("初評通過票數需為正整數。");
        }
        threshold = parsed;
      }
      const next = await saveRuleConfig({
        defaultFinalTopN: topN,
        defaultSecondaryThreshold: threshold
      });
      setRuleConfigState(next);
      setRuleTopNDraft(String(next.defaultFinalTopN));
      setRuleThresholdAuto(next.defaultSecondaryThreshold === null);
      setRuleThresholdDraft(
        next.defaultSecondaryThreshold === null ? "" : String(next.defaultSecondaryThreshold)
      );
      setRuleNote("已儲存預設規則並套用到目前狀態");
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "儲存預設規則失敗");
    } finally {
      setRuleBusy(false);
    }
  }

  async function saveSheetConfig() {
    setSheetBusy(true);
    setSheetError(null);
    setSheetNote(null);
    try {
      const shareLink = sheetShareLinkDraft.trim();
      const next = await saveAdminSheetConfig({ shareLink });
      setSheetConfig(next);
      setSheetShareLinkDraft(next.shareLink ?? shareLink);
      setSheetNote("已儲存 Google Sheet 設定。");
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "儲存 Google Sheet 設定失敗");
    } finally {
      setSheetBusy(false);
    }
  }

  async function exportScoresDownload(tag: "manual" | "clear-scores" | "clear-media"): Promise<string> {
    const { blob, filename } = await exportScoresCsv();
    const effectiveName =
      filename ??
      `photo-grade-scores-${new Date().toISOString().replace(/[:.]/g, "-")}-${tag}.csv`;
    triggerBlobDownload(blob, effectiveName);
    return effectiveName;
  }

  async function handleManualExport() {
    setMaintenanceBusy(true);
    setMaintenanceError(null);
    setMaintenanceNote(null);
    try {
      const fileName = await exportScoresDownload("manual");
      setMaintenanceNote(`已匯出 ${fileName}`);
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : "匯出評分 CSV 失敗");
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function runConfirmedMaintenance(action: MaintenanceAction) {
    setMaintenanceBusy(true);
    setMaintenanceError(null);
    setMaintenanceNote(null);
    try {
      const exportedFileName = await exportScoresDownload(
        action === "clearScores" ? "clear-scores" : "clear-media"
      );
      const payload: AdminClearRequest = {
        requireExport: true,
        exportedAt: new Date().toISOString(),
        exportedFileName
      };
      if (action === "clearScores") {
        await clearScoresData(payload);
        setMaintenanceNote(`已先匯出 ${exportedFileName}，並清除評分資料。`);
      } else {
        await clearMediaData(payload);
        setMaintenanceNote(`已先匯出 ${exportedFileName}，並清除圖片與媒體資料。`);
      }
      setConfirmAction(null);
    } catch (err) {
      setMaintenanceError(
        err instanceof Error
          ? err.message
          : action === "clearScores"
            ? "清除評分資料失敗"
            : "清除圖片資料失敗"
      );
    } finally {
      setMaintenanceBusy(false);
    }
  }

  function addJudgeName() {
    const name = judgeName.trim();
    if (!name) return;
    setError(null);
    setJudges((current) => [...current, { clientId: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`, name }]);
    setJudgeName("");
  }

  function deleteJudgeName(clientId: string) {
    setJudges((current) => current.filter((judge) => judge.clientId !== clientId));
  }

  async function saveJudgeDrafts() {
    const payload = judges.map((judge) => ({ id: judge.id, name: judge.name.trim() }));
    if (payload.some((judge) => !judge.name)) {
      setError("評審名稱不可空白。");
      return;
    }
    setJudgeBusy(true);
    setError(null);
    try {
      setJudges((await saveJudges(payload)).map(toJudgeDraft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存評審失敗");
    } finally {
      setJudgeBusy(false);
    }
  }

  function renameJudge(clientId: string, name: string) {
    setJudges((current) => current.map((judge) => (judge.clientId === clientId ? { ...judge, name } : judge)));
  }

  function moveJudge(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setJudges((current) => {
      const sourceIndex = current.findIndex((judge) => judge.clientId === sourceId);
      const targetIndex = current.findIndex((judge) => judge.clientId === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  return (
    <main className="admin-page">
      <section className="admin-photo-panel">
        <div>
          <span className="mode-banner">管理</span>
          <h1>匯入作品</h1>
          <p>選擇 CSV 或 Excel 檔案，系統會先做試跑檢查欄位後再確認匯入。</p>
        </div>
      </section>
      <section className="admin-controls">
        <section className="admin-block">
          <h2>評審設定</h2>
          <div className="judge-editor">
            <input
              value={judgeName}
              onChange={(event) => setJudgeName(event.target.value)}
              placeholder="新增評審名字"
              aria-label="評審名稱"
            />
            <button type="button" onClick={addJudgeName} disabled={judgeBusy || !judgeName.trim()}>
              <Plus size={16} />
              新增
            </button>
            <button type="button" onClick={() => void saveJudgeDrafts()} disabled={judgeBusy || !judges.length} title="儲存目前評審名單與排序。">
              <Save size={16} />
              儲存
            </button>
          </div>
          <ul className="judge-list">
            {judges.map((judge, index) => (
              <li
                key={judge.clientId}
                draggable={!judgeBusy}
                onDragStart={() => setDraggingJudgeId(judge.clientId)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingJudgeId) moveJudge(draggingJudgeId, judge.clientId);
                  setDraggingJudgeId(null);
                }}
                onDragEnd={() => setDraggingJudgeId(null)}
              >
                <GripVertical size={16} className="drag-handle" aria-hidden="true" />
                <span className="judge-order">{index + 1}</span>
                <input
                  value={judge.name}
                  onChange={(event) => renameJudge(judge.clientId, event.target.value)}
                  aria-label={`評審 ${index + 1} 名稱`}
                />
                <button type="button" onClick={() => deleteJudgeName(judge.clientId)} disabled={judgeBusy || judges.length <= 1} aria-label={`刪除 ${judge.name}`}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
            {!judges.length ? <li className="empty-row">尚無評審資料</li> : null}
          </ul>
        </section>

        <section className="admin-block">
          <h2>預設排序模式</h2>
          <div className="ordering-control">
            <div className="ordering-segmented" role="group" aria-label="預設排序模式">
              <button
                type="button"
                className={`ordering-segmented__btn${ordering?.defaultMode === "sequential" ? " active" : ""}`}
                onClick={() => void handleSelectDefaultOrdering("sequential")}
                disabled={orderingBusy || !ordering}
                aria-pressed={ordering?.defaultMode === "sequential"}
              >
                順序
              </button>
              <button
                type="button"
                className={`ordering-segmented__btn${ordering?.defaultMode === "shuffle" ? " active" : ""}`}
                onClick={() => void handleSelectDefaultOrdering("shuffle")}
                disabled={orderingBusy || !ordering}
                aria-pressed={ordering?.defaultMode === "shuffle"}
              >
                亂序
              </button>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                onClick={() => void handleRegenerateShuffle()}
                disabled={orderingBusy || !ordering || ordering.defaultMode !== "shuffle"}
                title="重新建立亂序順序，所有客戶端會立即套用。"
              >
                <Shuffle size={16} />
                重新打亂
              </button>
            </div>
            <p className="system-note ordering-help">
              亂序時，後端會在切換或按重新打亂時建立新順序；切換到順序時不會清除既有亂序，方便切回。
            </p>
            {orderingNote ? (
              <p className="system-note">
                {orderingNote}
                {ordering?.generatedAt
                  ? `（${formatRelativeTime(ordering.generatedAt)}建立）`
                  : null}
              </p>
            ) : null}
            {orderingError ? <p className="system-note error">{orderingError}</p> : null}
          </div>
        </section>

        <section className="admin-block">
          <h2>評選規則預設值</h2>
          <div className="rule-config-grid">
            <label className="rule-config-row">
              <span>初評通過票數</span>
              <span className="rule-config-input">
                <input
                  type="checkbox"
                  checked={ruleThresholdAuto}
                  onChange={(event) => setRuleThresholdAuto(event.target.checked)}
                  disabled={ruleBusy}
                  aria-label="依評審人數自動過半數"
                />
                <span className="rule-config-input__hint">依評審人數自動過半數</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={ruleThresholdDraft}
                  onChange={(event) => setRuleThresholdDraft(event.target.value)}
                  disabled={ruleBusy || ruleThresholdAuto}
                  placeholder={ruleThresholdAuto ? "自動" : "票"}
                  aria-label="初評通過票數"
                />
              </span>
            </label>
            <label className="rule-config-row">
              <span>決評入圍人數</span>
              <span className="rule-config-input">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={ruleTopNDraft}
                  onChange={(event) => setRuleTopNDraft(event.target.value)}
                  disabled={ruleBusy}
                  aria-label="決評入圍人數"
                />
                <span className="rule-config-input__hint">名</span>
              </span>
            </label>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              onClick={() => void saveRuleDefaults()}
              disabled={ruleBusy || !ruleConfig}
              title="儲存後會套用到目前狀態，並觸發初評通過名單重算。"
            >
              <Save size={16} />
              儲存預設值
            </button>
          </div>
          <p className="system-note ordering-help">
            初評通過票數預設為「依評審人數自動過半數」（例如 3 位評審則 2 票通過）。
            勾掉自動可固定為任一票數。決評入圍人數預設 60，平手仍超額錄取。
            儲存後會清除目前 host 的臨時調整並重新套用。
          </p>
          {ruleNote ? <p className="system-note">{ruleNote}</p> : null}
          {ruleError ? <p className="system-note error">{ruleError}</p> : null}
        </section>

        <section className="admin-block">
          <h2>Google Sheet 同步設定</h2>
          {sheetConfig ? (
            canShowSheetSyncControls ? (
              <>
                <p className="system-note">
                  請把目標試算表分享給以下服務帳號（編輯者）：
                  <strong>{sheetConfig.serviceAccountEmail}</strong>
                </p>
                <label className="field-label">
                  <span>共用連結</span>
                  <input
                    type="url"
                    value={sheetShareLinkDraft}
                    onChange={(event) => setSheetShareLinkDraft(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    disabled={sheetBusy}
                  />
                </label>
                <div className="admin-actions">
                  <button
                    type="button"
                    onClick={() => void saveSheetConfig()}
                    disabled={sheetBusy}
                    title="儲存後會由後端解析 Spreadsheet ID，並在同步時檢查/建立工作表 Header。"
                  >
                    <Save size={16} />
                    {sheetBusy ? "儲存中…" : "儲存設定"}
                  </button>
                </div>
                <div className="sheet-config-status">
                  <p className="system-note">
                    解析 Spreadsheet ID：<strong>{sheetConfig?.spreadsheetId ?? "尚未解析"}</strong>
                  </p>
                  <p className="system-note">
                    工作表：<strong>{sheetConfig?.worksheetTitle ?? "未設定"}</strong>
                  </p>
                  <p className="system-note">
                    Header 檢查：
                    <strong>
                      {sheetConfig?.headerOk
                        ? " 正常"
                        : sheetConfig?.headerAction
                          ? ` ${sheetConfig.headerAction}`
                          : " 待檢查"}
                    </strong>
                  </p>
                  {sheetConfig?.headerMessage ? (
                    <p className="system-note">{sheetConfig.headerMessage}</p>
                  ) : null}
                </div>
                {sheetNote ? <p className="system-note">{sheetNote}</p> : null}
                {sheetError ? <p className="system-note error">{sheetError}</p> : null}
              </>
            ) : (
              <>
                <p className="system-note error">
                  Google Sheet 同步未啟用
                  {!sheetSyncEnabled ? "（GOOGLE_SHEETS_ENABLED=false）" : "（尚未設定 service account 金鑰）"}。
                </p>
                <details className="sheet-setup-guide">
                  <summary>展開設定教學（約 3 分鐘）</summary>
                  <ol>
                    <li>到 Google Cloud 建立專案，啟用 Google Sheets API。</li>
                    <li>建立 Service Account，產生 JSON 金鑰。</li>
                    <li>
                      將金鑰放到 `GOOGLE_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_SERVICE_ACCOUNT_FILE`
                      （例如 `/data/secrets/google-service-account.json`）。
                    </li>
                    <li>設定 `GOOGLE_SHEETS_ENABLED=true` 並重啟 app/worker。</li>
                    <li>把目標試算表分享給服務帳號 email（編輯者）。</li>
                  </ol>
                </details>
              </>
            )
          ) : (
            <p className="system-note">讀取 Google Sheet 設定中…</p>
          )}
        </section>

        <section className="admin-block">
          <h2>匯入範本下載</h2>
          <div className="admin-actions">
            <a className="admin-link-btn" href="/api/admin/import/template.csv" download>
              <Download size={16} />
              CSV 範本
            </a>
            <a className="admin-link-btn" href="/api/admin/import/template.xlsx" download>
              <Download size={16} />
              Excel 範本
            </a>
          </div>
        </section>

        <section className="admin-block">
          <h2>資料維護</h2>
          <div className="admin-actions">
            <button type="button" onClick={() => void handleManualExport()} disabled={maintenanceBusy}>
              <Download size={16} />
              匯出評分 CSV
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("clearScores")}
              disabled={maintenanceBusy}
              title="會先匯出評分 CSV 並下載，成功後才清除評分資料。"
            >
              <Trash2 size={16} />
              清除評分資料
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("clearMedia")}
              disabled={maintenanceBusy}
              title="會先匯出評分 CSV 並下載，成功後才清除圖片資料。"
            >
              <Trash2 size={16} />
              清除圖片資料
            </button>
          </div>
          <p className="system-note ordering-help">
            清除動作會先強制匯出評分 CSV。若匯出或下載失敗，清除流程會中止。
          </p>
          {maintenanceNote ? <p className="system-note">{maintenanceNote}</p> : null}
          {maintenanceError ? <p className="system-note error">{maintenanceError}</p> : null}
        </section>

        <section className="admin-block">
          <h2>作品匯入</h2>
        <p className="system-note">作品連結中的檔案必須是「知道連結的任何人可檢視」才能下載。</p>
        {isImportActive ? null : (
          <>
            <label
              className={`file-drop${dragActive ? " is-drag" : ""}`}
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={22} />
              <span>
                {file
                  ? file.name
                  : activeBatch
                    ? activeBatch.fileName
                    : "選擇或拖曳 CSV / Excel 檔案，選完會自動進行試跑檢查"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMPORT_ACCEPT}
                onChange={selectFile}
              />
            </label>
            {dryRunBusy ? <p className="system-note">試跑檢查中…</p> : null}
            {dryRun ? (
              <DryRunSummary
                result={dryRun}
                total={total}
                onOpen={() => setDryRunDialogOpen(true)}
              />
            ) : null}
            <div className="admin-actions">
              <button
                type="button"
                title={
                  dryRunHasErrors
                    ? "試跑有錯誤，請修正欄位後重新選檔。"
                    : "確認後會清掉所有舊資料並重新下載匯入。"
                }
                onClick={() => void runConfirm()}
                disabled={!canConfirm}
              >
                <Check size={18} />
                {confirmBusy ? "排入佇列中…" : "確認匯入"}
              </button>
              {isImportTerminal ? (
                <button type="button" onClick={resetImport} title="清除目前狀態並開始新的匯入。">
                  <RotateCcw size={18} />
                  開始新的匯入
                </button>
              ) : null}
            </div>
          </>
        )}
        {error ? <p className="system-note error">{error}</p> : null}
        {progress ? (
          <div className="progress-panel">
            {activeBatch ? (
              <p className="progress-meta">
                {activeBatch.fileName} · {formatRelativeTime(activeBatch.createdAt)}
              </p>
            ) : null}
            <div className="progress-head">
              <span>{progress.phase ?? progress.status ?? "匯入"}</span>
              <span>
                {progress.done ?? 0} / {progress.total ?? 0}
                {progress.total ? ` · ${progressPercent}%` : null}
              </span>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            {progress.message ? <p>{progress.message}</p> : null}
            {progress.workerOnline === false ? (
              <p className="system-note error">
                工作處理程序未啟動，匯入工作無法執行。請執行 <code>docker compose up -d worker</code>，啟動後本頁會自動恢復。
              </p>
            ) : null}
            {isImportActive ? (
              <div className="admin-actions">
                <button
                  type="button"
                  onClick={() => void runCancel()}
                  disabled={cancelBusy}
                  title="中斷目前匯入。已下載的檔案會保留，再次按確認匯入會清掉重新下載。"
                >
                  <X size={18} />
                  {cancelBusy ? "取消中…" : "取消匯入"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        </section>
      </section>
      {confirmAction ? (
        <ConfirmMaintenanceDialog
          action={confirmAction}
          busy={maintenanceBusy}
          onCancel={() => {
            if (!maintenanceBusy) setConfirmAction(null);
          }}
          onConfirm={() => void runConfirmedMaintenance(confirmAction)}
        />
      ) : null}
      {dryRun && dryRunDialogOpen ? (
        <DryRunDialog result={dryRun} total={total} onClose={() => setDryRunDialogOpen(false)} />
      ) : null}
    </main>
  );
}

function toJudgeDraft(judge: Judge): JudgeDraft {
  return { clientId: judge.id, id: judge.id, name: judge.name };
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "剛剛";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function ConfirmMaintenanceDialog({
  action,
  busy,
  onCancel,
  onConfirm
}: {
  action: MaintenanceAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const title = action === "clearScores" ? "清除評分資料" : "清除圖片與媒體資料";

  return (
    <div className="score-detail-backdrop" onClick={() => (!busy ? onCancel() : undefined)} role="presentation">
      <div
        className="score-detail"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="score-detail__head">
          <span className="score-detail__title">{title}</span>
          <button type="button" className="score-detail__close" onClick={onCancel} aria-label="關閉" disabled={busy}>
            ×
          </button>
        </header>
        <div className="score-detail__body">
          <p className="system-note">
            這個動作會先匯出並下載評分 CSV。只有在匯出成功後才會繼續清除。
          </p>
        </div>
        <footer className="mode-switch-dialog__footer">
          <button type="button" className="top-nav-mode-btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="button" className="top-nav-mode-btn active" onClick={onConfirm} disabled={busy}>
            {busy ? "執行中…" : "確認並執行"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DryRunSummary({
  result,
  total,
  onOpen
}: {
  result: ImportDryRunResult;
  total: number;
  onOpen: () => void;
}) {
  const errors = result.errors ?? [];
  const warnings = result.warnings ?? [];
  const items = result.items ?? [];
  if (!items.length && !errors.length && !warnings.length && !total) return null;
  return (
    <button
      type="button"
      className="dryrun-summary"
      onClick={onOpen}
      aria-label="開啟試跑結果明細"
      title="點擊查看試跑結果明細"
    >
      <span className="dryrun-summary__chip">
        <span className="dryrun-summary__label">總列數</span>
        <span className="dryrun-summary__value">{total ?? "-"}</span>
      </span>
      <span className="dryrun-summary__sep">·</span>
      <span className="dryrun-summary__chip">
        <span className="dryrun-summary__label">有效</span>
        <span className="dryrun-summary__value">{result.valid ?? "-"}</span>
      </span>
      <span className="dryrun-summary__sep">·</span>
      <span className="dryrun-summary__chip">
        <span className="dryrun-summary__label">警告</span>
        <span className="dryrun-summary__value">{warnings.length}</span>
      </span>
      <span className="dryrun-summary__sep">·</span>
      <span
        className={`dryrun-summary__chip${errors.length ? " dryrun-summary__chip--error" : ""}`}
      >
        <span className="dryrun-summary__label">錯誤</span>
        <span className="dryrun-summary__value">{errors.length}</span>
      </span>
    </button>
  );
}

function DryRunDialog({
  result,
  total,
  onClose
}: {
  result: ImportDryRunResult;
  total: number;
  onClose: () => void;
}) {
  const errors = result.errors ?? [];
  const warnings = result.warnings ?? [];
  const items = result.items ?? [];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="score-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="score-detail score-detail--wide"
        role="dialog"
        aria-modal="true"
        aria-label="試跑結果"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="score-detail__head">
          <span className="score-detail__title">試跑結果</span>
          <button type="button" className="score-detail__close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </header>
        <div className="score-detail__body">
          <div className="import-stats" role="group" aria-label="試跑摘要">
            <span>總列數 {total ?? "-"}</span>
            <span>有效 {result.valid ?? "-"}</span>
            <span>警告 {warnings.length}</span>
            <span>錯誤 {errors.length}</span>
          </div>
          {errors.length ? (
            <MessageList title={`錯誤 (${errors.length})`} severity="error" items={errors} />
          ) : null}
          {warnings.length ? (
            <MessageList title={`警告 (${warnings.length})`} severity="warning" items={warnings} />
          ) : null}
          {items.length ? (
            <div className="dryrun-items">
              <h3>作品列表 ({items.length})</h3>
              <table className="import-table">
                <thead>
                  <tr>
                    <th>代碼</th>
                    <th>名稱</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.base ?? item.name ?? index}`}>
                      <td>{item.base ?? "-"}</td>
                      <td>{item.name ?? "-"}</td>
                      <td>{item.status ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MessageList({ title, severity, items }: { title: string; severity: "warning" | "error"; items: string[] }) {
  return (
    <div className={`message-list message-list--${severity}`}>
      <h3>{title}</h3>
      {items.map((item, index) => (
        <p key={`${index}-${item}`}>{item}</p>
      ))}
    </div>
  );
}
