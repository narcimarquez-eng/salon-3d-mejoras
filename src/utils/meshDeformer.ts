import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { animatedMeshNames, buildBlenderClips, exportMaterialFor } from './blenderAnimation';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { prepareGeometryNormals, applyNormalSmoothingToModel } from './geometrySmoothing';

export type TriangleSubdivideMode = 2 | 3 | 4 | 'poke';
export type VertexMovePlaneMode = 'camera' | 'surface';
export type VertexLineSnapMode = 'snap_to_line' | 'coplanar_line';

export type SculptToolMode =
  | 'none'
  | 'smooth'
  | 'inflate'
  | 'deflate'
  | 'crease'
  | 'pinch'
  | 'flatten'
  | 'paint'
  | 'tri_paint'
  | 'tri_subdivide'
  | 'tri_extrude'
  | 'tri_push'
  | 'tri_delete'
  | 'vertex_move'
  | 'vertex_line';

export interface SculptBrushSettings {
  mode: SculptToolMode;
  radius: number;      // Radio de la esfera de influencia en unidades de mundo (0.1 a 1.5)
  strength: number;    // Intensidad del pincel (0.05 a 1.0)
  paintColor: string;  // Color hex para pintar vértices o triángulos (#ef4444)
  symmetryX: boolean;  // Simetría en espejo eje X activada por defecto
  triSubdivideSegments?: TriangleSubdivideMode; // 2 (1->4 tris), 3 (1->9 tris), 4 (1->16 tris) o 'poke' (1->3 tris)
  triExtrudeHeight?: number; // Altura al extruir un triángulo (por defecto 0.08)
  triExtrudeScale?: number;  // Escala de biselado/inset en la tapa extruida (por defecto 0.82)
  triSingleFaceMode?: boolean; // true = edita 1 triángulo exacto bajo el cursor; false = usa el radio del pincel
  vertexMoveSoftRadius?: boolean; // false = mueve 1 vértice exacto (soldado); true = arrastra vecinos cercanos en el mismo plano
  vertexMovePlaneMode?: VertexMovePlaneMode; // 'camera' = plano paralelo a vista en el vértice; 'surface' = plano tangente a los vértices
  vertexLineSnapMode?: VertexLineSnapMode; // 'snap_to_line' = colapsa a la línea en el plano; 'coplanar_line' = nivela al plano y acerca a la línea
}

export function isTriangleToolMode(mode: SculptToolMode): boolean {
  return (
    mode === 'tri_paint' ||
    mode === 'tri_subdivide' ||
    mode === 'tri_extrude' ||
    mode === 'tri_push' ||
    mode === 'tri_delete'
  );
}

export function isVertexToolMode(mode: SculptToolMode): boolean {
  return mode === 'vertex_move' || mode === 'vertex_line';
}

const _hitPointLocal = new THREE.Vector3();
const _hitNormalLocal = new THREE.Vector3();
const _symPointLocal = new THREE.Vector3();
const _symNormalLocal = new THREE.Vector3();
const _vertexPos = new THREE.Vector3();
const _avgPos = new THREE.Vector3();
const _symAvgPos = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();
const _tempVec = new THREE.Vector3();

interface MeshGeometrySnapshot {
  geometryClone: THREE.BufferGeometry;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

/**
 * Guarda una copia maestra intacta de todo el dibujo 3D (todas las mallas y geometrías originales)
 * para poder rehacer/restaurar el dibujo completo en cualquier momento aunque se reduzca o deforme.
 */
export function saveMasterDrawingCheckpoint(root: THREE.Object3D): void {
  const snapshots: Array<{
    meshUuid: string;
    geometryClone: THREE.BufferGeometry;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  }> = [];

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        snapshots.push({
          meshUuid: mesh.uuid,
          geometryClone: mesh.geometry.clone(),
          position: mesh.position.clone(),
          rotation: mesh.rotation.clone(),
          scale: mesh.scale.clone(),
        });
      }
    }
  });

  if (snapshots.length > 0) {
    // Liberar geometrías previas si existían
    const oldList = root.userData.masterDrawingCheckpoint as typeof snapshots | undefined;
    if (oldList) {
      oldList.forEach((item) => item.geometryClone.dispose());
    }
    root.userData.masterDrawingCheckpoint = snapshots;
  }
}

export function ensureMasterDrawingCheckpoint(root: THREE.Object3D): void {
  if (!root.userData.masterDrawingCheckpoint) {
    saveMasterDrawingCheckpoint(root);
  }
}

/**
 * Restaura el dibujo 3D a su estado maestro intacto (antes de reducciones poligonales o deformaciones destructivas).
 */
export function restoreMasterDrawingCheckpoint(
  root: THREE.Object3D,
  currentSmoothing: number
): boolean {
  const snapshots = root.userData.masterDrawingCheckpoint as
    | Array<{
        meshUuid: string;
        geometryClone: THREE.BufferGeometry;
        position: THREE.Vector3;
        rotation: THREE.Euler;
        scale: THREE.Vector3;
      }>
    | undefined;

  if (!snapshots || snapshots.length === 0) return false;

  // Guardar estado actual en Undo por si quiere volver adelante con Rehacer (Redo)
  pushUndoSnapshot(root, false);

  const snapshotMap = new Map(snapshots.map((s) => [s.meshUuid, s]));
  let restoredCount = 0;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const snap = snapshotMap.get(mesh.uuid);
      if (snap) {
        mesh.geometry.dispose();
        mesh.geometry = snap.geometryClone.clone();
        mesh.position.copy(snap.position);
        mesh.rotation.copy(snap.rotation);
        mesh.scale.copy(snap.scale);
        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
        restoredCount++;
      }
    }
  });

  if (restoredCount > 0) {
    applyNormalSmoothingToModel(root, currentSmoothing);
    return true;
  }
  return false;
}

/**
 * Guarda una instantánea completa de la geometría (incluyendo cambios en número de vértices/triángulos
 * por Decimate o Subdivide) en la pila de Deshacer (Undo).
 */
export function pushUndoSnapshot(root: THREE.Object3D, clearRedo: boolean = true): void {
  ensureMasterDrawingCheckpoint(root);

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry || !mesh.geometry.attributes.position) return;

      if (!mesh.userData.undoStack) {
        mesh.userData.undoStack = [];
      }
      const stack = mesh.userData.undoStack as MeshGeometrySnapshot[];
      if (stack.length >= 10) {
        const oldest = stack.shift();
        oldest?.geometryClone.dispose();
      }
      stack.push({
        geometryClone: mesh.geometry.clone(),
        position: mesh.position.clone(),
        rotation: mesh.rotation.clone(),
        scale: mesh.scale.clone(),
      });

      if (clearRedo && mesh.userData.redoStack) {
        const redoStack = mesh.userData.redoStack as MeshGeometrySnapshot[];
        redoStack.forEach((s) => s.geometryClone.dispose());
        mesh.userData.redoStack = [];
      }
    }
  });
}

/**
 * Deshace la última modificación geométrica (incluso si cambió el conteo de polígonos con Decimate o Subdivide)
 * y guarda el estado actual en la pila de Rehacer (Redo).
 */
export function popUndoSnapshot(root: THREE.Object3D, currentSmoothing: number): boolean {
  let didUndo = false;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const stack = mesh.userData.undoStack as MeshGeometrySnapshot[] | undefined;
      if (stack && stack.length > 0) {
        if (!mesh.userData.redoStack) {
          mesh.userData.redoStack = [];
        }
        const redoStack = mesh.userData.redoStack as MeshGeometrySnapshot[];
        redoStack.push({
          geometryClone: mesh.geometry.clone(),
          position: mesh.position.clone(),
          rotation: mesh.rotation.clone(),
          scale: mesh.scale.clone(),
        });

        const prevSnap = stack.pop()!;
        mesh.geometry.dispose();
        mesh.geometry = prevSnap.geometryClone;
        mesh.position.copy(prevSnap.position);
        mesh.rotation.copy(prevSnap.rotation);
        mesh.scale.copy(prevSnap.scale);

        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
        didUndo = true;
      }
    }
  });

  if (didUndo) {
    applyNormalSmoothingToModel(root, currentSmoothing);
  }
  return didUndo;
}

/**
 * Rehace (Redo) la última modificación geométrica deshecha.
 */
export function popRedoSnapshot(root: THREE.Object3D, currentSmoothing: number): boolean {
  let didRedo = false;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const redoStack = mesh.userData.redoStack as MeshGeometrySnapshot[] | undefined;
      if (redoStack && redoStack.length > 0) {
        if (!mesh.userData.undoStack) {
          mesh.userData.undoStack = [];
        }
        const undoStack = mesh.userData.undoStack as MeshGeometrySnapshot[];
        undoStack.push({
          geometryClone: mesh.geometry.clone(),
          position: mesh.position.clone(),
          rotation: mesh.rotation.clone(),
          scale: mesh.scale.clone(),
        });

        const nextSnap = redoStack.pop()!;
        mesh.geometry.dispose();
        mesh.geometry = nextSnap.geometryClone;
        mesh.position.copy(nextSnap.position);
        mesh.rotation.copy(nextSnap.rotation);
        mesh.scale.copy(nextSnap.scale);

        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
        didRedo = true;
      }
    }
  });

  if (didRedo) {
    applyNormalSmoothingToModel(root, currentSmoothing);
  }
  return didRedo;
}

export function hasUndoHistory(root: THREE.Object3D | null): boolean {
  if (!root) return false;
  let found = false;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const stack = child.userData.undoStack as MeshGeometrySnapshot[] | undefined;
      if (stack && stack.length > 0) found = true;
    }
  });
  return found;
}

export function hasRedoHistory(root: THREE.Object3D | null): boolean {
  if (!root) return false;
  let found = false;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const stack = child.userData.redoStack as MeshGeometrySnapshot[] | undefined;
      if (stack && stack.length > 0) found = true;
    }
  });
  return found;
}

/**
 * Aplica un desplazamiento o deformación puntual sobre un vértice dado un centro de pincel local.
 */
function deformSingleStrokePass(
  posAttr: THREE.BufferAttribute,
  normAttr: THREE.BufferAttribute | undefined,
  colorAttr: THREE.BufferAttribute | undefined,
  centerLocal: THREE.Vector3,
  normalLocal: THREE.Vector3,
  avgPosLocal: THREE.Vector3,
  localRadius: number,
  effectiveMode: SculptToolMode,
  strength: number,
  brushColor: THREE.Color
): number {
  const radiusSq = localRadius * localRadius;
  const count = posAttr.count;
  let modified = 0;

  for (let i = 0; i < count; i++) {
    _vertexPos.fromBufferAttribute(posAttr, i);
    const distSq = _vertexPos.distanceToSquared(centerLocal);

    if (distSq < radiusSq) {
      const dist = Math.sqrt(distSq);
      const t = 1 - dist / localRadius;
      const falloff = t * t * (3 - 2 * t);
      const intensity = falloff * strength;

      if (effectiveMode === 'smooth') {
        _vertexPos.lerp(avgPosLocal, intensity * 0.48);
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'inflate') {
        let nx = normalLocal.x;
        let ny = normalLocal.y;
        let nz = normalLocal.z;
        if (normAttr) {
          nx = normAttr.getX(i);
          ny = normAttr.getY(i);
          nz = normAttr.getZ(i);
        }
        _vertexPos.x += nx * intensity * 0.085;
        _vertexPos.y += ny * intensity * 0.085;
        _vertexPos.z += nz * intensity * 0.085;
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'deflate') {
        let nx = normalLocal.x;
        let ny = normalLocal.y;
        let nz = normalLocal.z;
        if (normAttr) {
          nx = normAttr.getX(i);
          ny = normAttr.getY(i);
          nz = normAttr.getZ(i);
        }
        _vertexPos.x -= nx * intensity * 0.085;
        _vertexPos.y -= ny * intensity * 0.085;
        _vertexPos.z -= nz * intensity * 0.085;
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'crease') {
        // Pincel Crease / Hendidura: hunde con perfil agudo en el centro y pellizca ligeramente los bordes
        const sharpFalloff = Math.pow(t, 3);
        _vertexPos.addScaledVector(normalLocal, -sharpFalloff * strength * 0.11);
        _vertexPos.lerp(centerLocal, sharpFalloff * strength * 0.18);
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'pinch') {
        // Pincel Pinch / Pellizcar: atrae los vértices hacia el centro del impacto para afilar bordes
        _vertexPos.lerp(centerLocal, intensity * 0.35);
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'flatten') {
        const toVertex = _tempVec.subVectors(_vertexPos, centerLocal);
        const dotDist = toVertex.dot(normalLocal);
        _vertexPos.addScaledVector(normalLocal, -dotDist * intensity * 0.72);
        posAttr.setXYZ(i, _vertexPos.x, _vertexPos.y, _vertexPos.z);
        modified++;
      } else if (effectiveMode === 'paint' && colorAttr) {
        const r = colorAttr.getX(i);
        const g = colorAttr.getY(i);
        const b = colorAttr.getZ(i);
        colorAttr.setXYZ(
          i,
          THREE.MathUtils.lerp(r, brushColor.r, intensity),
          THREE.MathUtils.lerp(g, brushColor.g, intensity),
          THREE.MathUtils.lerp(b, brushColor.b, intensity)
        );
        modified++;
      }
    }
  }

  return modified;
}

