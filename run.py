"""chan models エントリポイント。

使い方:
    python run.py          通常起動
    python run.py --debug  WebInspector付きで起動
"""

import os
import sys

import webview

from app.api import Api
from app.registry import app_root


def _unblock_bundled_dlls():
    """同梱DLLの Zone.Identifier(Mark of the Web)を除去する(Windowsのみ)。

    ブラウザでダウンロードしたzipをExplorerで展開すると全ファイルに
    「ネット由来」の印が付き、.NET Framework が pythonnet の
    Python.Runtime.dll のロードを拒否して起動できない
    (Failed to resolve Python.Runtime.Loader.Initialize)。
    起動のたびに印を剥がして自己修復する。失敗しても致命ではないので握りつぶす。
    """
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    from pathlib import Path
    for dll in Path(sys._MEIPASS).rglob("*.dll"):
        try:
            os.remove(f"{dll}:Zone.Identifier")  # NTFSの代替ストリームを削除
        except OSError:
            pass  # 印が付いていない(通常ケース)か、削除できない場所にある


def main():
    debug = "--debug" in sys.argv
    _unblock_bundled_dlls()
    index_html = app_root() / "ui" / "index.html"
    api = Api()
    webview.create_window(
        "chan models",
        # 必ず file:// URI で渡すこと。素のパスを渡すと pywebview が内部HTTP
        # サーバーを自動起動し、macOSのローカルネットワーク権限プロンプトが出る
        # (pywebview 6 の is_local_url() 判定。docs/architecture.md 参照)
        index_html.as_uri(),
        js_api=api,
        width=1280,
        height=840,
        min_size=(900, 600),
    )
    # 内部HTTPサーバーは立てない(file://直読み。docs/architecture.md 参照)
    webview.start(debug=debug)
    # ウィンドウが全て閉じた後。Manifoldを解放してnanobindのリーク警告を抑える
    api._release_parts()


if __name__ == "__main__":
    main()
