# SPDX-FileCopyrightText: 2024-2026 @misetteichan
# SPDX-License-Identifier: MIT

from manifold3d import Manifold, set_circular_segments
from app.model_api import Model, Param, Part

set_circular_segments(100)

FACE_WIDTH = 400.0
FACE_HEIGHT = 400.0
FACE_DEPTH = 100.0
FACE_RADIUS = 30.0
BODY_DEPTH = 300.0
HOLE_RADIUS = 0.3
# 表情パネルの厚みは本体サイズによらず、この大きさ(mm)指定時の厚みで一定にする
PANEL_THICKNESS_SIZE = 12.0


def _rounded_cube(width, height, depth, radius):
    """XY面の四隅を丸めた直方体を作る。"""
    inner_width = width - radius * 2
    inner_height = height - radius * 2

    body = Manifold.cube((inner_width, height, depth)).translate(
        (radius, 0, 0)
    )
    body += Manifold.cube((width, inner_height, depth)).translate(
        (0, radius, 0)
    )

    corner = Manifold.cylinder(depth, radius).translate((radius, radius, 0))
    corners = corner
    corners += corner.translate((inner_width, 0, 0))
    corners += corner.translate((0, inner_height, 0))
    corners += corner.translate((inner_width, inner_height, 0))
    return body + corners


def _head():
    radius = 150.0
    side = Manifold.cylinder(FACE_HEIGHT, radius)
    shape = Manifold.cube(
        (FACE_WIDTH, FACE_HEIGHT, BODY_DEPTH - radius)
    ).translate((0, 0, radius))
    shape += Manifold.cube(
        (FACE_WIDTH, FACE_HEIGHT - radius, BODY_DEPTH)
    ).translate((0, radius, 0))
    shape += side.rotate((0, 90, 0)).translate((0, radius, radius))
    return shape ^ _rounded_cube(
        FACE_WIDTH, FACE_HEIGHT, BODY_DEPTH, FACE_RADIUS
    )


def _foot(with_hole):
    width, height, depth = 140.0, 200.0, 50.0
    half = Manifold.cube((width, depth, height)).translate((10, 0, 0))
    feet = half + half.mirror((1, 0, 0))

    if with_hole:
        foot_hole = (Manifold.cylinder(depth, 40.0)
                     .rotate((90, 0, 0))
                     .translate((0, depth, height / 2)))
        feet -= foot_hole

    connector = Manifold.cylinder(30.0, 50.0).rotate((90, 0, 0))
    return connector + feet.translate((0, -(depth + 30), -height / 2))


def _panel():
    lcd_width, lcd_height, depth = 320.0, 240.0, 10.0

    eye = Manifold.cylinder(depth, 25.0).translate(
        (-lcd_width / 4, 40, 0)
    )
    eyes = eye + eye.mirror((1, 0, 0))
    mouth = Manifold.cube((120.0, 30.0, depth)).translate((-60, -60, 0))
    face = (eyes + mouth).translate((lcd_width / 2, lcd_height / 2, 0))

    button_width, button_height = 60.0, 30.0
    step = (lcd_width - button_width) / 2 * 0.8
    button = Manifold.cube((button_width, button_height, depth)).translate(
        (lcd_width / 2 - button_width / 2, button_height * 1.5, 0)
    )
    buttons = button + button.translate((-step, 0, 0))
    buttons += button.translate((step, 0, 0))

    face = face.translate(
        ((FACE_WIDTH - lcd_width) / 2,
         (FACE_HEIGHT - lcd_height) / 2,
         0)
    )
    buttons = buttons.translate(((FACE_WIDTH - lcd_width) / 2, 0, 0))
    return (face + buttons).translate((0, 0, -depth))


class StackCharm(Model):
    id = "stack_charm"
    name = "ｽﾀｯｸﾁｬｰﾑ"
    description = "ｽﾀｯｸﾁｬﾝのフィギュアだよ!多色!!!!"

    params = {
        "size": Param("大きさ", 20, "float", 12, 50, 1, "mm"),
        "top_hole": Param("上面の穴", True, "bool"),
        "bottom_hole": Param("底面の穴", False, "bool"),
        "cutout_panel": Param("表情部分をくり抜く", False, "bool"),
    }

    def build(self, p):
        scale = p.size / FACE_WIDTH
        head = _head().scale((scale, scale, scale))
        foot = (_foot(p.bottom_hole)
                .translate((FACE_WIDTH / 2, 0,
                            (BODY_DEPTH + FACE_DEPTH) / 2))
                .scale((scale, scale, scale)))
        face = (_rounded_cube(FACE_WIDTH, FACE_HEIGHT,
                              FACE_DEPTH, FACE_RADIUS)
                .translate((0, 0, BODY_DEPTH))
                .scale((scale, scale, scale)))
        # 表情パネルは XY を size に追従させつつ、Z(厚み)だけは
        # PANEL_THICKNESS_SIZE 相当で固定する。前面(本体前面)に揃える。
        panel_z_scale = PANEL_THICKNESS_SIZE / FACE_WIDTH
        panel = (_panel()
                 .scale((scale, scale, panel_z_scale))
                 .translate((0, 0, (FACE_DEPTH + BODY_DEPTH) * scale)))
        if p.cutout_panel:
            face -= panel

        # チャーム穴は本体の拡大率にかかわらず半径0.3 mmに保つ。
        hole = (Manifold.cylinder(5.0, HOLE_RADIUS)
                .rotate((90, 0, 0))
                .translate((p.size / 2, 0, p.size / 2)))
        if p.top_hole:
            head -= hole.translate((0, p.size, 0))
        if p.bottom_hole:
            head -= hole.translate((0, 5, 0))
            foot -= (Manifold.cylinder(10.0, HOLE_RADIUS)
                     .rotate((90, 0, 0))
                     .translate((p.size / 2, 0, p.size / 2)))

        # 顔側をプリントベッドに向ける。X軸まわりに反転したあと、
        # モデル全体が正の座標に収まるようY・Z方向へ移動する。
        def face_down(shape):
            return shape.rotate((180, 0, 0)).translate((0, p.size, p.size))

        return [
            Part("ボディ", face_down(head + foot), "#FF0000"),
            Part("顔", face_down(face), "#000000"),
            Part("表情", face_down(panel), "#FFFFFF"),
        ]
