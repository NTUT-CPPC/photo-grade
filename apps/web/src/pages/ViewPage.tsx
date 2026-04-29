import { ExifTable } from "../components/ExifTable";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { isCover, modeLabel, useGallery } from "../state/gallery";

export function ViewPage() {
  const gallery = useGallery("view");
  const item = gallery.current;
  const onCover = isCover(item);
  const concept = item?.json?.concept ?? item?.concept;
  const realTotal = Math.max(gallery.items.length - 1, 0);
  const realBases = gallery.items.filter((entry) => !isCover(entry)).map((entry) => entry.base);

  return (
    <TwoPaneShell
      item={item}
      photoQuality="mini"
      canPrev={gallery.idx > 0}
      canNext={gallery.idx < gallery.items.length - 1}
      bases={realBases}
      onPrev={() => void gallery.navigate(gallery.idx - 1)}
      onNext={() => void gallery.navigate(gallery.idx + 1)}
      onJump={gallery.jumpTo}
    >
      {onCover ? null : <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />}
      {onCover ? (
        <header className="photo-details">
          <div className="meta-line">{modeLabel(gallery.mode)} · 開場</div>
          <h1>請掃描 QR 碼進入觀看頁</h1>
          <small>等待主持開場</small>
          <p>主持按下 Next 後，將切換到第一張作品。</p>
        </header>
      ) : (
        <header className="photo-details">
          <div className="meta-line">{gallery.idx}/{realTotal || 0}</div>
          <h1>{concept?.title ?? item?.base ?? "No photo"}</h1>
          <small>{item ? `${item.base}_mini.jpg` : "-"}</small>
          <p>{concept?.description ?? ""}</p>
        </header>
      )}
      {onCover ? null : <ExifTable info={item?.json?.info ?? item?.info} />}
      {gallery.error ? <p className="system-note error">{gallery.error}</p> : null}
    </TwoPaneShell>
  );
}
