"""models/*.py の自動発見と動的import。リソースパス解決もここに置く。"""

import importlib.util
import sys
import traceback
from pathlib import Path

from app.model_api import Model


def app_root():
    """プロジェクト(または PyInstaller 展開先)のルートパス。

    リソース(ui/, models/)へのアクセスは必ずここを経由する。
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def _model_files():
    models_dir = app_root() / "models"
    if not models_dir.is_dir():
        return []
    return [p for p in sorted(models_dir.glob("*.py"))
            if not p.name.startswith("_")]


def models_signature():
    """models/ の現在の状態(ファイル名・mtime・サイズ)。変更検知に使う。"""
    return tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size)
                 for p in _model_files())


def discover_models():
    """models/*.py を import し、({id: Modelインスタンス}, importエラー一覧) を返す。

    `_` 始まりのファイルは無視。import に失敗したファイルは登録をスキップして
    エラー一覧([{file, message}])に載せ、コンソールに traceback も出す
    (起動は続行する)。再実行可能(ホットリロードが呼び直す)。
    """
    registry = {}
    errors = []

    for path in _model_files():
        module_name = f"models.{path.stem}"
        try:
            spec = importlib.util.spec_from_file_location(module_name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        except Exception as e:
            errors.append({"file": path.name,
                           "message": f"{type(e).__name__}: {e}"})
            print(f"[registry] {path.name} の読み込みに失敗(スキップ):",
                  file=sys.stderr)
            traceback.print_exc()
            continue

        for obj in vars(module).values():
            if (isinstance(obj, type) and issubclass(obj, Model)
                    and obj is not Model and obj.__module__ == module_name):
                instance = obj()
                if not instance.id:
                    print(f"[registry] {path.name}: id が空のモデルをスキップ",
                          file=sys.stderr)
                    continue
                if instance.id in registry:
                    print(f"[registry] id 重複: {instance.id}({path.name})を"
                          "スキップ", file=sys.stderr)
                    continue
                instance._source_file = path.name  # ホットリロードの保持判定用
                registry[instance.id] = instance
    return registry, errors
