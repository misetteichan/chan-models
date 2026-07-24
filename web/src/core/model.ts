// モデルスクリプト向け公開API。デスクトップ版 app/model_api.py の写像
// (Param → ParamSpec / Part / Model → ModelDef)。セマンティクスを揃えること。

import type { Manifold } from "manifold-3d";

export type ParamType = "float" | "int" | "bool";

export interface ParamSpec {
  label: string;
  default: number | boolean;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

// Python の `p.<key>` 相当。bool 宣言は boolean、それ以外は number になる
export type ResolvedParams<P extends Record<string, ParamSpec>> = {
  [K in keyof P]: P[K]["type"] extends "bool" ? boolean : number;
};

// ビューアの色分け・表示切替・3MF内オブジェクトの単位
export interface Part {
  name: string;
  manifold: Manifold;
  color: string; // "#RRGGBB"
}

export interface ModelDef<
  P extends Record<string, ParamSpec> = Record<string, ParamSpec>,
> {
  id: string;
  name: string;
  description: string;
  params: P;
  // Python の set_circular_segments() 相当。generate が build 直前に毎回
  // 適用する(未指定=0 は Manifold 既定の品質ベース)
  circularSegments?: number;
  // 非同期アセットの読み込み(初回 generate 時に一度だけ await される)
  init?(): Promise<void>;
  build(p: ResolvedParams<P>): Part[];
}

// params の型リテラル("bool" 等)を保ったまま ModelDef を作るヘルパー
export function defineModel<P extends Record<string, ParamSpec>>(
  def: ModelDef<P>,
): ModelDef<P> {
  return def;
}

// Python の `raise ValueError("理由")` 相当。message がそのままUIに赤字で出る
export class BuildError extends Error {}

// Param.coerce(): 型変換し、min/max にクランプ。変換不能ならデフォルト値
function coerce(spec: ParamSpec, value: unknown): number | boolean {
  if (spec.type === "bool") return Boolean(value);
  let v = Number(value);
  if (Number.isNaN(v)) v = Number(spec.default);
  if (spec.min != null) v = Math.max(v, spec.min);
  if (spec.max != null) v = Math.min(v, spec.max);
  return spec.type === "int" ? Math.round(v) : v;
}

// 欠損キーをデフォルトで補完し、型強制・クランプ済みの値オブジェクトを返す
export function resolveParams<P extends Record<string, ParamSpec>>(
  model: ModelDef<P>,
  values: Record<string, unknown>,
): ResolvedParams<P> {
  const resolved: Record<string, number | boolean> = {};
  for (const [key, spec] of Object.entries(model.params)) {
    const raw = key in values ? values[key] : spec.default;
    resolved[key] = coerce(spec, raw);
  }
  return resolved as ResolvedParams<P>;
}

// ---- UI向けシリアライズ(デスクトップ版 list_models() と同スキーマ) ----

export interface ParamInfo {
  key: string;
  label: string;
  default: number | boolean;
  type: ParamType;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  params: ParamInfo[];
}

export function serializeModel(model: ModelDef): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    params: Object.entries(model.params).map(([key, s]) => ({
      key,
      label: s.label,
      default: s.default,
      type: s.type,
      min: s.min ?? null,
      max: s.max ?? null,
      // step 省略時のデフォルトは Param.__init__ と同じ(float=0.1 / int=1)
      step: s.step ?? (s.type === "bool" ? null : s.type === "float" ? 0.1 : 1),
      unit: s.unit ?? "",
    })),
  };
}