/**
 * Aplica una pincelada de escultura / deformación con el ratón sobre una malla,
 * incluyendo soporte opcional para Simetría en Espejo X (Mirror X).
 */
export function applySculptBrushToMesh(
  mesh: THREE.Mesh,
  worldHitPoint: THREE.Vector3,
  worldHitNormal: THREE.Vector3,
  brush: SculptBrushSettings,
  isAltOrShift: boolean = false
): boolean {
  if (brush.mode === 'none') return false;

  const geometry = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  if (!posAttr) return false;

  // Convertir el punto de impacto y normal al espacio local de la malla
  _invMatrix.copy(mesh.matrixWorld).invert();
  _hitPointLocal.copy(worldHitPoint).applyMatrix4(_invMatrix);
  _hitNormalLocal.copy(worldHitNormal).transformDirection(_invMatrix).normalize();

  // Escalar el radio al espacio local
  const scale = mesh.getWorldScale(_tempVec);
  const maxScale = Math.max(scale.x, scale.y, scale.z, 0.001);
  const localRadius = brush.radius / maxScale;
  const radiusSq = localRadius * localRadius;

  const count = posAttr.count;

  let effectiveMode = brush.mode;
  if (brush.mode === 'inflate' && isAltOrShift) effectiveMode = 'deflate';
  else if (brush.mode === 'deflate' && isAltOrShift) effectiveMode = 'inflate';

  // Calcular promedio para modo Smooth
  if (effectiveMode === 'smooth') {
    _avgPos.set(0, 0, 0);
    let closeCount = 0;
    for (let i = 0; i < count; i++) {
      _vertexPos.fromBufferAttribute(posAttr, i);
      if (_vertexPos.distanceToSquared(_hitPointLocal) < radiusSq) {
        _avgPos.add(_vertexPos);
        closeCount++;
      }
    }
    if (closeCount > 1) _avgPos.divideScalar(closeCount);
    else _avgPos.copy(_hitPointLocal);
  }

  // Atributo de color por vértice si estamos en modo Paint
  let colorAttr = geometry.attributes.color as THREE.BufferAttribute | undefined;
  if (effectiveMode === 'paint' && !colorAttr) {
    const colors = new Float32Array(count * 3);
    colors.fill(1.0);
    colorAttr = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute('color', colorAttr);
    const enableVC = (m: THREE.Material | undefined) => {
      if (m && 'vertexColors' in m) {
        (m as THREE.MeshStandardMaterial).vertexColors = true;
        m.needsUpdate = true;
      }
    };
    enableVC(mesh.userData.toonMaterial);
    enableVC(mesh.userData.eeveeMaterial);
    enableVC(mesh.userData.cyclesMaterial);
    enableVC(mesh.userData.matcapMaterial);
    if (!Array.isArray(mesh.userData.originalMaterial)) {
      enableVC(mesh.userData.originalMaterial);
    }
  }

  const brushColor = new THREE.Color(brush.paintColor);
  const normAttr = geometry.attributes.normal as THREE.BufferAttribute | undefined;

  let totalModified = deformSingleStrokePass(
    posAttr,
    normAttr,
    colorAttr,
    _hitPointLocal,
    _hitNormalLocal,
    _avgPos,
    localRadius,
    effectiveMode,
    brush.strength,
    brushColor
  );

  // Si Simetría X está activa y el impacto no está justo en el centro X=0, aplicar en el lado opuesto
  if (brush.symmetryX && Math.abs(worldHitPoint.x) > 0.03) {
    const worldSymPoint = new THREE.Vector3(-worldHitPoint.x, worldHitPoint.y, worldHitPoint.z);
    const worldSymNormal = new THREE.Vector3(-worldHitNormal.x, worldHitNormal.y, worldHitNormal.z);

    _symPointLocal.copy(worldSymPoint).applyMatrix4(_invMatrix);
    _symNormalLocal.copy(worldSymNormal).transformDirection(_invMatrix).normalize();

    if (effectiveMode === 'smooth') {
      _symAvgPos.set(0, 0, 0);
      let symClose = 0;
      for (let i = 0; i < count; i++) {
        _vertexPos.fromBufferAttribute(posAttr, i);
        if (_vertexPos.distanceToSquared(_symPointLocal) < radiusSq) {
          _symAvgPos.add(_vertexPos);
          symClose++;
        }
      }
      if (symClose > 1) _symAvgPos.divideScalar(symClose);
      else _symAvgPos.copy(_symPointLocal);
    }

    totalModified += deformSingleStrokePass(
      posAttr,
      normAttr,
      colorAttr,
      _symPointLocal,
      _symNormalLocal,
      _symAvgPos,
      localRadius,
      effectiveMode,
      brush.strength,
      brushColor
    );
  }

  if (totalModified > 0) {
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (mesh.userData.outlineMesh) {
      const outlineMesh = mesh.userData.outlineMesh as THREE.Mesh;
      outlineMesh.geometry = mesh.geometry;
    }

    if (colorAttr) {
      colorAttr.needsUpdate = true;
    }
    return true;
  }

  return false;
}

/**
 * Suavizado Laplaciano Global (Redondeo Global):
 * Promedia cada vértice con sus vecinos adyacentes en toda la malla (soldando espacialmente costuras).
 */
export function applyGlobalLaplacianSmoothing(
  root: THREE.Object3D,
  iterations: number = 3,
  factor: number = 0.5,
  recordUndo: boolean = true
): number {
  if (recordUndo) {
    pushUndoSnapshot(root);
  }
  let totalAffectedVertices = 0;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      if (!posAttr) return;

      const vertexCount = posAttr.count;
      totalAffectedVertices += vertexCount;

      const tempPositions = new Float32Array(posAttr.array);
      const precision = 600;

      for (let iter = 0; iter < iterations; iter++) {
        // Agrupar vértices que comparten la misma posición física para que las costuras no se separen
        const weldGroup = new Map<string, number[]>();
        for (let i = 0; i < vertexCount; i++) {
          const kx = Math.round(tempPositions[i * 3] * precision);
          const ky = Math.round(tempPositions[i * 3 + 1] * precision);
          const kz = Math.round(tempPositions[i * 3 + 2] * precision);
          const key = `${kx}_${ky}_${kz}`;
          let arr = weldGroup.get(key);
          if (!arr) {
            arr = [];
            weldGroup.set(key, arr);
          }
          arr.push(i);
        }

        const neighborSums = new Float32Array(vertexCount * 3);
        const neighborCounts = new Uint16Array(vertexCount);

        const addEdge = (v1: number, v2: number) => {
          neighborSums[v1 * 3] += tempPositions[v2 * 3];
          neighborSums[v1 * 3 + 1] += tempPositions[v2 * 3 + 1];
          neighborSums[v1 * 3 + 2] += tempPositions[v2 * 3 + 2];
          neighborCounts[v1]++;
        };

        for (let i = 0; i < vertexCount; i += 3) {
          const a = i;
          const b = i + 1;
          const c = i + 2;
          if (c < vertexCount) {
            addEdge(a, b);
            addEdge(b, a);
            addEdge(b, c);
            addEdge(c, b);
            addEdge(c, a);
            addEdge(a, c);
          }
        }

        // Promediar acumuladores entre vértices soldados espacialmente
        weldGroup.forEach((indices) => {
          let sumX = 0;
          let sumY = 0;
          let sumZ = 0;
          let totalCount = 0;
          for (const idx of indices) {
            sumX += neighborSums[idx * 3];
            sumY += neighborSums[idx * 3 + 1];
            sumZ += neighborSums[idx * 3 + 2];
            totalCount += neighborCounts[idx];
          }
          if (totalCount > 0) {
            const avgX = sumX / totalCount;
            const avgY = sumY / totalCount;
            const avgZ = sumZ / totalCount;
            for (const idx of indices) {
              const cx = tempPositions[idx * 3];
              const cy = tempPositions[idx * 3 + 1];
              const cz = tempPositions[idx * 3 + 2];
              tempPositions[idx * 3] = cx + (avgX - cx) * factor;
              tempPositions[idx * 3 + 1] = cy + (avgY - cy) * factor;
              tempPositions[idx * 3 + 2] = cz + (avgZ - cz) * factor;
            }
          }
        });
      }

      posAttr.array.set(tempPositions);
      posAttr.needsUpdate = true;

      prepareGeometryNormals(mesh);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (mesh.userData.outlineMesh) {
        (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
      }
    }
  });

  return totalAffectedVertices;
}

/**
 * Subdivisión y Redondeo Orgánico (Tessellate + Laplacian Smooth):
 * Divide los triángulos grandes para añadir densidad de malla y aplica relajación suave,
 * ideal para convertir geometrías muy low-poly en esculturas de alta definición.
 */
export function subdivideAndSmoothModel(root: THREE.Object3D): number {
  pushUndoSnapshot(root);
  const tessellator = new TessellateModifier(0.42, 2);
  let newTotalTriangles = 0;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry as THREE.BufferGeometry;
      if (geo.attributes.position.count < 45000) {
        const subdivided = tessellator.modify(geo);
        mesh.geometry.dispose();
        mesh.geometry = subdivided;
        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
      }
      newTotalTriangles += Math.floor(mesh.geometry.attributes.position.count / 3);
    }
  });

  // Aplicar 2 pasadas suaves sin empujar un segundo snapshot redundante
  applyGlobalLaplacianSmoothing(root, 2, 0.42, false);
  return newTotalTriangles;
}

/**
 * Cuenta cuántos vértices únicos soldados espacialmente tiene una geometría.
 * Esto evita el fallo clásico de SimplifyModifier donde se le pide eliminar más vértices
 * que los vértices únicos reales que posee la malla.
 */
function countUniqueWeldedVertices(posAttr: THREE.BufferAttribute): number {
  const uniqueSet = new Set<string>();
  const precision = 1000;
  for (let i = 0; i < posAttr.count; i++) {
    const kx = Math.round(posAttr.getX(i) * precision);
    const ky = Math.round(posAttr.getY(i) * precision);
    const kz = Math.round(posAttr.getZ(i) * precision);
    uniqueSet.add(`${kx}_${ky}_${kz}`);
  }
  return uniqueSet.size;
}

/**
 * Restaura la caja delimitadora (BoundingBox) original tras la simplificación para evitar
 * que las piezas esféricas o cilíndricas se encojan o se separen de sus articulaciones.
 */
