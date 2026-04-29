import { ExifTable } from "../components/ExifTable";
import { ScoreSubmissionFlash } from "../components/ScoreSubmissionFlash";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { isCover, modeLabel, useGallery } from "../state/gallery";
import type { Mode, PhotoItem } from "../types";

export function HostPage() {
  const gallery = useGallery("host");
  const item = gallery.current;
  const onCover = isCover(item);
  const realTotal = Math.max(gallery.items.length - 1, 0);
  const realBases = gallery.items.filter((entry) => !isCover(entry)).map((entry) => entry.base);

  return (
    <>
      <TwoPaneShell
        item={item}
        canPrev={gallery.idx > 0}
        canNext={gallery.idx < gallery.items.length - 1}
        bases={realBases}
        onPrev={() => void gallery.navigate(gallery.idx - 1)}
        onNext={() => void gallery.navigate(gallery.idx + 1)}
        onJump={gallery.jumpTo}
      >
        {onCover ? null : <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />}
        <PhotoDetails
          item={item}
          mode={gallery.mode}
          position={gallery.idx}
          total={realTotal}
          onCover={onCover}
        />
        {onCover ? null : <ExifTable info={itemInfo(item)} />}
        <Status loading={gallery.loading} error={gallery.error} />
      </TwoPaneShell>
      {onCover ? null : <ScoreSubmissionFlash base={item?.base} />}
    </>
  );
}

function PhotoDetails({
  item,
  mode,
  position,
  total,
  onCover
}: {
  item?: PhotoItem;
  mode: Mode;
  position: number;
  total: number;
  onCover: boolean;
}) {
  if (onCover) {
    return (
      <header className="photo-details">
        <div className="meta-line">{modeLabel(mode)} · 開場</div>
        <h1>等待開場 · 第 0 張</h1>
        <small>掃描畫面 QR 碼進入觀看頁</small>
        <p>主持按下 Next 後，將切換到第一張作品。</p>
      </header>
    );
  }
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
