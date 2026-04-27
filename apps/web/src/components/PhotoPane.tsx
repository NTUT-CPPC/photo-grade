import { useLayoutEffect, useRef, useState } from "react";
import { imageUrl } from "../api/client";
import type { PhotoItem } from "../types";

type Props = {
  item?: PhotoItem;
  rotation: number;
  quality?: "high" | "mini";
};

export function PhotoPane({ item, rotation, quality = "high" }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [loadVersion, setLoadVersion] = useState(0);

  useLayoutEffect(() => {
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
  }, [item?.base, loadVersion, rotation]);

  return (
    <div className="photo-pane" ref={frameRef}>
      {item ? (
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

function titleFor(item: PhotoItem) {
  return item.json?.concept?.title ?? item.concept?.title ?? item.base;
}