function restoreBoundingVolume(
  geo: THREE.BufferGeometry,
  origBox: THREE.Box3
): void {
  geo.computeBoundingBox();
  const newBox = geo.boundingBox;
  if (!newBox || newBox.isEmpty() || origBox.isEmpty()) return;

  const origSize = new THREE.Vector3();
  const newSize = new THREE.Vector3();
  const origCenter = new THREE.Vector3();
  const newCenter = new THREE.Vector3();
  origBox.getSize(origSize);
  newBox.getSize(newSize);
  origBox.getCenter(origCenter);
  newBox.getCenter(newCenter);

  const sx = newSize.x > 1e-4 ? origSize.x / newSize.x : 1.0;
  const sy = newSize.y > 1e-4 ? origSize.y / newSize.y : 1.0;
  const sz = newSize.z > 1e-4 ? origSize.z / newSize.z : 1.0;

  // Limitar factor de corrección a un rango seguro para no distorsionar formas planas
  const clampScale = (s: number) => THREE.MathUtils.clamp(s, 0.85, 1.25);
  const fx = clampScale(sx);
  const fy = clampScale(sy);
  const fz = clampScale(sz);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = (posAttr.getX(i) - newCenter.x) * fx + origCenter.x;
    const y = (posAttr.getY(i) - newCenter.y) * fy + origCenter.y;
    const z = (posAttr.getZ(i) - newCenter.z) * fz + origCenter.z;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/**
 * Re-proyecta los colores por vértice (si el usuario pintó el modelo) desde la geometría
 * anterior hacia los vértices simplificados más cercanos.
 */
function transferVertexColors(
  sourcePos: THREE.BufferAttribute,
  sourceColor: THREE.BufferAttribute,
  targetGeo: THREE.BufferGeometry
): void {
  const targetPos = targetGeo.attributes.position as THREE.BufferAttribute;
  if (!targetPos) return;

  // Muestrear puntos fuente con un paso máximo para mantener velocidad instantánea
  const srcCount = sourcePos.count;
  const step = Math.max(1, Math.floor(srcCount / 600));
  const outColors = new Float32Array(targetPos.count * 3);

  for (let i = 0; i < targetPos.count; i++) {
    const tx = targetPos.getX(i);
    const ty = targetPos.getY(i);
    const tz = targetPos.getZ(i);
    let bestDistSq = Infinity;
    let bestIdx = 0;

    for (let j = 0; j < srcCount; j += step) {
      const dx = sourcePos.getX(j) - tx;
      const dy = sourcePos.getY(j) - ty;
      const dz = sourcePos.getZ(j) - tz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = j;
        if (dSq < 1e-5) break;
      }
    }

    outColors[i * 3] = sourceColor.getX(bestIdx);
    outColors[i * 3 + 1] = sourceColor.getY(bestIdx);
    outColors[i * 3 + 2] = sourceColor.getZ(bestIdx);
  }

  targetGeo.setAttribute('color', new THREE.BufferAttribute(outColors, 3));
}

export interface SmartDecimateOptions {
  preserveFeatures?: boolean; // Protege ojos, cuernos pequeños, articulaciones y restaura volumen
  currentSmoothing?: number;
}

/**
 * Reducción de Polígonos Inteligente con Preservación de Silueta y Detalles (Smart Decimate).
 * - Calcula el conteo real de vértices soldados (`uniqueVertexCount`) en vez de `posAttr.count`
 *   para que SimplifyModifier NUNCA colapse ni destruya las mallas.
 * - Protege sub-mallas pequeñas de detalle (ojos, garras, articulaciones, gemas) cuando `preserveFeatures` está activo.
 * - Restaura el volumen BoundingBox original para evitar encogimiento o huecos entre piezas.
 * - Conserva la pintura por vértices y guarda una instantánea completa en Undo / Copia Maestra.
 */
export async function decimateModelGeometry(
  root: THREE.Object3D,
  reductionRatio: number,
  options: SmartDecimateOptions = {}
): Promise<{ originalTriangles: number; newTriangles: number; protectedMeshes: number }> {
  const { preserveFeatures = true, currentSmoothing = 0.92 } = options;

  // Guardar en la pila de Deshacer (Undo) y asegurar Copia Maestra intacta
  pushUndoSnapshot(root);

  const modifier = new SimplifyModifier();
  let originalTriangles = 0;
  let newTriangles = 0;
  let protectedMeshes = 0;

  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });

  // Límite seguro del ratio de reducción sobre vértices soldados
  const safeRatio = preserveFeatures
    ? Math.min(reductionRatio, 0.62)
    : Math.min(reductionRatio, 0.78);

  for (const mesh of meshes) {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    if (!posAttr) continue;

    const currentTriCount = geo.index ? geo.index.count / 3 : posAttr.count / 3;
    originalTriangles += Math.floor(currentTriCount);

    const uniqueVertices = countUniqueWeldedVertices(posAttr);

    // 1. Proteger piezas pequeñas de detalle (ojos, cuernos finos, garras, gemas, articulaciones)
    // Si una pieza tiene <= 42 vértices únicos (o <= 64 triángulos) y preserveFeatures está activo,
    // no la diezmamos para que no pierda su forma geométrica reconocible.
    if (preserveFeatures && (uniqueVertices <= 42 || currentTriCount <= 64)) {
      protectedMeshes++;
      newTriangles += Math.floor(currentTriCount);
      continue;
    }

    // 2. Calcular cuántos vértices ÚNICOS soldados se pueden quitar sin destruir la pieza
    const minSafeVertices = preserveFeatures
      ? Math.max(24, Math.ceil(uniqueVertices * 0.42))
      : Math.max(14, Math.ceil(uniqueVertices * 0.25));

    const maxAllowedToRemove = Math.max(0, uniqueVertices - minSafeVertices);
    const desiredToRemove = Math.floor(uniqueVertices * safeRatio);
    const countToRemove = Math.min(desiredToRemove, maxAllowedToRemove);

    if (countToRemove >= 4) {
      try {
        geo.computeBoundingBox();
        const origBox = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
        const prevColorAttr = geo.attributes.color as THREE.BufferAttribute | undefined;

        // Preparar clon limpio solo con 'position' para que SimplifyModifier suelde vértices sin errores de normales/atributos custom
        const cleanInputGeo = new THREE.BufferGeometry();
        cleanInputGeo.setAttribute('position', posAttr.clone());
        if (geo.index) {
          cleanInputGeo.setIndex(geo.index.clone());
        }

        const simplifiedIndexed = (modifier.modify(cleanInputGeo, countToRemove) as unknown) as THREE.BufferGeometry;
        cleanInputGeo.dispose();

        // Convertir de vuelta a no-indexado para nuestro pipeline de Cel-Shading y suavizado de normales
        const finalGeo = simplifiedIndexed.index
          ? simplifiedIndexed.toNonIndexed()
          : simplifiedIndexed;

        const simplifiedTriCount = Math.floor(finalGeo.attributes.position.count / 3);

        // Verificar que la malla simplificada sea válida y conserve volumen; si degeneró, conservar original
        if (simplifiedTriCount < 8) {
          finalGeo.dispose();
          protectedMeshes++;
          newTriangles += Math.floor(currentTriCount);
          continue;
        }

        // 3. Restaurar el volumen BoundingBox original para evitar que las piezas se encojan o separen
        if (preserveFeatures && !origBox.isEmpty()) {
          restoreBoundingVolume(finalGeo, origBox);
        }

        // 4. Re-proyectar colores pintados por vértice si existían
        if (prevColorAttr) {
          transferVertexColors(posAttr, prevColorAttr, finalGeo);
        }

        mesh.geometry.dispose();
        mesh.geometry = finalGeo;

        prepareGeometryNormals(mesh);
        mesh.geometry.computeVertexNormals();

        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }

        newTriangles += simplifiedTriCount;
      } catch (err) {
        console.warn('Pieza conservada intacta tras aviso del simplificador:', err);
        protectedMeshes++;
        newTriangles += Math.floor(currentTriCount);
      }
    } else {
      protectedMeshes++;
      newTriangles += Math.floor(currentTriCount);
    }
  }

  applyNormalSmoothingToModel(root, currentSmoothing);
  return { originalTriangles, newTriangles, protectedMeshes };
}

/**
 * Exporta el modelo 3D actual modificado como un archivo `.glb` binario.
 */
/**
 * Clave de agrupación: mallas con el mismo tipo de material, color, rugosidad, emisión y atributos
 * pueden unirse. Devuelve null si la malla no debe unirse (skinning, morph targets o materiales múltiples).
 */
function mergeKeyFor(mesh: THREE.Mesh): string | null {
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return null;
  if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) return null;
  if (Array.isArray(mesh.material)) return null;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (!mat || !mat.color) return null;
  const attrs = Object.keys(mesh.geometry.attributes).sort().join(',');
  const emissive = mat.emissive ? mat.emissive.getHex() : 0;
  const emissiveIntensity = Math.round((mat.emissiveIntensity ?? 0) * 100);
  const rough = Math.round((mat.roughness ?? 0.5) * 100);
  const metal = Math.round((mat.metalness ?? 0.0) * 100);
  const opacity = Math.round((mat.opacity ?? 1.0) * 100);
  const hasMap = mat.map ? mat.map.uuid : 'nomap';
  const hasNormal = mat.normalMap ? mat.normalMap.uuid : 'nonormal';
  const hasRough = mat.roughnessMap ? mat.roughnessMap.uuid : 'norough';
  return [
    mat.type,
    mat.color.getHex(),
    rough,
    metal,
    emissive,
    emissiveIntensity,
    opacity,
    mat.transparent ? 1 : 0,
     mat.vertexColors ? 1 : 0,
    hasMap,
    hasNormal,
    hasRough,
    attrs,
  ].join('|');
}

/**
 * Une las mallas de `root` que comparten material en una malla por grupo.
 * Las geometrías se transforman a la escala local de `root`; el resultado queda sin jerarquía.
 * Si una unión falla, las mallas de ese grupo se dejan como estaban.
 */
function mergeMeshesByMaterial(root: THREE.Object3D): void {
  try {
    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const meshes: THREE.Mesh[] = [];
    root.traverse((child) => {
      if (child !== root && (child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.geometry && m.geometry.attributes?.position && m.geometry.attributes.position.count > 0) {
          meshes.push(m);
        }
      }
    });

    const animated = animatedMeshNames();
    const groups = new Map<string, THREE.Mesh[]>();
    for (const mesh of meshes) {
      if (animated.has(mesh.name)) continue;
      const key = mergeKeyFor(mesh);
      if (key === null) continue;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }

    let index = 0;
    groups.forEach((list) => {
      if (list.length < 2) return;

      try {
        // 1. Encontrar atributos presentes en TODAS las mallas del grupo para evitar que mergeGeometries lance error
        const firstGeo = list[0].geometry;
        const commonAttrs = new Set(Object.keys(firstGeo.attributes));
        for (let i = 1; i < list.length; i++) {
          const gAttrs = new Set(Object.keys(list[i].geometry.attributes));
          for (const attr of Array.from(commonAttrs)) {
            if (!gAttrs.has(attr)) commonAttrs.delete(attr);
          }
        }
        if (!commonAttrs.has('position')) return;

        const geometries = list.map((mesh) => {
          let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          for (const attr of Object.keys(geo.attributes)) {
            if (!commonAttrs.has(attr)) geo.deleteAttribute(attr);
          }
          if (!geo.attributes.normal) {
            geo.computeVertexNormals();
          }
          const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
          geo.applyMatrix4(relative);
          return geo;
        });

        const merged = mergeGeometries(geometries, false);
        if (!merged) return;

        list.forEach((mesh) => mesh.removeFromParent());
        const material = list[0].material as THREE.Material;
        const combined = new THREE.Mesh(merged, material);
        combined.name = `Grupo_${index}_${list.length}piezas`;
        root.add(combined);
        index++;
      } catch (groupErr) {
        console.warn('Omitiendo fusión de grupo de material:', groupErr);
      }
    });
  } catch (rootErr) {
    console.warn('mergeMeshesByMaterial omitido por seguridad:', rootErr);
  }
}

export type GlbExportPresetMode = 'light' | 'ultra_light' | 'full';

export interface GlbExportOptions {
  mode?: GlbExportPresetMode;
  decimateRatio?: number;
  stripTextures?: boolean;
  maxTextureSize?: number;
  weldVertices?: boolean;
  mergeByMaterial?: boolean;
}

export interface GlbExportStats {
  sizeBytes: number;
  sizeFormatted: string;
  meshesBefore: number;
  meshesAfter: number;
  verticesBefore: number;
  verticesAfter: number;
  trianglesBefore: number;
  trianglesAfter: number;
  modeUsed: GlbExportPresetMode;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function quantizeGeometryAttributes(geo: THREE.BufferGeometry, posStep = 1e-4, normStep = 1e-3): void {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (pos && pos.array) {
    const arr = pos.array as Float32Array;
    const inv = 1 / posStep;
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.round(arr[i] * inv) / inv;
    }
    pos.needsUpdate = true;
  }
  const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (norm && norm.array) {
    const arr = norm.array as Float32Array;
    const inv = 1 / normStep;
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.round(arr[i] * inv) / inv;
    }
    norm.needsUpdate = true;
  }
}

