import { Check, Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { confirmImport, createJudge, dryRunImport, getImportProgress, getJudges, removeJudge } from "../api/client";
import { onImportProgress } from "../api/socket";
import type { ImportDryRunResult, ImportProgress, Judge } from "../types";

export function AdminPage() {
  const [sourcePath, setSourcePath] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dryRun, setDryRun] = useState<ImportDryRunResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [judgeName, setJudgeName] = useState("");
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importId = dryRun?.importId ?? dryRun?.id;
  const canConfirm = Boolean(importId) && !busy;
  const total = dryRun?.total ?? dryRun?.items?.length ?? files.length;

  useEffect(() => {
    return onImportProgress((next) => {
      if (!importId || !next.importId || next.importId === importId) setProgress(next);
    });
  }, [importId]);

  useEffect(() => {
    if (!importId || progress?.status === "complete" || progress?.status === "error") return;
    const timer = window.setInterval(() => {
      getImportProgress(importId)
        .then(setProgress)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [importId, progress?.status]);

  useEffect(() => {
    void refreshJudges();
  }, []);

  const progressPercent = useMemo(() => {
    if (!progress?.total) return 0;
    return Math.round(((progress.done ?? 0) / progress.total) * 100);
  }, [progress]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
    setDryRun(null);
    setProgress(null);
    setError(null);
  }

  async function refreshJudges() {
    try {
      setJudges(await getJudges());
    } catch {
      setJudges([]);
    }
  }

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const form = new FormData();
      form.set("sourcePath", sourcePath);
      form.set("dryRun", "true");
      files.forEach((file) => form.append("files", file, file.webkitRelativePath || file.name));
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

  async function addJudgeName() {
    const name = judgeName.trim();
    if (!name) return;
    setJudgeBusy(true);
    setError(null);
    try {
      await createJudge(name);
      setJudgeName("");
      await refreshJudges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create judge failed");
    } finally {
      setJudgeBusy(false);
    }
  }

  async function deleteJudgeName(judgeId: string) {
    setJudgeBusy(true);
    setError(null);
    try {
      await removeJudge(judgeId);
      await refreshJudges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete judge failed");
    } finally {
      setJudgeBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-photo-panel">
        <div>
          <span className="mode-banner">Admin</span>
          <h1>Import photos</h1>
          <p>Dry-run the selected folder, review warnings, then confirm the import.</p>
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
            <button type="button" onClick={() => void addJudgeName()} disabled={judgeBusy || !judgeName.trim()}>
              <Plus size={16} />
              新增
            </button>
          </div>
          <ul className="judge-list">
            {judges.map((judge) => (
              <li key={judge.id}>
                <span>{judge.name}</span>
                <button type="button" onClick={() => void deleteJudgeName(judge.id)} disabled={judgeBusy} aria-label={`刪除 ${judge.name}`}>
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
        <label className="field-label">
          Source path
          <input value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="Optional server path" />
        </label>
        <label className="file-drop">
          <Upload size={22} />
          <span>{files.length ? `${files.length} files selected` : "Select folder or files"}</span>
          <input type="file" multiple onChange={selectFiles} {...{ webkitdirectory: "" }} />
        </label>
        <div className="admin-actions">
          <button
            type="button"
            title="先檢查欄位與資料格式，不會真正下載檔案或寫入作品。"
            onClick={() => void runDryRun()}
            disabled={busy || (!files.length && !sourcePath)}
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
              <span>{progressPercent}%</span>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <p>{progress.message ?? `${progress.done ?? 0}/${progress.total ?? 0}`}</p>
          </div>
        ) : null}
        </section>
      </section>
    </main>
  );
}

function DryRunResult({ result, total }: { result: ImportDryRunResult; total: number }) {
  return (
    <div className="dryrun-panel">
      <h2>Dry-run result</h2>
      <div className="import-stats">
        <span>Total {total ?? "-"}</span>
        <span>Valid {result.valid ?? "-"}</span>
        <span>Warnings {result.warnings?.length ?? 0}</span>
        <span>Errors {result.errors?.length ?? 0}</span>
      </div>
      {result.warnings?.length ? <MessageList title="Warnings" items={result.warnings} /> : null}
      {result.errors?.length ? <MessageList title="Errors" items={result.errors} /> : null}
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
