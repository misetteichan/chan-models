// 色付きマルチオブジェクト3MFの生成。
// デスクトップ版 app/export.py write_3mf(lib3mf)と同等の構造を
// zip(fflate)+ XML 手書きで出力する:
//   - 単位 mm を明示
//   - ColorGroup を1つ作り、パーツごとに名前付き object を作って
//     object レベル(pid/pindex 属性)で色を付ける
//   - 各 object を build item として配置(transform 省略=単位行列)
// この構造は Bambu Studio で名前・色の認識を確認済みの方式(docs/architecture.md)。
// 座標はモデル座標(mm, Z-up)のまま書く。

import { strToU8, zipSync } from "fflate";
import type { MeshPart } from "../core/mesh";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!,
  );
}

// 座標の文字列化: 小数6桁で丸めて末尾ゼロを除去(ファイルサイズ抑制)
function fmt(v: number): string {
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

// "#RRGGBB" → "#RRGGBBFF"(lib3mf はアルファ付き8桁で書き出すため揃える)
function colorWithAlpha(color: string): string {
  return `${color.toUpperCase()}FF`;
}

export function build3mf(parts: MeshPart[]): Uint8Array {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<model unit="millimeter" xml:lang="und"` +
    ` xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"` +
    ` xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">`,
  );
  lines.push(` <resources>`);

  // リソースID採番は lib3mf と同じ: colorgroup=1、object は2から連番。
  // pindex は colorgroup 内の並び順(=パーツ順)
  lines.push(`  <m:colorgroup id="1">`);
  for (const part of parts) {
    lines.push(`   <m:color color="${colorWithAlpha(part.color)}"/>`);
  }
  lines.push(`  </m:colorgroup>`);

  parts.forEach((part, i) => {
    const objectId = i + 2;
    lines.push(
      `  <object id="${objectId}" type="model"` +
      ` name="${escapeXml(part.name)}" pid="1" pindex="${i}">`,
    );
    lines.push(`   <mesh>`);
    lines.push(`    <vertices>`);
    const v = part.vertices;
    for (let j = 0; j < v.length; j += 3) {
      lines.push(
        `     <vertex x="${fmt(v[j])}" y="${fmt(v[j + 1])}" z="${fmt(v[j + 2])}"/>`,
      );
    }
    lines.push(`    </vertices>`);
    lines.push(`    <triangles>`);
    const idx = part.indices;
    for (let j = 0; j < idx.length; j += 3) {
      lines.push(
        `     <triangle v1="${idx[j]}" v2="${idx[j + 1]}" v3="${idx[j + 2]}"/>`,
      );
    }
    lines.push(`    </triangles>`);
    lines.push(`   </mesh>`);
    lines.push(`  </object>`);
  });

  lines.push(` </resources>`);
  lines.push(` <build>`);
  parts.forEach((_, i) => lines.push(`  <item objectid="${i + 2}"/>`));
  lines.push(` </build>`);
  lines.push(`</model>`);
  lines.push(``);

  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(lines.join("\n")),
  });
}
