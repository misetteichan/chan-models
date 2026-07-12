"""サンプル2: 仕切りトレイ(int型パラメータのデモ)"""
from manifold3d import Manifold

from app.model_api import Model, Param, Part


class DividerTray(Model):
    id = "divider_tray"
    name = "仕切りトレイ"
    description = "行数・列数を指定できる小物トレイ。"
    params = {
        "width": Param("幅", 120.0, "float", 40, 300, 1, "mm"),
        "depth": Param("奥行", 80.0, "float", 40, 300, 1, "mm"),
        "height": Param("高さ", 25.0, "float", 8, 80, 1, "mm"),
        "wall": Param("壁の厚さ", 2.0, "float", 1.0, 5, 0.2, "mm"),
        "cols": Param("列数", 3, "int", 1, 8, 1),
        "rows": Param("行数", 2, "int", 1, 6, 1),
    }

    def build(self, p):
        w, d, h, t = p.width, p.depth, p.height, p.wall
        cell_w = (w - t * (p.cols + 1)) / p.cols
        cell_d = (d - t * (p.rows + 1)) / p.rows
        if cell_w < 5 or cell_d < 5:
            raise ValueError("仕切りが多すぎてセルが小さくなりすぎます(最低5mm)")

        tray = Manifold.cube((w, d, h))
        for i in range(p.cols):
            for j in range(p.rows):
                x = t + i * (cell_w + t)
                y = t + j * (cell_d + t)
                tray -= Manifold.cube((cell_w, cell_d, h)).translate((x, y, t))
        return [Part("tray", tray, "#43A047")]
