// エントリポイント: ビューアを先に立ち上げ、WASMエンジン初期化後にUIを起動する
// (デスクトップ版の pywebviewready 待ちと同じ段取り)。

import "./style.css";
import { initEngine } from "./core/engine";
import { initUI, setStatus } from "./ui";
import { initViewer } from "./viewer";

document.getElementById("version")!.textContent = `v${__APP_VERSION__}`;
// バンドルした three.js / manifold-3d / fflate のライセンス表記(public/ に配置)
(document.getElementById("licenses-link") as HTMLAnchorElement).href =
  `${import.meta.env.BASE_URL}THIRD-PARTY-LICENSES.txt`;

initViewer(document.getElementById("viewer")!);
setStatus("エンジン読み込み中…");

initEngine().then(
  () => initUI(),
  (err) => {
    console.error(err);
    setStatus(`エンジンの初期化に失敗: ${err}`, true);
  },
);
