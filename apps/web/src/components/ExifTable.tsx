import type { PhotoInfo } from "../types";

const EXIF_FIELDS: Array<[keyof PhotoInfo, string, string]> = [
  ["shutter", "快門速度", "秒"],
  ["aparture", "光圈 (f/)", ""],
  ["ISO", "感光度 (ISO)", ""],
  ["megapixel", "百萬像素", "MP"],
  ["camera", "相機型號", ""],
  ["lens", "鏡頭型號", ""],
  ["focal_length", "焦距", "mm"]
];

type Props = {
  info?: PhotoInfo;
};

export function ExifTable({ info }: Props) {
  return (
    <table className="exif-table">
      <tbody>
        {EXIF_FIELDS.map(([key, label, unit]) => {
          const fallbackKey = key === "aparture" ? "aperture" : key === "ISO" ? "iso" : key;
          const value = formatValue(info?.[key] ?? info?.[fallbackKey], unit);
          return (
            <tr key={key}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatValue(raw: unknown, unit: string) {
  if (raw == null || raw === "") return "-";
  let value: string | number = raw as string | number;
  if (typeof value === "string" && value.includes("/")) {
    const [n, d] = value.split("/").map(Number);
    if (Number.isFinite(n) && Number.isFinite(d) && d) {
      value = (n / d).toFixed(2);
    }
  }
  return `${value}${unit ? ` ${unit}` : ""}`;
}
