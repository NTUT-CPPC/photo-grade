export function extractGoogleDriveFileId(url: string): string | null {
  const idParam = url.match(/[?&]id=([^&]+)/);
  if (idParam?.[1]) return decodeURIComponent(idParam[1]);
  const filePath = url.match(/\/d\/([^/]+)/);
  if (filePath?.[1]) return decodeURIComponent(filePath[1]);
  return null;
}

export function publicGoogleDriveDownloadUrl(url: string): string | null {
  const id = extractGoogleDriveFileId(url);
  return id ? `https://docs.google.com/uc?export=download&id=${encodeURIComponent(id)}` : null;
}
