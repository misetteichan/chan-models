// chan models Web版 UI。デスクトップ版 ui/app.js の移植。
// pywebview ブリッジ呼び出しをローカル関数(core/・export/)に置き換えた以外は
// ロジックを変えないこと。ホットリロード(poll_models)は Vite HMR が代替。

import { generate, getLastModelId, getLastParts } from "./core/generate";
import type { ModelInfo, ParamInfo } from "./core/model";
import { findModel, listModels } from "./core/registry";
import { downloadBlob, sanitizeFilename } from "./export/download";
import { buildStl } from "./export/stl";
import { build3mf } from "./export/threemf";
import { zipSync } from "fflate";
import * as viewer from "./viewer";

const DEBOUNCE_MS = 250;

// ---- 状態 ----
let models: ModelInfo[] = [];
let currentModel: ModelInfo | null = null;
let values: Record<string, number | boolean> = {};
let partVisibility: Record<string, boolean> = {};
let generateSeq = 0; // 連打時に古い結果を捨てるための世代番号
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// ---- DOM ----
const $modelSelect = document.getElementById("model-select") as HTMLSelectElement;
const $modelDesc = document.getElementById("model-desc") as HTMLParagraphElement;
const $paramsForm = document.getElementById("params-form") as HTMLFormElement;
const $partsList = document.getElementById("parts-list") as HTMLUListElement;
const $status = document.getElementById("status") as HTMLDivElement;

// ---- ステータス欄 ----
export function setStatus(text: string, isError = false): void {
  $status.textContent = text;
  $status.classList.toggle("error", isError);
}

// ---- パラメータフォーム(モデル定義から自動生成) ----
function buildForm(model: ModelInfo): void {
  $paramsForm.textContent = "";
  for (const param of model.params) {
    const row = document.createElement("div");
    row.className = "param";

    if (param.type === "bool") {
      const wrap = document.createElement("label");
      wrap.className = "param-bool";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = Boolean(values[param.key]);
      check.addEventListener("change", () => {
        values[param.key] = check.checked;
        scheduleGenerate();
      });
      wrap.appendChild(check);
      wrap.appendChild(document.createTextNode(param.label));
      row.appendChild(wrap);
      $paramsForm.appendChild(row);
      continue;
    }

    // float / int: 数値入力+(min/max両方あれば)スライダー
    const head = document.createElement("div");
    head.className = "param-head";
    const label = document.createElement("label");
    label.textContent = param.label;
    head.appendChild(label);

    const number = document.createElement("input");
    number.type = "number";
    if (param.min != null) number.min = String(param.min);
    if (param.max != null) number.max = String(param.max);
    if (param.step != null) number.step = String(param.step);
    number.value = String(values[param.key]);
    head.appendChild(number);

    if (param.unit) {
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = param.unit;
      head.appendChild(unit);
    }
    row.appendChild(head);

    let slider: HTMLInputElement | null = null;
    if (param.min != null && param.max != null) {
      slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(param.min);
      slider.max = String(param.max);
      if (param.step != null) slider.step = String(param.step);
      slider.value = String(values[param.key]);
      row.appendChild(slider);
    }

    const commit = (raw: string) => {
      const v = param.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
      if (Number.isNaN(v)) return;
      values[param.key] = v;
      scheduleGenerate();
    };
    number.addEventListener("input", () => {
      if (slider) slider.value = number.value;
      commit(number.value);
    });
    slider?.addEventListener("input", () => {
      number.value = slider.value;
      commit(slider.value);
    });

    $paramsForm.appendChild(row);
  }
}

// ---- パーツ一覧 ----
interface PartSummary {
  name: string;
  color: string;
  triangles: number;
}

function buildPartsList(parts: PartSummary[]): void {
  $partsList.textContent = "";
  for (const part of parts) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    label.style.display = "contents";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = partVisibility[part.name];
    check.addEventListener("change", () => {
      partVisibility[part.name] = check.checked;
      viewer.setPartVisible(part.name, check.checked);
    });

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = part.color;

    const tris = document.createElement("span");
    tris.className = "tri-count";
    tris.textContent = `${part.triangles.toLocaleString()} メッシュ`;

    label.appendChild(check);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(part.name));
    label.appendChild(tris);
    li.appendChild(label);
    $partsList.appendChild(li);
  }
}

