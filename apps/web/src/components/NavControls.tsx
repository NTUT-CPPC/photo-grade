import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  canPrev: boolean;
  canNext: boolean;
  bases: string[];
  onPrev: () => void;
  onNext: () => void;
  onRotate: () => void;
  onJump: (base: string) => void;
};

const MAX_SUGGESTIONS = 8;

export function NavControls({ canPrev, canNext, bases, onPrev, onNext, onRotate, onJump }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return bases.filter((base) => base.startsWith(trimmed)).slice(0, MAX_SUGGESTIONS);
  }, [bases, value]);

  useEffect(() => {
    setActive(0);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function commit(target: string) {
    onJump(target);
    setValue("");
    setOpen(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const target = matches[active] ?? matches[0] ?? trimmed;
    commit(target);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((idx) => (idx + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((idx) => (idx - 1 + matches.length) % matches.length);
    }
  }

  return (
    <form className="nav-controls" onSubmit={submit}>
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous photo">
        <ChevronLeft size={22} />
      </button>
      <div className="nav-jump" ref={wrapRef}>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="跳轉"
          aria-label="Jump to work number"
          autoComplete="off"
        />
        {open && matches.length ? (
          <ul className="nav-jump-suggestions" role="listbox">
            {matches.map((base, index) => (
              <li key={base}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "active" : undefined}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(base);
                  }}
                >
                  {base}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="button" onClick={onRotate} aria-label="Rotate photo">
        <RotateCw size={20} />
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next photo">
        <ChevronRight size={22} />
      </button>
    </form>
  );
}
