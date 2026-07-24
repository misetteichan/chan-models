// SPDX-FileCopyrightText: 2026 @misetteichan
// SPDX-License-Identifier: MIT
//
// models/clicker-chan.py の移植。形状ロジック・実測寸法を変えないこと。
//
// 土台メッシュは Python 版の base64 埋め込みではなく、静的アセット
// public/models/clicker-chan.bin(zlib圧縮のまま)を fetch する。
// .bin の生成コマンド(リポジトリルートで):
//   ./.venv/bin/python -c "
//   import base64, importlib.util, pathlib
//   spec = importlib.util.spec_from_file_location('cc', 'models/clicker-chan.py')
//   mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
//   pathlib.Path('web/public/models/clicker-chan.bin').write_bytes(base64.b64decode(mod._DATA))"
//
// バイナリレイアウト(リトルエンディアン、パーツ順に連続):
//   u4 頂点数 nv / u4 三角形数 nt / f4×nv×3 頂点 / u4×nt×3 三角形 ×4パーツ

import { unzlibSync } from "fflate";
import type { Manifold as ManifoldT } from "manifold-3d";
import { M, track } from "../core/engine";
import { defineModel, type Part } from "../core/model";

const PARTS: ReadonlyArray<readonly [string, string]> = [
  ["ボディ", "#FF0000"],
  ["足", "#FF0000"],
  ["顔", "#000000"],
  ["表情", "#FFFFFF"],
];

// 穴(14x14角穴): X-Z断面は side x side。サイズ可変なので X-Z は中央基準(X=0,Z=-9.19)。
// Yは深さ固定なので「中央」ではなく、奥側(+Y)の面を固定位置(HOLE_Y_BACK)にして、
// そこから足側(-Y)方向へ HOLE_DEPTH ぶん伸ばす。
// → HOLE_DEPTH を増やすほど足側へ深く抜ける。サイズを変えても Y はズレない。
const HOLE_XZ_CENTER = [0.0, -9.19] as const; // X中心, Z中心
const HOLE_Y_BACK = 5.93;                     // Yの奥端(固定位置)
const HOLE_DEPTH = 17.0;                      // 奥端から足側(-Y)へ伸ばす深さ
// 足の十字穴: 全長4.2mm固定・アーム厚可変・深さ3.5mm(Y方向)
const CROSS_SPAN = 4.2;
const CROSS_DEPTH = 3.5;
const CROSS_CENTER = [0.03, -12.75, -9.82] as const;

// ヒートン(吊り下げ用ネジ)下穴: 頭頂部(+Y面)の中央から -Y 方向へ。
// 直径0.8mm・深さ3.0mm。ボディ +Y面(Y=11.07)からわずかに外へ出して確実に開口させ、
// 材料内の深さはちょうど3.0mmになるよう入口をオーバーシュートさせる。
const HEATON_DIAM = 0.8;
const HEATON_DEPTH = 3.0;
const HEATON_OVERSHOOT = 0.2;
const HEATON_SURFACE_Y = 11.07;               // ボディ +Y 面
// 穴中心 (X, Z)。Zはボディ+顔を合わせた全体の中心(-9.87)。入口はボディ面内に収まる。
const HEATON_XZ = [0.0, -9.87] as const;

let meshData: { verts: Float32Array; tris: Uint32Array }[] | null = null;

async function loadParts(): Promise<void> {
  const url = `${import.meta.env.BASE_URL}models/clicker-chan.bin`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`土台メッシュの取得に失敗: ${url} (${res.status})`);
  }
  const raw = unzlibSync(new Uint8Array(await res.arrayBuffer()));
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: { verts: Float32Array; tris: Uint32Array }[] = [];
  let off = 0;
  for (let i = 0; i < PARTS.length; i++) {
    const nv = dv.getUint32(off, true);
    const nt = dv.getUint32(off + 4, true);
    off += 8;
    const verts = new Float32Array(raw.buffer, raw.byteOffset + off, nv * 3);
    off += nv * 12;
    const tris = new Uint32Array(raw.buffer, raw.byteOffset + off, nt * 3);
    off += nt * 12;
    out.push({ verts, tris });
  }
  meshData = out;
}

