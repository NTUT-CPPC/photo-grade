import { Check, Download, GripVertical, Plus, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelImport,
  confirmImport,
  dryRunImport,
  getActiveImport,
  getImportProgress,
  getJudges,
  saveJudges
} from "../api/client";
import { onImportProgress } from "../api/socket";
import type { ImportDryRunResult, ImportProgress, Judge } from "../types";

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
          <h2>作品匯入</h2>
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
