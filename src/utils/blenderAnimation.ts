import * as THREE from 'three';

const activeLoops: Record<string, any>[] = [];
const registeredMeshNames = new Set<string>();
const specialExportMaterials = new Map<string, THREE.Material>();

export function startBlenderRun(): void {
  activeLoops.length = 0;
  registeredMeshNames.clear();
  specialExportMaterials.clear();
}

export function clearBlenderAnimations(): void {
  activeLoops.length = 0;
  registeredMeshNames.clear();
  specialExportMaterials.clear();
}

export function addBlenderLoop(loopDef: Record<string, any> | null | undefined): void {
  if (loopDef) {
    activeLoops.push(loopDef);
    if (loopDef.meshName) registeredMeshNames.add(loopDef.meshName);
    if (loopDef.target?.name) registeredMeshNames.add(loopDef.target.name);
  }
}

export function setBlenderWater(
  mesh: THREE.Mesh | null | undefined,
  baseColor?: THREE.Color,
  _speed = 1,
  _amp = 0.05,
  _freq = 2
): void {
  if (!mesh) return;
  registeredMeshNames.add(mesh.name);
  if (baseColor && mesh.material) {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && 'color' in mat && (mat as THREE.MeshStandardMaterial).color) {
      (mat as THREE.MeshStandardMaterial).color.copy(baseColor);
    }
  }
}

export function finalizeBlenderRun(_scaleFactor = 1): void {
  // Finaliza registro de animaciones procedurales
}

export function animatedMeshNames(): Set<string> {
  return new Set(registeredMeshNames);
}

export function exportMaterialFor(meshName: string): THREE.Material | undefined {
  return specialExportMaterials.get(meshName);
}

export function buildBlenderClips(_existingMeshNames?: Set<string>): THREE.AnimationClip[] {
  return [];
}