// ---- 生成 ----
function scheduleGenerate(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runGenerate(false), DEBOUNCE_MS);
}

async function runGenerate(fitAfter: boolean): Promise<void> {
  if (!currentModel) return;
  const model = findModel(currentModel.id);
  if (!model) return;
  const seq = ++generateSeq;
  setStatus("生成中…");
  const res = await generate(model, values);
  if (seq !== generateSeq) return; // 古いリクエストの結果は捨てる
  if (!res.ok) {
    setStatus(res.error, true);
    return;
  }
  viewer.showParts(res.parts, partVisibility);
  buildPartsList(res.parts);
  const totalTris = res.parts.reduce((s, p) => s + p.triangles, 0);
  setStatus(`生成 ${res.elapsed_ms} ms ・ ${totalTris.toLocaleString()} メッシュ`);
  if (fitAfter) viewer.fitCamera();
}

// ---- モデル選択 ----
function selectModel(model: ModelInfo): void {
  currentModel = model;
  $modelDesc.textContent = model.description;
  values = {};
  for (const p of model.params) values[p.key] = p.default;
  partVisibility = {};
  buildForm(model);
  void runGenerate(true);
}

// ---- エクスポート ----
// デスクトップ版と違い保存ダイアログがないため、成功時は
// 「〜をダウンロードしました」をステータスに出す。
// STLは1ファイルに複数オブジェクトを持てないため、表示パーツが複数のときは
// <model>_<part>.stl を zip にまとめてダウンロードする。
function exportFile(kind: "stl" | "3mf"): void {
  const names = new Set(viewer.visibleNames());
  const parts = getLastParts().filter((p) => names.has(p.name));
  if (!parts.length) {
    setStatus(
      "エクスポート対象のパーツがありません(先に生成し、パーツを表示状態にしてください)",
      true,
    );
    return;
  }
  const model = sanitizeFilename(getLastModelId() ?? "model");
  try {
    if (kind === "3mf") {
      downloadBlob(build3mf(parts), `${model}.3mf`, "model/3mf");
      setStatus(`${model}.3mf をダウンロードしました`);
    } else if (parts.length === 1) {
      downloadBlob(buildStl(parts), `${model}.stl`, "model/stl");
      setStatus(`${model}.stl をダウンロードしました`);
    } else {
      const files: Record<string, Uint8Array> = {};
      for (const part of parts) {
        files[`${model}_${sanitizeFilename(part.name)}.stl`] =
          new Uint8Array(buildStl([part]));
      }
      downloadBlob(zipSync(files), `${model}_stl.zip`, "application/zip");
      setStatus(`${model}_stl.zip をダウンロードしました`);
    }
  } catch (e) {
    console.error(e);
    setStatus(e instanceof Error ? `${e.name}: ${e.message}` : String(e), true);
  }
}

// ---- 初期化 ----
export function initUI(): void {
  const $paramsToggle = document.getElementById("params-toggle") as HTMLInputElement;
  const $resetRow = document.getElementById("reset-row") as HTMLDivElement;
  // パラメータ調整はメイン用途(選択→表示→保存)ではないので初期は折りたたみ
  $paramsToggle.addEventListener("change", () => {
    const open = $paramsToggle.checked;
    $paramsForm.hidden = !open;
    $resetRow.hidden = !open;
  });
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    if (!currentModel) return;
    values = {};
    for (const p of currentModel.params) values[p.key] = p.default;
    buildForm(currentModel);
    void runGenerate(false);
  });

  $modelSelect.addEventListener("change", () => {
    const model = models.find((m) => m.id === $modelSelect.value);
    if (model) selectModel(model);
  });
  document.getElementById("btn-fit")!.addEventListener("click", viewer.fitCamera);
  document.getElementById("btn-stl")!.addEventListener("click", () => exportFile("stl"));
  document.getElementById("btn-3mf")!.addEventListener("click", () => exportFile("3mf"));

  models = listModels();
  $modelSelect.textContent = "";
  for (const model of models) {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.name;
    $modelSelect.appendChild(opt);
  }
  if (!models.length) {
    setStatus("モデルが登録されていません", true);
    return;
  }
  selectModel(models[0]);
}
