import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavControls } from "./NavControls";
import { PhotoPane } from "./PhotoPane";
import type { PhotoItem } from "../types";

type Props = {
  item?: PhotoItem;
  photoQuality?: "high" | "mini";
  canPrev: boolean;
  canNext: boolean;
  bases: string[];
  onPrev: () => void;
  onNext: () => void;
  onJump: (base: string) => void;
  children: ReactNode;
  footer?: ReactNode;
  compactPhoto?: boolean;
};

export function TwoPaneShell({
  item,
  photoQuality = "high",
  canPrev,
  canNext,
  bases,
  onPrev,
  onNext,
  onJump,
  children,
  footer,
  compactPhoto = false
}: Props) {
  const [rotation, setRotation] = useState(0);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  useLayoutEffect(() => {
    const node = footerRef.current;
    if (!footer || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setFooterHeight(node.offsetHeight);
    });
    observer.observe(node);
    setFooterHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, [footer]);

  useEffect(() => {
    if (!footer) setFooterHeight(0);
  }, [footer]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (event.key === "ArrowLeft") {
        if (!canPrev) return;
        event.preventDefault();
        onPrev();
      } else {
        if (!canNext) return;
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canPrev, canNext, onPrev, onNext]);

  const shellClass = `two-pane-shell${compactPhoto ? " two-pane-shell--compact-photo" : ""}`;
  const paneClass = `info-pane${footer ? " info-pane--with-footer" : ""}`;
  const paneStyle = footer
    ? ({ "--info-footer-height": `${footerHeight}px` } as React.CSSProperties)
    : undefined;

  return (
    <main className={shellClass}>
      <PhotoPane item={item} rotation={rotation} quality={photoQuality} />
      <section className={paneClass} style={paneStyle}>
        <div className="info-scroll">{children}</div>
        {footer ? (
          <div className="info-footer" ref={footerRef}>
            {footer}
          </div>
        ) : null}
        <NavControls
          canPrev={canPrev}
          canNext={canNext}
          bases={bases}
          onPrev={onPrev}
          onNext={onNext}
          onJump={onJump}
          onRotate={() => setRotation((value) => (value + 90) % 360)}
        />
      </section>
    </main>
  );
}
