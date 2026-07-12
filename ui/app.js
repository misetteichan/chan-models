// chan models UI。従来型スクリプト(file://直読みのためESモジュール禁止)。
// JS↔Python API契約は docs/architecture.md と同期を保つこと。
"use strict";

(function () {
  var DEBOUNCE_MS = 250;

  // ---- 状態 ----
  var models = [];          // list_models() の結果
  var currentModel = null;  // 選択中のモデル定義
  var values = {};          // 現在のパラメータ値
  var partVisibility = {};  // パーツ名 → 表示中か
  var generateSeq = 0;      // 連打時に古い結果を捨てるための世代番号
  var debounceTimer = null;

  // ---- DOM ----
  var $modelSelect = document.getElementById("model-select");
  var $modelDesc = document.getElementById("model-desc");
  var $paramsForm = document.getElementById("params-form");
  var $partsList = document.getElementById("parts-list");
  var $status = document.getElementById("status");

  // ---- three.js ビューア ----
  var scene, camera, renderer, controls, modelGroup;

  function initViewer() {
    var container = document.getElementById("viewer");
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
    var dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(150, 250, 200);
    scene.add(dir);
    var dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-120, 80, -150);
    scene.add(dir2);

    var grid = new THREE.GridHelper(400, 40, 0x4a5058, 0x30353c);
    scene.add(grid);

    // モデルは mm・Z-up。three.js は Y-up なのでここで変換する
    // (Python側では座標変換しない: docs/architecture.md)
    modelGroup = new THREE.Group();
    modelGroup.rotation.x = -Math.PI / 2;
    scene.add(modelGroup);

    window.addEventListener("resize", function () {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  function clearModelGroup() {
    while (modelGroup.children.length) {
      var mesh = modelGroup.children[0];
      modelGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  function showParts(parts) {
    clearModelGroup();
    parts.forEach(function (part) {
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position",
        new THREE.BufferAttribute(new Float32Array(part.vertices), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
      geometry.computeVertexNormals();
      var material = new THREE.MeshStandardMaterial({
        color: part.color, flatShading: true, metalness: 0.05, roughness: 0.65,
      });
      var mesh = new THREE.Mesh(geometry, material);
      mesh.name = part.name;
      if (!(part.name in partVisibility)) partVisibility[part.name] = true;
      mesh.visible = partVisibility[part.name];
      modelGroup.add(mesh);
    });
  }

  function fitCamera() {
    var box = new THREE.Box3();
    var has = false;
    modelGroup.children.forEach(function (mesh) {
      if (!mesh.visible) return;
      box.expandByObject(mesh);
      has = true;
    });
    if (!has) return;
    var center = box.getCenter(new THREE.Vector3());
    var sphere = box.getBoundingSphere(new THREE.Sphere());
    var dist = sphere.radius / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.15;
    var offset = new THREE.Vector3(0.55, 0.5, 1).normalize().multiplyScalar(dist);
    camera.position.copy(center).add(offset);
    controls.target.copy(center);
    controls.update();
  }

  // ---- ステータス欄 ----
  function setStatus(text, isError) {
    $status.textContent = text;
    $status.classList.toggle("error", !!isError);
  }

  // ---- パラメータフォーム(モデル定義から自動生成) ----
  function buildForm(model) {
    $paramsForm.textContent = "";
    model.params.forEach(function (param) {
      var row = document.createElement("div");
      row.className = "param";

      if (param.type === "bool") {
        var wrap = document.createElement("label");
        wrap.className = "param-bool";
        var check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!values[param.key];
        check.addEventListener("change", function () {
          values[param.key] = check.checked;
          scheduleGenerate();
        });
        wrap.appendChild(check);
        wrap.appendChild(document.createTextNode(param.label));
        row.appendChild(wrap);
        $paramsForm.appendChild(row);
        return;
      }

      // float / int: 数値入力+(min/max両方あれば)スライダー
      var head = document.createElement("div");
      head.className = "param-head";
      var label = document.createElement("label");
      label.textContent = param.label;
      head.appendChild(label);

      var number = document.createElement("input");
      number.type = "number";
      if (param.min != null) number.min = param.min;
      if (param.max != null) number.max = param.max;
      if (param.step != null) number.step = param.step;
      number.value = values[param.key];
      head.appendChild(number);

      if (param.unit) {
        var unit = document.createElement("span");
        unit.className = "unit";
        unit.textContent = param.unit;
        head.appendChild(unit);
      }
      row.appendChild(head);

      var slider = null;
      if (param.min != null && param.max != null) {
        slider = document.createElement("input");
        slider.type = "range";
        slider.min = param.min;
        slider.max = param.max;
        if (param.step != null) slider.step = param.step;
        slider.value = values[param.key];
        row.appendChild(slider);
      }

      function commit(raw) {
        var v = param.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
        if (isNaN(v)) return;
        values[param.key] = v;
        scheduleGenerate();
      }
      number.addEventListener("input", function () {
        if (slider) slider.value = number.value;
        commit(number.value);
      });
      if (slider) {
        slider.addEventListener("input", function () {
          number.value = slider.value;
          commit(slider.value);
        });
      }

      $paramsForm.appendChild(row);
    });
  }

  // ---- パーツ一覧 ----
  function buildPartsList(parts) {
    $partsList.textContent = "";
    parts.forEach(function (part) {
      var li = document.createElement("li");
      var label = document.createElement("label");
      label.style.display = "contents";

      var check = document.createElement("input");
      check.type = "checkbox";
      check.checked = partVisibility[part.name];
      check.addEventListener("change", function () {
        partVisibility[part.name] = check.checked;
        var mesh = modelGroup.getObjectByName(part.name);
        if (mesh) mesh.visible = check.checked;
      });

      var swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = part.color;

      var tris = document.createElement("span");
      tris.className = "tri-count";
      tris.textContent = part.triangles.toLocaleString() + " メッシュ";

      label.appendChild(check);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(part.name));
      label.appendChild(tris);
      li.appendChild(label);
      $partsList.appendChild(li);
    });
  }

  // ---- 生成 ----
  function scheduleGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generate, DEBOUNCE_MS);
  }

  function generate(fitAfter) {
    if (!currentModel) return;
    var seq = ++generateSeq;
    setStatus("生成中…");
    window.pywebview.api.generate(currentModel.id, values).then(function (res) {
      if (seq !== generateSeq) return; // 古いリクエストの結果は捨てる
      if (!res.ok) {
        setStatus(res.error, true);
        return;
      }
      showParts(res.parts);
      buildPartsList(res.parts);
      if (importErrors.length) {
        showImportErrors(); // モデルファイルのエラー表示を成功メッセージで消さない
      } else {
        var totalTris = res.parts.reduce(function (s, p) { return s + p.triangles; }, 0);
        setStatus("生成 " + res.elapsed_ms + " ms ・ " +
                  totalTris.toLocaleString() + " メッシュ");
      }
      if (fitAfter) fitCamera();
    }).catch(function (err) {
      if (seq !== generateSeq) return;
      setStatus("ブリッジエラー: " + err, true);
    });
  }

  // ---- モデル選択 ----
  function selectModel(model) {
    currentModel = model;
    $modelDesc.textContent = model.description;
    values = {};
    model.params.forEach(function (p) { values[p.key] = p.default; });
    partVisibility = {};
    buildForm(model);
    generate(true);
  }

  // ---- エクスポート ----
  function visibleNames() {
    return modelGroup.children
      .filter(function (m) { return m.visible; })
      .map(function (m) { return m.name; });
  }

  // 成功・キャンセル時は何も表示しない(保存ダイアログ自体が確認になるため)。
  // エラーのみステータス欄に赤字で出す。
  function exportFile(kind) {
    window.pywebview.api.export_file(kind, visibleNames()).then(function (res) {
      if (!res.ok && res.error !== "") setStatus(res.error, true);
    }).catch(function (err) {
      setStatus("ブリッジエラー: " + err, true);
    });
  }

  // ---- モデル一覧の(再)構築 ----
  // 起動時とホットリロード時の両方から呼ばれる。選択中モデルが残っていれば
  // 選択と入力値を維持する
  function applyModels(newModels) {
    models = newModels;
    var prevId = currentModel && currentModel.id;
    $modelSelect.textContent = "";
    models.forEach(function (model) {
      var opt = document.createElement("option");
      opt.value = model.id;
      opt.textContent = model.name;
      $modelSelect.appendChild(opt);
    });

    if (!models.length) {
      currentModel = null;
      clearModelGroup();
      $partsList.textContent = "";
      $paramsForm.textContent = "";
      setStatus("models/ にモデルが見つかりません", true);
      return;
    }

    var kept = models.find(function (m) { return m.id === prevId; });
    if (kept) {
      $modelSelect.value = prevId;
      currentModel = kept;
      var oldValues = values;
      values = {};
      kept.params.forEach(function (p) {
        // 型が変わっていない既存パラメータの入力値は引き継ぐ
        values[p.key] = (p.key in oldValues &&
                         typeof oldValues[p.key] === typeof p.default)
          ? oldValues[p.key] : p.default;
      });
      buildForm(kept);
      generate(false);
    } else {
      selectModel(models[0]);
    }
  }

  // ---- ホットリロード(models/ の変更を1秒間隔で検知) ----
  var importErrors = [];

  function showImportErrors() {
    setStatus(importErrors.map(function (e) {
      return e.file + " — " + e.message;
    }).join(" / "), true);
  }

  function startPolling() {
    setInterval(function () {
      window.pywebview.api.poll_models().then(function (res) {
        importErrors = res.errors || [];
        if (res.changed) applyModels(res.models);
        if (importErrors.length) showImportErrors();
      }).catch(function () { /* 終了間際などの一時的な失敗は無視 */ });
    }, 1000);
  }

  // ---- 初期化 ----
  function init() {
    window.pywebview.api.version().then(function (v) {
      document.getElementById("version").textContent = "v" + v;
    }).catch(function () { /* バージョン表示は必須ではないので握りつぶす */ });
    window.pywebview.api.list_models().then(function (result) {
      applyModels(result);
      startPolling();
    }).catch(function (err) {
      setStatus("モデル一覧の取得に失敗: " + err, true);
    });
  }

  // パラメータ調整はメイン用途(選択→表示→保存)ではないので初期は折りたたみ
  var $paramsToggle = document.getElementById("params-toggle");
  var $resetRow = document.getElementById("reset-row");
  $paramsToggle.addEventListener("change", function () {
    var open = $paramsToggle.checked;
    $paramsForm.hidden = !open;
    $resetRow.hidden = !open;
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    if (!currentModel) return;
    values = {};
    currentModel.params.forEach(function (p) { values[p.key] = p.default; });
    buildForm(currentModel);
    generate(false);
  });

  $modelSelect.addEventListener("change", function () {
    var model = models.find(function (m) { return m.id === $modelSelect.value; });
    if (model) selectModel(model);
  });
  document.getElementById("btn-fit").addEventListener("click", fitCamera);
  document.getElementById("btn-stl").addEventListener("click", function () {
    exportFile("stl");
  });
  document.getElementById("btn-3mf").addEventListener("click", function () {
    exportFile("3mf");
  });

  initViewer();

  if (window.pywebview && window.pywebview.api) {
    init();
  } else {
    window.addEventListener("pywebviewready", init);
    setStatus("バックエンド待機中…");
  }
})();
