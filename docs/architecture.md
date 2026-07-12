# アーキテクチャ

## 全体像

```
┌────────────────────────────────────────────────────┐
│ pywebviewネイティブウィンドウ                          │
│  (macOS: WKWebView / Windows: WebView2)             │
│                                                     │
│  ui/index.html + app.js + three.js (r170, 同梱)      │
│   ・パラメータフォーム(モデル定義から自動生成)          │
│   ・3Dビューア(OrbitControls: 回転/ズーム/パン)        │
│   ・パーツ表示切替、STL/3MFエクスポートボタン           │
└───────────────┬────────────────────────────────────┘
                │ window.pywebview.api.*  (js_api、JSON)
┌───────────────▼────────────────────────────────────┐
│ app/api.py  Api クラス(ブリッジ)                     │
│   ├─ registry.py   models/*.py を動的import          │
│   ├─ model_api.py  Model / Param / Part(公開API)    │
│   ├─ meshing.py    Manifold → フラット頂点/インデックス │
│   └─ export.py     バイナリSTL / 色付き3MF(lib3mf)    │
│ ジオメトリカーネル: manifold3d(CSG、メッシュ直接出力)   │
└────────────────────────────────────────────────────┘
```

- HTMLアセットは **file:// 直読み**(HTTPサーバー不使用)。localhostサーバーを
  立てるとmacOSの「ローカルネットワーク」権限プロンプトが出るため不採用(要素検証で確認)
- **罠: `create_window` には必ず `file://` URI を渡すこと**(`Path.as_uri()`)。
  pywebview 6 は素のファイルパスを渡すと `is_local_url()` 判定により
  **`http_server=False` でも内部HTTPサーバーを自動起動**し、上記の権限プロンプトが
  出る(配布版.appで発現して発覚。開発時はターミナル側の既存権限に隠れて気づけない)
- file://ではESモジュールがCORSでブロックされるため、UIは**従来型スクリプトのみ**。
  three.js+OrbitControlsは `ui/vendor/three.bundle.js` にバンドルして同梱する
  (グローバル `THREE` / `OrbitControls` を公開)。`app.js` 自体はバンドル不要の
  素のJSで、直接編集してよい。バンドルの作り方(three.js更新時のみ実行、要Node):

  ```sh
  # ui/vendor/ に three.module.min.js と OrbitControls.js(examples/jsm/controls)を
  # 置き、_entry.js で「import して window.THREE / window.OrbitControls に代入」した上で:
  npx -y esbuild _entry.js --bundle --minify \
    --alias:three=./three.module.min.js --format=iife --outfile=three.bundle.js
  ```

  esbuildはライセンスコメントを保持するので、three.jsのMIT表記はバンドル内に残る
  (再配布条件を満たす)。このコマンドは `ui/vendor/build-bundle.sh` として置くこと
- **vendor同梱はライブラリの再配布**なので、ライブラリを追加・更新するときは
  必ずライセンス条項を守ること: 著作権・ライセンス表記を同梱物の中に保持する
  (ミニファイやバンドルで消さない。表記がファイル内に残らない形式なら
  ライセンス全文を `ui/vendor/` に並置する)。あわせて README のライセンス節の
  一覧と、配布物の `THIRD-PARTY-LICENSES.txt` に追記する。
  再配布を許さないライセンスのものは同梱しない

## JS↔Python API契約

`ui/app.js` は `window.pywebview.api.<method>` を await で呼ぶ。
各メソッドはJSON化可能な値を返す。**このスキーマを変更する場合は本節・app/api.py・
ui/app.js を同時に更新すること。**

### `list_models() -> Model[]`

```jsonc
[{
  "id": "box_with_lid",          // models/内で一意。エクスポートのデフォルトファイル名にも使用
  "name": "フタ付きボックス",      // 表示名
  "description": "…",
  "params": [{
    "key": "width",              // build()に渡る属性名
    "label": "幅",
    "default": 60.0,
    "type": "float",             // "float" | "int" | "bool"
    "min": 20, "max": 200,       // null可(nullならスライダーなし・数値入力のみ)
    "step": 1,                   // null可
    "unit": "mm"                 // 表示専用
  }]
}]
```

### `generate(model_id: str, values: dict) -> Result`

```jsonc
// 成功
{ "ok": true,
  "elapsed_ms": 3.8,
  "parts": [{
    "name": "body",
    "color": "#4A90D9",
    "vertices": [x0,y0,z0, x1,y1,z1, ...],   // float32のフラット配列(mm, Z-up)
    "indices":  [a0,b0,c0, a1,b1,c1, ...],   // uint32のフラット配列(三角形)
    "triangles": 328                          // 三角形数(表示用)
  }]
}
// 失敗(モデルのValueError等。messageはユーザーにそのまま表示される)
{ "ok": false, "error": "ValueError: 肉厚が大きすぎます…" }
```

- `values` の欠損キーはパラメータのデフォルト値で補完、型はPython側で強制(coerce)、
  min/maxにクランプされる
- 成功時、生成された `Part`(Manifold形状ごと)は `Api._last_parts` に保持され、
  次のエクスポートの対象になる

