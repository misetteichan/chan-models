"""Manifold → three.js 用フラット配列への変換。"""

import numpy as np


def part_to_mesh_dict(part):
    """Part を API 契約の parts 要素(JSON化可能な dict)に変換する。

    vertices は float32 のフラット配列(mm, Z-up)、indices は uint32 の
    フラット配列(三角形)。座標変換はしない(Z-up→Y-up は three.js 側)。
    """
    mesh = part.manifold.to_mesh()
    vertices = np.asarray(mesh.vert_properties, dtype=np.float32)[:, :3]
    indices = np.asarray(mesh.tri_verts, dtype=np.uint32)
    return {
        "name": part.name,
        "color": part.color,
        "vertices": vertices.ravel().tolist(),
        "indices": indices.ravel().tolist(),
        "triangles": int(indices.shape[0]),
    }


def part_triangles(part):
    """パーツの (頂点座標 [n,3] float64, 三角形 [m,3] uint32) を返す(エクスポート用)。"""
    mesh = part.manifold.to_mesh()
    verts = np.asarray(mesh.vert_properties, dtype=np.float64)[:, :3]
    tris = np.asarray(mesh.tri_verts, dtype=np.uint32).reshape(-1, 3)
    return verts, tris
