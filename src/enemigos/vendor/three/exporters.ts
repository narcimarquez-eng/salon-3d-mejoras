// @ts-nocheck
// Copiado de Enemigo-rpg (f53a67e) con scripts/sync-enemigos.mjs. No editar aquí.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  AuraParticleEffectId,
  EnemyConfig,
  MeshDensity,
  OPTIMIZATION_TIERS,
  getEffectiveMeshDensity,
  getOptimizationTierSpec,
} from '../types/enemy';
import { BuiltEnemyRig, resetRigToBindPose } from './enemyBuilder';

export interface OptimizationTierMetricsReport {
  id: MeshDensity;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  texSize: number;
  triangles: number;
  vertices: number;
  reductionPercent: number;
  glbMegabytes: number;
  htmlMegabytes: number;
}

/**
 * Computes polygon (triangle & vertex) counts and file weight in Megabytes (MB)
 * for all 5 optimization levels ('completo', 'high', 'medium', 'low', 'minimum'),
 * anchored to the live 3D rig metrics in the viewport.
 */
export function computeOptimizationReport(
  config: EnemyConfig,
  activeMetrics: { totalVertices: number; totalTriangles: number; partCount: number },
  measuredSizesByTier?: Partial<Record<MeshDensity, { glbBytes?: number; htmlBytes?: number; tris?: number; verts?: number }>>
): OptimizationTierMetricsReport[] {
  const activeTierId = getEffectiveMeshDensity(config);
  const activeSpec = getOptimizationTierSpec(activeTierId);
  const activeRatio = Math.max(0.1, activeSpec.polyRatioVsCompleto);

  // Reconstruct the 100% "Completo" baseline from the currently active rig's exact polygon count
  const completoTris = Math.max(1200, Math.round(activeMetrics.totalTriangles / activeRatio));
  const completoVerts = Math.max(900, Math.round(activeMetrics.totalVertices / activeRatio));

  return OPTIMIZATION_TIERS.map((tier) => {
    const cached = measuredSizesByTier?.[tier.id];
    const isCurrentActive = tier.id === activeTierId;

    const triangles = isCurrentActive
      ? activeMetrics.totalTriangles
      : cached?.tris ?? Math.max(420, Math.round(completoTris * tier.polyRatioVsCompleto));
    const vertices = isCurrentActive
      ? activeMetrics.totalVertices
      : cached?.verts ?? Math.max(320, Math.round(completoVerts * tier.polyRatioVsCompleto));

    const reductionPercent =
      tier.id === 'completo'
        ? 0
        : Math.max(1, Math.min(92, Math.round((1 - triangles / completoTris) * 100)));

    // Geometry binary payload: position(12B) + normal(12B) + uv(8B) + color(12B) + skinIndex(8B) + skinWeight(16B) = 68B/vert + 6B/tri
    const geometryBytes = vertices * 68 + triangles * 6;
    // 6 embedded skeletal animation clips scaled by keyframe step density
    const animBytes = Math.round(48000 * tier.animStepMult);
    // Embedded PNG texture maps scaled by tier.texSize (512 -> 384 -> 256 -> 128 -> 64)
    const texAreaRatio = (tier.texSize * tier.texSize) / (512 * 512);
    const textureBytes =
      tier.id === 'minimum'
        ? Math.round(38000 * texAreaRatio)
        : tier.id === 'low'
        ? Math.round(240000 * texAreaRatio)
        : Math.round(490000 * texAreaRatio);

    const estimatedGlbBytes = cached?.glbBytes ?? geometryBytes + animBytes + textureBytes + 14336;
    const estimatedHtmlBytes =
      cached?.htmlBytes ?? Math.round(estimatedGlbBytes * 1.338) + 15800;

    return {
      id: tier.id,
      label: tier.label,
      shortLabel: tier.shortLabel,
      badge: tier.badge,
      description: tier.description,
      texSize: tier.texSize,
      triangles,
      vertices,
      reductionPercent,
      glbMegabytes: Number((estimatedGlbBytes / (1024 * 1024)).toFixed(2)),
      htmlMegabytes: Number((estimatedHtmlBytes / (1024 * 1024)).toFixed(2)),
    };
  });
}

function createDownscaledCanvasTexture(
  sourceTex: THREE.Texture | null | undefined,
  targetSize: number
): THREE.CanvasTexture | null {
  if (!sourceTex || !sourceTex.image) return null;
  const img = sourceTex.image as HTMLCanvasElement | HTMLImageElement;
  const srcW = img.width || 512;
  const srcH = img.height || 512;
  if (srcW <= targetSize && srcH <= targetSize) return null;

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetSize, targetSize);

  const downscaled = new THREE.CanvasTexture(canvas);
  downscaled.colorSpace = sourceTex.colorSpace;
  downscaled.wrapS = sourceTex.wrapS;
  downscaled.wrapT = sourceTex.wrapT;
  downscaled.repeat.copy(sourceTex.repeat);
  downscaled.offset.copy(sourceTex.offset);
  downscaled.needsUpdate = true;
  return downscaled;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Serializes the unified THREE.SkinnedMesh + THREE.Bone skeleton + 6 embedded THREE.AnimationClip
 * tracks ('Idle', 'Walk', 'Attack', 'JumpBite', 'Hit', 'Death') + Weapon_Slash_Trail_Arc + Elemental_Breath_Cone
 * + animated Orbiting Aura Shards & Procedural Aura Particle Motes into a .GLB ArrayBuffer or .GLTF JSON.
 * Automatically scales embedded texture resolutions and particle motes according to the Optimization Tier!
 */
