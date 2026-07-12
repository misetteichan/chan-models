"""chan models エントリポイント。

使い方:
    python run.py          通常起動
    python run.py --debug  WebInspector付きで起動
"""

import sys

import webview

from app.api import Api
from app.registry import app_root


def main():
    debug = "--debug" in sys.argv
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
