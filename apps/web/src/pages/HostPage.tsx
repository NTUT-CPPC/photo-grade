import { ExifTable } from "../components/ExifTable";
import { ScoreSubmissionFlash } from "../components/ScoreSubmissionFlash";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import type { Mode, PhotoItem } from "../types";

const MODES: Mode[] = ["initial", "secondary", "final"];

export function HostPage() {
  const gallery = useGallery("host");
  const item = gallery.current;

  return (
    <>
      <TwoPaneShell
        item={item}
        canPrev={gallery.idx > 0}
        canNext={gallery.idx < gallery.items.length - 1}
        onPrev={() => void gallery.navigate(gallery.idx - 1)}
        onNext={() => void gallery.navigate(gallery.idx + 1)}
        onJump={gallery.jumpTo}
      >
        <ModePicker value={gallery.mode} onChange={(mode) => void gallery.changeMode(mode)} />
        <PhotoDetails item={item} mode={gallery.mode} position={gallery.idx + 1} total={gallery.items.length} />
        <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />
        <ExifTable info={itemInfo(item)} />
        <Status loading={gallery.loading} error={gallery.error} />
      </TwoPaneShell>
      <ScoreSubmissionFlash base={item?.base} />
    </>
  );
}

function ModePicker({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="mode-row">
      <select value={value} onChange={(event) => onChange(event.target.value as Mode)} aria-label="Judging mode">
        {MODES.map((mode) => (
          <option key={mode} value={mode}>
            {modeLabel(mode)}
          </option>
        ))}
      </select>
      <span className="mode-banner">模式：{modeLabel(value)}</span>
    </div>
  );
}

function PhotoDetails({
  item,
  mode,
  position,
  total
}: {
  item?: PhotoItem;
  mode: Mode;
  position: number;
  total: number;
}) {
  const concept = item?.json?.concept ?? item?.concept;
  return (
    <header className="photo-details">
      <div className="meta-line">{modeLabel(mode)} · {position}/{total || 0}</div>
      <h1>{concept?.title ?? item?.base ?? "No photo"}</h1>
      <small>{item ? `${item.base}.jpg` : "-"}</small>
      <p>{concept?.description ?? ""}</p>
    </header>
  );
}

function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="system-note">Loading photos...</p>;
  if (error) return <p className="system-note error">{error}</p>;
  return null;
}

function itemInfo(item?: PhotoItem) {
  return item?.json?.info ?? item?.info;
}