/**
 * Ejecuta el parseo de GLTFExporter en Promise controlada tolerante a errores
 */
function parseObjectToGlbBuffer(
  objectToExport: THREE.Object3D,
  options: { binary: boolean; maxTextureSize?: number; animations?: THREE.AnimationClip[] }
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const exporter = new GLTFExporter();
      const parseOptions: any = {
        binary: true,
      };
      if (options.maxTextureSize) parseOptions.maxTextureSize = options.maxTextureSize;
      if (options.animations && options.animations.length > 0) {
        parseOptions.animations = options.animations;
      }

      exporter.parse(
        objectToExport,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else if (result && (result as any).byteLength !== undefined) {
            resolve((result as unknown) as ArrayBuffer);
          } else {
            const str = JSON.stringify(result);
            const enc = new TextEncoder();
            resolve((enc.encode(str).buffer as unknown) as ArrayBuffer);
          }
        },
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        parseOptions
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function triggerGlbDownload(buffer: ArrayBuffer, fileName: string): void {
  const safeFileName = (fileName || 'modelo_exportado.glb')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  const finalName = safeFileName.toLowerCase().endsWith('.glb')
    ? safeFileName
    : `${safeFileName}.glb`;

  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.position = 'fixed';
  link.style.top = '-9999px';
  link.style.left = '-9999px';
  link.style.opacity = '0';
  link.style.pointerEvents = 'none';
  link.href = url;
  link.download = finalName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  try {
    link.click();
  } catch (err) {
    console.warn('triggerGlbDownload click error:', err);
  }
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}

function extractSafeColor(rawColor: unknown, fallbackHex: number): THREE.Color {
  if (!rawColor) return new THREE.Color(fallbackHex);
  if (rawColor instanceof THREE.Color) return rawColor.clone();
  if (typeof (rawColor as THREE.Color).clone === 'function') {
    try {
      return (rawColor as THREE.Color).clone();
    } catch {
      // Continuar a conversión manual
    }
  }
  if (typeof rawColor === 'number' || typeof rawColor === 'string') {
    try {
      return new THREE.Color(rawColor as number);
    } catch {
      return new THREE.Color(fallbackHex);
    }
  }
  if (
    typeof rawColor === 'object' &&
    rawColor !== null &&
    'r' in rawColor &&
    'g' in rawColor &&
    'b' in rawColor
  ) {
    const c = rawColor as { r: number; g: number; b: number };
    return new THREE.Color(Number(c.r) || 0, Number(c.g) || 0, Number(c.b) || 0);
  }
  return new THREE.Color(fallbackHex);
}

/**
 * Las texturas generadas en canvas (procedurales) pesan mucho como PNG y no tienen transparencia real:
 * si el canal alfa es opaco se exportan como JPEG (pérdida mínima, PSNR > 45 dB).
 */
function markOpaqueTextureAsJpeg(tex: THREE.Texture): void {
  if (tex.userData.mimeType) return;
  const img = tex.image as CanvasImageSource | undefined;
  if (!img) return;
  // DataTexture: píxeles RGBA directos en `data`
  const raw = tex.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  if (raw && raw.data && raw.width && raw.height && !(img as unknown as { getContext?: unknown }).getContext) {
    const px = raw.data;
    if (px.length < raw.width * raw.height * 4) return;
    for (let i = 3; i < raw.width * raw.height * 4; i += 4) {
      if (px[i] !== 255) return;
    }
    tex.userData.mimeType = 'image/jpeg';
    return;
  }
  if (typeof document === 'undefined') return;
  try {
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) return;
    }
    tex.userData.mimeType = 'image/jpeg';
  } catch {
    // Canvas no legible (p. ej. origen externo): se exporta con el formato por defecto
  }
}

function isExportableImageSource(img: unknown): boolean {
  if (!img || typeof img !== 'object') return false;
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) return true;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return true;
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return true;
  if (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) return true;
  return false;
}

export async function exportModifiedGlb(
  root: THREE.Object3D,
  fileName: string = 'enemigo_modificado.glb',
  options: GlbExportOptions = {}
): Promise<GlbExportStats> {
  const mode: GlbExportPresetMode = options.mode ?? 'light';
  const stripTextures = options.stripTextures ?? (mode === 'light' || mode === 'ultra_light');
  const maxTextureSize =
    options.maxTextureSize ?? (mode === 'ultra_light' ? 64 : mode === 'light' ? 128 : 1024);
  const weldVertices = options.weldVertices ?? true;
  const mergeByMaterial = options.mergeByMaterial ?? true;
  const decimateRatio =
    options.decimateRatio ?? (mode === 'ultra_light' ? 0.48 : 0);

  let meshesBefore = 0;
  let verticesBefore = 0;
  let trianglesBefore = 0;
  let meshesAfter = 0;
  let verticesAfter = 0;
  let trianglesAfter = 0;

  // Asegurar que las matrices de transformación del árbol original estén al día
  root.updateMatrixWorld(true);

  try {
    const exportScene = new THREE.Scene();
    const modifier = decimateRatio > 0.01 ? new SimplifyModifier() : null;
    let autoMeshId = 1;

    // 1. Construir jerarquía limpia SIN usar root.clone(true) (evita JSON.stringify(userData) que corrompe THREE.Color y ShaderMaterials)
    const buildCleanNode = (srcNode: THREE.Object3D): THREE.Object3D | null => {
      if (
        srcNode.userData?.isOutlineMesh ||
        srcNode.name.includes('_outline') ||
        (srcNode as THREE.Light).isLight ||
        !srcNode.visible
      ) {
        return null;
      }

      let targetNode: THREE.Object3D;

      if ((srcNode as THREE.Mesh).isMesh) {
        const srcMesh = srcNode as THREE.Mesh;
        const srcGeo = srcMesh.geometry as THREE.BufferGeometry | undefined;
        const srcPos = srcGeo?.attributes?.position as THREE.BufferAttribute | undefined;

        if (!srcGeo || !srcPos || srcPos.count === 0) {
          targetNode = new THREE.Group();
          targetNode.name = srcNode.name || `Grupo_${autoMeshId++}`;
        } else {
          meshesBefore++;
          verticesBefore += srcPos.count;
          const tris = srcGeo.index ? srcGeo.index.count / 3 : srcPos.count / 3;
          trianglesBefore += Math.floor(tris);

          const meshName =
            srcMesh.name && srcMesh.name.trim() ? srcMesh.name.trim() : `Pieza_${autoMeshId++}`;

          let geo = srcGeo.clone();

          const specialExportMat = exportMaterialFor(meshName) as
            | THREE.MeshStandardMaterial
            | undefined;
          const rawOrigMat = Array.isArray(srcMesh.userData?.originalMaterial)
            ? srcMesh.userData.originalMaterial[0]
            : srcMesh.userData?.originalMaterial;
          const pbrMat = (specialExportMat ||
            rawOrigMat ||
            srcMesh.userData?.eeveeMaterial ||
            srcMesh.userData?.cyclesMaterial ||
            (Array.isArray(srcMesh.material) ? srcMesh.material[0] : srcMesh.material)) as
            | THREE.MeshStandardMaterial
            | undefined;

          const pbrProps = srcMesh.userData?.pbrProps as Record<string, any> | undefined;

          const baseColor = extractSafeColor(pbrMat?.color, 0xdbe4ee);
          const roughness = THREE.MathUtils.clamp(
            Number(pbrProps?.roughness ?? pbrMat?.roughness ?? 0.55),
            0.04,
            1.0
          );
          const metalness = THREE.MathUtils.clamp(
            Number(pbrProps?.metalness ?? pbrMat?.metalness ?? 0.08),
            0.0,
            1.0
          );
          const emissive = extractSafeColor(pbrMat?.emissive, 0x000000);
          const emissiveIntensity = Number(pbrMat?.emissiveIntensity ?? 0);
          const opacity = Number(pbrMat?.opacity ?? 1.0);
          const transparent = Boolean(pbrMat?.transparent && opacity < 0.99);

          let keepVertexColors = false;
          const colAttr = geo.attributes.color as THREE.BufferAttribute | undefined;
          if (colAttr && colAttr.count > 0) {
            const r0 = colAttr.getX(0);
            const g0 = colAttr.getY(0);
            const b0 = colAttr.getZ(0);
            let isUniform = true;
            for (let i = 1; i < colAttr.count; i++) {
              if (
                Math.abs(colAttr.getX(i) - r0) > 0.012 ||
                Math.abs(colAttr.getY(i) - g0) > 0.012 ||
                Math.abs(colAttr.getZ(i) - b0) > 0.012
              ) {
                isUniform = false;
                break;
              }
            }
            if (isUniform) {
              if (r0 < 0.985 || g0 < 0.985 || b0 < 0.985) {
                baseColor.multiply(new THREE.Color(r0, g0, b0));
              }
              geo.deleteAttribute('color');
              keepVertexColors = false;
            } else {
              keepVertexColors = true;
            }
          }

          const cleanMat = new THREE.MeshStandardMaterial({
            name: pbrMat?.name || meshName || 'PBR_Mat',
            color: baseColor,
            roughness: Math.round(roughness * 100) / 100,
            metalness: Math.round(metalness * 100) / 100,
            emissive,
            emissiveIntensity: Math.round(emissiveIntensity * 100) / 100,
            transparent,
            opacity: Math.round(opacity * 100) / 100,
            vertexColors: keepVertexColors,
          });

          if (
            !stripTextures &&
            pbrMat &&
            'map' in pbrMat &&
            pbrMat.map &&
            isExportableImageSource(pbrMat.map.image)
          ) {
            markOpaqueTextureAsJpeg(pbrMat.map);
            cleanMat.map = pbrMat.map;
            if (pbrMat.bumpMap && isExportableImageSource(pbrMat.bumpMap.image)) {
              markOpaqueTextureAsJpeg(pbrMat.bumpMap);
              cleanMat.bumpMap = pbrMat.bumpMap;
              cleanMat.bumpScale = pbrMat.bumpScale ?? 0.02;
            }
          }

          // Normal y rugosidad (mapas PBR de "Mis texturas" y de las plantillas): se exportan junto al color
          if (!stripTextures && pbrMat && 'normalMap' in pbrMat && pbrMat.normalMap && isExportableImageSource(pbrMat.normalMap.image)) {
            cleanMat.normalMap = pbrMat.normalMap;
            cleanMat.normalScale = (pbrMat as THREE.MeshStandardMaterial).normalScale?.clone() ?? new THREE.Vector2(1, 1);
          }
          if (!stripTextures && pbrMat && 'roughnessMap' in pbrMat && pbrMat.roughnessMap && isExportableImageSource(pbrMat.roughnessMap.image)) {
            cleanMat.roughnessMap = pbrMat.roughnessMap;
            cleanMat.roughness = 1; // el mapa de rugosidad multiplica este valor
          }

          const allowedAttrs = new Set<string>(['position', 'normal']);
          if (keepVertexColors) allowedAttrs.add('color');
          if (!stripTextures && (cleanMat.map || cleanMat.normalMap || cleanMat.roughnessMap)) allowedAttrs.add('uv');

          for (const attrName of Object.keys(geo.attributes)) {
            if (!allowedAttrs.has(attrName)) {
              geo.deleteAttribute(attrName);
            }
          }

          if (!geo.attributes.normal) {
            geo.computeVertexNormals();
          }

          const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;

          // Simplificación opcional en Ultra-Ligero
          if (modifier && posAttr && posAttr.count >= 144) {
            const uniqueVerts = countUniqueWeldedVertices(posAttr);
            if (uniqueVerts > 48) {
              const targetRemove = Math.min(
                Math.floor(uniqueVerts * decimateRatio),
                Math.max(0, uniqueVerts - 28)
              );
              if (targetRemove >= 6) {
                try {
                  geo.computeBoundingBox();
                  const origBox = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
                  const savedColor = geo.attributes.color as THREE.BufferAttribute | undefined;

                  const simpInput = new THREE.BufferGeometry();
                  simpInput.setAttribute('position', posAttr.clone());
                  if (geo.index) simpInput.setIndex(geo.index.clone());

                  const simpOut = (modifier.modify(
                    simpInput,
                    targetRemove
                  ) as unknown) as THREE.BufferGeometry;
                  simpInput.dispose();

                  const finalSimp = simpOut.index ? simpOut.toNonIndexed() : simpOut;
                  if (finalSimp.attributes.position && finalSimp.attributes.position.count >= 24) {
                    if (!origBox.isEmpty()) {
                      restoreBoundingVolume(finalSimp, origBox);
                    }
                    if (savedColor && keepVertexColors) {
                      transferVertexColors(posAttr, savedColor, finalSimp);
                    }
                    finalSimp.computeVertexNormals();
                    geo = finalSimp;
                  } else {
                    finalSimp.dispose();
                  }
                } catch {
                  // Conservar geometría original si una pieza no se puede decimar
                }
              }
            }
          }

          const outMesh = new THREE.Mesh(geo, cleanMat);
          outMesh.name = meshName;
          outMesh.userData = {};
          targetNode = outMesh;
        }
      } else {
        targetNode = new THREE.Group();
        targetNode.name = srcNode.name || '';
        targetNode.userData = {};
      }

      targetNode.position.copy(srcNode.position);
      targetNode.quaternion.copy(srcNode.quaternion);
      targetNode.scale.copy(srcNode.scale);
      targetNode.updateMatrix();

      for (const child of srcNode.children) {
        const cleanChild = buildCleanNode(child);
        if (cleanChild) {
          targetNode.add(cleanChild);
        }
      }

      return targetNode;
    };

    const clonedRoot = buildCleanNode(root) || new THREE.Group();
    clonedRoot.updateMatrixWorld(true);

    // 2. Fusión por material segura
    if (mergeByMaterial) {
      mergeMeshesByMaterial(clonedRoot);
    }

    // 3. Cuantizado y soldadura de vértices
    clonedRoot.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        meshesAfter++;
        let geo = mesh.geometry as THREE.BufferGeometry;
        quantizeGeometryAttributes(geo, mode === 'ultra_light' ? 2e-4 : 1e-4, 1e-3);

        if (weldVertices) {
          try {
            const nonIdx = geo.index ? geo.toNonIndexed() : geo;
            const welded = mergeVertices(nonIdx, mode === 'ultra_light' ? 2.5e-4 : 1e-4);
            if (welded && welded.attributes?.position && welded.attributes.position.count > 0) {
              geo = welded;
              mesh.geometry = welded;
            }
          } catch {
            // Conservar geometría original
          }
        }

        const p = geo.attributes.position as THREE.BufferAttribute | undefined;
        if (p) {
          verticesAfter += p.count;
          const tCount = geo.index ? geo.index.count / 3 : p.count / 3;
          trianglesAfter += Math.floor(tCount);
        }
      }
    });

    exportScene.add(clonedRoot);
    exportScene.updateMatrixWorld(true);

    // 4. Construir clips solo para nombres presentes en la jerarquía clonada
    const existingMeshNames = new Set<string>();
    clonedRoot.traverse((child) => {
      if (child.name) existingMeshNames.add(child.name);
    });
    const clips = buildBlenderClips(existingMeshNames);

    let buffer: ArrayBuffer;
    try {
      buffer = await parseObjectToGlbBuffer(exportScene, {
        binary: true,
        maxTextureSize,
        animations: clips,
      });
    } catch (clipErr) {
      console.warn('[GLB Export] Reintentando exportación sin pistas de animación:', clipErr);
      buffer = await parseObjectToGlbBuffer(exportScene, {
        binary: true,
        maxTextureSize,
      });
    }

    triggerGlbDownload(buffer, fileName);
    const sizeBytes = buffer.byteLength;

    return {
      sizeBytes,
      sizeFormatted: formatByteSize(sizeBytes),
      meshesBefore,
      meshesAfter: meshesAfter || meshesBefore,
      verticesBefore,
      verticesAfter: verticesAfter || verticesBefore,
      trianglesBefore,
      trianglesAfter: trianglesAfter || trianglesBefore,
      modeUsed: mode,
    };
  } catch (optError) {
    console.warn('[GLB Export] Modo optimizado falló, ejecutando exportación fallback directa:', optError);

    // Fallback 100% infalible sin root.clone(true) (construye mallas planas en coordenadas de mundo)
    const fallbackScene = new THREE.Scene();
    let fallbackMeshes = 0;
    let fallbackVerts = 0;
    let fallbackTris = 0;

    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (
        child.userData?.isOutlineMesh ||
        child.name.includes('_outline') ||
        (child as THREE.Light).isLight ||
        !child.visible
      ) {
        return;
      }
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        const srcGeo = m.geometry as THREE.BufferGeometry | undefined;
        const srcPos = srcGeo?.attributes?.position as THREE.BufferAttribute | undefined;
        if (!srcGeo || !srcPos || srcPos.count === 0) return;

        fallbackMeshes++;
        fallbackVerts += srcPos.count;
        fallbackTris += Math.floor(srcGeo.index ? srcGeo.index.count / 3 : srcPos.count / 3);

        const cleanGeo = new THREE.BufferGeometry();
        cleanGeo.setAttribute('position', srcPos.clone());
        if (srcGeo.attributes.normal) {
          cleanGeo.setAttribute('normal', srcGeo.attributes.normal.clone());
        } else {
          cleanGeo.computeVertexNormals();
        }
        if (srcGeo.attributes.color) {
          cleanGeo.setAttribute('color', srcGeo.attributes.color.clone());
        }
        if (srcGeo.index) {
          cleanGeo.setIndex(srcGeo.index.clone());
        }
        cleanGeo.applyMatrix4(m.matrixWorld);

        const rawOrigMat = Array.isArray(m.userData?.originalMaterial)
          ? m.userData.originalMaterial[0]
          : m.userData?.originalMaterial;
        const matRef = (rawOrigMat ||
          m.userData?.eeveeMaterial ||
          (Array.isArray(m.material) ? m.material[0] : m.material)) as
          | THREE.MeshStandardMaterial
          | undefined;

        const col = extractSafeColor(matRef?.color, 0xdbe4ee);
        const outMesh = new THREE.Mesh(
          cleanGeo,
          new THREE.MeshStandardMaterial({
            name: m.name || `Pieza_${fallbackMeshes}`,
            color: col,
            roughness: 0.55,
            metalness: 0.08,
            vertexColors: Boolean(cleanGeo.attributes.color),
          })
        );
        outMesh.name = m.name || `Pieza_${fallbackMeshes}`;
        fallbackScene.add(outMesh);
      }
    });

    const fallbackBuffer = await parseObjectToGlbBuffer(fallbackScene, {
      binary: true,
      maxTextureSize: 256,
    });

    triggerGlbDownload(fallbackBuffer, fileName);
    const sizeBytes = fallbackBuffer.byteLength;

    return {
      sizeBytes,
      sizeFormatted: formatByteSize(sizeBytes),
      meshesBefore: fallbackMeshes,
      meshesAfter: fallbackMeshes,
      verticesBefore: fallbackVerts,
      verticesAfter: fallbackVerts,
      trianglesBefore: fallbackTris,
      trianglesAfter: fallbackTris,
      modeUsed: 'full',
    };
  }
}

