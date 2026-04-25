import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { FormEvent, useState } from "react";

type Props = {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRotate: () => void;
  onJump: (base: string) => void;
};

export function NavControls({ canPrev, canNext, onPrev, onNext, onRotate, onJump }: Props) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onJump(value);
    setValue("");
  }

  return (
    <form className="nav-controls" onSubmit={submit}>
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous photo">
        <ChevronLeft size={22} />
      </button>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="跳轉"
        aria-label="Jump to work number"
      />
      <button type="button" onClick={onRotate} aria-label="Rotate photo">
        <RotateCw size={20} />
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next photo">
        <ChevronRight size={22} />
      </button>
    </form>
  );
}