export async function serializeEnemyToGLBData(
  rig: BuiltEnemyRig,
  auraParticleMode: AuraParticleEffectId = 'arcane_sparks',
  binary = true
): Promise<ArrayBuffer | object> {
  const exporter = new GLTFExporter();
  const targetGroup = rig.exportableGroup;
  const tierId: MeshDensity =
    (targetGroup.userData?.optimizationTier as MeshDensity) || 'high';
  const tierSpec = getOptimizationTierSpec(tierId);

  // 1. Save current animated bone transforms & reset skeleton to clean bind pose
  const savedBoneState = rig.skeleton.bones.map((b) => ({
    bone: b,
    pos: b.position.clone(),
    quat: b.quaternion.clone(),
    scale: b.scale.clone(),
  }));
  resetRigToBindPose(rig);

  // 1B. Temporarily downscale embedded PBR textures for lighter optimization levels ('high', 'medium', 'low', 'minimum')
  const textureSwaps: Array<{
    mat: THREE.MeshStandardMaterial;
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
    bumpMap: THREE.Texture | null;
    tempTextures: THREE.CanvasTexture[];
  }> = [];

  if (tierSpec.texSize < 512) {
    const visitedMats = new Set<THREE.Material>();
    const downscaleCache = new Map<THREE.Texture, THREE.CanvasTexture>();
    const getOrScale = (tex: THREE.Texture | null): THREE.Texture | null => {
      if (!tex) return null;
      const existing = downscaleCache.get(tex);
      if (existing) return existing;
      const scaled = createDownscaledCanvasTexture(tex, tierSpec.texSize);
      if (scaled) {
        downscaleCache.set(tex, scaled);
        return scaled;
      }
      return tex;
    };

    targetGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of matList) {
        if (visitedMats.has(m)) continue;
        visitedMats.add(m);
        const stdMat = m as THREE.MeshStandardMaterial;
        if (stdMat.map || stdMat.normalMap || stdMat.roughnessMap || stdMat.bumpMap) {
          const origMap = stdMat.map;
          const origNormal = stdMat.normalMap;
          const origRough = stdMat.roughnessMap;
          const origBump = stdMat.bumpMap;

          stdMat.map = getOrScale(origMap);
          // In 'minimum' tier, omit normal/roughness/bump maps to achieve ultra-minimum MB size
          if (tierId === 'minimum') {
            stdMat.normalMap = null;
            stdMat.roughnessMap = null;
            stdMat.bumpMap = null;
          } else if (tierId === 'low') {
            stdMat.normalMap = getOrScale(origNormal);
            stdMat.roughnessMap = null;
            stdMat.bumpMap = null;
          } else {
            stdMat.normalMap = getOrScale(origNormal);
            stdMat.roughnessMap = getOrScale(origRough);
            stdMat.bumpMap = getOrScale(origBump);
          }
          stdMat.needsUpdate = true;
          textureSwaps.push({
            mat: stdMat,
            map: origMap,
            normalMap: origNormal,
            roughnessMap: origRough,
            bumpMap: origBump,
            tempTextures: [],
          });
        }
      }
    });
    downscaleCache.forEach((t) => {
      if (textureSwaps.length > 0) textureSwaps[0].tempTextures.push(t);
    });
  }

  // 2. Temporarily detach AxesHelpers and hidden exploded-view source meshes so only unified SkinnedMesh + Skeleton export
  const detachedNodes: Array<{ parent: THREE.Object3D; child: THREE.Object3D }> = [];
  const toDetach: THREE.Object3D[] = [];
  targetGroup.traverse((child) => {
    if (
      (child as THREE.LineSegments).isLineSegments ||
      child.type === 'AxesHelper' ||
      child.userData?.isExplodedSourceMesh
    ) {
      toDetach.push(child);
    }
  });
  for (const node of toDetach) {
    if (node.parent) {
      detachedNodes.push({ parent: node.parent, child: node });
      node.parent.remove(node);
    }
  }

  // 3. Temporarily expand InstancedMesh into individual Meshes for universal GLTF 2.0 compatibility
  const instancedSwaps: Array<{
    parent: THREE.Object3D;
    inst: THREE.InstancedMesh;
    holder: THREE.Group;
  }> = [];
  const instancedNodes: THREE.InstancedMesh[] = [];
  targetGroup.traverse((child) => {
    if ((child as THREE.InstancedMesh).isInstancedMesh) {
      instancedNodes.push(child as THREE.InstancedMesh);
    }
  });

  const mat4 = new THREE.Matrix4();
  for (const inst of instancedNodes) {
    if (!inst.parent) continue;
    const holder = new THREE.Group();
    holder.name = inst.name || 'Aura_Shards_Group';
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, mat4);
      const shardMesh = new THREE.Mesh(inst.geometry, inst.material);
      shardMesh.name = `Runic_Shard_${i}`;
      shardMesh.applyMatrix4(mat4);
      holder.add(shardMesh);
    }
    instancedSwaps.push({ parent: inst.parent, inst, holder });
    inst.parent.add(holder);
    inst.parent.remove(inst);
  }

  // 4. Create 3D Aura Particle Motes inside targetGroup scaled by Optimization Tier
  const glbParticleHolder = new THREE.Group();
  glbParticleHolder.name = 'Aura_Particles_GLB_Group';
  const isVolcanic = auraParticleMode === 'volcanic_smoke';
  const glbMoteGeo = isVolcanic
    ? new THREE.IcosahedronGeometry(0.055, tierId === 'completo' ? 1 : 0)
    : new THREE.OctahedronGeometry(0.042, 0);
  const glbMoteMat = new THREE.MeshStandardMaterial({
    name: isVolcanic ? 'Mat_GLB_VolcanicSmoke' : 'Mat_GLB_ArcaneSparks',
    color: isVolcanic
      ? new THREE.Color('#3b231e')
      : rig.materials.emissiveRuneMat.color.clone().lerp(new THREE.Color('#ffffff'), 0.35),
    emissive: isVolcanic
      ? new THREE.Color('#ff5511')
      : rig.materials.emissiveRuneMat.color.clone(),
    emissiveIntensity: isVolcanic ? 1.2 : 2.2,
    roughness: isVolcanic ? 0.85 : 0.15,
    transparent: true,
    opacity: auraParticleMode === 'none' ? 0.0 : 0.88,
  });

  const baseMoteCount =
    tierId === 'completo'
      ? 16
      : tierId === 'high'
      ? 12
      : tierId === 'medium'
      ? 8
      : tierId === 'low'
      ? 4
      : 0;
  const GLB_MOTE_COUNT = auraParticleMode === 'none' ? 0 : baseMoteCount;
  for (let mIdx = 0; mIdx < GLB_MOTE_COUNT; mIdx++) {
    const moteMesh = new THREE.Mesh(glbMoteGeo, glbMoteMat);
    moteMesh.name = `Aura_Particle_Mote_${mIdx}`;
    glbParticleHolder.add(moteMesh);
  }
  if (GLB_MOTE_COUNT > 0) {
    targetGroup.add(glbParticleHolder);
  }

  // 5. Clone rig animations and append keyframe tracks for Runic_Shard_* and Aura_Particle_Mote_* so they animate in .GLB
  const exportAnimations = rig.animations.map((baseClip) => {
    const extraTracks: THREE.KeyframeTrack[] = [];
    const steps = Math.max(6, Math.round(16 * tierSpec.animStepMult));
    const dur = baseClip.duration;
    const times = new Float32Array(steps + 1);
    for (let s = 0; s <= steps; s++) {
      times[s] = Number(((s / steps) * dur).toFixed(4));
    }

    // Orbiting Runic Shards keyframe tracks
    for (let i = 0; i < rig.shardData.length; i++) {
      const sd = rig.shardData[i];
      const posBuf = new Float32Array((steps + 1) * 3);
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const ang = sd.angle + frac * Math.PI * 2;
        const y = sd.yOffset + Math.sin(frac * Math.PI * 2 + i) * 0.12;
        posBuf[s * 3] = Math.cos(ang) * sd.radius;
        posBuf[s * 3 + 1] = y;
        posBuf[s * 3 + 2] = Math.sin(ang) * sd.radius;
      }
      extraTracks.push(new THREE.VectorKeyframeTrack(`Runic_Shard_${i}.position`, times, posBuf));
    }

    // Rising & spiraling Aura Particle Motes keyframe tracks from aura anchors
    for (let mIdx = 0; mIdx < GLB_MOTE_COUNT; mIdx++) {
      const posBuf = new Float32Array((steps + 1) * 3);
      const scaleBuf = new Float32Array((steps + 1) * 3);
      const baseAngle = (mIdx / GLB_MOTE_COUNT) * Math.PI * 2;
      const baseRadius = 0.45 + (mIdx % 4) * 0.22;
      const baseY = 0.35 + (mIdx % 5) * 0.32;

      for (let s = 0; s <= steps; s++) {
        const u = ((s / steps) + mIdx / GLB_MOTE_COUNT) % 1.0;
        const spiral = baseAngle + u * (isVolcanic ? 1.4 : 3.6);
        const r = baseRadius + (isVolcanic ? u * 0.24 : Math.sin(u * Math.PI) * 0.18);
        posBuf[s * 3] = Math.cos(spiral) * r;
        posBuf[s * 3 + 1] = baseY + u * (isVolcanic ? 0.95 : 0.72);
        posBuf[s * 3 + 2] = Math.sin(spiral) * r;

        const env = Math.sin(u * Math.PI) * (isVolcanic ? 1.35 : 1.1);
        const sc = Math.max(0.01, env);
        scaleBuf[s * 3] = sc;
        scaleBuf[s * 3 + 1] = sc;
        scaleBuf[s * 3 + 2] = sc;
      }
      extraTracks.push(
        new THREE.VectorKeyframeTrack(`Aura_Particle_Mote_${mIdx}.position`, times, posBuf)
      );
      extraTracks.push(
        new THREE.VectorKeyframeTrack(`Aura_Particle_Mote_${mIdx}.scale`, times, scaleBuf)
      );
    }

    return new THREE.AnimationClip(baseClip.name, baseClip.duration, [
      ...baseClip.tracks,
      ...extraTracks,
    ]);
  });

  targetGroup.updateMatrixWorld(true);

  const restoreSceneState = () => {
    if (GLB_MOTE_COUNT > 0) {
      targetGroup.remove(glbParticleHolder);
    }
    glbMoteGeo.dispose();
    glbMoteMat.dispose();
    for (const swap of textureSwaps) {
      swap.mat.map = swap.map;
      swap.mat.normalMap = swap.normalMap;
      swap.mat.roughnessMap = swap.roughnessMap;
      swap.mat.bumpMap = swap.bumpMap;
      swap.mat.needsUpdate = true;
      for (const tmp of swap.tempTextures) {
        tmp.dispose();
      }
    }
    for (const swap of instancedSwaps) {
      swap.parent.remove(swap.holder);
      swap.parent.add(swap.inst);
    }
    for (const item of detachedNodes) {
      item.parent.add(item.child);
    }
    for (const st of savedBoneState) {
      st.bone.position.copy(st.pos);
      st.bone.quaternion.copy(st.quat);
      st.bone.scale.copy(st.scale);
    }
    targetGroup.updateMatrixWorld(true);
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      targetGroup,
      (result) => {
        restoreSceneState();
        resolve(result);
      },
      (error) => {
        restoreSceneState();
        reject(error);
      },
      {
        binary,
        trs: true,
        onlyVisible: true,
        animations: exportAnimations,
      }
    );
  });
}

