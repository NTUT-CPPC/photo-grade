declare module "heic-convert" {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  const convert: (options: ConvertOptions) => Promise<ArrayBuffer>;
  export default convert;
}
