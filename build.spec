# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec(macOS/Windows共用)。build.sh / build.bat から使う。

onedirモード固定(onefileは起動が遅く、macOS署名とも相性が悪い)。
要素検証で判明済みの罠への対処をコメントで明示している。
"""

import re
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all


def _read_version():
    """app/__init__.py の __version__ を読む(唯一の真実)。

    app パッケージを import せずファイルから直接読む(重い依存の巻き込みや
    パス問題を避けるため)。SPECPATH は PyInstaller が注入する spec の所在。
    """
    text = Path(SPECPATH, "app", "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'^__version__\s*=\s*["\']([^"\']+)["\']', text, re.M)
    return m.group(1) if m else "0.0.0"


APP_NAME = "chan-models"          # 実行ファイル名・distフォルダ名(ASCII)
DISPLAY_NAME = "chan models"      # 表示名
BUNDLE_ID = "com.misetteichan.chan-models"
VERSION = _read_version()

# アイコン: Windowsはexe埋め込み(.ico)、macOSは.appバンドル(.icns)
WIN_ICON = "assets/icon.ico"
MAC_ICON = "assets/icon.icns"

datas = [
    ("ui", "ui"),                          # HTML/JS/three.jsバンドル(file://直読み)
    ("models", "models"),                  # モデルスクリプト(実行時に動的import)
    ("THIRD-PARTY-LICENSES.txt", "."),     # 同梱OSSのライセンス全文
]
binaries = []

# models/ は動的ロードなので Analysis が import を検出できない。
# manifold3d を明示しないと「起動はするが生成で死ぬ」
hiddenimports = ["manifold3d"]

# webviewのバックエンドも動的import
if sys.platform == "darwin":
    hiddenimports += ["webview.platforms.cocoa"]
elif sys.platform == "win32":
    hiddenimports += [
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
        "clr_loader",
    ]

# lib3mfは共有ライブラリ(.dylib/.dll)をctypesでロードするため collect_all が必須
lib3mf_datas, lib3mf_binaries, lib3mf_hidden = collect_all("lib3mf")
datas += lib3mf_datas
binaries += lib3mf_binaries
hiddenimports += lib3mf_hidden

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,          # GUIアプリ(コンソールを出さない)
    disable_windowed_traceback=False,
    argv_emulation=False,
    icon=WIN_ICON if sys.platform == "win32" else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name=APP_NAME,
)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name=f"{APP_NAME}.app",
        icon=MAC_ICON,
        bundle_identifier=BUNDLE_ID,
        # 注意: NSAppTransportSecurity / NSAllowsLocalNetworking は入れないこと
        # (file://直読みのため不要。HTTPサーバー時代の名残を復活させない)
        info_plist={
            "CFBundleName": DISPLAY_NAME,
            "CFBundleDisplayName": DISPLAY_NAME,
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "12.0",
        },
    )