/**
 * Exports the unified THREE.SkinnedMesh + THREE.Bone skeleton + 6 embedded THREE.AnimationClip
 * tracks ('Idle', 'Walk', 'Attack', 'JumpBite', 'Hit', 'Death') + Weapon_Slash_Trail_Arc + Aura Particles
 * into a standard binary .GLB or .GLTF 2.0 file with optimization tier suffix.
 */
export async function exportEnemyToGLB(
  rig: BuiltEnemyRig,
  config: EnemyConfig,
  binary = true,
  auraParticleMode: AuraParticleEffectId = 'arcane_sparks'
): Promise<{ sizeBytes: number; filename: string; tier: MeshDensity; triangles: number; vertices: number }> {
  const tier: MeshDensity =
    (rig.exportableGroup.userData?.optimizationTier as MeshDensity) ||
    getEffectiveMeshDensity(config);
  const result = await serializeEnemyToGLBData(rig, auraParticleMode, binary);
  const ext = binary ? 'glb' : 'gltf';
  const filename = `${config.id}_${tier}.${ext}`;
  const triangles = rig.metrics.totalTriangles;
  const vertices = rig.metrics.totalVertices;
  if (result instanceof ArrayBuffer) {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    triggerDownload(blob, filename);
    return { sizeBytes: result.byteLength, filename, tier, triangles, vertices };
  } else {
    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: 'model/gltf+json' });
    triggerDownload(blob, filename);
    return { sizeBytes: blob.size, filename, tier, triangles, vertices };
  }
}

/**
 * Exports a 100% self-contained, single-file .HTML 3D Interactive Viewer & Embeddable Widget
 * containing the embedded Base64 .GLB (SkinnedMesh + Skeleton + 6 Animations + Weapon Slash Trail + PBR Textures)
 * plus the real-time Procedural Aura Particle Emitter (Volcanic Smoke & Arcane Sparks).
 */
export async function exportEnemyToHTML(
  rig: BuiltEnemyRig,
  config: EnemyConfig,
  initialParticleMode: AuraParticleEffectId = 'arcane_sparks'
): Promise<{ sizeBytes: number; filename: string; tier: MeshDensity; triangles: number; vertices: number }> {
  const tier: MeshDensity =
    (rig.exportableGroup.userData?.optimizationTier as MeshDensity) ||
    getEffectiveMeshDensity(config);
  const glbBuffer = (await serializeEnemyToGLBData(rig, initialParticleMode, true)) as ArrayBuffer;
  const base64Glb = arrayBufferToBase64(glbBuffer);
  const filename = `${config.id}_${tier}_viewer.html`;
  const triangles = rig.metrics.totalTriangles;
  const vertices = rig.metrics.totalVertices;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.name} — Visor 3D Autónomo (.GLB + Partículas + Estela)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0d13;
      color: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      user-select: none;
    }
    #canvas-container { width: 100%; height: 100%; cursor: grab; }
    #canvas-container:active { cursor: grabbing; }
    .hud-top {
      position: fixed;
      top: 16px;
      left: 20px;
      z-index: 10;
      pointer-events: none;
    }
    .hud-top h1 {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #f8fafc;
    }
    .hud-top p {
      font-size: 0.78rem;
      color: #94a3b8;
      margin-top: 4px;
      font-family: ui-monospace, monospace;
    }
    .hud-dock {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: center;
      background: rgba(15, 20, 32, 0.92);
      border: 1px solid #334155;
      padding: 10px 16px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      max-width: 95vw;
    }
    .btn-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .group-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #cbd5e1;
      margin-right: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    button {
      background: #0d121d;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 11px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    button:hover { border-color: #64748b; }
    button.active-anim {
      background: #f59e0b;
      color: #090d16;
      border-color: #fbbf24;
    }
    button.active-fx {
      background: #38bdf8;
      color: #090d16;
      border-color: #7dd3fc;
    }
    .divider {
      width: 1px;
      height: 24px;
      background: #334155;
      margin: 0 4px;
    }
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div class="hud-top">
    <h1>${config.name}</h1>
    <p>${config.title} · Nv.${config.stats.level} ${config.stats.tier} · Elemento: ${config.stats.element} · HP ${config.stats.hp} · ATQ ${config.stats.attack}</p>
  </div>

  <div id="canvas-container"></div>

  <div class="hud-dock">
    <div class="btn-group" id="anim-buttons">
      <span class="group-label">Animación (.GLB):</span>
      <button data-clip="Idle" class="active-anim">Reposo</button>
      <button data-clip="Walk">Marcha Realista</button>
      <button data-clip="Attack">Ataque / Fuego</button>
      <button data-clip="JumpBite">Salto Mordida</button>
      <button data-clip="Hit">Impacto</button>
      <button data-clip="Death">Derrota</button>
    </div>
    <div class="divider"></div>
    <div class="btn-group" id="fx-buttons">
      <span class="group-label">Partículas Aura:</span>
      <button data-fx="none" class="${initialParticleMode === 'none' ? 'active-fx' : ''}">Desactivado</button>
      <button data-fx="volcanic_smoke" class="${initialParticleMode === 'volcanic_smoke' ? 'active-fx' : ''}">Humo Volcánico</button>
      <button data-fx="arcane_sparks" class="${initialParticleMode === 'arcane_sparks' ? 'active-fx' : ''}">Chispas Arcanas</button>
    </div>
  </div>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

    const BASE64_GLB = "${base64Glb}";
    const EMISSIVE_HEX = "${config.materials.emissiveColor}";
    let particleMode = "${initialParticleMode}";

    const container = document.getElementById('canvas-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d13);
    scene.fog = new THREE.FogExp2(0x0b0d13, 0.04);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 80);
    camera.position.set(2.85, 2.25, 3.65);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.35, 0);
    controls.enableDamping = true;
    controls.update();

    const keyLight = new THREE.DirectionalLight(0xffdca8, 2.6);
    keyLight.position.set(4.2, 6.8, 4.5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e130c, 0.9);
    scene.add(hemiLight);

    const rimLight = new THREE.SpotLight(0xf59e0b, 2.4, 18, Math.PI / 3, 0.6, 1.5);
    rimLight.position.set(-3.5, 4.2, -4.0);
    scene.add(rimLight);

    // Pedestal
    const dais = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.65, 0.22, 24),
      new THREE.MeshStandardMaterial({ color: 0x121620, metalness: 0.55, roughness: 0.38 })
    );
    dais.position.y = -0.11;
    dais.receiveShadow = true;
    scene.add(dais);

    // Procedural Particle Sprite Textures
    function makeSpriteTex(isSpark) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
      if (isSpark) {
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.5, 'rgba(200,190,185,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const PARTICLE_COUNT = 140;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(PARTICLE_COUNT * 3);
    const pCol = new Float32Array(PARTICLE_COUNT * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));

    const smokeMat = new THREE.PointsMaterial({
      map: makeSpriteTex(false), size: 0.36, transparent: true, opacity: 0.82, depthWrite: false, vertexColors: true
    });
    const sparkMat = new THREE.PointsMaterial({
      map: makeSpriteTex(true), size: 0.24, transparent: true, opacity: 0.95, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending
    });
    const particlePoints = new THREE.Points(pGeo, sparkMat);
    particlePoints.frustumCulled = false;
    scene.add(particlePoints);

    const pool = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      age: (i / PARTICLE_COUNT) * 1.2,
      lifetime: 0.8 + (i % 9) * 0.12,
      anchorIdx: i,
      vx: 0, vy: 0.55, vz: 0,
      seed: i * 1.618
    }));

    // Decode embedded Base64 .GLB
    const binStr = atob(BASE64_GLB);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);

    let mixer = null;
    const actions = {};
    let activeAction = null;
    const anchorNodes = [];

    const loader = new GLTFLoader();
    loader.parse(bytes.buffer, '', (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
        if (obj.name.startsWith('socket_') || obj.name.startsWith('Runic_Shard_')) {
          anchorNodes.push(obj);
        }
      });
      scene.add(model);

      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
      });
      if (actions['Idle']) {
        activeAction = actions['Idle'];
        activeAction.play();
      }
    });

    document.querySelectorAll('#anim-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clipName = btn.getAttribute('data-clip');
        if (!actions[clipName]) return;
        document.querySelectorAll('#anim-buttons button').forEach((b) => b.classList.remove('active-anim'));
        btn.classList.add('active-anim');
        const nextAction = actions[clipName];
        if (activeAction && activeAction !== nextAction) {
          activeAction.fadeOut(0.2);
        }
        nextAction.reset().fadeIn(0.2).play();
        activeAction = nextAction;
      });
    });

    document.querySelectorAll('#fx-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => {
        particleMode = btn.getAttribute('data-fx');
        document.querySelectorAll('#fx-buttons button').forEach((b) => b.classList.remove('active-fx'));
        btn.classList.add('active-fx');
      });
    });

    const clock = new THREE.Clock();
    const tmpVec = new THREE.Vector3();
    const baseCol = new THREE.Color(EMISSIVE_HEX);
    const outCol = new THREE.Color();

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();
      if (mixer) mixer.update(dt);

      if (particleMode === 'none' || anchorNodes.length === 0) {
        particlePoints.visible = false;
      } else {
        particlePoints.visible = true;
        const isVolc = particleMode === 'volcanic_smoke';
        particlePoints.material = isVolc ? smokeMat : sparkMat;
        const posAttr = pGeo.getAttribute('position');
        const colAttr = pGeo.getAttribute('color');

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const p = pool[i];
          p.age += dt;
          if (p.age >= p.lifetime) {
            p.age = 0;
            const node = anchorNodes[p.anchorIdx % anchorNodes.length];
            p.anchorIdx++;
            node.getWorldPosition(tmpVec);
            const ang = t * 3.5 + p.seed * 6.28;
            posAttr.setXYZ(i, tmpVec.x + Math.cos(ang) * 0.07, tmpVec.y, tmpVec.z + Math.sin(ang) * 0.07);
            p.vx = Math.cos(ang) * (isVolc ? 0.16 : 0.38);
            p.vy = 0.5 + (i % 7) * 0.06;
            p.vz = Math.sin(ang) * (isVolc ? 0.16 : 0.38);
          }
          const ratio = p.age / p.lifetime;
          let x = posAttr.getX(i) + (p.vx + Math.sin(t * 3 + p.seed) * 0.22) * dt;
          let y = posAttr.getY(i) + p.vy * dt;
          let z = posAttr.getZ(i) + (p.vz + Math.cos(t * 3 + p.seed) * 0.22) * dt;
          posAttr.setXYZ(i, x, y, z);

          if (isVolc) {
            outCol.set(ratio < 0.28 ? '#ff5511' : '#261d1e').multiplyScalar(Math.max(0, 1 - ratio * 0.85));
          } else {
            outCol.copy(baseCol).lerp(new THREE.Color('#ffffff'), ratio < 0.3 ? 0.5 : 0.1).multiplyScalar(Math.max(0, 1 - ratio));
          }
          colAttr.setXYZ(i, outCol.r, outCol.g, outCol.b);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, filename);
  return { sizeBytes: blob.size, filename, tier, triangles, vertices };
}

