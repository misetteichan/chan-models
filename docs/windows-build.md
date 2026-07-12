# Windowsビルド手順

PyInstallerはクロスコンパイル不可のため、Windows上でビルドする
(またはGitHub Actionsの `windows-latest` を使う)。
ローカルで行う場合はプロジェクト一式(`.venv` と `dist/`, `build/` を除く)を
Windows機にコピーして始める。

## 前提

- Windows 10 / 11、x64(ARM版Windowsの場合もx64のPythonを使う。エミュレーションで動く)
- **WebView2ランタイム**: Windows 11は標準搭載。Windows 10もEdge経由で
  ほぼ入っているが、無い場合は[Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/)を実行

## 手順

```bat
rem 1. Python 3.12 (x64) を入れる
winget install Python.Python.3.12

rem 2. venv作成と依存インストール
cd <プロジェクトのパス>
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt pyinstaller

rem 3. まず開発モードで起動確認(ウィンドウが開き、生成・エクスポートが動くこと)
.venv\Scripts\python run.py

rem 4. ビルド
build.bat

rem 5. 動作確認
dist\chan-models\chan-models.exe
```

## 確認チェックリスト

- [ ] 手順3: 開発モードでウィンドウが開く(pywebview + WebView2の疎通)
- [ ] 手順3: モデル生成・ビューア操作・STL/3MFエクスポートが動く
- [ ] 手順5: ビルド成果物だけで同じことができる(venvをリネームした状態でも起動する)。
      **注意**: `dist\chan-models\` フォルダが1つのアプリ。exeの隣の `_internal\`
      にはPython本体とリソースが入っており、**消すと動かない**。配布時はフォルダごとzipする
- [ ] 生成した3MFをスライサー(Bambu Studio等)で開いて色・パーツ名が見える

## 要素検証で判明済みの罠(設計に織り込み済み。再発させないこと)

| 症状 | 原因と対処 |
|---|---|
| ウィンドウは開くが一切操作できず、コンソールに `[pywebview] Error while processing window.native.AccessibilityObject...: maximum recursion depth exceeded` | js_apiオブジェクト(`Api`)に `webview.Window` などの複雑なオブジェクトを**公開属性**として持たせると発生する。pywebviewは公開属性を再帰的にJSへ公開するため、WinFormsのnativeオブジェクトの循環グラフで無限再帰しブリッジが壊れる。**js_apiには関数以外の公開属性を置かず、内部状態は `_` 付きにする**(macOSのcocoaでは発症しないため、Windowsで初めて顕在化する点に注意) |

## 予想されるハマりどころ(遭遇したら結果を追記)

| 症状 | 対処 |
|---|---|
| pywebview起動時に `clr` / `Python.Runtime` 関連のImportError | pythonnetの同梱漏れ。build.specのhiddenimportsに`clr_loader`を指定。それでも出る場合は `collect_all("pythonnet")` と `collect_all("clr_loader")` をspecに追加 |
| ウィンドウが真っ白 | WebView2ランタイム未導入の可能性。前提の項を参照 |
| `lib3mf.dll` が見つからない | `collect_all("lib3mf")` の同梱漏れ。dist内に`lib3mf\lib3mf.dll`があるか確認 |
| SmartScreen警告(配布時) | 未署名exeの宿命。利用者に「詳細情報→実行」してもらう(README記載。署名は当面やらない方針) |

## 配布(ビルドが通った後の話)

- onedirのフォルダをzipで配るのが最小構成(GitHub Actionsが自動化する)
- インストーラにするなら Inno Setup。WebView2の有無をチェックして
  Evergreen Bootstrapperを蹴るスクリプトを入れるのが定石
