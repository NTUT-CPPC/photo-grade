import { ExifTable } from "../components/ExifTable";
import { ScoreSubmissionFlash } from "../components/ScoreSubmissionFlash";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import type { Mode, PhotoItem } from "../types";

export function HostPage() {
  const gallery = useGallery("host");
  const item = gallery.current;

  return (
    <>
      <TwoPaneShell
        item={item}
        canPrev={gallery.idx > 0}
        canNext={gallery.idx < gallery.items.length - 1}
        bases={gallery.items.map((item) => item.base)}
        onPrev={() => void gallery.navigate(gallery.idx - 1)}
        onNext={() => void gallery.navigate(gallery.idx + 1)}
        onJump={gallery.jumpTo}
      >
        <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />
        <PhotoDetails item={item} mode={gallery.mode} position={gallery.idx + 1} total={gallery.items.length} />
        <ExifTable info={itemInfo(item)} />
        <Status loading={gallery.loading} error={gallery.error} />
      </TwoPaneShell>
      <ScoreSubmissionFlash base={item?.base} />
    </>
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
