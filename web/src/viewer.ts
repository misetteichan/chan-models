// three.js ビューア(デスクトップ版 ui/app.js の該当部の移植)。
// 見た目(ライティング・配色・カメラ挙動)を変えないこと。

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MeshPart } from "./core/mesh";

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let modelGroup: THREE.Group;

export function initViewer(container: HTMLElement): void {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e2127);

  camera = new THREE.PerspectiveCamera(
    50, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(120, 100, 160);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xbfd4e5, 0x3a3630, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(150, 250, 200);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dir2.position.set(-120, 80, -150);
  scene.add(dir2);

  const grid = new THREE.GridHelper(400, 40, 0x4a5058, 0x30353c);
  scene.add(grid);

  // モデルは mm・Z-up。three.js は Y-up なのでここで変換する
  // (生成・エクスポート側では座標変換しない: docs/architecture.md)
  modelGroup = new THREE.Group();
  modelGroup.rotation.x = -Math.PI / 2;
  scene.add(modelGroup);

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

export function clearModelGroup(): void {
  while (modelGroup.children.length) {
    const mesh = modelGroup.children[0] as THREE.Mesh;
    modelGroup.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

export function showParts(
  parts: MeshPart[],
  partVisibility: Record<string, boolean>,
): void {
  clearModelGroup();
  for (const part of parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: part.color, flatShading: true, metalness: 0.05, roughness: 0.65,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    if (!(part.name in partVisibility)) partVisibility[part.name] = true;
    mesh.visible = partVisibility[part.name];
    modelGroup.add(mesh);
  }
}

export function setPartVisible(name: string, visible: boolean): void {
  const mesh = modelGroup.getObjectByName(name);
  if (mesh) mesh.visible = visible;
}

export function visibleNames(): string[] {
  return modelGroup.children.filter((m) => m.visible).map((m) => m.name);
}

export function fitCamera(): void {
  const box = new THREE.Box3();
  let has = false;
  for (const mesh of modelGroup.children) {
    if (!mesh.visible) continue;
    box.expandByObject(mesh);
    has = true;
  }
  if (!has) return;
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = sphere.radius / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.15;
  const offset = new THREE.Vector3(0.55, 0.5, 1).normalize().multiplyScalar(dist);
  camera.position.copy(center).add(offset);
  controls.target.copy(center);
  controls.update();
}
