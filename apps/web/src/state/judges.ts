import { useEffect, useState } from "react";
import { getJudges } from "../api/client";
import type { Judge } from "../types";

let cache: Judge[] | null = null;
let inflight: Promise<Judge[]> | null = null;
const subscribers = new Set<(value: Judge[]) => void>();

function loadJudges(): Promise<Judge[]> {
  if (inflight) return inflight;
  inflight = getJudges()
    .then((next) => {
      cache = next;
      for (const fn of subscribers) fn(next);
      return next;
    })
    .catch(() => {
      cache = [];
      for (const fn of subscribers) fn([]);
      return [] as Judge[];
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useJudges(): Judge[] | null {
  const [value, setValue] = useState<Judge[] | null>(cache);

  useEffect(() => {
    if (cache !== null) {
      setValue(cache);
      return;
    }
    let live = true;
    const onUpdate = (next: Judge[]) => {
      if (live) setValue(next);
    };
    subscribers.add(onUpdate);
    void loadJudges();
    return () => {
      live = false;
      subscribers.delete(onUpdate);
    };
  }, []);

  return value;
}