/**
 * Crea un cursor 3D indicador doble (Anillo principal + punto central)
 * para mostrar con precisión el área del pincel sobre el modelo.
 */
export function createBrushIndicatorMesh(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.88, 1.0, 40);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.renderOrder = 999;
  ring.visible = false;
  return ring;
}

/**
 * Crea un indicador 3D de Triángulo (Relleno semitransparente + Borde luminoso)
 * para resaltar con exactitud el triángulo bajo el cursor en los modos de edición por triángulos.
 */
export function createTriangleHighlightMesh(colorHex: number = 0xf59e0b): THREE.Group {
  const group = new THREE.Group();
  group.renderOrder = 998;
  group.visible = false;

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const fillMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.38,
    depthTest: false,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.name = 'tri_fill';
  group.add(fillMesh);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
  });
  const lineLoop = new THREE.Line(lineGeo, lineMat);
  lineLoop.name = 'tri_outline';
  group.add(lineLoop);

  return group;
}

/**
 * Actualiza la posición en coordenadas de mundo de los 3 vértices del indicador de triángulo.
 */
export function updateTriangleHighlightMesh(
  indicator: THREE.Group,
  mesh: THREE.Mesh,
  faceIndex: number,
  colorHex?: string | number
): boolean {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) {
    indicator.visible = false;
    return false;
  }

  const i0 = faceIndex * 3;
  const i1 = faceIndex * 3 + 1;
  const i2 = faceIndex * 3 + 2;
  if (i2 >= posAttr.count) {
    indicator.visible = false;
    return false;
  }

  const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
  const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(mesh.matrixWorld);
  const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(mesh.matrixWorld);

  // Pequeño desplazamiento hacia afuera según la normal para evitar z-fighting
  const edge1 = new THREE.Vector3().subVectors(v1, v0);
  const edge2 = new THREE.Vector3().subVectors(v2, v0);
  const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
  v0.addScaledVector(faceNormal, 0.0015);
  v1.addScaledVector(faceNormal, 0.0015);
  v2.addScaledVector(faceNormal, 0.0015);

  const fillMesh = indicator.getObjectByName('tri_fill') as THREE.Mesh | undefined;
  const lineLoop = indicator.getObjectByName('tri_outline') as THREE.Line | undefined;

  if (fillMesh) {
    const fPos = fillMesh.geometry.attributes.position as THREE.BufferAttribute;
    fPos.setXYZ(0, v0.x, v0.y, v0.z);
    fPos.setXYZ(1, v1.x, v1.y, v1.z);
    fPos.setXYZ(2, v2.x, v2.y, v2.z);
    fPos.needsUpdate = true;
    if (colorHex !== undefined) {
      (fillMesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
    }
  }

  if (lineLoop) {
    const lPos = lineLoop.geometry.attributes.position as THREE.BufferAttribute;
    lPos.setXYZ(0, v0.x, v0.y, v0.z);
    lPos.setXYZ(1, v1.x, v1.y, v1.z);
    lPos.setXYZ(2, v2.x, v2.y, v2.z);
    lPos.setXYZ(3, v0.x, v0.y, v0.z);
    lPos.needsUpdate = true;
    if (colorHex !== undefined) {
      (lineLoop.material as THREE.LineBasicMaterial).color.set(colorHex);
    }
  }

  indicator.visible = true;
  return true;
}

/**
 * Garantiza que la geometría tenga el atributo 'color' por vértice y activa vertexColors en sus materiales.
 */
function ensureMeshVertexColors(mesh: THREE.Mesh): THREE.BufferAttribute {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  let colorAttr = geo.attributes.color as THREE.BufferAttribute | undefined;

  if (!colorAttr || colorAttr.count !== posAttr.count) {
    const colors = new Float32Array(posAttr.count * 3);
    const baseColor = new THREE.Color(0xffffff);
    const toonMat = mesh.userData.toonMaterial as THREE.MeshToonMaterial | undefined;
    if (toonMat && toonMat.color) {
      baseColor.copy(toonMat.color);
    } else if ((mesh.material as THREE.MeshStandardMaterial)?.color) {
      baseColor.copy((mesh.material as THREE.MeshStandardMaterial).color);
    }

    for (let i = 0; i < posAttr.count; i++) {
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }
    colorAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colorAttr);
  }

  const enableVC = (mat: THREE.Material | undefined) => {
    if (!mat) return;
    const m = mat as THREE.MeshToonMaterial;
    if (!m.vertexColors) {
      m.vertexColors = true;
      if (m.color) m.color.setHex(0xffffff);
      m.needsUpdate = true;
    }
  };
  enableVC(mesh.userData.toonMaterial);
  enableVC(mesh.userData.eeveeMaterial);
  enableVC(mesh.userData.cyclesMaterial);
  enableVC(mesh.userData.matcapMaterial);
  if (!Array.isArray(mesh.userData.originalMaterial)) {
    enableVC(mesh.userData.originalMaterial);
  }

  return colorAttr;
}

/**
 * Encuentra el índice del triángulo simétrico en el eje X (-x, y, z) dentro de la misma malla.
 */
