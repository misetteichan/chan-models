"""JS↔Pythonブリッジ。API契約は docs/architecture.md と同期を保つこと。

注意: pywebview は js_api の公開属性を再帰的にJSへ公開するため、
このクラスには関数以外の公開属性を置かない(内部状態は `_` 付き)。
js_api 呼び出しはリクエストごとに別スレッドで走る点にも注意。
"""

import re
import sys
import threading
import time
import traceback

from app import __version__, export
from app.meshing import part_to_mesh_dict
from app.registry import discover_models, models_signature

# ファイル名に使えない文字(Windowsの禁止文字とパス区切り)を _ に置換
_UNSAFE_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _sanitize_filename(name):
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", name).strip(" .")
    return cleaned or "part"


class Api:
    def __init__(self):
        self._reload_lock = threading.Lock()
        self._registry, self._import_errors = discover_models()
        self._models_sig = models_signature()
        self._last_parts = []       # 直近の generate 成功時の Part リスト
        self._last_model_id = None  # エクスポートのデフォルトファイル名に使う

    def version(self):
        """アプリのバージョン文字列(app/__init__.py の __version__)。UIの表示用。"""
        return __version__

    def _serialize_models(self):
        return [
            {
                "id": model.id,
                "name": model.name,
                "description": model.description,
                "params": [p.to_dict(key) for key, p in model.params.items()],
            }
            for model in self._registry.values()
        ]

    def list_models(self):
        return self._serialize_models()

    def poll_models(self):
        """ホットリロード用。UIが1秒間隔で呼ぶ(契約は docs/architecture.md)。"""
        with self._reload_lock:
            sig = models_signature()
            if sig == self._models_sig:
                return {"changed": False, "errors": self._import_errors}
            self._models_sig = sig
            new_registry, errors = discover_models()
            # importに失敗したファイルは直前の正常なモデルを残す
            # (エディタでの書きかけ保存で選択中モデルが消えないように)
            error_files = {e["file"] for e in errors}
            for model_id, model in self._registry.items():
                if (getattr(model, "_source_file", None) in error_files
                        and model_id not in new_registry):
                    new_registry[model_id] = model
            self._registry = new_registry
            self._import_errors = errors
            return {"changed": True, "models": self._serialize_models(),
                    "errors": errors}

    def generate(self, model_id, values):
        model = self._registry.get(model_id)
        if model is None:
            return {"ok": False, "error": f"未知のモデルID: {model_id}"}
        try:
            p = model.resolve_params(values)
            start = time.perf_counter()
            parts = model.build(p)
            mesh_dicts = [part_to_mesh_dict(part) for part in parts]
            elapsed_ms = (time.perf_counter() - start) * 1000
        except ValueError as e:
            return {"ok": False, "error": f"ValueError: {e}"}
        except Exception as e:
            traceback.print_exc()
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

        self._last_parts = parts
        self._last_model_id = model_id
        return {"ok": True, "elapsed_ms": round(elapsed_ms, 1),
                "parts": mesh_dicts}

    def _release_parts(self):
        """終了時に呼ぶ(run.py)。Manifold への参照を解放し、インタプリタ終了時の
        nanobind リーク警告(無害だが紛らわしい)を抑える。`_` 付きなのでJSには
        公開されない。"""
        self._last_parts = []

    def export_file(self, kind, visible_names):
        if kind not in ("stl", "3mf"):
            return {"ok": False, "error": f"未知のエクスポート形式: {kind}"}
        parts = [p for p in self._last_parts if p.name in set(visible_names)]
        if not parts:
            return {"ok": False,
                    "error": "エクスポート対象のパーツがありません(先に生成し、"
                             "パーツを表示状態にしてください)"}

        # STLは1ファイルに複数オブジェクトを持てないため、表示パーツが複数のときは
        # フォルダを選ばせてパーツごとに <model>_<part>.stl を書き出す。
        # 単一パーツ(および3MF)は従来どおり保存ダイアログで1ファイル。
        if kind == "stl" and len(parts) > 1:
            return self._export_stl_per_part(parts)
        return self._export_single_file(kind, parts)

    def _export_single_file(self, kind, parts):
        import webview
        window = webview.windows[0]
        model = self._last_model_id or "model"
        result = window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename=f"{model}.{kind}",
            file_types=(f"{kind.upper()} ファイル (*.{kind})",),
        )
        if not result:
            return {"ok": False, "error": ""}  # キャンセル(エラー扱いにしない)
        path = result if isinstance(result, str) else result[0]

        try:
            if kind == "stl":
                export.write_stl(path, parts)
            else:
                export.write_3mf(path, parts)
        except Exception as e:
            traceback.print_exc()
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return {"ok": True, "paths": [path]}

    def _export_stl_per_part(self, parts):
        import os
        import webview
        window = webview.windows[0]
        result = window.create_file_dialog(webview.FileDialog.FOLDER)
        if not result:
            return {"ok": False, "error": ""}  # キャンセル(エラー扱いにしない)
        folder = result if isinstance(result, str) else result[0]

        model = _sanitize_filename(self._last_model_id or "model")
        try:
            paths = []
            for part in parts:
                name = f"{model}_{_sanitize_filename(part.name)}.stl"
                path = os.path.join(folder, name)
                export.write_stl(path, [part])
                paths.append(path)
        except Exception as e:
            traceback.print_exc()
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return {"ok": True, "paths": paths}
