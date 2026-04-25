import { ReactNode, useState } from "react";
import { NavControls } from "./NavControls";
import { PhotoPane } from "./PhotoPane";
import type { PhotoItem } from "../types";

type Props = {
  item?: PhotoItem;
  photoQuality?: "high" | "mini";
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJump: (base: string) => void;
  children: ReactNode;
};

export function TwoPaneShell({
  item,
  photoQuality = "high",
  canPrev,
  canNext,
  onPrev,
  onNext,
  onJump,
  children
}: Props) {
  const [rotation, setRotation] = useState(0);

  return (
    <main className="two-pane-shell">
      <PhotoPane item={item} rotation={rotation} quality={photoQuality} />
      <section className="info-pane">
        <div className="info-scroll">{children}</div>
        <NavControls
          canPrev={canPrev}
          canNext={canNext}
          onPrev={onPrev}
          onNext={onNext}
          onJump={onJump}
          onRotate={() => setRotation((value) => (value + 90) % 360)}
        />
      </section>
    </main>
  );
}