export function findMirrorTriangleIndex(mesh: THREE.Mesh, faceIndex: number): number | null {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return null;

  const triCount = Math.floor(posAttr.count / 3);
  if (faceIndex < 0 || faceIndex >= triCount) return null;

  const i0 = faceIndex * 3;
  const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
  const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 1).applyMatrix4(mesh.matrixWorld);
  const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 2).applyMatrix4(mesh.matrixWorld);

  const cx = (v0.x + v1.x + v2.x) / 3;
  const cy = (v0.y + v1.y + v2.y) / 3;
  const cz = (v0.z + v1.z + v2.z) / 3;

  // Si el triángulo está prácticamente en el centro (X ≈ 0), no buscar espejo separado
  if (Math.abs(cx) < 0.015) return null;

  const targetWorld = new THREE.Vector3(-cx, cy, cz);
  const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const targetLocal = targetWorld.applyMatrix4(invMat);

  let bestFace = -1;
  let bestDistSq = 0.08 * 0.08;

  for (let f = 0; f < triCount; f++) {
    if (f === faceIndex) continue;
    const base = f * 3;
    const fcx = (posAttr.getX(base) + posAttr.getX(base + 1) + posAttr.getX(base + 2)) / 3;
    const fcy = (posAttr.getY(base) + posAttr.getY(base + 1) + posAttr.getY(base + 2)) / 3;
    const fcz = (posAttr.getZ(base) + posAttr.getZ(base + 1) + posAttr.getZ(base + 2)) / 3;

    const dx = fcx - targetLocal.x;
    const dy = fcy - targetLocal.y;
    const dz = fcz - targetLocal.z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestFace = f;
    }
  }

  return bestFace >= 0 ? bestFace : null;
}

/**
 * Recopila los índices de triángulos objetivo según el modo de alcance (1 triángulo exacto o radio del pincel)
 * más sus triángulos simétricos en X si `symmetryX` está activo.
 */
function collectTargetTriangles(
  mesh: THREE.Mesh,
  primaryFaceIndex: number,
  worldHitPoint: THREE.Vector3,
  settings: SculptBrushSettings
): Set<number> {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const triCount = Math.floor(posAttr.count / 3);
  const selected = new Set<number>();

  if (primaryFaceIndex >= 0 && primaryFaceIndex < triCount) {
    selected.add(primaryFaceIndex);
  }

  const singleMode = settings.triSingleFaceMode !== false;

  if (!singleMode) {
    const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const localHit = worldHitPoint.clone().applyMatrix4(invMat);
    const avgScale = (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3 || 1;
    const localRadius = settings.radius / avgScale;
    const radiusSq = localRadius * localRadius;

    for (let f = 0; f < triCount; f++) {
      const base = f * 3;
      const cx = (posAttr.getX(base) + posAttr.getX(base + 1) + posAttr.getX(base + 2)) / 3;
      const cy = (posAttr.getY(base) + posAttr.getY(base + 1) + posAttr.getY(base + 2)) / 3;
      const cz = (posAttr.getZ(base) + posAttr.getZ(base + 1) + posAttr.getZ(base + 2)) / 3;
      const dx = cx - localHit.x;
      const dy = cy - localHit.y;
      const dz = cz - localHit.z;
      if (dx * dx + dy * dy + dz * dz <= radiusSq) {
        selected.add(f);
      }
    }
  }

  if (settings.symmetryX) {
    const initialFaces = Array.from(selected);
    for (const f of initialFaces) {
      const mirrorF = findMirrorTriangleIndex(mesh, f);
      if (mirrorF !== null) {
        selected.add(mirrorF);
      }
    }
  }

  return selected;
}

/**
 * Subdivide un único triángulo (v0, v1, v2) con colores (c0, c1, c2) en N segmentos por arista (N^2 sub-triángulos)
 * o en modo 'poke' (3 sub-triángulos unidos al centroide con elevación opcional).
 */
function appendSubdividedTriangle(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  c0: THREE.Color,
  c1: THREE.Color,
  c2: THREE.Color,
  mode: TriangleSubdivideMode,
  pokeOffset: number,
  outPositions: number[],
  outColors: number[]
): void {
  const pushTri = (
    pA: THREE.Vector3,
    pB: THREE.Vector3,
    pC: THREE.Vector3,
    colA: THREE.Color,
    colB: THREE.Color,
    colC: THREE.Color
  ) => {
    outPositions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z);
    outColors.push(colA.r, colA.g, colA.b, colB.r, colB.g, colB.b, colC.r, colC.g, colC.b);
  };

  if (mode === 'poke') {
    const center = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
    if (Math.abs(pokeOffset) > 1e-5) {
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const norm = new THREE.Vector3().crossVectors(e1, e2).normalize();
      center.addScaledVector(norm, pokeOffset);
    }
    const centerCol = new THREE.Color(
      (c0.r + c1.r + c2.r) / 3,
      (c0.g + c1.g + c2.g) / 3,
      (c0.b + c1.b + c2.b) / 3
    );
    pushTri(v0, v1, center, c0, c1, centerCol);
    pushTri(v1, v2, center, c1, c2, centerCol);
    pushTri(v2, v0, center, c2, c0, centerCol);
    return;
  }

  const n = mode; // 2, 3 o 4 segmentos por lado
  // Coordenadas baricéntricas en rejilla triangular de paso 1/n
  const getPoint = (i: number, j: number): { pos: THREE.Vector3; col: THREE.Color } => {
    const u = i / n;
    const v = j / n;
    const w = 1 - u - v;
    const pos = new THREE.Vector3(
      w * v0.x + u * v1.x + v * v2.x,
      w * v0.y + u * v1.y + v * v2.y,
      w * v0.z + u * v1.z + v * v2.z
    );
    const col = new THREE.Color(
      w * c0.r + u * c1.r + v * c2.r,
      w * c0.g + u * c1.g + v * c2.g,
      w * c0.b + u * c1.b + v * c2.b
    );
    return { pos, col };
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      // Triángulo directo (i, j) -> (i+1, j) -> (i, j+1)
      const p00 = getPoint(i, j);
      const p10 = getPoint(i + 1, j);
      const p01 = getPoint(i, j + 1);
      pushTri(p00.pos, p10.pos, p01.pos, p00.col, p10.col, p01.col);

      // Triángulo invertido interior si no estamos en el borde diagonal
      if (i + j + 1 < n) {
        const p11 = getPoint(i + 1, j + 1);
        pushTri(p10.pos, p11.pos, p01.pos, p10.col, p11.col, p01.col);
      }
    }
  }
}

/**
 * Extruye un triángulo (v0, v1, v2) a lo largo de su normal creando 3 caras laterales (6 triángulos)
 * más la tapa superior escalada/biselada (1 triángulo) = 7 triángulos en total.
 */
function appendExtrudedTriangle(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  c0: THREE.Color,
  c1: THREE.Color,
  c2: THREE.Color,
  extrudeDist: number,
  capScale: number,
  outPositions: number[],
  outColors: number[]
): void {
  const e1 = new THREE.Vector3().subVectors(v1, v0);
  const e2 = new THREE.Vector3().subVectors(v2, v0);
  const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();

  const centroid = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
  const topCenter = centroid.clone().addScaledVector(normal, extrudeDist);

  const makeTopVert = (v: THREE.Vector3) =>
    new THREE.Vector3().subVectors(v, centroid).multiplyScalar(capScale).add(topCenter);

  const t0 = makeTopVert(v0);
  const t1 = makeTopVert(v1);
  const t2 = makeTopVert(v2);

  const pushTri = (
    pA: THREE.Vector3,
    pB: THREE.Vector3,
    pC: THREE.Vector3,
    colA: THREE.Color,
    colB: THREE.Color,
    colC: THREE.Color
  ) => {
    outPositions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z);
    outColors.push(colA.r, colA.g, colA.b, colB.r, colB.g, colB.b, colC.r, colC.g, colC.b);
  };

  // Tapa extruida
  pushTri(t0, t1, t2, c0, c1, c2);

  // Pared lateral 1 (v0 - v1 - t1 - t0)
  pushTri(v0, v1, t1, c0, c1, c1);
  pushTri(v0, t1, t0, c0, c1, c0);

  // Pared lateral 2 (v1 - v2 - t2 - t1)
  pushTri(v1, v2, t2, c1, c2, c2);
  pushTri(v1, t2, t1, c1, c2, c1);

  // Pared lateral 3 (v2 - v0 - t0 - t2)
  pushTri(v2, v0, t0, c2, c0, c0);
  pushTri(v2, t0, t2, c2, c0, c2);
}

/**
 * Aplica la herramienta de edición por triángulos activa ('tri_paint', 'tri_subdivide', 'tri_extrude', 'tri_push', 'tri_delete')
 * sobre la malla impactada.
 */
