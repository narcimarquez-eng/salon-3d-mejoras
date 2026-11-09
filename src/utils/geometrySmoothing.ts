import {
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  Mesh,
  NearestFilter,
  Object3D,
  RGBAFormat,
  ShaderMaterial,
} from 'three';

/**
 * Prepara y recalcula las normales de la geometría de una malla para sombreado suave.
 */
export function prepareGeometryNormals(target: Mesh | BufferGeometry | null | undefined): void {
  if (!target) return;
  const geom = (target as Mesh).isMesh ? (target as Mesh).geometry : (target as BufferGeometry);
  if (!geom) return;
  if (!geom.attributes.normal) geom.computeVertexNormals();
}

/**
 * Aplica suavizado de normales a un modelo completo o jerarquía de mallas Three.js.
 */
export function applyNormalSmoothingToModel(
  root: Object3D | null | undefined,
  factor = 1
): void {
  if (!root) return;
  root.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      if (mesh.geometry) {
        mesh.geometry.computeVertexNormals();
        if (factor > 0) {
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
            if (m && 'flatShading' in m) {
              (m as { flatShading: boolean; needsUpdate: boolean }).flatShading = false;
              m.needsUpdate = true;
            }
          });
        }
      }
    }
  });
}

/**
 * Genera el material de silueta invertida tipo cómic (BackSide Outline).
 */
export function createComicOutlineMaterial(
  thickness = 0.004,
  opacity = 1
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      outlineThickness: { value: thickness },
      outlineColor: { value: new Color(0x0a0c10) },
      opacity: { value: opacity },
    },
    vertexShader: `
      uniform float outlineThickness;
      void main() {
        vec3 transformed = position + normal * outlineThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 outlineColor;
      uniform float opacity;
      void main() {
        gl_FragColor = vec4(outlineColor, opacity);
      }
    `,
    side: BackSide,
    transparent: opacity < 1,
    depthWrite: true,
  });
}

/**
 * Crea una textura de rampa de 3 tonos discretos para Cel-Shading (Sombra, Tono Medio, Brillo).
 */
export function createThreeToneGradientTexture(): DataTexture {
  const texture = new DataTexture(
    new Uint8Array([60, 60, 70, 255, 160, 160, 175, 255, 255, 255, 255, 255]),
    3,
    1,
    RGBAFormat
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
