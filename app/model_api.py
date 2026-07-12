"""モデルスクリプト向け公開API(Model / Param / Part)。

models/*.py はこのモジュールだけに依存する。後方互換を保つこと
(docs/model-authoring.md が仕様書)。
"""

from types import SimpleNamespace

_PARAM_TYPES = ("float", "int", "bool")


class Param:
    """パラメータ宣言。GUIフォームの自動生成と値の型強制・クランプに使う。"""

    def __init__(self, label, default, type="float", min=None, max=None,
                 step=None, unit=""):
        if type not in _PARAM_TYPES:
            raise ValueError(f"Param type は {_PARAM_TYPES} のいずれか: {type!r}")
        self.label = label
        self.default = default
        self.type = type
        self.min = min
        self.max = max
        if step is None and type != "bool":
            step = 0.1 if type == "float" else 1
        self.step = step
        self.unit = unit

    def coerce(self, value):
        """型変換し、min/maxにクランプした値を返す。変換不能ならデフォルト値。"""
        if self.type == "bool":
            return bool(value)
        try:
            v = float(value)
        except (TypeError, ValueError):
            v = float(self.default)
        if self.min is not None:
            v = max(v, self.min)
        if self.max is not None:
            v = min(v, self.max)
        return int(round(v)) if self.type == "int" else v

    def to_dict(self, key):
        return {
            "key": key,
            "label": self.label,
            "default": self.default,
            "type": self.type,
            "min": self.min,
            "max": self.max,
            "step": self.step,
            "unit": self.unit,
        }


class Part:
    """ビューアの色分け・表示切替・3MF内オブジェクトの単位。"""

    def __init__(self, name, manifold, color="#8899AA"):
        self.name = name
        self.manifold = manifold
        self.color = color


class Model:
    """models/*.py で継承する基底クラス。

    サブクラスは id / name / description / params を定義し、
    build(self, p) で list[Part] を返す。
    """

    id = ""
    name = ""
    description = ""
    params = {}

    def build(self, p):
        raise NotImplementedError

    def resolve_params(self, values):
        """欠損キーをデフォルトで補完し、型強制・クランプ済みの属性オブジェクトを返す。"""
        values = values or {}
        resolved = {}
        for key, param in self.params.items():
            raw = values.get(key, param.default)
            resolved[key] = param.coerce(raw)
        return SimpleNamespace(**resolved)
