"""バイナリSTL(自前)と色付きマルチオブジェクト3MF(lib3mf)の書き出し。

座標はモデル座標(mm, Z-up)をそのまま書く。3MFの単位はmmを明示する。
"""

import struct

import numpy as np

from app.meshing import part_triangles


def write_stl(path, parts):
    """対象パーツの三角形を1つのソリッドに連結してバイナリSTLを書く。

    法線は面ごとに計算する。
    """
    tri_blocks = []
    for part in parts:
        verts, tris = part_triangles(part)
        tri_blocks.append(verts[tris])          # [m, 3, 3]
    all_tris = np.concatenate(tri_blocks, axis=0)

    edge1 = all_tris[:, 1] - all_tris[:, 0]
    edge2 = all_tris[:, 2] - all_tris[:, 0]
    normals = np.cross(edge1, edge2)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    np.divide(normals, lengths, out=normals, where=lengths > 0)

    n = all_tris.shape[0]
    # レコード: 法線3f + 頂点9f + 属性u2 = 50バイト
    records = np.zeros(n, dtype=np.dtype([
        ("normal", "<f4", (3,)),
        ("verts", "<f4", (3, 3)),
        ("attr", "<u2"),
    ]))
    records["normal"] = normals.astype(np.float32)
    records["verts"] = all_tris.astype(np.float32)

    with open(path, "wb") as f:
        f.write(b"chan models binary STL".ljust(80, b"\0"))
        f.write(struct.pack("<I", n))
        f.write(records.tobytes())


def _hex_to_rgb(color):
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def write_3mf(path, parts):
    """パーツごとに名前付きMeshObjectを作り、オブジェクトレベルで色を付けた3MFを書く。

    この方式は Bambu Studio での名前・色の認識を確認済み(docs/architecture.md)。
    """
    import lib3mf

    wrapper = lib3mf.get_wrapper()
    model = wrapper.CreateModel()
    model.SetUnit(lib3mf.ModelUnit.MilliMeter)
    color_group = model.AddColorGroup()

    for part in parts:
        verts, tris = part_triangles(part)

        positions = (lib3mf.Position * len(verts))()
        for i, (x, y, z) in enumerate(verts):
            positions[i].Coordinates[0] = x
            positions[i].Coordinates[1] = y
            positions[i].Coordinates[2] = z
        triangles = (lib3mf.Triangle * len(tris))()
        for i, (a, b, c) in enumerate(tris):
            triangles[i].Indices[0] = int(a)
            triangles[i].Indices[1] = int(b)
            triangles[i].Indices[2] = int(c)

        mesh = model.AddMeshObject()
        mesh.SetName(part.name)
        mesh.SetGeometry(positions, triangles)

        r, g, b = _hex_to_rgb(part.color)
        color_id = color_group.AddColor(wrapper.RGBAToColor(r, g, b, 255))
        mesh.SetObjectLevelProperty(color_group.GetResourceID(), color_id)

        model.AddBuildItem(mesh, wrapper.GetIdentityTransform())

    writer = model.QueryWriter("3mf")
    writer.WriteToFile(str(path))
