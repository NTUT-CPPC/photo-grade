import { Check, ChevronRight, Download, GripVertical, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { confirmImport, dryRunImport, getImportProgress, getJudges, saveJudges } from "../api/client";
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

export function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dryRun, setDryRun] = useState<ImportDryRunResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [judges, setJudges] = useState<JudgeDraft[]>([]);
  const [judgeName, setJudgeName] = useState("");
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [draggingJudgeId, setDraggingJudgeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importId = dryRun?.importId ?? dryRun?.id;
  const canConfirm = Boolean(importId) && !busy;
  const total = dryRun?.total ?? dryRun?.items?.length ?? (file ? 1 : 0);

  useEffect(() => {
    return onImportProgress((next) => {
      if (!importId || !next.importId || next.importId === importId) setProgress(next);
    });
  }, [importId]);

  useEffect(() => {
    if (!importId) return;
    if (progress?.status === "complete") return;
    if (progress?.status === "error" && progress?.workerOnline !== false) return;
    const timer = window.setInterval(() => {
      getImportProgress(importId)
        .then(setProgress)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [importId, progress?.status, progress?.workerOnline]);

  useEffect(() => {
    void refreshJudges();
  }, []);

  const progressPercent = useMemo(() => {
    if (!progress?.total) return 0;
    return Math.round(((progress.done ?? 0) / progress.total) * 100);
  }, [progress]);

  function acceptFile(next: File | null) {
    setFile(next);
    setDryRun(null);
    setProgress(null);
    setError(next && !isImportFile(next) ? "請選擇 CSV 或 Excel (.xlsx) 檔案。" : null);
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

  async function runDryRun() {
    if (!file) return;
    if (!isImportFile(file)) {
      setError("請選擇 CSV 或 Excel (.xlsx) 檔案。");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const form = new FormData();
      form.set("dryRun", "true");
      form.append("files", file, file.name);
      setDryRun(await dryRunImport(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import dry-run failed");
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!importId) return;
    setBusy(true);
    setError(null);
    try {
      const initial = await confirmImport(importId);
      if (initial) setProgress(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import confirm failed");
    } finally {
      setBusy(false);
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
      setError(err instanceof Error ? err.message : "Save judges failed");
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
          <span className="mode-banner">Admin</span>
          <h1>Import photos</h1>
          <p>選擇 CSV 或 Excel 檔案，先 dry-run 檢查欄位後再確認匯入。</p>
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
              aria-label="Judge name"
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
        <label
          className={`file-drop${dragActive ? " is-drag" : ""}`}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload size={22} />
          <span>{file ? file.name : "選擇或拖曳 CSV / Excel 檔案"}</span>
          <input type="file" accept={IMPORT_ACCEPT} onChange={selectFile} />
        </label>
        <div className="admin-actions">
          <button
            type="button"
            title="先檢查欄位與資料格式，不會真正下載檔案或寫入作品。"
            onClick={() => void runDryRun()}
            disabled={busy || !file}
          >
            <RefreshCw size={18} />
            Dry run
          </button>
          <button
            type="button"
            title="確認後才會開始背景匯入：下載作品、產生縮圖與 metadata。"
            onClick={() => void runConfirm()}
            disabled={!canConfirm}
          >
            <Check size={18} />
            Confirm
          </button>
        </div>
        {error ? <p className="system-note error">{error}</p> : null}
        {dryRun ? <DryRunResult result={dryRun} total={total} /> : null}
        {progress ? (
          <div className="progress-panel">
            <div className="progress-head">
              <span>{progress.phase ?? progress.status ?? "Import"}</span>
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
                Worker 容器沒在跑，匯入工作不會被處理。請執行 <code>docker compose up -d worker</code>，啟動後本頁會自動恢復。
              </p>
            ) : null}
          </div>
        ) : null}
        </section>
      </section>
    </main>
  );
}

function toJudgeDraft(judge: Judge): JudgeDraft {
  return { clientId: judge.id, id: judge.id, name: judge.name };
}

function DryRunResult({ result, total }: { result: ImportDryRunResult; total: number }) {
  return (
    <div className="dryrun-panel">
      <h2>Dry-run result</h2>
      {result.errors?.length ? <MessageList title="Errors" items={result.errors} /> : null}
      <details className="dryrun-details">
        <summary className="import-stats">
          <ChevronRight size={16} className="dryrun-chevron" aria-hidden="true" />
          <span>Total {total ?? "-"}</span>
          <span>Valid {result.valid ?? "-"}</span>
          <span>Warnings {result.warnings?.length ?? 0}</span>
          <span>Errors {result.errors?.length ?? 0}</span>
        </summary>
        {result.warnings?.length ? <MessageList title="Warnings" items={result.warnings} /> : null}
        {result.items?.length ? (
          <table className="import-table">
            <tbody>
              {result.items.slice(0, 80).map((item, index) => (
                <tr key={`${item.base ?? item.name ?? index}`}>
                  <td>{item.base ?? item.name ?? "-"}</td>
                  <td>{item.status ?? "-"}</td>
                  <td>{item.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </div>
  );
}

function MessageList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="message-list">
      <h3>{title}</h3>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}