### `export_file(kind: "stl"|"3mf", visible_names: string[]) -> Result`

- `visible_names` はビューアで表示中のパーツ名(非表示パーツはエクスポートされない)
- ダイアログの種類は形式とパーツ数で変わる:
  - **3MF / STL(表示パーツ1個)**: ネイティブの保存ダイアログで1ファイル
    (`<model>.<kind>`)。3MFは1ファイルにマルチオブジェクト(名前・色)を保持
  - **STL(表示パーツ2個以上)**: STLは1ファイルに複数オブジェクトを持てないため、
    フォルダ選択ダイアログを開き、選んだフォルダに `<model>_<part>.stl` を
    パーツごとに書き出す(パーツ名はモデル内で一意=衝突しない。ファイル名の
    禁止文字はサニタイズ)
- 成功: `{ ok: true, paths: ["/…/box_with_lid_body.stl", "/…/box_with_lid_lid.stl"] }`
  (単一ファイルでも1要素の配列)
- キャンセル: `{ ok: false, error: "" }`(エラー扱いにしない)
- 失敗: `{ ok: false, error: "…" }`

### `poll_models() -> {changed, models?, errors}`

ホットリロード用。UIが1秒間隔で呼ぶ。

- `models/` の変更(ファイル名・mtime・サイズの組)を検知したら再importし、
  `{ changed: true, models: Model[], errors: [...] }` を返す
  (`models` は `list_models()` と同形)。変更がなければ `{ changed: false, errors: [...] }`
- `errors` は importに失敗したファイルの一覧 `[{file, message}]`(常に返す)。
  失敗したファイルの**直前の正常なモデルは登録に残る**
  (エディタの書きかけ保存で選択中モデルが消えないように)。GUIはステータス欄に赤字表示する
- UI側は `changed` 時にモデル一覧・フォームを作り直す。選択中モデルが残っていれば
  選択と入力値(型が変わっていないもの)を維持する

## 座標系と単位

- モデルスクリプトの世界は **mm・Z-up**(CAD/3Dプリンタ慣習)
- three.jsはY-upなので、ビューア側で `modelGroup.rotation.x = -π/2` により変換。
  **Python側では座標変換しない**
- STL/3MFにはモデル座標(Z-up, mm)をそのまま書く。3MFの単位はmmを明示

## エクスポート仕様

- **STL**: バイナリSTL(自前実装、`app/export.py`)。対象パーツの三角形を
  1つのソリッドに連結。法線は面ごとに計算
- **3MF**: lib3mfを使用。パーツごとに独立した `MeshObject`(名前付き)を作り、
  カラーグループでオブジェクトレベルの色を付与、各オブジェクトをビルドアイテムとして
  追加する。この方式は要素検証で**Bambu Studioでの名前・色の認識を確認済み**。
  PrusaSlicer / OrcaSlicer も同じ仕様を読むはずだが未確認

## エラーハンドリング方針

- モデルのパラメータ不正は `build()` 内で `ValueError(日本語メッセージ)` を投げる
  → `generate` が `{ok:false, error}` に変換 → GUIのステータス欄に赤字表示
- ブリッジ内の想定外例外も同じ経路(+コンソールにtraceback)。ダイアログは出さない

## スレッドモデル

- pywebviewの `js_api` 呼び出しは**リクエストごとに別スレッド**で実行される
- JS側は async/await なのでUIは生成中もブロックしない
- サンプル級のモデルは生成が数ms(要素検証実測)なので、当面は排他制御なしでよい。
  重いモデルを想定する段階で「最新リクエスト優先の直列化+キャンセル」を入れる

## 技術選定の経緯(決定記録)

| 決定 | 理由 |
|---|---|
| GUIに pywebview(却下: PySide6/Qt) | 要素検証でQt+VTK埋め込み(pyvistaqt QtInteractor)がセグフォルト。ネイティブGUI層が最大の環境リスクと判断し、OS内蔵WebView+three.jsに。配布サイズも数百MB→数十MBに |
| 3MFに lib3mf | マルチオブジェクト+色の3MFを正式サポートする公式ライブラリ。要素検証で出力を確認済み |
| Python 3.12 固定 | 3.13+は依存wheelが未検証で、開発機のデフォルト3.14では環境構築が破綻した実績あり。3.12は全依存のwheelが揃うことを確認済み |
| three.js をvendor同梱(却下: CDN実行時取得) | 配布アプリがオフラインで完結するため。CDN障害・終了で配布済みアプリが壊れるのを防ぐ。またjs_api(ファイル書き込み可)を持つWebViewで実行時に外部コードを取得するのはサプライチェーン攻撃の口になる |
| file://直読み(却下: 内部HTTPサーバー) | pywebviewの`http_server=True`はlocalhostサーバーを立て、macOSの「ローカルネットワーク」権限プロンプトを誘発する(要素検証で確認)。file://化に伴いESモジュールを廃止し、three.jsは従来型スクリプトにバンドル |
| STLは自前バイナリライタ | 依存(trimesh等)を増やさないため。実装は50行程度 |