export function downloadTextFile(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  triggerDownload(blob, filename);
}

/**
 * Generates a standalone, zero-dependency Three.js / TypeScript module that builds
 * the exact composite enemy (Dragon, Beast, Mythological, Magical, or Biped), sockets,
 * Weapon Slash Trail Arc, Procedural Aura Particles, RPG stats, and procedural animation controller.
 */
export function generateThreeJsModuleCode(config: EnemyConfig): string {
  const { morphology: m, materials: mat, stats, bodyPlan } = config;
  const isQuadruped = bodyPlan === 'quadruped_beast' || bodyPlan === 'dragon_wyvern';
  return `/**
 * Auto-generated by AetherForge 3D — RPG Enemy Studio
 * Enemy: ${config.name} (${config.title})
 * Race Category: ${config.raceCategory} | Body Plan: ${config.bodyPlan}
 * Archetype: ${config.archetype} | Tier: ${stats.tier} | Level: ${stats.level}
 *
 * Includes:
 * - Hierarchical THREE.Bone Skeleton & Sockets (socket_head, socket_weapon_r, socket_shield_l, socket_core)
 * - Weapon Slash Trail Arc (Weapon_Slash_Trail_Arc) activated during 'attack'
 * - Procedural Aura Particle Emitter ('none' | 'volcanic_smoke' | 'arcane_sparks')
 */
import * as THREE from 'three';

export type EnemyAnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export type EnemyAuraParticleMode = 'none' | 'volcanic_smoke' | 'arcane_sparks';

export const ENEMY_RPG_DATA = ${JSON.stringify(
    {
      id: config.id,
      name: config.name,
      title: config.title,
      raceCategory: config.raceCategory,
      bodyPlan: config.bodyPlan,
      archetype: config.archetype,
      stats: config.stats,
    },
    null,
    2
  )} as const;

export interface EnemyInstanceRig {
  group: THREE.Group;
  skeleton: THREE.Skeleton;
  sockets: {
    head: THREE.Object3D;
    weaponR: THREE.Object3D;
    shieldL: THREE.Object3D;
    core: THREE.Object3D;
  };
  parts: {
    rootBone: THREE.Bone;
    pelvis: THREE.Bone;
    torso: THREE.Bone;
    neck: THREE.Bone;
    head: THREE.Bone;
    tail: THREE.Bone;
    tailTip: THREE.Bone;
    leftWing: THREE.Bone;
    rightWing: THREE.Bone;
    leftArm: THREE.Bone;
    leftElbow: THREE.Bone;
    rightArm: THREE.Bone;
    rightElbow: THREE.Bone;
    leftLeg: THREE.Bone;
    leftKnee: THREE.Bone;
    rightLeg: THREE.Bone;
    rightKnee: THREE.Bone;
    coreMesh: THREE.Mesh;
    slashTrailMesh: THREE.Mesh;
    auraParticles: THREE.Points;
  };
  update: (
    state: EnemyAnimState,
    elapsed: number,
    delta: number,
    particleMode?: EnemyAuraParticleMode
  ) => void;
  dispose: () => void;
}

export function createEnemy_${config.id.replace(/[^a-zA-Z0-9_]/g, '_')}(): EnemyInstanceRig {
  const group = new THREE.Group();
  group.name = '${config.id}';
  group.userData = { ...ENEMY_RPG_DATA };

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const trackMat = <T extends THREE.Material>(matItem: T): T => { materials.push(matItem); return matItem; };
  const makeBone = (name: string): THREE.Bone => { const b = new THREE.Bone(); b.name = name; return b; };

  // PBR Studio Materials with Organic Sheen
  const primaryMat = trackMat(new THREE.MeshPhysicalMaterial({
    color: '${mat.primaryColor}',
    metalness: ${mat.metalness},
    roughness: ${mat.roughness},
    anisotropy: ${mat.anisotropy},
    sheen: 0.55,
    sheenRoughness: 0.5,
    clearcoat: 0.25,
  }));

  const secondaryMat = trackMat(new THREE.MeshPhysicalMaterial({
    color: '${mat.secondaryColor}',
    metalness: ${Math.min(1, Number((mat.metalness + 0.12).toFixed(2)))},
    roughness: ${Math.max(0.08, Number(((mat.roughness + 0.32) % 0.85).toFixed(2)))},
  }));

  const underbodyMat = trackMat(new THREE.MeshStandardMaterial({
    color: '${mat.underbodyColor}',
    metalness: ${Math.max(0.05, Number((mat.metalness * 0.25).toFixed(2)))},
    roughness: ${Math.min(0.92, Number((mat.roughness + 0.45).toFixed(2)))},
  }));

  const emissiveMat = trackMat(new THREE.MeshStandardMaterial({
    color: '${mat.emissiveColor}',
    emissive: '${mat.emissiveColor}',
    emissiveIntensity: ${mat.emissiveIntensity},
    roughness: 0.15,
  }));

  const slashTrailMat = trackMat(new THREE.MeshStandardMaterial({
    color: '${mat.emissiveColor}',
    emissive: '${mat.emissiveColor}',
    emissiveIntensity: ${(mat.emissiveIntensity * 1.45).toFixed(2)},
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));

  const legHeight = ${(0.95 * m.limbLength).toFixed(3)};
  const torsoHeight = ${(0.92 * m.heightScale).toFixed(3)};
  const bulk = ${m.torsoBulk.toFixed(3)};
  const shoulderW = ${m.shoulderWidth.toFixed(3)};

  // 1. Hierarchical THREE.Bone Skeleton (Grounded at y = 0)
  const rootBone = makeBone('Root_Bone');
  group.add(rootBone);

  const pelvis = makeBone('Pelvis_Chassis');
  pelvis.position.set(0, legHeight, ${isQuadruped ? -0.35 : 0});
  rootBone.add(pelvis);
  pelvis.add(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.34 * bulk, 0.28 * bulk, 0.44, 12)), primaryMat));

  const buildLeg = (side: number, tag: string) => {
    const leg = makeBone('Leg_' + tag);
    leg.position.set(side * 0.28 * bulk, legHeight, ${isQuadruped ? -0.45 : 0});
    rootBone.add(leg);

    const thigh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16 * bulk, 0.12 * bulk, legHeight * 0.5, 10)), primaryMat);
    thigh.position.y = -legHeight * 0.24;
    leg.add(thigh);

    const knee = makeBone('Knee_Hock_' + tag);
    knee.position.set(0, -legHeight * 0.48, 0);
    leg.add(knee);

    const shin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12 * bulk, 0.09 * bulk, legHeight * 0.5, 10)), primaryMat);
    shin.position.y = -legHeight * 0.24;
    knee.add(shin);

    const pawGeo = trackGeo(new THREE.SphereGeometry(0.14 * bulk, 8, 6));
    pawGeo.scale(0.9, 0.5, 1.45);
    const paw = new THREE.Mesh(pawGeo, secondaryMat);
    paw.position.set(0, -legHeight * 0.46, 0.1);
    knee.add(paw);

    return { leg, knee };
  };
  const { leg: leftLeg, knee: leftKnee } = buildLeg(1, 'L');
  const { leg: rightLeg, knee: rightKnee } = buildLeg(-1, 'R');

  // 2. Torso & Elemental Core
  const torso = makeBone('Torso_Main');
  torso.position.set(0, 0.2, ${isQuadruped ? 0.45 : 0});
  torso.rotation.x = ${isQuadruped ? 0.38 : 0};
  pelvis.add(torso);

  const cuirassPts = [
    new THREE.Vector2(0.28 * bulk, 0),
    new THREE.Vector2(0.4 * bulk, torsoHeight * 0.35),
    new THREE.Vector2(0.52 * bulk * shoulderW * 0.85, torsoHeight * 0.78),
    new THREE.Vector2(0.32 * bulk, torsoHeight),
  ];
  const cuirassGeo = trackGeo(new THREE.LatheGeometry(cuirassPts, 12));
  cuirassGeo.scale(1.15, 1.0, 0.82);
  torso.add(new THREE.Mesh(cuirassGeo, primaryMat));

  const socketCore = new THREE.Object3D();
  socketCore.name = 'socket_core';
  socketCore.position.set(0, torsoHeight * 0.54, 0.42 * bulk);
  torso.add(socketCore);

  const coreMesh = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.15 * bulk, 1)), emissiveMat);
  coreMesh.position.copy(socketCore.position);
  torso.add(coreMesh);

  // 3. Articulated Neck, Organic Sculpted Skull, Snout & Horns
  const neck = makeBone('Neck_Assembly');
  neck.position.set(0, torsoHeight * 0.92, 0.06);
  neck.rotation.x = ${isQuadruped ? -0.35 : 0};
  torso.add(neck);

  const head = makeBone('Head_Helm_Assembly');
  head.position.set(0, ${(0.45 * m.neckLength).toFixed(2)}, 0.1);
  neck.add(head);

  const socketHead = new THREE.Object3D();
  socketHead.name = 'socket_head';
  socketHead.position.set(0, 0.2, ${(0.28 * m.snoutLength).toFixed(2)});
  head.add(socketHead);

  const skullGeo = trackGeo(new THREE.SphereGeometry(0.23, 12, 10));
  skullGeo.scale(0.95, 0.88, 1.35);
  head.add(new THREE.Mesh(skullGeo, primaryMat));

  for (const side of [-1, 1]) {
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.16, 0.26, 0.02),
      new THREE.Vector3(side * ${(0.34 + 0.42 * m.hornLength * 0.4).toFixed(2)}, ${(0.34 + 0.42 * m.hornLength * 0.35).toFixed(2)}, -0.12),
      new THREE.Vector3(side * 0.24, ${(0.58 + 0.42 * m.hornLength * 1.1).toFixed(2)}, ${(0.32 * m.hornCurve).toFixed(2)}),
    ]);
    head.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(hornCurve, 12, 0.048, 6, false)), secondaryMat));
  }

  // 4. Articulated Wings & 2-Bone Tail
  const leftWing = makeBone('Wing_L');
  const rightWing = makeBone('Wing_R');
  torso.add(leftWing, rightWing);

  const tail = makeBone('Articulated_Tail');
  tail.position.set(0, 0.05, -0.45);
  pelvis.add(tail);
  const tailTip = makeBone('Tail_Mid_Tip');
  tailTip.position.set(0, -0.1, ${(-0.55 * m.tailLength).toFixed(2)});
  tail.add(tailTip);

  if (${m.tailLength > 0.08 ? 'true' : 'false'}) {
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.15, ${(-0.55 * m.tailLength).toFixed(2)}),
      new THREE.Vector3(0, 0.1, ${(-1.2 * m.tailLength).toFixed(2)}),
    ]);
    tail.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(tailCurve, 14, 0.09 * bulk, 7, false)), primaryMat));
  }

  // 5. 2-Bone Forelimbs / Arms & Equipment Sockets
  const buildArm = (side: number, tag: string, socketName: string) => {
    const arm = makeBone('Arm_Or_Foreleg_' + tag);
    arm.position.set(side * 0.52 * bulk * shoulderW, torsoHeight * 0.72, 0);
    torso.add(arm);

    const upperArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.1, ${(0.38 * m.limbLength).toFixed(2)}, 8)), underbodyMat);
    upperArm.position.set(0, -0.19, 0);
    arm.add(upperArm);

    const elbow = makeBone('Elbow_Joint_' + tag);
    elbow.position.set(0, -0.38, 0);
    arm.add(elbow);

    const forearm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.09, ${(0.38 * m.limbLength).toFixed(2)}, 8)), primaryMat);
    forearm.position.set(0, -0.19, 0.04);
    elbow.add(forearm);

    const socket = new THREE.Object3D();
    socket.name = socketName;
    socket.position.set(0, -0.38, 0.14);
    elbow.add(socket);
    return { arm, elbow, socket };
  };

  const { arm: leftArm, elbow: leftElbow, socket: socketShieldL } = buildArm(1, 'L', 'socket_shield_l');
  const { arm: rightArm, elbow: rightElbow, socket: socketWeaponR } = buildArm(-1, 'R', 'socket_weapon_r');

  // 6. Weapon Slash Trail Arc on socket_weapon_r
  const slashGeo = trackGeo(new THREE.RingGeometry(0.48, 0.96, 18, 1, -Math.PI * 0.4, Math.PI * 0.85));
  slashGeo.rotateY(Math.PI / 2);
  const slashTrailMesh = new THREE.Mesh(slashGeo, slashTrailMat);
  slashTrailMesh.name = 'Weapon_Slash_Trail_Arc';
  slashTrailMesh.position.set(0, 0.08, 0.28);
  slashTrailMesh.scale.setScalar(0.0001);
  socketWeaponR.add(slashTrailMesh);

  // 7. Procedural Aura Particle Emitter around sockets
  const PARTICLE_COUNT = 96;
  const pGeo = trackGeo(new THREE.BufferGeometry());
  const pPos = new Float32Array(PARTICLE_COUNT * 3);
  const pCol = new Float32Array(PARTICLE_COUNT * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = trackMat(new THREE.PointsMaterial({
    size: 0.22,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  }));
  const auraParticles = new THREE.Points(pGeo, pMat);
  auraParticles.name = 'Procedural_Aura_Particles';
  group.add(auraParticles);

  const bones: THREE.Bone[] = [];
  rootBone.traverse((c) => { if ((c as THREE.Bone).isBone) bones.push(c as THREE.Bone); });
  const skeleton = new THREE.Skeleton(bones);

  return {
    group,
    skeleton,
    sockets: { head: socketHead, weaponR: socketWeaponR, shieldL: socketShieldL, core: socketCore },
    parts: {
      rootBone, pelvis, torso, neck, head, tail, tailTip, leftWing, rightWing,
      leftArm, leftElbow, rightArm, rightElbow, leftLeg, leftKnee, rightLeg, rightKnee,
      coreMesh, slashTrailMesh, auraParticles,
    },
    update(
      state: EnemyAnimState,
      elapsed: number,
      delta: number,
      particleMode: EnemyAuraParticleMode = 'arcane_sparks'
    ) {
      coreMesh.rotation.y = elapsed * 1.5;
      tail.rotation.y = Math.sin(elapsed * 2.5) * 0.26;
      tailTip.rotation.y = Math.sin(elapsed * 2.5 - 0.9) * 0.35;
      const wingFlap = Math.sin(elapsed * 3.2) * 0.4;
      leftWing.rotation.y = wingFlap;
      rightWing.rotation.y = -wingFlap;
      const damp = (cur: number, target: number) => THREE.MathUtils.damp(cur, target, 10, delta);
      if (state === 'idle') {
        slashTrailMesh.scale.setScalar(0.0001);
        const b = Math.sin(elapsed * 2.3);
        const s = 1.0 + b * 0.025;
        torso.scale.set(s, 1.0 + b * 0.015, s);
        head.rotation.y = damp(head.rotation.y, Math.sin(elapsed * 1.15) * 0.12);
        rightArm.rotation.x = damp(rightArm.rotation.x, -0.18 + b * 0.06);
        leftArm.rotation.x = damp(leftArm.rotation.x, -0.22 - b * 0.06);
        leftElbow.rotation.x = damp(leftElbow.rotation.x, -0.32);
        rightElbow.rotation.x = damp(rightElbow.rotation.x, -0.32);
        leftKnee.rotation.x = damp(leftKnee.rotation.x, 0.16);
        rightKnee.rotation.x = damp(rightKnee.rotation.x, 0.16);
      } else if (state === 'walk') {
        slashTrailMesh.scale.setScalar(0.0001);
        const s = Math.sin(elapsed * 5.8);
        leftLeg.rotation.x = damp(leftLeg.rotation.x, s * 0.52);
        rightLeg.rotation.x = damp(rightLeg.rotation.x, -s * 0.52);
        leftKnee.rotation.x = damp(leftKnee.rotation.x, Math.max(0.08, -s * 0.65 + 0.25));
        rightKnee.rotation.x = damp(rightKnee.rotation.x, Math.max(0.08, s * 0.65 + 0.25));
        rightArm.rotation.x = damp(rightArm.rotation.x, s * 0.48 - 0.15);
        leftArm.rotation.x = damp(leftArm.rotation.x, -s * 0.48 - 0.15);
      } else if (state === 'attack') {
        const cycle = (elapsed * 2.5) % (Math.PI * 2);
        const swing = Math.sin(cycle);
        const slashPower = Math.max(0, Math.sin(cycle - 0.25));
        rightArm.rotation.x = damp(rightArm.rotation.x, swing > 0 ? -1.4 + swing * 2.2 : -0.35);
        rightElbow.rotation.x = damp(rightElbow.rotation.x, swing > 0 ? -0.6 + swing * 0.5 : -0.4);
        if (slashPower > 0.05) {
          slashTrailMesh.scale.set(1.0, slashPower * 1.35, slashPower * 1.35);
          slashTrailMesh.rotation.x = -0.35 + slashPower * 1.15;
        } else {
          slashTrailMesh.scale.setScalar(0.0001);
        }
      } else {
        slashTrailMesh.scale.setScalar(0.0001);
      }

      auraParticles.visible = particleMode !== 'none';
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((mItem) => mItem.dispose());
    },
  };
}
`;
}

