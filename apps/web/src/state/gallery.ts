import type { OrderingMode } from "@photo-grade/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getIdx,
  getItems,
  getMode,
  getOrdering,
  getSheetRecords,
  setIdx,
  setMode
} from "../api/client";
import { emitIdx, emitMode, onOrderingChanged, onSyncState } from "../api/socket";
import type { Mode, PhotoItem, SheetRecord } from "../types";

const MODE_LABELS: Record<Mode, string> = {
  initial: "初評",
  secondary: "複評",
  final: "決評"
};

export const COVER_BASE = "__cover__";

export function makeCoverItem(): PhotoItem {
  return { base: COVER_BASE };
}

export function isCover(item?: PhotoItem | null): boolean {
  return item?.base === COVER_BASE;
}

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

function orderItems(items: PhotoItem[], orderingMode: OrderingMode, shuffleOrder: string[]) {
  if (orderingMode !== "shuffle" || shuffleOrder.length === 0) {
    return sortItems(items);
  }
  const positions = new Map<string, number>();
  shuffleOrder.forEach((code, index) => {
    positions.set(code, index);
  });
  const known: PhotoItem[] = [];
  const unknown: PhotoItem[] = [];
  for (const item of items) {
    if (positions.has(item.base)) known.push(item);
    else unknown.push(item);
  }
  known.sort((a, b) => (positions.get(a.base)! - positions.get(b.base)!));
  return [...known, ...sortItems(unknown)];
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
  const [orderingMode, setOrderingMode] = useState<OrderingMode>("sequential");
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedItems = useMemo(
    () => orderItems(items, orderingMode, shuffleOrder),
    [items, orderingMode, shuffleOrder]
  );
  const coverItem = useMemo(() => makeCoverItem(), []);
  const visibleItems = useMemo(() => {
    const filtered = filterByMode(sortedItems, rows, mode);
    const realVisible = filtered.length ? filtered : sortedItems;
    return [coverItem, ...realVisible];
  }, [coverItem, mode, rows, sortedItems]);

  const current = visibleItems[Math.max(0, Math.min(idx, visibleItems.length - 1))];
  const realIdx = current && !isCover(current)
    ? sortedItems.findIndex((item) => item.base === current.base)
    : -1;

  const lastModeRef = useRef<Mode>(mode);
  useEffect(() => {
    lastModeRef.current = mode;
  }, [mode]);

  const refreshOrdering = useCallback(async () => {
    try {
      const state = await getOrdering();
      setOrderingMode(state.activeMode);
      setShuffleOrder(state.shuffleOrder);
    } catch {
      // ignore — keep current ordering
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextItems, nextRows, nextIdx, nextMode, nextOrdering] = await Promise.all([
        getItems(),
        getSheetRecords().catch(() => []),
        getIdx().catch(() => 0),
        getMode().catch(() => "initial" as Mode),
        getOrdering().catch(() => null)
      ]);
      const activeOrdering: OrderingMode = nextOrdering?.activeMode ?? "sequential";
      const nextShuffle = nextOrdering?.shuffleOrder ?? [];
      const ordered = orderItems(nextItems, activeOrdering, nextShuffle);
      setItems(nextItems);
      setOrderingMode(activeOrdering);
      setShuffleOrder(nextShuffle);
      setRows(nextRows);
      setLocalMode(nextMode);
      // New idx convention (with cover prepended):
      //   nextIdx === 0 → cover; nextIdx >= 1 → ordered[nextIdx - 1] in real list.
      const remoteBase = nextIdx >= 1 ? ordered[nextIdx - 1]?.base : undefined;
      const filteredReal = filterByMode(ordered, nextRows, nextMode);
      const visibleReal = filteredReal.length ? filteredReal : ordered;
      if (nextIdx <= 0 || !remoteBase) {
        setLocalIdx(0);
      } else {
        const localReal = visibleReal.findIndex((item) => item.base === remoteBase);
        if (localReal >= 0) {
          setLocalIdx(localReal + 1);
        } else {
          // Fallback: clamp into the visible list (which includes cover at index 0).
          const visibleLength = 1 + visibleReal.length;
          setLocalIdx(Math.min(nextIdx, Math.max(visibleLength - 1, 0)));
        }
      }
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
    return onOrderingChanged((state) => {
      setOrderingMode(state.activeMode);
      setShuffleOrder(state.shuffleOrder);
    });
  }, []);

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
        // Cover: idx === 0 with no base → cover item (visible idx 0).
        if ((state.idx ?? -1) === 0 && !state.base) return 0;
        // Resolve target real-item base from explicit base, or from absolute idx
        // under the new convention (idx 0 = cover, idx 1 = sortedItems[0]).
        let base = state.base;
        if (!base && state.idx != null && state.idx >= 1) {
          base = sortedItems[state.idx - 1]?.base;
        }
        if (!base) return currentIdx;
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
        if (!item || isCover(item)) {
          // Cover lives at absolute idx 0 with no base — server stores opaque integer.
          emitIdx(0, undefined);
          await setIdx(0).catch(() => undefined);
          return;
        }
        const realPos = sortedItems.findIndex((candidate) => candidate.base === item.base);
        const absoluteIdx = realPos >= 0 ? realPos + 1 : bounded;
        emitIdx(absoluteIdx, item.base);
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
    orderingMode,
    realIdx,
    refresh,
    refreshOrdering,
    navigate,
    jumpTo,
    changeMode
  };
}
