import * as THREE from 'three';

/**
 * Custom Post-Processing ShaderPass que combina:
 * 1. Detección de bordes en espacio de pantalla (Sobel sobre luminancia y gradiente)
 *    para reforzar los pliegues internos estilo cómic/manga/anime.
 * 2. Cuantización estilizada opcional para enfatizar la separación tonal de 3 niveles.
 * 3. Mezcla de tinta oscura con opacidad y grosor ajustables en tiempo real.
 */
export const ComicEdgePostShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1024, 768) },
    uOutlineThickness: { value: 1.35 },
    uOutlineOpacity: { value: 0.92 },
    uOutlineColor: { value: new THREE.Color('#090a0f') },
    uSsaoBoost: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uOutlineThickness;
    uniform float uOutlineOpacity;
    uniform vec3 uOutlineColor;
    uniform float uSsaoBoost;

    varying vec2 vUv;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 baseTex = texture2D(tDiffuse, vUv);
      vec3 color = baseTex.rgb;

      // Paso de muestreo escalado por el grosor de línea deseado
      vec2 texel = (1.0 / uResolution) * max(0.25, uOutlineThickness * 0.85);

      // Kernel Sobel 3x3 sobre luminancia para detectar bordes de pliegues internos y silueta
      float tl = getLuma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  1.0)).rgb);
      float tm = getLuma(texture2D(tDiffuse, vUv + texel * vec2( 0.0,  1.0)).rgb);
      float tr = getLuma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  1.0)).rgb);

      float ml = getLuma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  0.0)).rgb);
      float mr = getLuma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  0.0)).rgb);

      float bl = getLuma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
      float bm = getLuma(texture2D(tDiffuse, vUv + texel * vec2( 0.0, -1.0)).rgb);
      float br = getLuma(texture2D(tDiffuse, vUv + texel * vec2( 1.0, -1.0)).rgb);

      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;
      float edgeGrad = sqrt(gx * gx + gy * gy);

      // Umbral suave para trazo de tinta limpia
      float inkEdge = smoothstep(0.18, 0.48, edgeGrad) * clamp(uOutlineOpacity, 0.0, 1.0);

      // Realce sutil de sombras de contacto (SSAO / cavidades oscuras)
      float luma = getLuma(color);
      float cavityFactor = smoothstep(0.45, 0.08, luma) * (uSsaoBoost - 0.5) * 0.18;
      color = max(vec3(0.0), color - vec3(cavityFactor));

      // Aplicar tinta negra de contorno sobre los bordes detectados
      vec3 finalColor = mix(color, uOutlineColor, inkEdge * 0.78);

      gl_FragColor = vec4(finalColor, baseTex.a);
    }
  `,
};