export default defineModel({
  id: "clicker_chan",
  name: "ｸﾘｯｶｰﾁｬﾝ",
  description: "ｸﾘｯｶｰﾁｬﾝだよ! ｶﾁｶﾁ!!!!",

  params: {
    hole_size: { label: "穴の大きさ", default: 14.0, type: "float", min: 13.0, max: 15.0, step: 0.01, unit: "mm" },
    stem_thickness: { label: "ステムのアーム厚", default: 1.18, type: "float", min: 0.18, max: 2.18, step: 0.01, unit: "mm" },
    heaton_hole: { label: "ヒートン下穴", default: false, type: "bool" },
    print_layout: { label: "プリント用配置", default: true, type: "bool" },
  },

  init: loadParts,

  build(p) {
    const { Manifold, Mesh } = M;
    if (!meshData) throw new Error("土台メッシュが未読み込みです");

    // 可変フィーチャーを CSG で生成
    // 穴: X-Zは中央基準(可変サイズ)、Yは奥端(HOLE_Y_BACK)固定で足側へ深さぶん伸ばす
    const hole = Manifold.cube([p.hole_size, HOLE_DEPTH, p.hole_size])
      .translate([
        HOLE_XZ_CENTER[0] - p.hole_size / 2,
        HOLE_Y_BACK - HOLE_DEPTH,
        HOLE_XZ_CENTER[1] - p.hole_size / 2,
      ]);
    const armX = Manifold.cube([CROSS_SPAN, CROSS_DEPTH, p.stem_thickness], true);
    const armZ = Manifold.cube([p.stem_thickness, CROSS_DEPTH, CROSS_SPAN], true);
    const cross = armX.add(armZ).translate([...CROSS_CENTER]);

    // ヒートン下穴: +Y面から -Y へ深さ3mm。入口を少しだけ外へ出す。
    const heaton = Manifold.cylinder(
      HEATON_DEPTH + HEATON_OVERSHOOT, HEATON_DIAM / 2, -1, 24)
      .rotate([90, 0, 0])
      .translate([HEATON_XZ[0], HEATON_SURFACE_Y + HEATON_OVERSHOOT, HEATON_XZ[1]]);

    const built: [string, string, ManifoldT][] = [];
    for (let i = 0; i < PARTS.length; i++) {
      const [name, color] = PARTS[i];
      const { verts, tris } = meshData[i];
      // コンストラクタ経由はメソッド計装を通らないため track で明示的に登録する
      let m = track(new Manifold(
        new Mesh({ numProp: 3, vertProperties: verts, triVerts: tris })));
      if (name === "ボディ" || name === "顔") {
        m = m.subtract(hole);       // 14x14角穴を開ける
      } else if (name === "足") {
        m = m.subtract(cross);      // 十字穴を開ける
      }
      if (name === "ボディ" && p.heaton_hole) {
        m = m.subtract(heaton);     // ヒートン下穴を開ける
      }
      built.push([name, color, m]);
    }

    if (!p.print_layout) {
      const z0 = Math.min(...built.map(([, , m]) => m.boundingBox().min[2]));
      return built.map(([name, color, m]): Part => ({
        name, manifold: m.translate([0, 0, -z0]), color,
      }));
    }

    // プリント用: 足以外はこの向きのままベッド接地。足は寝かせて右隣へ、
    // 上から見てY位置をボディに揃える。
    const main = built.filter(([name]) => name !== "足");
    const footEntry = built.find(([name]) => name === "足")!;
    const z0 = Math.min(...main.map(([, , m]) => m.boundingBox().min[2]));
    const seated = main.map(([n, c, m]): [string, string, ManifoldT] =>
      [n, c, m.translate([0, 0, -z0])]);
    const parts: Part[] = seated.map(([n, c, m]) => ({ name: n, manifold: m, color: c }));
    const boxes = seated.map(([, , m]) => m.boundingBox());
    const mainRight = Math.max(...boxes.map((b) => b.max[0]));
    const mainCy = (Math.min(...boxes.map((b) => b.min[1])) +
                    Math.max(...boxes.map((b) => b.max[1]))) / 2;
    let foot = footEntry[2].rotate([90, 0, 0]);
    const fb = foot.boundingBox();
    foot = foot.translate([
      mainRight + 4.0 - fb.min[0],
      mainCy - (fb.min[1] + fb.max[1]) / 2,
      -fb.min[2],
    ]);
    parts.push({ name: "足", manifold: foot, color: footEntry[1] });
    return parts;
  },
});
