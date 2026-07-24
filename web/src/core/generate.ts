// メッシュ生成(app/api.py の generate() 相当)。結果スキーマも同じ:
// 成功 {ok:true, elapsed_ms, parts:[{name,color,vertices,indices,triangles}]}
// 失敗 {ok:false, error}
//
// async にしてあるのは model.init() の await と、将来 Web Worker へ実装を
// 差し替えられるようにするため(現行モデルは数ms〜数十msなのでメインスレッド)。

import { M, withManifoldScope } from "./engine";
import { partToMeshPart, type MeshPart } from "./mesh";
import { BuildError, resolveParams, type ModelDef } from "./model";

export type GenerateResult =
  | { ok: true; elapsed_ms: number; parts: MeshPart[] }
  | { ok: false; error: string };

// 直近の generate 成功時のメッシュ(エクスポート対象)。
// Manifold は build 終了時に全て解放するので、TypedArray だけを保持する
let lastParts: MeshPart[] = [];
let lastModelId: string | null = null;

export function getLastParts(): MeshPart[] {
  return lastParts;
}

export function getLastModelId(): string | null {
  return lastModelId;
}

const initialized = new WeakSet<ModelDef>();

export async function generate(
  model: ModelDef,
  values: Record<string, unknown>,
): Promise<GenerateResult> {
  try {
    if (model.init && !initialized.has(model)) {
      await model.init();
      initialized.add(model);
    }
    const p = resolveParams(model, values);
    const start = performance.now();
    // グローバル状態なのでモデル間の実行順序に依存しないよう毎回設定する
    M.setCircularSegments(model.circularSegments ?? 0);
    const parts = withManifoldScope(() => model.build(p).map(partToMeshPart));
    const elapsedMs = Math.round((performance.now() - start) * 10) / 10;
    lastParts = parts;
    lastModelId = model.id;
    return { ok: true, elapsed_ms: elapsedMs, parts };
  } catch (e) {
    if (e instanceof BuildError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    const message =
      e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { ok: false, error: message };
  }
}
