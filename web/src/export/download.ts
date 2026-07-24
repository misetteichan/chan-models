// ブラウザでのファイル保存(Blob + <a download>)。
// デスクトップ版のネイティブ保存ダイアログの置き換え。

// ファイル名に使えない文字(Windowsの禁止文字とパス区切り・制御文字)を _ に置換
// (app/api.py の _sanitize_filename と同じ規則)
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(UNSAFE_FILENAME_CHARS, "_")
    .replace(/^[ .]+|[ .]+$/g, "");
  return cleaned || "part";
}

export function downloadBlob(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // click 直後の revoke は一部ブラウザでダウンロードが失敗するため遅延させる
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
