"""サンプル1: フタ付きボックス(2パーツ・色分け)"""
from manifold3d import Manifold, set_circular_segments

from app.model_api import Model, Param, Part

set_circular_segments(64)


class BoxWithLid(Model):
    id = "box_with_lid"
    name = "フタ付きボックス"
    description = "本体とかぶせ式のフタの2パーツ。フタは印刷しやすいよう並べて配置。"
    params = {
        "width": Param("幅", 60.0, "float", 20, 200, 1, "mm"),
        "depth": Param("奥行", 40.0, "float", 20, 200, 1, "mm"),
        "height": Param("高さ", 30.0, "float", 10, 120, 1, "mm"),
        "wall": Param("肉厚", 2.0, "float", 0.8, 6, 0.2, "mm"),
        "clearance": Param("フタのクリアランス", 0.2, "float", 0.0, 1.0, 0.05, "mm"),
        "knob": Param("フタのつまみ", True, "bool"),
    }

    def build(self, p):
        w, d, h, t, c = p.width, p.depth, p.height, p.wall, p.clearance
        if w - 4 * t - 2 * c <= 2 or d - 4 * t - 2 * c <= 2:
            raise ValueError("肉厚が大きすぎます(幅・奥行に対して壁が厚すぎ)")

        body = Manifold.cube((w, d, h)) - Manifold.cube(
            (w - 2 * t, d - 2 * t, h)
        ).translate((t, t, t))

        # フタ: 天板 + 内側に落ちるリップ(額縁状)
        lid = Manifold.cube((w, d, t)).translate((0, 0, t))
        lip = Manifold.cube((w - 2 * t - 2 * c, d - 2 * t - 2 * c, t)).translate(
            (t + c, t + c, 0)
        )
        lip -= Manifold.cube((w - 4 * t - 2 * c, d - 4 * t - 2 * c, t)).translate(
            (2 * t + c, 2 * t + c, 0)
        )
        lid += lip
        if p.knob:
            r = min(w, d) * 0.12
            lid += Manifold.cylinder(4, r, r * 0.75).translate((w / 2, d / 2, 2 * t))

        lid = lid.translate((w + 15, 0, 0))
        return [
            Part("body", body, "#4A90D9"),
            Part("lid", lid, "#E67E22"),
        ]
