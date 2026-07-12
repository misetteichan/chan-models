#!/bin/sh
# macOS用ビルド。成果物: dist/chan-models.app
# 前提: .venv に requirements.txt + pyinstaller がインストール済み
set -eu
cd "$(dirname "$0")"
./.venv/bin/pyinstaller --noconfirm --clean build.spec

# PyInstaller自身のadhoc署名は、ソースに拡張属性(Finder情報等)が付いていると
# 「resource fork ... not allowed」で失敗する(実ビルドで遭遇)。
# 拡張属性を落としてから署名し直す
xattr -cr dist/chan-models.app
codesign -s - --force --deep dist/chan-models.app
codesign -v dist/chan-models.app

echo
echo "done: dist/chan-models.app"
du -sh dist/chan-models.app
