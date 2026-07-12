"""chan models アプリパッケージ。

__version__ がアプリのバージョンの唯一の真実(single source of truth)。
build.spec(配布物のバージョン)と run.py(ウィンドウタイトル表示)がこれを参照する。
リリース手順: この値を上げてコミット → 同じ値で `git tag vX.Y.Z` を打つ。
"""

__version__ = "1.0.1"