export function applyTriangleToolToMesh(
  mesh: THREE.Mesh,
  faceIndex: number,
  worldHitPoint: THREE.Vector3,
  settings: SculptBrushSettings,
  isShiftInverted: boolean
): { modified: boolean; pickedColor?: string; deltaTriangles?: number } {
  const geo = mesh.geometry as THREE.BufferGeometry;
  if (geo.index) {
    mesh.geometry = geo.toNonIndexed();
  }
  const activeGeo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = activeGeo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return { modified: false };

  const triCount = Math.floor(posAttr.count / 3);
  if (faceIndex < 0 || faceIndex >= triCount) return { modified: false };

  const colorAttr = ensureMeshVertexColors(mesh);

  // 1. MODO PINTAR TRIÁNGULO (o Cuentagotas con Shift)
  if (settings.mode === 'tri_paint') {
    if (isShiftInverted) {
      const i0 = faceIndex * 3;
      const picked = new THREE.Color(
        colorAttr.getX(i0),
        colorAttr.getY(i0),
        colorAttr.getZ(i0)
      );
      return { modified: false, pickedColor: `#${picked.getHexString()}` };
    }

    const targets = collectTargetTriangles(mesh, faceIndex, worldHitPoint, settings);
    if (targets.size === 0) return { modified: false };

    const targetColor = new THREE.Color(settings.paintColor);
    const alpha = THREE.MathUtils.clamp(settings.strength * 1.35, 0.25, 1.0);

    targets.forEach((f) => {
      const base = f * 3;
      for (let k = 0; k < 3; k++) {
        const idx = base + k;
        const r = THREE.MathUtils.lerp(colorAttr.getX(idx), targetColor.r, alpha);
        const g = THREE.MathUtils.lerp(colorAttr.getY(idx), targetColor.g, alpha);
        const b = THREE.MathUtils.lerp(colorAttr.getZ(idx), targetColor.b, alpha);
        colorAttr.setXYZ(idx, r, g, b);
      }
    });

    colorAttr.needsUpdate = true;
    return { modified: true, deltaTriangles: 0 };
  }

  // 2. MODO EMPUJAR / TIRAR TRIÁNGULO (Desplaza la cara a lo largo de su normal)
  if (settings.mode === 'tri_push') {
    const targets = collectTargetTriangles(mesh, faceIndex, worldHitPoint, settings);
    if (targets.size === 0) return { modified: false };

    const sign = isShiftInverted ? -1 : 1;
    const avgScale = (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3 || 1;
    const stepDist = (sign * settings.strength * 0.025) / avgScale;

    targets.forEach((f) => {
      const base = f * 3;
      const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, base);
      const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, base + 1);
      const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, base + 2);
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const norm = new THREE.Vector3().crossVectors(e1, e2).normalize();

      v0.addScaledVector(norm, stepDist);
      v1.addScaledVector(norm, stepDist);
      v2.addScaledVector(norm, stepDist);

      posAttr.setXYZ(base, v0.x, v0.y, v0.z);
      posAttr.setXYZ(base + 1, v1.x, v1.y, v1.z);
      posAttr.setXYZ(base + 2, v2.x, v2.y, v2.z);
    });

    posAttr.needsUpdate = true;
    prepareGeometryNormals(mesh);
    activeGeo.computeBoundingBox();
    activeGeo.computeBoundingSphere();
    if (mesh.userData.outlineMesh) {
      (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
    }
    return { modified: true, deltaTriangles: 0 };
  }

  // 3. MODOS QUE RECONSTRUYEN LA TOPOLOGÍA DE TRIÁNGULOS:
  //    'tri_subdivide' (Aumentar segmentos), 'tri_extrude' (Extruir cara), 'tri_delete' (Borrar cara)
  if (
    settings.mode === 'tri_subdivide' ||
    settings.mode === 'tri_extrude' ||
    settings.mode === 'tri_delete'
  ) {
    const targets = collectTargetTriangles(mesh, faceIndex, worldHitPoint, settings);
    if (targets.size === 0) return { modified: false };

    // Evitar borrar todos los triángulos de una malla
    if (settings.mode === 'tri_delete' && targets.size >= triCount) {
      return { modified: false };
    }

    const outPositions: number[] = [];
    const outColors: number[] = [];

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const c0 = new THREE.Color();
    const c1 = new THREE.Color();
    const c2 = new THREE.Color();

    const avgScale = (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3 || 1;
    const subMode: TriangleSubdivideMode = settings.triSubdivideSegments ?? 2;
    const extrudeHeight = ((settings.triExtrudeHeight ?? 0.08) * (isShiftInverted ? -1 : 1)) / avgScale;
    const extrudeScale = THREE.MathUtils.clamp(settings.triExtrudeScale ?? 0.82, 0.2, 1.4);
    const pokeOffset = isShiftInverted
      ? -((settings.triExtrudeHeight ?? 0.05) * 0.45) / avgScale
      : settings.strength > 0.65
      ? ((settings.triExtrudeHeight ?? 0.05) * 0.35) / avgScale
      : 0;

    for (let f = 0; f < triCount; f++) {
      const base = f * 3;
      v0.fromBufferAttribute(posAttr, base);
      v1.fromBufferAttribute(posAttr, base + 1);
      v2.fromBufferAttribute(posAttr, base + 2);

      c0.setRGB(colorAttr.getX(base), colorAttr.getY(base), colorAttr.getZ(base));
      c1.setRGB(colorAttr.getX(base + 1), colorAttr.getY(base + 1), colorAttr.getZ(base + 1));
      c2.setRGB(colorAttr.getX(base + 2), colorAttr.getY(base + 2), colorAttr.getZ(base + 2));

      if (!targets.has(f)) {
        outPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        outColors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
        continue;
      }

      if (settings.mode === 'tri_delete') {
        // Omitir triángulo eliminado
        continue;
      } else if (settings.mode === 'tri_subdivide') {
        appendSubdividedTriangle(v0, v1, v2, c0, c1, c2, subMode, pokeOffset, outPositions, outColors);
      } else if (settings.mode === 'tri_extrude') {
        appendExtrudedTriangle(
          v0,
          v1,
          v2,
          c0,
          c1,
          c2,
          extrudeHeight,
          extrudeScale,
          outPositions,
          outColors
        );
      }
    }

    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
    newGeo.setAttribute('color', new THREE.Float32BufferAttribute(outColors, 3));

    mesh.geometry.dispose();
    mesh.geometry = newGeo;
    prepareGeometryNormals(mesh);
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();

    if (mesh.userData.outlineMesh) {
      (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
    }

    const newTriCount = Math.floor(outPositions.length / 9);
    return { modified: true, deltaTriangles: newTriCount - triCount };
  }

  return { modified: false };
}

/**
 * Rellena de color todos los triángulos de la pieza (o los que comparten color similar al triángulo clicado).
 */
export function floodFillMeshTriangles(
  mesh: THREE.Mesh,
  seedFaceIndex: number,
  paintColorHex: string,
  onlySimilarColor: boolean = false
): number {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return 0;

  const colorAttr = ensureMeshVertexColors(mesh);
  const triCount = Math.floor(posAttr.count / 3);
  const targetColor = new THREE.Color(paintColorHex);

  const seedBase = Math.max(0, Math.min(triCount - 1, seedFaceIndex)) * 3;
  const seedColor = new THREE.Color(
    colorAttr.getX(seedBase),
    colorAttr.getY(seedBase),
    colorAttr.getZ(seedBase)
  );

  let paintedCount = 0;
  for (let f = 0; f < triCount; f++) {
    const base = f * 3;
    if (onlySimilarColor) {
      const dr = colorAttr.getX(base) - seedColor.r;
      const dg = colorAttr.getY(base) - seedColor.g;
      const db = colorAttr.getZ(base) - seedColor.b;
      if (dr * dr + dg * dg + db * db > 0.08) continue;
    }
    for (let k = 0; k < 3; k++) {
      colorAttr.setXYZ(base + k, targetColor.r, targetColor.g, targetColor.b);
    }
    paintedCount++;
  }

  colorAttr.needsUpdate = true;
  return paintedCount;
}

/**
 * Segmentación Global de Triángulos:
 * Aumenta el número de segmentos/triángulos de todo el modelo dividiendo cada triángulo
 * en 4 (2x2), 9 (3x3) o 3 (Poke central), preservando colores por triángulo.
 */
export function segmentAllModelTriangles(
  root: THREE.Object3D,
  mode: TriangleSubdivideMode,
  currentSmoothing: number = 0.92
): { beforeTriangles: number; afterTriangles: number } {
  pushUndoSnapshot(root);

  let beforeTriangles = 0;
  let afterTriangles = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
      if (!posAttr) return;

      const triCount = Math.floor(posAttr.count / 3);
      beforeTriangles += triCount;

      // Límite de seguridad por pieza para mantener fluidez en tiempo real
      if (triCount > 22000) {
        afterTriangles += triCount;
        return;
      }

      const colorAttr = ensureMeshVertexColors(mesh);
      const outPositions: number[] = [];
      const outColors: number[] = [];

      for (let f = 0; f < triCount; f++) {
        const base = f * 3;
        v0.fromBufferAttribute(posAttr, base);
        v1.fromBufferAttribute(posAttr, base + 1);
        v2.fromBufferAttribute(posAttr, base + 2);

        c0.setRGB(colorAttr.getX(base), colorAttr.getY(base), colorAttr.getZ(base));
        c1.setRGB(colorAttr.getX(base + 1), colorAttr.getY(base + 1), colorAttr.getZ(base + 1));
        c2.setRGB(colorAttr.getX(base + 2), colorAttr.getY(base + 2), colorAttr.getZ(base + 2));

        appendSubdividedTriangle(v0, v1, v2, c0, c1, c2, mode, 0, outPositions, outColors);
      }

      const newGeo = new THREE.BufferGeometry();
      newGeo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
      newGeo.setAttribute('color', new THREE.Float32BufferAttribute(outColors, 3));

      mesh.geometry.dispose();
      mesh.geometry = newGeo;
      prepareGeometryNormals(mesh);
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();

      if (mesh.userData.outlineMesh) {
        (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
      }

      afterTriangles += Math.floor(outPositions.length / 9);
    }
  });

  applyNormalSmoothingToModel(root, currentSmoothing);
  return { beforeTriangles, afterTriangles };
}

/**
 * Crea un indicador 3D de Vértice (Esfera brillante + Anillo exterior) para mostrar el vértice
 * exacto que se va a pinchar/mover o usar como inicio de una línea.
 */
export function createVertexHighlightMesh(colorHex: number = 0xa855f7): THREE.Group {
  const group = new THREE.Group();
  group.renderOrder = 999;
  group.visible = false;

  const sphereGeo = new THREE.SphereGeometry(0.022, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.name = 'vert_dot';
  group.add(sphere);

  const ringGeo = new THREE.RingGeometry(0.032, 0.044, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.name = 'vert_ring';
  group.add(ring);

  return group;
}

/**
 * Crea el indicador 3D para la herramienta "Función Línea de Vértices":
 * Muestra el segmento de línea entre el Vértice A y el Vértice B, las 2 esferas de los extremos
 * y la banda planar semitransparente que indica el plano y el radio de atracción de los vértices cercanos.
 */
export function createVertexLineIndicatorMesh(colorHex: number = 0x38bdf8): THREE.Group {
  const group = new THREE.Group();
  group.renderOrder = 999;
  group.visible = false;

  // Línea principal A -> B
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 1.0,
    depthTest: false,
  });
  const mainLine = new THREE.Line(lineGeo, lineMat);
  mainLine.name = 'line_segment';
  group.add(mainLine);

  // Banda del plano (muestra visualmente el plano en el que se alinean los vértices cercanos)
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const planeMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.24,
    depthTest: false,
  });
  const planeStrip = new THREE.Mesh(planeGeo, planeMat);
  planeStrip.name = 'line_plane_strip';
  group.add(planeStrip);

  // Borde del área planar
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
  const borderMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  const borderLine = new THREE.Line(borderGeo, borderMat);
  borderLine.name = 'line_plane_border';
  group.add(borderLine);

  // Esferas en el punto inicial A y final B
  const dotGeo = new THREE.SphereGeometry(0.025, 14, 14);
  const startDot = new THREE.Mesh(
    dotGeo,
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false })
  );
  startDot.name = 'line_start_dot';
  group.add(startDot);

  const endDot = new THREE.Mesh(
    dotGeo,
    new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false })
  );
  endDot.name = 'line_end_dot';
  group.add(endDot);

  return group;
}

/**
 * Actualiza el indicador 3D de la Línea y su Plano Coplanar entre `startWorld` y `endWorld`.
 */
export function updateVertexLineIndicatorMesh(
  indicator: THREE.Group,
  startWorld: THREE.Vector3,
  endWorld: THREE.Vector3,
  planeNormalWorld: THREE.Vector3,
  corridorRadius: number
): void {
  const mainLine = indicator.getObjectByName('line_segment') as THREE.Line | undefined;
  const planeStrip = indicator.getObjectByName('line_plane_strip') as THREE.Mesh | undefined;
  const borderLine = indicator.getObjectByName('line_plane_border') as THREE.Line | undefined;
  const startDot = indicator.getObjectByName('line_start_dot') as THREE.Mesh | undefined;
  const endDot = indicator.getObjectByName('line_end_dot') as THREE.Mesh | undefined;

  if (startDot) startDot.position.copy(startWorld);
  if (endDot) endDot.position.copy(endWorld);

  if (mainLine) {
    const pos = mainLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, startWorld.x, startWorld.y, startWorld.z);
    pos.setXYZ(1, endWorld.x, endWorld.y, endWorld.z);
    pos.needsUpdate = true;
  }

  const lineVec = new THREE.Vector3().subVectors(endWorld, startWorld);
  const len = lineVec.length();
  if (len > 1e-4 && planeStrip && borderLine) {
    const u = lineVec.clone().divideScalar(len);
    const side = new THREE.Vector3().crossVectors(planeNormalWorld, u).normalize();
    if (side.lengthSq() < 1e-4) {
      side.set(0, 1, 0);
    }
    const r = Math.max(0.02, corridorRadius);

    // 4 esquinas del rectángulo coplanar alrededor de la línea A -> B
    const c0 = startWorld.clone().addScaledVector(side, r);
    const c1 = startWorld.clone().addScaledVector(side, -r);
    const c2 = endWorld.clone().addScaledVector(side, -r);
    const c3 = endWorld.clone().addScaledVector(side, r);

    const pAttr = planeStrip.geometry.attributes.position as THREE.BufferAttribute;
    pAttr.setXYZ(0, c0.x, c0.y, c0.z);
    pAttr.setXYZ(1, c1.x, c1.y, c1.z);
    pAttr.setXYZ(2, c2.x, c2.y, c2.z);
    pAttr.setXYZ(3, c0.x, c0.y, c0.z);
    pAttr.setXYZ(4, c2.x, c2.y, c2.z);
    pAttr.setXYZ(5, c3.x, c3.y, c3.z);
    pAttr.needsUpdate = true;

    const bAttr = borderLine.geometry.attributes.position as THREE.BufferAttribute;
    bAttr.setXYZ(0, c0.x, c0.y, c0.z);
    bAttr.setXYZ(1, c1.x, c1.y, c1.z);
    bAttr.setXYZ(2, c2.x, c2.y, c2.z);
    bAttr.setXYZ(3, c3.x, c3.y, c3.z);
    bAttr.setXYZ(4, c0.x, c0.y, c0.z);
    bAttr.needsUpdate = true;
  }

  indicator.visible = true;
}

/**
 * Encuentra el vértice más cercano al punto de impacto dentro del triángulo `faceIndex`
 * y devuelve su posición y normal en coordenadas de mundo.
 */
