// モデルの静的登録。デスクトップ版の models/ 動的発見と違い、静的サイトでは
// ビルド時にバンドルするため、モデルを追加したらここに1行足す。

import { serializeModel, type ModelDef, type ModelInfo } from "./model";
import stackCharmColor from "../models/stack-charm-color";
import stackCharmMono from "../models/stack-charm-mono";
import clickerChan from "../models/clicker-chan";

export const MODELS: ModelDef[] = [
  stackCharmColor,
  stackCharmMono,
  clickerChan,
];

export function listModels(): ModelInfo[] {
  return MODELS.map(serializeModel);
}

export function findModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}
