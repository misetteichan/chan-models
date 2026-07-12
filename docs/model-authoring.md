# モデルスクリプトの書き方

`models/` に `.py` ファイルを1つ置くと、自動発見されてモデル一覧に並ぶ。
アプリ起動中の追加・変更・削除は約1秒で自動反映される(ホットリロード)。
importエラー(書きかけの構文エラー等)はステータス欄に赤字表示され、
そのファイルの直前の正常なモデルは残るので、アプリを起動したまま書き進めてよい。
`_` で始まるファイルは無視される。

## 最小の例

```python
from manifold3d import Manifold
from app.model_api import Model, Param, Part


class SimpleCube(Model):
    id = "simple_cube"          # 一意なID(英数字とアンダースコア)
    name = "ただの直方体"        # GUI表示名
    description = "3辺の長さを指定できる直方体。"

    params = {
        "x": Param("幅",   30.0, "float", 1, 200, 1, "mm"),
        "y": Param("奥行", 20.0, "float", 1, 200, 1, "mm"),
        "z": Param("高さ", 10.0, "float", 1, 200, 1, "mm"),
    }

    def build(self, p):
        return [Part("cube", Manifold.cube((p.x, p.y, p.z)), "#4A90D9")]
```

## API リファレンス

### `Param(label, default, type="float", min=None, max=None, step=None, unit="")`

| 引数 | 意味 |
|---|---|
| `label` | GUIに表示するラベル(日本語可) |
| `default` | デフォルト値 |
| `type` | `"float"`(スライダー+数値)/ `"int"`(同、整数)/ `"bool"`(チェックボックス) |
| `min` / `max` | 範囲。両方指定するとスライダーが付く。値はこの範囲にクランプされる |
| `step` | 刻み。省略時 float=0.1 / int=1 |
| `unit` | 表示専用の単位文字列(`"mm"` など) |

### `build(self, p) -> list[Part]`

- `p` は各パラメータを属性に持つオブジェクト(`p.width` のように参照)。
  値は型変換・min/maxクランプ済み
- 戻り値は `Part` のリスト。**Partがビューアの色分け表示・表示切替・
  3MF内の個別オブジェクトの単位**になる
- パラメータの組み合わせが不正なときは
  `raise ValueError("日本語で理由")` — GUIのステータス欄に赤字で表示される

### `Part(name, manifold, color="#8899AA")`

- `name`: パーツ名(3MFのオブジェクト名にもなる)。**モデル内で一意にすること**
- `manifold`: `manifold3d.Manifold` 形状
- `color`: `#RRGGBB`。ビューア表示と3MFの色の両方に使われる

## 単位・座標系

- **mm、Z-up**。Z=0を底面(プリントベッド)とする配置を推奨
- 複数パーツは印刷時の配置を意識して重ならないように並べる
  (例: box_with_lid はフタを本体の隣に配置)

## 動作確認(GUIなし)

```sh
./.venv/bin/python - <<'EOF'
from app.api import Api
api = Api()
res = api.generate("simple_cube", {"x": 50})
print(res["ok"], res.get("error") or f"{len(res['parts'])} parts")
EOF
```
