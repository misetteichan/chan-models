// SPDX-FileCopyrightText: 2024-2026 @misetteichan
// SPDX-License-Identifier: MIT
//
// models/stack-charm_color.py の移植。形状ロジックを変えないこと。

import type { Manifold as ManifoldT } from "manifold-3d";
import { M } from "../core/engine";
import { defineModel } from "../core/model";

const FACE_WIDTH = 400.0;
const FACE_HEIGHT = 400.0;
const FACE_DEPTH = 100.0;
const FACE_RADIUS = 30.0;
const BODY_DEPTH = 300.0;
const HOLE_RADIUS = 0.3;
// 表情パネルの厚みは本体サイズによらず、この大きさ(mm)指定時の厚みで一定にする
const PANEL_THICKNESS_SIZE = 12.0;

// XY面の四隅を丸めた直方体を作る
function roundedCube(
  width: number, height: number, depth: number, radius: number,
): ManifoldT {
  const { Manifold } = M;
  const innerWidth = width - radius * 2;
  const innerHeight = height - radius * 2;

  let body = Manifold.cube([innerWidth, height, depth]).translate([radius, 0, 0]);
  body = body.add(Manifold.cube([width, innerHeight, depth]).translate([0, radius, 0]));

  const corner = Manifold.cylinder(depth, radius).translate([radius, radius, 0]);
  let corners = corner;
  corners = corners.add(corner.translate([innerWidth, 0, 0]));
  corners = corners.add(corner.translate([0, innerHeight, 0]));
  corners = corners.add(corner.translate([innerWidth, innerHeight, 0]));
  return body.add(corners);
}

function head(): ManifoldT {
  const { Manifold } = M;
  const radius = 150.0;
  const side = Manifold.cylinder(FACE_HEIGHT, radius);
  let shape = Manifold.cube([FACE_WIDTH, FACE_HEIGHT, BODY_DEPTH - radius])
    .translate([0, 0, radius]);
  shape = shape.add(
    Manifold.cube([FACE_WIDTH, FACE_HEIGHT - radius, BODY_DEPTH])
      .translate([0, radius, 0]));
  shape = shape.add(side.rotate([0, 90, 0]).translate([0, radius, radius]));
  return shape.intersect(
    roundedCube(FACE_WIDTH, FACE_HEIGHT, BODY_DEPTH, FACE_RADIUS));
}

function foot(withHole: boolean): ManifoldT {
  const { Manifold } = M;
  const width = 140.0, height = 200.0, depth = 50.0;
  const half = Manifold.cube([width, depth, height]).translate([10, 0, 0]);
  let feet = half.add(half.mirror([1, 0, 0]));

  if (withHole) {
    const footHole = Manifold.cylinder(depth, 40.0)
      .rotate([90, 0, 0])
      .translate([0, depth, height / 2]);
    feet = feet.subtract(footHole);
  }

  const connector = Manifold.cylinder(30.0, 50.0).rotate([90, 0, 0]);
  return connector.add(feet.translate([0, -(depth + 30), -height / 2]));
}

function panel(): ManifoldT {
  const { Manifold } = M;
  const lcdWidth = 320.0, lcdHeight = 240.0, depth = 10.0;

  const eye = Manifold.cylinder(depth, 25.0).translate([-lcdWidth / 4, 40, 0]);
  const eyes = eye.add(eye.mirror([1, 0, 0]));
  const mouth = Manifold.cube([120.0, 30.0, depth]).translate([-60, -60, 0]);
  let face = eyes.add(mouth).translate([lcdWidth / 2, lcdHeight / 2, 0]);

  const buttonWidth = 60.0, buttonHeight = 30.0;
  const step = (lcdWidth - buttonWidth) / 2 * 0.8;
  const button = Manifold.cube([buttonWidth, buttonHeight, depth]).translate(
    [lcdWidth / 2 - buttonWidth / 2, buttonHeight * 1.5, 0]);
  let buttons = button.add(button.translate([-step, 0, 0]));
  buttons = buttons.add(button.translate([step, 0, 0]));

  face = face.translate(
    [(FACE_WIDTH - lcdWidth) / 2, (FACE_HEIGHT - lcdHeight) / 2, 0]);
  buttons = buttons.translate([(FACE_WIDTH - lcdWidth) / 2, 0, 0]);
  return face.add(buttons).translate([0, 0, -depth]);
}

export default defineModel({
  id: "stack_charm",
  name: "ｽﾀｯｸﾁｬｰﾑ",
  description: "ｽﾀｯｸﾁｬﾝのフィギュアだよ!多色!!!!",
  circularSegments: 100,

  params: {
    size: { label: "大きさ", default: 20, type: "float", min: 12, max: 50, step: 1, unit: "mm" },
    top_hole: { label: "上面の穴", default: true, type: "bool" },
    bottom_hole: { label: "底面の穴", default: false, type: "bool" },
    cutout_panel: { label: "表情部分をくり抜く", default: false, type: "bool" },
  },

  build(p) {
    const { Manifold } = M;
    const scale = p.size / FACE_WIDTH;
    let headShape = head().scale([scale, scale, scale]);
    let footShape = foot(p.bottom_hole)
      .translate([FACE_WIDTH / 2, 0, (BODY_DEPTH + FACE_DEPTH) / 2])
      .scale([scale, scale, scale]);
    let faceShape = roundedCube(FACE_WIDTH, FACE_HEIGHT, FACE_DEPTH, FACE_RADIUS)
      .translate([0, 0, BODY_DEPTH])
      .scale([scale, scale, scale]);
    // 表情パネルは XY を size に追従させつつ、Z(厚み)だけは
    // PANEL_THICKNESS_SIZE 相当で固定する。前面(本体前面)に揃える。
    const panelZScale = PANEL_THICKNESS_SIZE / FACE_WIDTH;
    const panelShape = panel()
      .scale([scale, scale, panelZScale])
      .translate([0, 0, (FACE_DEPTH + BODY_DEPTH) * scale]);
    if (p.cutout_panel) faceShape = faceShape.subtract(panelShape);

    // チャーム穴は本体の拡大率にかかわらず半径0.3 mmに保つ。
    const hole = Manifold.cylinder(5.0, HOLE_RADIUS)
      .rotate([90, 0, 0])
      .translate([p.size / 2, 0, p.size / 2]);
    if (p.top_hole) headShape = headShape.subtract(hole.translate([0, p.size, 0]));
    if (p.bottom_hole) {
      headShape = headShape.subtract(hole.translate([0, 5, 0]));
      footShape = footShape.subtract(
        Manifold.cylinder(10.0, HOLE_RADIUS)
          .rotate([90, 0, 0])
          .translate([p.size / 2, 0, p.size / 2]));
    }

    // 顔側をプリントベッドに向ける。X軸まわりに反転したあと、
    // モデル全体が正の座標に収まるようY・Z方向へ移動する。
    const faceDown = (shape: ManifoldT) =>
      shape.rotate([180, 0, 0]).translate([0, p.size, p.size]);

    return [
      { name: "ボディ", manifold: faceDown(headShape.add(footShape)), color: "#FF0000" },
      { name: "顔", manifold: faceDown(faceShape), color: "#000000" },
      { name: "表情", manifold: faceDown(panelShape), color: "#FFFFFF" },
    ];
  },
});
