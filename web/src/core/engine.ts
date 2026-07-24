// manifold-3d(WASM)の初期化とメモリ管理。
//
// ⚠ manifold-3d は 3.3.2 に固定(package.json)。npm の WASM ビルドは
// 3.4.0〜3.5.1 で「ブール演算の結果を別のブール演算の入力に使うと誤った
// 形状になる(順序依存で体積が欠ける)」リグレッションがある。
// 同一バージョンの Python ネイティブ版(manifold3d 3.5.x)では発生しない。
// 再現例: cube+cube の結果と回転した cylinder の union が正解 46,063,933mm³
// に対し 41,853,610mm³ になる(バッチ Manifold.union やメッシュ往復では正常)。
// バージョンを上げる際は stack_charm のボディ体積がデスクトップ版と一致する
// ことを必ず確認すること。
//
// JS版 Manifold は wasm ヒープ上のオブジェクトで、GC されず .delete() が必要。
// スライダー操作のたびに generate するアプリでは放置できないため、
// Manifold のメソッドを一括計装し「スコープ内で生まれた Manifold を
// スコープ終了時にまとめて解放する」仕組みを提供する。
// モデル作者はメモリ管理を意識しなくてよい(build() は generate() が
// withManifoldScope 内で呼ぶ)。

import Module from "manifold-3d";
import type { Manifold, ManifoldToplevel } from "manifold-3d";

// initEngine() 完了後に有効。モデルは build() 内で `const { Manifold } = M;`
// のように参照する(モジュールトップレベルでの分割代入は初期化前なので不可)
export let M: ManifoldToplevel;

let currentScope: Set<Manifold> | null = null;

// value が Manifold なら現在のスコープに登録して返す。
// 計装をバイパスする生成経路(`new M.Manifold(mesh)` 等)の戻り値に使う。
export function track<T>(value: T): T {
  if (currentScope && value instanceof M.Manifold) {
    currentScope.add(value as unknown as Manifold);
  }
  return value;
}

// 静的メソッドとインスタンスメソッドの戻り値を track で包む
function instrument(target: object): void {
  for (const key of Object.getOwnPropertyNames(target)) {
    if (key === "constructor" || key === "delete") continue;
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (!desc || typeof desc.value !== "function" || !desc.writable) continue;
    const orig = desc.value as (...args: unknown[]) => unknown;
    Object.defineProperty(target, key, {
      ...desc,
      value: function (this: unknown, ...args: unknown[]) {
        return track(orig.apply(this, args));
      },
    });
  }
}

export async function initEngine(): Promise<void> {
  const wasm = await Module();
  wasm.setup(); // 必須。忘れるとクラスが未バインドのまま実行時エラーになる
  instrument(wasm.Manifold);
  instrument(wasm.Manifold.prototype);
  M = wasm;
}

// fn 内で生成された Manifold をすべて追跡し、終了時に一括解放する。
// メッシュデータは fn 内で TypedArray に取り出しておくこと
// (スコープを抜けた Manifold は使えない)。ネストは想定しない。
export function withManifoldScope<T>(fn: () => T): T {
  const scope = new Set<Manifold>();
  currentScope = scope;
  try {
    return fn();
  } finally {
    currentScope = null;
    for (const m of scope) {
      try {
        m.delete();
      } catch {
        // 二重解放などは無視(解放が目的なので失敗しても実害なし)
      }
    }
  }
}
