import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIdx, getItems, getMode, getSheetRecords, setIdx, setMode } from "../api/client";
import { emitIdx, emitMode, onSyncState } from "../api/socket";
import type { Mode, PhotoItem, SheetRecord } from "../types";

const MODE_LABELS: Record<Mode, string> = {
  initial: "初評",
  secondary: "複評",
  final: "決評"
};

function parseBase(base: string) {
  const match = /^(\d+)(.*)$/.exec(base);
  if (!match) return { num: NaN, suffix: base };
  return { num: Number(match[1]), suffix: match[2] ?? "" };
}

export function sortItems(items: PhotoItem[]) {
  return [...items].sort((a, b) => {
    const aa = parseBase(a.base);
    const bb = parseBase(b.base);
    if (aa.suffix !== bb.suffix) return aa.suffix.localeCompare(bb.suffix);
    if (Number.isFinite(aa.num) && Number.isFinite(bb.num)) return aa.num - bb.num;
    return a.base.localeCompare(b.base);
  });
}

function truthy(value: unknown) {
  return ["1", "TRUE", "YES", "Y", "通過"].includes(String(value ?? "").trim().toUpperCase());
}

function recordBase(record: SheetRecord) {
  return String(record["作品編號"] ?? record.base ?? record.id ?? "").trim();
}

function secondaryPass(record: SheetRecord) {
  return truthy(record["初評通過"]) || truthy(record["複評通過"]) || truthy(record.secondary);
}

function finalScore(record: SheetRecord) {
  return Number(record["複評總分"] ?? record.secondaryTotal ?? record.score ?? 0) || 0;
}

function filterByMode(items: PhotoItem[], rows: SheetRecord[], mode: Mode) {
  if (!rows.length) return items;

  if (mode === "initial") {
    const allowed = new Set(rows.map(recordBase).filter(Boolean));
    return items.filter((item) => allowed.has(item.base));
  }

  if (mode === "secondary") {
    const allowed = new Set(rows.filter(secondaryPass).map(recordBase).filter(Boolean));
    return items.filter((item) => allowed.has(item.base));
  }

  const ranked = [...rows].sort((a, b) => finalScore(b) - finalScore(a));
  const allowed = new Set<string>();
  let last: number | null = null;
  for (const row of ranked) {
    const score = finalScore(row);
    if (allowed.size < 30 || score === last) {
      const base = recordBase(row);
      if (base) allowed.add(base);
      last = score;
      continue;
    }
    break;
  }
  return items.filter((item) => allowed.has(item.base));
}

export function modeLabel(mode: Mode) {
  return MODE_LABELS[mode];
}

export function useGallery(role: "host" | "score" | "view") {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [rows, setRows] = useState<SheetRecord[]>([]);
  const [idx, setLocalIdx] = useState(0);
  const [mode, setLocalMode] = useState<Mode>("initial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedItems = useMemo(() => sortItems(items), [items]);
  const visibleItems = useMemo(() => {
    const filtered = filterByMode(sortedItems, rows, mode);
    return filtered.length ? filtered : sortedItems;
  }, [mode, rows, sortedItems]);

  const current = visibleItems[Math.max(0, Math.min(idx, visibleItems.length - 1))];
  const realIdx = current ? sortedItems.findIndex((item) => item.base === current.base) : 0;

  const lastModeRef = useRef<Mode>(mode);
  useEffect(() => {
    lastModeRef.current = mode;
  }, [mode]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextItems, nextRows, nextIdx, nextMode] = await Promise.all([
        getItems(),
        getSheetRecords().catch(() => []),
        getIdx().catch(() => 0),
        getMode().catch(() => "initial" as Mode)
      ]);
      const ordered = sortItems(nextItems);
      setItems(ordered);
      setRows(nextRows);
      setLocalMode(nextMode);
      const remoteBase = ordered[nextIdx]?.base;
      const filtered = filterByMode(ordered, nextRows, nextMode);
      const local = filtered.findIndex((item) => item.base === remoteBase);
      setLocalIdx(local >= 0 ? local : Math.min(nextIdx, Math.max(filtered.length - 1, 0)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load gallery");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return onSyncState((state) => {
      if (state.mode && state.mode !== lastModeRef.current) {
        lastModeRef.current = state.mode;
        setLocalMode(state.mode);
        setLocalIdx(0);
        return;
      }

      if (state.idx == null && !state.base) return;
      setLocalIdx((currentIdx) => {
        const base = state.base ?? sortedItems[state.idx ?? 0]?.base;
        const next = visibleItems.findIndex((item) => item.base === base);
        return next >= 0 ? next : currentIdx;
      });
    });
  }, [sortedItems, visibleItems]);

  const navigate = useCallback(
    async (nextIdx: number) => {
      const bounded = Math.max(0, Math.min(nextIdx, Math.max(visibleItems.length - 1, 0)));
      setLocalIdx(bounded);
      if (role === "host") {
        const item = visibleItems[bounded];
        const absoluteIdx = item ? sortedItems.findIndex((candidate) => candidate.base === item.base) : bounded;
        emitIdx(absoluteIdx, item?.base);
        await setIdx(absoluteIdx).catch(() => undefined);
      }
    },
    [role, sortedItems, visibleItems]
  );

  const jumpTo = useCallback(
    (base: string) => {
      const target = visibleItems.findIndex((item) => item.base === base.trim());
      if (target >= 0) void navigate(target);
    },
    [navigate, visibleItems]
  );

  const changeMode = useCallback(
    async (nextMode: Mode) => {
      setLocalMode(nextMode);
      setLocalIdx(0);
      if (role === "host") {
        emitMode(nextMode);
        await setMode(nextMode).catch(() => undefined);
      }
    },
    [role]
  );

  return {
    current,
    error,
    idx,
    items: visibleItems,
    loading,
    mode,
    realIdx,
    refresh,
    navigate,
    jumpTo,
    changeMode
  };
}