export interface BlenderScriptTierMeta {
  tier: MeshDensity;
  title: string;
  badge: string;
  modifiersSummary: string;
  shaderSummary: string;
  whySafeDescription: string;
}

export const BLENDER_SCRIPT_TIER_INFO: Record<MeshDensity, BlenderScriptTierMeta> = {
  completo: {
    tier: 'completo',
    title: 'Pipeline Ultra Escultura (Catmull-Clark + Corrective Smooth + SSS)',
    badge: 'Subdivisión Orgánica Completa',
    modifiersSummary: 'Weld (0.0004) + Corrective Smooth (0.35, 4 iter) + Subsurf Catmull-Clark (Niveles 1/2)',
    shaderSummary: 'Subsurface Scattering (SSS 0.20) + Curvatura Pointiness + Bump Orgánico Fino',
    whySafeDescription:
      'Aprovecha la malla densa del modelo Completo para aplicar subdivisión Catmull-Clark y suavizado correctivo orgánico sin perder volumen en garras, costillas ni articulaciones.',
  },
  high: {
    tier: 'high',
    title: 'Pipeline Alta Calidad (Subsurf SIMPLE + Micro-Smooth + Weighted Normals + SSS)',
    badge: 'Alta Fidelidad Sin Contracción',
    modifiersSummary: 'Subsurf SIMPLE (Nivel 1) + Corrective Smooth Suave (0.20, 2 iter, Pin Boundary) + Weighted Normals (65)',
    shaderSummary: 'Subsurface Scattering (SSS 0.16) + Desgaste de Bordes Pointiness + Bump PBR (0.24)',
    whySafeDescription:
      'Sustituye Catmull-Clark por Subdivisión SIMPLE planar combinada con Micro-Smooth y Normales Ponderadas para suavizar siluetas en High sin encoger extremidades.',
  },
  medium: {
    tier: 'medium',
    title: 'Pipeline Estándar MMO (Subdivisión Planar SIMPLE + Weighted Normals + Cavidad PBR)',
    badge: 'Equilibrio MMO Anti-Encogimiento',
    modifiersSummary: 'Subsurf SIMPLE Planar (Nivel 1) + Corrective Smooth Mínimo (0.12, 1 iter) + Weighted Normals (80)',
    shaderSummary: 'Ambient Occlusion Cavity + Pointiness Edge Wear + Bump Procedural Doble (0.28)',
    whySafeDescription:
      'Evita por completo el Weld y el Catmull-Clark; subdivide en plano (SIMPLE) y recalcula normales ponderadas por área para que el modelo Medium gane suavidad sin deformarse.',
  },
  low: {
    tier: 'low',
    title: 'Pipeline Especial Low-Poly (Weighted Normals Esféricas + Subsurf Planar + Relieve por Shader 3D)',
    badge: 'Especial Low-Poly · 0% Deformación',
    modifiersSummary: 'Weighted Normals (Peso 100, Keep Sharp) + Subsurf SIMPLE Planar Opcional + Triangulate Beauty (CERO Weld / CERO Catmull)',
    shaderSummary: 'Booster de Detalle Low-Poly: Ambient Occlusion + Voronoi/Noise Bump (0.35) + Cavidad Pointiness',
    whySafeDescription:
      'Diseñado específicamente para mallas Low: NO mueve ni encoge ningún vértice (cero Weld y cero Catmull-Clark). Redondea la iluminación mediante Normales Ponderadas al 100% e inyecta el relieve anatómico directamente en los nodos de Shader PBR.',
  },
  minimum: {
    tier: 'minimum',
    title: 'Pipeline Ultra Low-Poly (Topología 100% Intacta + Weighted Normals + Shader Retro-PBR)',
    badge: 'Ultra Ligero · Polígonos Exactos',
    modifiersSummary: 'Weighted Normals (Peso 100, Keep Sharp) + Auto-Smooth por Ángulo (0 Modificadores de Subdivisión)',
    shaderSummary: 'Shader de Cavidad AO + Fresnel Rim Light + Bump Nítido (0.38) + Realce Emisivo',
    whySafeDescription:
      'Mantiene intacto el 100% del presupuesto mínimo de polígonos sin añadir un solo vértice extra, mejorando el sombreado en Blender mediante Normales Ponderadas y oclusión ambiental en el material.',
  },
};