export function findNearestVertexOnHit(
  mesh: THREE.Mesh,
  faceIndex: number,
  worldHitPoint: THREE.Vector3
): {
  vertexIndex: number;
  worldPos: THREE.Vector3;
  worldNormal: THREE.Vector3;
} | null {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return null;

  const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const i0 = faceIndex * 3;
  if (i0 + 2 >= posAttr.count) return null;

  let bestIdx = i0;
  let bestDistSq = Infinity;
  const bestWorldPos = new THREE.Vector3();
  const tempV = new THREE.Vector3();

  for (let k = 0; k < 3; k++) {
    const idx = i0 + k;
    tempV.fromBufferAttribute(posAttr, idx).applyMatrix4(mesh.matrixWorld);
    const dSq = tempV.distanceToSquared(worldHitPoint);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
      bestWorldPos.copy(tempV);
    }
  }

  const worldNormal = new THREE.Vector3(0, 1, 0);
  if (normAttr && bestIdx < normAttr.count) {
    worldNormal
      .fromBufferAttribute(normAttr, bestIdx)
      .transformDirection(mesh.matrixWorld)
      .normalize();
  } else {
    const vA = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
    const vB = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 1).applyMatrix4(mesh.matrixWorld);
    const vC = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 2).applyMatrix4(mesh.matrixWorld);
    worldNormal.crossVectors(vB.sub(vA), vC.sub(vA)).normalize();
  }

  return {
    vertexIndex: bestIdx,
    worldPos: bestWorldPos,
    worldNormal,
  };
}

/**
 * Captura una instantánea ligera de las posiciones de todos los vértices del modelo
 * al iniciar un arrastre (`pointerdown`) para que el movimiento de vértices o la alineación
 * a una línea en vivo sea 100% exacta y sin acumulación de error frame a frame.
 */
export function captureModelPositionsSnapshot(
  root: THREE.Object3D
): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>();
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const posAttr = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
      if (posAttr) {
        map.set(mesh.uuid, new Float32Array(posAttr.array));
      }
    }
  });
  return map;
}

/**
 * MOVER VÉRTICES (Pinchando y Moviendo en el mismo plano):
 * Desplaza el vértice seleccionado (junto con todos los vértices soldados en esa misma coordenada
 * para mantener las caras unidas) siguiendo el cursor sobre el plano del vértice.
 * Si `vertexMoveSoftRadius` está activo, arrastra también suavemente los vértices cercanos en el mismo plano.
 */
export function applyVertexMoveFromSnapshot(
  root: THREE.Object3D,
  snapshot: Map<string, Float32Array>,
  grabStartWorld: THREE.Vector3,
  grabCurrentWorld: THREE.Vector3,
  planeNormalWorld: THREE.Vector3,
  settings: SculptBrushSettings
): number {
  // Asegurar que el vector de movimiento esté estrictamente contenido en el plano del vértice seleccionado
  const rawDelta = new THREE.Vector3().subVectors(grabCurrentWorld, grabStartWorld);
  const normalComponent = rawDelta.dot(planeNormalWorld);
  const planarDeltaWorld = rawDelta.clone().addScaledVector(planeNormalWorld, -normalComponent);

  // Desplazamiento simétrico en X (-dx, dy, dz)
  const symStartWorld = new THREE.Vector3(-grabStartWorld.x, grabStartWorld.y, grabStartWorld.z);
  const symDeltaWorld = new THREE.Vector3(-planarDeltaWorld.x, planarDeltaWorld.y, planarDeltaWorld.z);
  const hasSymmetry = settings.symmetryX && Math.abs(grabStartWorld.x) > 0.015;

  const useSoftRadius = settings.vertexMoveSoftRadius === true;
  const weldToleranceSq = 0.004 * 0.004;
  const softRadius = Math.max(0.025, settings.radius);
  const softRadiusSq = softRadius * softRadius;

  let movedVerticesCount = 0;
  const worldPos = new THREE.Vector3();
  const invMatrix = new THREE.Matrix4();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const origArray = snapshot.get(mesh.uuid);
      const geo = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geo?.attributes?.position as THREE.BufferAttribute | undefined;
      if (!origArray || !posAttr || origArray.length !== posAttr.array.length) return;

      invMatrix.copy(mesh.matrixWorld).invert();
      let meshModified = false;

      for (let i = 0; i < posAttr.count; i++) {
        const ox = origArray[i * 3];
        const oy = origArray[i * 3 + 1];
        const oz = origArray[i * 3 + 2];

        worldPos.set(ox, oy, oz).applyMatrix4(mesh.matrixWorld);

        const distSqPrimary = worldPos.distanceToSquared(grabStartWorld);
        const distSqSym = hasSymmetry ? worldPos.distanceToSquared(symStartWorld) : Infinity;

        let weightPrimary = 0;
        if (distSqPrimary <= weldToleranceSq) {
          weightPrimary = 1.0;
        } else if (useSoftRadius && distSqPrimary < softRadiusSq) {
          const d = Math.sqrt(distSqPrimary);
          weightPrimary = 0.5 + 0.5 * Math.cos((Math.PI * d) / softRadius);
        }

        let weightSym = 0;
        if (hasSymmetry) {
          if (distSqSym <= weldToleranceSq) {
            weightSym = 1.0;
          } else if (useSoftRadius && distSqSym < softRadiusSq) {
            const d = Math.sqrt(distSqSym);
            weightSym = 0.5 + 0.5 * Math.cos((Math.PI * d) / softRadius);
          }
        }

        if (weightPrimary > 0 || weightSym > 0) {
          if (weightPrimary >= weightSym) {
            worldPos.addScaledVector(planarDeltaWorld, weightPrimary);
          } else {
            worldPos.addScaledVector(symDeltaWorld, weightSym);
          }
          worldPos.applyMatrix4(invMatrix);
          posAttr.setXYZ(i, worldPos.x, worldPos.y, worldPos.z);
          meshModified = true;
          movedVerticesCount++;
        } else {
          posAttr.setXYZ(i, ox, oy, oz);
        }
      }

      if (meshModified) {
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
      }
    }
  });

  return movedVerticesCount;
}

/**
 * FUNCIÓN LÍNEA DE VÉRTICES (Alinear los vértices más cercanos a la línea trazada en el mismo plano):
 * Cuando el usuario traza una línea entre dos vértices seleccionados (A y B):
 * 1. Define el plano exacto que contiene a los vértices seleccionados A y B y su orientación superficial (`planeNormalWorld`).
 * 2. Busca todos los vértices cercanos al segmento de línea A -> B dentro del corredor `settings.radius`.
 * 3. Mueve esos vértices al mismo plano que los vértices seleccionados A y B y los atrae directamente
 *    hacia la línea A -> B según la fuerza configurada.
 */
export function applyVertexLineAlignmentFromSnapshot(
  root: THREE.Object3D,
  snapshot: Map<string, Float32Array>,
  lineStartWorld: THREE.Vector3,
  lineEndWorld: THREE.Vector3,
  planeNormalWorld: THREE.Vector3,
  settings: SculptBrushSettings
): number {
  const lineVec = new THREE.Vector3().subVectors(lineEndWorld, lineStartWorld);
  const lineLenSq = lineVec.lengthSq();
  if (lineLenSq < 1e-6) return 0;
  const lineLen = Math.sqrt(lineLenSq);
  const lineDir = lineVec.clone().divideScalar(lineLen);

  // Ortogonalizar la normal del plano respecto a la dirección de la línea para que la línea A->B
  // esté 100% contenida en el plano
  const planeNorm = planeNormalWorld
    .clone()
    .addScaledVector(lineDir, -planeNormalWorld.dot(lineDir))
    .normalize();
  if (planeNorm.lengthSq() < 1e-4) {
    planeNorm.set(0, 0, 1);
  }

  // Línea y plano simétricos en X si Simetría X está activa
  const hasSymmetry =
    settings.symmetryX &&
    (Math.abs(lineStartWorld.x) > 0.02 || Math.abs(lineEndWorld.x) > 0.02);
  const symStart = new THREE.Vector3(-lineStartWorld.x, lineStartWorld.y, lineStartWorld.z);
  const symEnd = new THREE.Vector3(-lineEndWorld.x, lineEndWorld.y, lineEndWorld.z);
  const symVec = new THREE.Vector3().subVectors(symEnd, symStart);
  const symPlaneNorm = new THREE.Vector3(-planeNorm.x, planeNorm.y, planeNorm.z).normalize();

  const corridorRadius = Math.max(0.03, settings.radius);
  const strength = THREE.MathUtils.clamp(settings.strength, 0.1, 1.0);
  const snapMode: VertexLineSnapMode = settings.vertexLineSnapMode ?? 'snap_to_line';

  let alignedCount = 0;
  const worldPos = new THREE.Vector3();
  const invMatrix = new THREE.Matrix4();
  const closestOnLine = new THREE.Vector3();
  const offsetVec = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();

  const processSegment = (
    vWorld: THREE.Vector3,
    segA: THREE.Vector3,
    segAB: THREE.Vector3,
    segLenSq: number,
    pNorm: THREE.Vector3
  ): THREE.Vector3 | null => {
    const relX = vWorld.x - segA.x;
    const relY = vWorld.y - segA.y;
    const relZ = vWorld.z - segA.z;
    const rawT = (relX * segAB.x + relY * segAB.y + relZ * segAB.z) / segLenSq;

    // Solo afectar a los vértices que se encuentran a lo largo del tramo de la línea (con ligero margen en los extremos)
    if (rawT < -0.08 || rawT > 1.08) return null;

    const clampedT = THREE.MathUtils.clamp(rawT, 0, 1);
    closestOnLine.copy(segA).addScaledVector(segAB, clampedT);

    const dist = vWorld.distanceTo(closestOnLine);
    if (dist > corridorRadius) return null;

    // Los vértices más cercanos (dentro del 55% central del radio) se alinean con fuerza completa,
    // y el borde exterior tiene transición suave para no crear escalones bruscos
    let falloff = 1.0;
    if (dist > corridorRadius * 0.55) {
      const u = (dist - corridorRadius * 0.55) / (corridorRadius * 0.45);
      falloff = 0.5 + 0.5 * Math.cos(Math.PI * u);
    }
    const w = THREE.MathUtils.clamp(strength * falloff * 1.15, 0, 1);

    // Vector desde el punto más cercano de la línea hasta el vértice
    offsetVec.subVectors(vWorld, closestOnLine);

    // Altura fuera del plano de los vértices seleccionados A y B
    const heightOutOfPlane = offsetVec.dot(pNorm);
    // Posición del vértice proyectada exactamente sobre el MISMO PLANO que los vértices seleccionados A y B
    const projectedInPlane = vWorld.clone().addScaledVector(pNorm, -heightOutOfPlane);

    if (snapMode === 'snap_to_line') {
      // Mueve el vértice al mismo plano de A-B y lo lleva directamente sobre la línea A-B
      targetWorld.copy(vWorld).lerp( projectedInPlane, Math.min(1, w * 1.25));
      targetWorld.lerp(closestOnLine, w);
    } else {
      // Modo 'coplanar_line': nivela al 100% en el mismo plano de A-B y acerca suavemente hacia la línea
      targetWorld.copy(vWorld).lerp(projectedInPlane, Math.min(1, w * 1.3));
      targetWorld.lerp(closestOnLine, w * 0.55);
    }

    return targetWorld.clone();
  };

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
      const mesh = child as THREE.Mesh;
      const origArray = snapshot.get(mesh.uuid);
      const geo = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geo?.attributes?.position as THREE.BufferAttribute | undefined;
      if (!origArray || !posAttr || origArray.length !== posAttr.array.length) return;

      invMatrix.copy(mesh.matrixWorld).invert();
      let meshModified = false;

      for (let i = 0; i < posAttr.count; i++) {
        const ox = origArray[i * 3];
        const oy = origArray[i * 3 + 1];
        const oz = origArray[i * 3 + 2];

        worldPos.set(ox, oy, oz).applyMatrix4(mesh.matrixWorld);

        let movedWorld = processSegment(worldPos, lineStartWorld, lineVec, lineLenSq, planeNorm);
        if (!movedWorld && hasSymmetry) {
          movedWorld = processSegment(worldPos, symStart, symVec, lineLenSq, symPlaneNorm);
        }

        if (movedWorld) {
          movedWorld.applyMatrix4(invMatrix);
          posAttr.setXYZ(i, movedWorld.x, movedWorld.y, movedWorld.z);
          meshModified = true;
          alignedCount++;
        } else {
          posAttr.setXYZ(i, ox, oy, oz);
        }
      }

      if (meshModified) {
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
      }
    }
  });

  return alignedCount;
}


