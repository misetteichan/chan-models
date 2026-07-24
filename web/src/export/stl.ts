// バイナリSTLの生成。デスクトップ版 app/export.py write_stl と同じレイアウト:
// 80バイトヘッダ + 三角形数(u4) + [法線3f + 頂点9f + 属性u2](50バイト)×N。
// すべてリトルエンディアン。法線は面ごとに cross(e1, e2) を正規化(長さ0は0ベクトル)。
// 座標はモデル座標(mm, Z-up)のまま書く。

import type { MeshPart } from "../core/mesh";

const HEADER = "chan models binary STL";

export function buildStl(parts: MeshPart[]): ArrayBuffer {
  let triCount = 0;
  for (const p of parts) triCount += p.triangles;

  const buf = new ArrayBuffer(84 + 50 * triCount);
  const dv = new DataView(buf);
  for (let i = 0; i < HEADER.length; i++) dv.setUint8(i, HEADER.charCodeAt(i));
  dv.setUint32(80, triCount, true);

  let off = 84;
  for (const part of parts) {
    const v = part.vertices;
    const idx = part.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ax = v[a], ay = v[a + 1], az = v[a + 2];
      const bx = v[b], by = v[b + 1], bz = v[b + 2];
      const cx = v[c], cy = v[c + 1], cz = v[c + 2];

      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) {
        nx /= len; ny /= len; nz /= len;
      }

      dv.setFloat32(off, nx, true);
      dv.setFloat32(off + 4, ny, true);
      dv.setFloat32(off + 8, nz, true);
      dv.setFloat32(off + 12, ax, true);
      dv.setFloat32(off + 16, ay, true);
      dv.setFloat32(off + 20, az, true);
      dv.setFloat32(off + 24, bx, true);
      dv.setFloat32(off + 28, by, true);
      dv.setFloat32(off + 32, bz, true);
      dv.setFloat32(off + 36, cx, true);
      dv.setFloat32(off + 40, cy, true);
      dv.setFloat32(off + 44, cz, true);
      // 属性(u2)は ArrayBuffer 初期値の 0 のまま
      off += 50;
    }
  }
  return buf;
}