/**
 * Generates a dedicated, quality-specific Blender 3.6 / 4.x Python (bpy) enhancement script
 * tailored to the exact polygon topology of each optimization tier ('completo', 'high', 'medium', 'low', 'minimum').
 */
export function generateBlenderPythonScript(
  config: EnemyConfig,
  targetTier?: MeshDensity
): string {
  const tier: MeshDensity = targetTier ?? getEffectiveMeshDensity(config);
  const meta = BLENDER_SCRIPT_TIER_INFO[tier];
  const mat = config.materials;
  const wear = (mat.grainWearIntensity ?? 1.0).toFixed(2);

  const tierModifierBlock =
    tier === 'completo'
      ? `        # --- PIPELINE EXCLUSIVO "COMPLETO" (ULTRA ESCULTURA) ---
        # 1. Modificador WELD ultra-fino para sellar costuras UV en malla de alta densidad
        if "AF_Weld_Seams" not in obj.modifiers:
            weld = obj.modifiers.new(name="AF_Weld_Seams", type='WELD')
            weld.merge_threshold = 0.0004
            if hasattr(weld, "mode"):
                weld.mode = 'ALL'

        # 2. Modificador CORRECTIVE SMOOTH orgánico (suaviza uniones musculares)
        if "AF_Corrective_Sculpt" not in obj.modifiers:
            cs = obj.modifiers.new(name="AF_Corrective_Sculpt", type='CORRECTIVE_SMOOTH')
            cs.factor = 0.35
            cs.iterations = 4
            cs.smooth_type = 'LENGTH_WEIGHTED'
            cs.use_only_smooth = True
            cs.use_pin_boundary = True

        # 3. Modificador SUBSURF Catmull-Clark conservando bordes UV
        if "AF_Catmull_Subsurf" not in obj.modifiers:
            sub = obj.modifiers.new(name="AF_Catmull_Subsurf", type='SUBSURF')
            sub.subdivision_type = 'CATMULL_CLARK'
            sub.levels = 1
            sub.render_levels = 2
            sub.uv_smooth = 'PRESERVE_BOUNDARIES'`
      : tier === 'high'
      ? `        # --- PIPELINE EXCLUSIVO "HIGH" (ALTA CALIDAD SIN CONTRACCIÓN) ---
        # Sin WELD para no colapsar vértices cercanos en dedos o costillas.
        # 1. Subdivisión SIMPLE en plano para duplicar resolución de sombreado sin encoger el volumen
        if "AF_High_SimpleSubsurf" not in obj.modifiers:
            sub = obj.modifiers.new(name="AF_High_SimpleSubsurf", type='SUBSURF')
            sub.subdivision_type = 'SIMPLE'
            sub.levels = 1
            sub.render_levels = 1
            sub.uv_smooth = 'PRESERVE_BOUNDARIES'

        # 2. Micro-pasada de Corrective Smooth con bordes anclados (Pin Boundary)
        if "AF_High_MicroSmooth" not in obj.modifiers:
            cs = obj.modifiers.new(name="AF_High_MicroSmooth", type='CORRECTIVE_SMOOTH')
            cs.factor = 0.20
            cs.iterations = 2
            cs.smooth_type = 'SIMPLE'
            cs.use_only_smooth = True
            cs.use_pin_boundary = True

        # 3. Normales Ponderadas (Weighted Normals) para iluminación suave de estudio
        if "AF_Weighted_Normals" not in obj.modifiers:
            wn = obj.modifiers.new(name="AF_Weighted_Normals", type='WEIGHTED_NORMAL')
            wn.mode = 'FACE_AREA_WITH_ANGLE'
            wn.weight = 65
            wn.keep_sharp = True`
      : tier === 'medium'
      ? `        # --- PIPELINE EXCLUSIVO "MEDIUM" (ESTÁNDAR MMO ANTI-DEFORMACIÓN) ---
        # CERO Weld y CERO Catmull-Clark: preserva el 100% de la silueta de nivel Medium.
        # 1. Subdivisión SIMPLE planar (añade soporte de vértices sin contraer cilindros)
        if "AF_Medium_SimpleSubsurf" not in obj.modifiers:
            sub = obj.modifiers.new(name="AF_Medium_SimpleSubsurf", type='SUBSURF')
            sub.subdivision_type = 'SIMPLE'
            sub.levels = 1
            sub.render_levels = 1
            sub.uv_smooth = 'PRESERVE_BOUNDARIES'

        # 2. Suavizado mínimo de 1 sola iteración con bordes fijos
        if "AF_Medium_MicroSmooth" not in obj.modifiers:
            cs = obj.modifiers.new(name="AF_Medium_MicroSmooth", type='CORRECTIVE_SMOOTH')
            cs.factor = 0.12
            cs.iterations = 1
            cs.smooth_type = 'SIMPLE'
            cs.use_only_smooth = True
            cs.use_pin_boundary = True

        # 3. Weighted Normals de alto peso para redondear visualmente las caras medias
        if "AF_Weighted_Normals" not in obj.modifiers:
            wn = obj.modifiers.new(name="AF_Weighted_Normals", type='WEIGHTED_NORMAL')
            wn.mode = 'FACE_AREA_WITH_ANGLE'
            wn.weight = 80
            wn.keep_sharp = True`
      : tier === 'low'
      ? `        # --- PIPELINE ESPECIAL "LOW" (CERO DEFORMACIÓN + NORMALES ESFÉRICAS) ---
        # IMPORTANTE: En calidad LOW NO se usa Weld ni Catmull-Clark ni Corrective Smooth,
        # porque contraen los polígonos simplificados. En su lugar usamos:
        # 1. Subdivisión SIMPLE planar (mantiene el 100% de la posición exacta de cada vértice)
        if "AF_Low_PlanarSubsurf" not in obj.modifiers:
            sub = obj.modifiers.new(name="AF_Low_PlanarSubsurf", type='SUBSURF')
            sub.subdivision_type = 'SIMPLE'
            sub.levels = 1
            sub.render_levels = 1
            sub.uv_smooth = 'PRESERVE_BOUNDARIES'

        # 2. Triangulación óptima Beauty para evitar sombreado diagonal plano en quads Low-Poly
        if "AF_Low_BeautyTriangulate" not in obj.modifiers:
            tri = obj.modifiers.new(name="AF_Low_BeautyTriangulate", type='TRIANGULATE')
            tri.quad_method = 'BEAUTY'
            tri.keep_custom_normals = True

        # 3. Weighted Normals al 100% (hace que pocos polígonos reflejen la luz como una superficie curva continua)
        if "AF_Low_WeightedNormals" not in obj.modifiers:
            wn = obj.modifiers.new(name="AF_Low_WeightedNormals", type='WEIGHTED_NORMAL')
            wn.mode = 'FACE_AREA_WITH_ANGLE'
            wn.weight = 100
            wn.thresh = 0.01
            wn.keep_sharp = True`
      : `        # --- PIPELINE ESPECIAL "MINIMUM" (ULTRA LOW-POLY · 100% TOPOLOGÍA INTACTA) ---
        # No añade ni mueve ni un solo vértice para respetar el presupuesto mínimo de polígonos.
        # Mejora únicamente las normales de sombreado mediante Weighted Normals al 100%.
        if "AF_Minimum_WeightedNormals" not in obj.modifiers:
            wn = obj.modifiers.new(name="AF_Minimum_WeightedNormals", type='WEIGHTED_NORMAL')
            wn.mode = 'FACE_AREA_WITH_ANGLE'
            wn.weight = 100
            wn.thresh = 0.01
            wn.keep_sharp = True`;

  const bumpMultiplier =
    tier === 'completo'
      ? '0.22'
      : tier === 'high'
      ? '0.25'
      : tier === 'medium'
      ? '0.28'
      : tier === 'low'
      ? '0.35'
      : '0.38';

  const sssWeight =
    tier === 'completo'
      ? '0.20'
      : tier === 'high'
      ? '0.16'
      : tier === 'medium'
      ? '0.12'
      : '0.08';

  return `# ==============================================================================
# AetherForge 3D — Blender 3.6 / 4.x Post-Processing Script Por Calidad (bpy)
# Criatura: ${config.name} (${config.id})
# CALIDAD OBJETIVO: ${tier.toUpperCase()} — ${meta.title}
# ARCHIVO GLB OBJETIVO: "${config.id}_${tier}.glb"
#
# QUÉ HACE ESTE SCRIPT ESPECÍFICO PARA LA CALIDAD "${tier.toUpperCase()}":
# - Modificadores 3D: ${meta.modifiersSummary}
# - Shaders PBR:      ${meta.shaderSummary}
# - Por qué es seguro: ${meta.whySafeDescription}
#
# CÓMO USAR EN BLENDER:
# 1. Descarga "${config.id}_${tier}.glb" e impórtalo en Blender (File -> Import -> glTF 2.0)
# 2. Abre la pestaña "Scripting" en Blender, pega este código y pulsa "Run Script" (Alt + P).
# ==============================================================================

import bpy
import os

QUALITY_TIER = "${tier}"
GLB_INPUT_PATH = "${config.id}_${tier}.glb"
GLB_OUTPUT_PATH = "${config.id}_${tier}_blender_enhanced.glb"
AUTO_EXPORT_ENHANCED_GLB = False  # Cambia a True para re-exportar el .GLB automáticamente

PRIMARY_HEX = "${mat.primaryColor}"
SECONDARY_HEX = "${mat.secondaryColor}"
EMISSIVE_HEX = "${mat.emissiveColor}"
ROUGHNESS_VAL = ${mat.roughness.toFixed(2)}
METALNESS_VAL = ${mat.metalness.toFixed(2)}
GRAIN_WEAR_STRENGTH = ${wear}
EMISSIVE_STRENGTH = ${(mat.emissiveIntensity * 4.5).toFixed(2)}


def hex_to_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    if len(h) != 6:
        return (0.5, 0.5, 0.5, alpha)
    r = pow(int(h[0:2], 16) / 255.0, 2.2)
    g = pow(int(h[2:4], 16) / 255.0, 2.2)
    b = pow(int(h[4:6], 16) / 255.0, 2.2)
    return (r, g, b, alpha)


def ensure_glb_imported():
    has_skinned = any(obj.type == 'MESH' and obj.name.startswith('Skinned_Unified_') for obj in bpy.data.objects)
    if not has_skinned and os.path.exists(GLB_INPUT_PATH):
        print(f"[AetherForge] Importando {GLB_INPUT_PATH} (Calidad {QUALITY_TIER.upper()})...")
        bpy.ops.import_scene.gltf(filepath=GLB_INPUT_PATH)


def clean_incompatible_modifiers(obj):
    """
    Limpia modificadores de otras calidades si el usuario probó otro script antes,
    evitando que un modificador de 'completo' quede activo sobre un modelo 'low'.
    """
    all_af_mods = [
        "AF_Weld_Seams",
        "AF_Corrective_Sculpt",
        "AF_Catmull_Subsurf",
        "AF_High_SimpleSubsurf",
        "AF_High_MicroSmooth",
        "AF_Medium_SimpleSubsurf",
        "AF_Medium_MicroSmooth",
        "AF_Low_PlanarSubsurf",
        "AF_Low_BeautyTriangulate",
        "AF_Low_WeightedNormals",
        "AF_Minimum_WeightedNormals",
        "AF_Weighted_Normals",
    ]
    for mod_name in all_af_mods:
        if mod_name in obj.modifiers:
            obj.modifiers.remove(obj.modifiers[mod_name])


def apply_quality_specific_modifiers():
    """
    Aplica la pila de modificadores diseñada específicamente para la calidad '${tier.toUpperCase()}'.
    Las sub-mallas rígidas (dientes, colmillos, cráneo óseo y hojas de arma) reciben únicamente
    normales nítidas sin suavizado de silueta para mantener sus bordes afilados.
    """
    CRISP_BONE_EXCLUDED = (
        "IvoryFangsAndHorns",
        "ToothEnamel",
        "SculptedCraniumBone",
        "SkullSocketVoid",
        "WeaponBlade",
    )

    processed_skin = 0
    processed_rigid = 0

    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue

        if not obj.name.startswith('Skinned_Unified_'):
            continue

        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)

        # Limpiar modificadores previos de otras calidades
        clean_incompatible_modifiers(obj)

        for poly in obj.data.polygons:
            poly.use_smooth = True

        # En Blender 3.6 / 4.0 activar auto-smooth si existe en mesh data para que keep_sharp funcione
        if hasattr(obj.data, "use_auto_smooth"):
            obj.data.use_auto_smooth = True
            obj.data.auto_smooth_angle = 1.0472  # 60 grados

        # Si es diente, hueso craneal o filo de arma: solo aplicar Weighted Normals manteniendo aristas vivas
        if any(tag in obj.name for tag in CRISP_BONE_EXCLUDED):
            wn = obj.modifiers.new(name="AF_Weighted_Normals", type='WEIGHTED_NORMAL')
            wn.mode = 'FACE_AREA_WITH_ANGLE'
            wn.weight = 100
            wn.keep_sharp = True
            obj.select_set(False)
            processed_rigid += 1
            continue

${tierModifierBlock}

        obj.select_set(False)
        processed_skin += 1

    print(
        f"[AetherForge] Calidad {QUALITY_TIER.upper()}: modificadores aplicados a "
        f"{processed_skin} mallas orgánicas y {processed_rigid} mallas óseas/armas."
    )


def enhance_pbr_materials_for_tier():
    """
    Configura el árbol de nodos Shader en Blender adaptado a la calidad '${tier.toUpperCase()}':
    - En calidades Low y Minimum refuerza el relieve por Shader (Ambient Occlusion Cavity +
      Voronoi/Noise Bump + Pointiness) para compensar el menor número de polígonos sin tocar la malla.
    - En calidades Completo, High y Medium equilibra Subsurface Scattering (SSS) y micro-relieve PBR.
    """
    emi_rgba = hex_to_rgba(EMISSIVE_HEX)

    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue

        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue

        # Evitar duplicar nodos si se ejecuta varias veces
        if nodes.get("AF_Curvature_Geo"):
            continue

        # 1. Subsurface Scattering (SSS) adaptado a la calidad
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = ${sssWeight}
        elif "Subsurface" in bsdf.inputs:
            bsdf.inputs["Subsurface"].default_value = ${sssWeight}

        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.045

        # 2. Geometría Pointiness + Ambient Occlusion para resaltar aristas y cavidades
        geo_node = nodes.new(type='ShaderNodeNewGeometry')
        geo_node.name = "AF_Curvature_Geo"
        geo_node.location = (-920, 260)

        ao_node = nodes.new(type='ShaderNodeAmbientOcclusion')
        ao_node.name = "AF_Cavity_AO"
        ao_node.location = (-920, 60)
        ao_node.samples = 8
        ao_node.inputs["Distance"].default_value = 0.18

        ramp = nodes.new(type='ShaderNodeValToRGB')
        ramp.name = "AF_EdgeWear_Ramp"
        ramp.location = (-660, 240)
        ramp.color_ramp.elements[0].position = 0.45
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.56
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        links.new(geo_node.outputs["Pointiness"], ramp.inputs["Fac"])

        # 3. Generador de Relieve 3D por Shader (Noise + Voronoi en Low/Minimum para máximo detalle visual)
        noise = nodes.new(type='ShaderNodeTexNoise')
        noise.name = "AF_Organic_Grain_Noise"
        noise.location = (-920, -200)
        noise.inputs["Scale"].default_value = 46.0 if QUALITY_TIER in ("low", "minimum") else 40.0
        noise.inputs["Detail"].default_value = 10.0 if QUALITY_TIER in ("low", "minimum") else 8.0
        noise.inputs["Roughness"].default_value = 0.70

        bump = nodes.new(type='ShaderNodeBump')
        bump.name = "AF_Sculpt_Bump"
        bump.location = (-440, -220)
        bump.inputs["Strength"].default_value = min(1.0, ${bumpMultiplier} * GRAIN_WEAR_STRENGTH)
        bump.inputs["Distance"].default_value = 0.018 if QUALITY_TIER in ("low", "minimum") else 0.014
        links.new(noise.outputs["Fac"], bump.inputs["Height"])

        if bsdf.inputs["Normal"].is_linked:
            old_normal_socket = bsdf.inputs["Normal"].links[0].from_socket
            links.new(old_normal_socket, bump.inputs["Normal"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

        # 4. Realce de emisión para ojos, runas y núcleos de energía
        if "Emission Strength" in bsdf.inputs and bsdf.inputs["Emission Strength"].default_value > 0.1:
            bsdf.inputs["Emission Strength"].default_value = max(
                bsdf.inputs["Emission Strength"].default_value,
                EMISSIVE_STRENGTH
            )
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = emi_rgba

    print(f"[AetherForge] Shaders PBR optimizados para calidad {QUALITY_TIER.upper()} aplicados con éxito.")


def main():
    ensure_glb_imported()
    apply_quality_specific_modifiers()
    enhance_pbr_materials_for_tier()

    if AUTO_EXPORT_ENHANCED_GLB:
        print(f"[AetherForge] Exportando versión mejorada ({QUALITY_TIER.upper()}) a {GLB_OUTPUT_PATH}...")
        bpy.ops.export_scene.gltf(
            filepath=GLB_OUTPUT_PATH,
            export_format='GLB',
            export_apply=True,
            export_animations=True,
            export_skins=True
        )
        print("[AetherForge] Exportación completada.")


if __name__ == "__main__":
    main()
`;
}



