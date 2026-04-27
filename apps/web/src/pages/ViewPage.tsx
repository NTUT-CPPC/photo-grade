import { ExifTable } from "../components/ExifTable";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";

export function ViewPage() {
  const gallery = useGallery("view");
  const item = gallery.current;
  const concept = item?.json?.concept ?? item?.concept;

  return (
    <TwoPaneShell
      item={item}
      photoQuality="mini"
      canPrev={gallery.idx > 0}
      canNext={gallery.idx < gallery.items.length - 1}
      bases={gallery.items.map((item) => item.base)}
      onPrev={() => void gallery.navigate(gallery.idx - 1)}
      onNext={() => void gallery.navigate(gallery.idx + 1)}
      onJump={gallery.jumpTo}
    >
      <span className="mode-banner">模式：{modeLabel(gallery.mode)}</span>
      <header className="photo-details">
        <div className="meta-line">{gallery.idx + 1}/{gallery.items.length || 0}</div>
        <h1>{concept?.title ?? item?.base ?? "No photo"}</h1>
        <small>{item ? `${item.base}_mini.jpg` : "-"}</small>
        <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />
        <p>{concept?.description ?? ""}</p>
      </header>
      <ExifTable info={item?.json?.info ?? item?.info} />
      {gallery.error ? <p className="system-note error">{gallery.error}</p> : null}
    </TwoPaneShell>
  );
}
