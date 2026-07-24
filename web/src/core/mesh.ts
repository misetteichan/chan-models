// Manifold → 表示・エクスポート用のフラット配列(app/meshing.py 相当)。
// 座標はモデル座標(mm, Z-up)のまま。Y-up への変換は viewer 側で行う。

import type { Part } from "./model";

export interface MeshPart {
  name: string;
  color: string;
  vertices: Float32Array; // [x0,y0,z0, x1,y1,z1, ...]
  indices: Uint32Array;   // [a0,b0,c0, ...]
  triangles: number;
}

export function partToMeshPart(part: Part): MeshPart {
  const mesh = part.manifold.getMesh();
  let vertices = mesh.vertProperties;
  // vertProperties は [x,y,z, ...追加プロパティ] の可能性があるので座標だけ抜く
  if (mesh.numProp !== 3) {
    const stride = mesh.numProp;
    const numVert = vertices.length / stride;
    const out = new Float32Array(numVert * 3);
    for (let i = 0; i < numVert; i++) {
      out[i * 3] = vertices[i * stride];
      out[i * 3 + 1] = vertices[i * stride + 1];
      out[i * 3 + 2] = vertices[i * stride + 2];
    }
    vertices = out;
  }
  return {
    name: part.name,
    color: part.color,
    vertices,
    indices: mesh.triVerts,
    triangles: mesh.triVerts.length / 3,
  };
}
