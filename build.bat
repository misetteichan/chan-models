@echo off
rem Windows用ビルド。成果物: dist\chan-models\chan-models.exe
rem 前提: .venv に requirements.txt + pyinstaller がインストール済み
rem (手順の詳細は docs\windows-build.md)
cd /d %~dp0
.venv\Scripts\pyinstaller --noconfirm --clean build.spec
if errorlevel 1 exit /b 1
echo.
echo done: dist\chan-models\chan-models.exe
