// three.bundle.js のエントリ。ESモジュールを従来型スクリプトに変換し、
// グローバル THREE / OrbitControls を公開する(file://直読みのため。
// 生成方法は docs/architecture.md、実行は build-bundle.sh)。
import * as THREE from "./three.module.min.js";
import { OrbitControls } from "./OrbitControls.js";

window.THREE = THREE;
window.OrbitControls = OrbitControls;
