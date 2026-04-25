import { useEffect, useState } from "react";
import { ExifTable } from "../components/ExifTable";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import { onScoreNotification } from "../api/socket";

export function ViewPage() {
  const gallery = useGallery("view");
  const item = gallery.current;
  const [notice, setNotice] = useState("");

  useEffect(() => {
    return onScoreNotification((notification) => {
      if (notification.base !== item?.base) return;
      const text = notification.summary ?? scoreSummary(notification.scores);
      setNotice(text ? `已送出：\n${text}` : "已送出");
      window.setTimeout(() => setNotice(""), 2500);
    });
  }, [item?.base]);

  const concept = item?.json?.concept ?? item?.concept;

  return (
    <TwoPaneShell
      item={item}
      photoQuality="mini"
      canPrev={gallery.idx > 0}
      canNext={gallery.idx < gallery.items.length - 1}
      onPrev={() => void gallery.navigate(gallery.idx - 1)}
      onNext={() => void gallery.navigate(gallery.idx + 1)}
      onJump={gallery.jumpTo}
    >
      <span className="mode-banner">模式：{modeLabel(gallery.mode)}</span>
      <header className="photo-details">
        <div className="meta-line">{gallery.idx + 1}/{gallery.items.length || 0}</div>
        <h1>{concept?.title ?? item?.base ?? "No photo"}</h1>
        <small>{item ? `${item.base}_mini.jpg` : "-"}</small>
        {notice ? <div className="notification">{notice}</div> : null}
        <p>{concept?.description ?? ""}</p>
      </header>
      <ExifTable info={item?.json?.info ?? item?.info} />
      {gallery.error ? <p className="system-note error">{gallery.error}</p> : null}
    </TwoPaneShell>
  );
}

function scoreSummary(scores?: Record<string, string | number>) {
  if (!scores) return "";
  return Object.entries(scores)
    .map(([field, value]) => `${field} ${value} 分`)
    .join("\n");
}
