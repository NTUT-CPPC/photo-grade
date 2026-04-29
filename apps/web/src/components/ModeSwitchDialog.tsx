import type { ModePreviewResult } from "@photo-grade/shared";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { modeLabel } from "../state/gallery";
import type { Mode } from "../types";

type Props = {
  fromMode: Mode;
  toMode: Mode;
  preview: ModePreviewResult | null;
  loading: boolean;
  error: string | null;
  topN: number | null;
  onTopNChange: (topN: number | null) => void;
  onRefresh: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ModeSwitchDialog({
  fromMode,
  toMode,
  preview,
  loading,
  error,
  topN,
  onTopNChange,
  onRefresh,
  onConfirm,
  onCancel
}: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleTopNInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") {
      onTopNChange(null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next) || !Number.isInteger(next) || next < 1) return;
    onTopNChange(next);
  };

  return createPortal(
    <div className="score-detail-backdrop" onClick={onCancel} role="presentation">
      <div
        className="score-detail mode-switch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="切換評審模式"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="score-detail__head">
          <span className="score-detail__title">切換到 {modeLabel(toMode)}</span>
          <span className="score-detail__base">由 {modeLabel(fromMode)} 切換</span>
          <button type="button" className="score-detail__close" onClick={onCancel} aria-label="取消">
            ×
          </button>
        </header>
        <div className="score-detail__body">
          {loading && !preview ? (
            <p className="score-detail__empty">計算中...</p>
          ) : (
            <PreviewBody
              toMode={toMode}
              preview={preview}
              topN={topN}
              onTopNInput={handleTopNInput}
              onRefresh={onRefresh}
              loading={loading}
            />
          )}
          {error ? <p className="mode-switch-dialog__error">{error}</p> : null}
        </div>
        <footer className="mode-switch-dialog__footer">
          <button
            type="button"
            className="top-nav-mode-btn"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="top-nav-mode-btn active"
            onClick={onConfirm}
            disabled={loading || !preview}
          >
            確認切換
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function PreviewBody({
  toMode,
  preview,
  topN,
  onTopNInput,
  onRefresh,
  loading
}: {
  toMode: Mode;
  preview: ModePreviewResult | null;
  topN: number | null;
  onTopNInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  if (!preview) {
    return <p className="score-detail__empty">尚無預覽資料</p>;
  }

  if (toMode === "initial") {
    return (
      <div className="mode-switch-dialog__row">
        <p>
          共 <strong>{preview.count}</strong> 件作品（初評不做篩選）。
        </p>
      </div>
    );
  }

  if (toMode === "secondary") {
    const threshold = preview.initialThreshold;
    const judgeCount = preview.judgeCount;
    return (
      <div className="mode-switch-dialog__row">
        <p>
          共 <strong>{preview.count}</strong> 件通過初評、進入複評。
        </p>
        {threshold && judgeCount ? (
          <p className="mode-switch-dialog__hint">
            初評通過門檻：{threshold}/{judgeCount} 票（過半數）
          </p>
        ) : null}
      </div>
    );
  }

  // final
  return (
    <div className="mode-switch-dialog__row">
      <p>
        預計 <strong>{preview.count}</strong> 件進入決評（前 {preview.baseCount} 名
        {preview.overflow > 0 ? ` + 同分超額 ${preview.overflow} 件` : ""}）
      </p>
      <div className="mode-switch-dialog__topn">
        <label htmlFor="mode-switch-topn">篩選名次</label>
        <input
          id="mode-switch-topn"
          type="number"
          min={1}
          step={1}
          value={topN ?? ""}
          onChange={onTopNInput}
          disabled={loading}
        />
        <button
          type="button"
          className="top-nav-mode-btn"
          onClick={onRefresh}
          disabled={loading || topN === null}
        >
          重新計算
        </button>
      </div>
      <p className="mode-switch-dialog__hint">臨時調整不會覆寫 Admin 預設值（{preview.defaultTopN}）</p>
    </div>
  );
}
