import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getRuntimeConfig, imageUrl } from "../api/client";
import { isCover } from "../state/gallery";
import type { PhotoItem } from "../types";

type Props = {
  item?: PhotoItem;
  rotation: number;
  quality?: "high" | "mini";
};

let cachedViewEntryUrl: string | null = null;
let viewEntryUrlPromise: Promise<string> | null = null;

function fallbackViewEntryUrl(): string {
  return `${window.location.origin.replace(/\/+$/, "")}/view`;
}

function loadViewEntryUrl(): Promise<string> {
  if (cachedViewEntryUrl) return Promise.resolve(cachedViewEntryUrl);
  if (viewEntryUrlPromise) return viewEntryUrlPromise;
  viewEntryUrlPromise = getRuntimeConfig()
    .then((config) => {
      const base = config.entryBaseUrl?.trim() || window.location.origin;
      const url = `${base.replace(/\/+$/, "")}/view`;
      cachedViewEntryUrl = url;
      return url;
    })
    .catch(() => {
      const url = fallbackViewEntryUrl();
      cachedViewEntryUrl = url;
      return url;
    })
    .finally(() => {
      viewEntryUrlPromise = null;
    });
  return viewEntryUrlPromise;
}

export function PhotoPane({ item, rotation, quality = "high" }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [loadVersion, setLoadVersion] = useState(0);
  const cover = isCover(item);

  useLayoutEffect(() => {
    if (cover) {
      setScale(1);
      return;
    }
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return;

    const measure = () => {
      const rotated = Math.abs(rotation % 180) === 90;
      if (!rotated) {
        setScale(1);
        return;
      }
      const w = image.clientWidth || 1;
      const h = image.clientHeight || 1;
      setScale(Math.min(frame.clientWidth / h, frame.clientHeight / w, 1));
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(frame);
    resize.observe(image);
    return () => resize.disconnect();
  }, [cover, item?.base, loadVersion, rotation]);

  return (
    <div className="photo-pane" ref={frameRef}>
      {cover ? (
        <CoverContent />
      ) : item ? (
        <img
          ref={imageRef}
          src={imageUrl(item, quality)}
          alt={titleFor(item)}
          onLoad={() => setLoadVersion((value) => value + 1)}
          style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
        />
      ) : (
        <div className="empty-state">No photo loaded</div>
      )}
    </div>
  );
}

function CoverContent() {
  const [viewUrl, setViewUrl] = useState<string>(() => cachedViewEntryUrl ?? fallbackViewEntryUrl());
  const [qrCode, setQrCode] = useState<string>("");

  useEffect(() => {
    let live = true;
    void loadViewEntryUrl().then((url) => {
      if (live) setViewUrl(url);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!viewUrl) return;
    let live = true;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(viewUrl, {
          width: 512,
          margin: 1,
          color: { dark: "#121212", light: "#ffffff" }
        })
      )
      .then((url) => {
        if (live) setQrCode(url);
      })
      .catch(() => {
        if (live) setQrCode("");
      });
    return () => {
      live = false;
    };
  }, [viewUrl]);

  return (
    <div className="photo-pane__cover">
      <span className="photo-pane__cover-caption">SCAN TO VIEW</span>
      {qrCode ? (
        <img src={qrCode} alt={`QR code for ${viewUrl}`} />
      ) : (
        <div className="empty-state">Generating QR code...</div>
      )}
      <a className="photo-pane__cover-url" href={viewUrl} target="_blank" rel="noreferrer">
        {viewUrl}
      </a>
    </div>
  );
}

function titleFor(item: PhotoItem) {
  return item.json?.concept?.title ?? item.concept?.title ?? item.base;
}
