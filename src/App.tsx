import React, { useEffect, useRef, useState } from 'react';
import { applyLimbAndFaceExtras } from './human/limbFaceExtras';
import { syncFaceDuplicates } from './human/faceTexture';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  MeshNormalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Skeleton,
  SkeletonHelper,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  Boxes,
  CodeXml,
  Cpu,
  Download,
  HardDrive,
  Play,
  RotateCcw,
  Skull,
  Sparkles,
  X,
  Share2,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Maximize2,
  BookOpen,
} from 'lucide-react';
import HumanFromImagesPanel, { type HumanPanelResult } from './components/HumanFromImagesPanel';
import MonsterLoaderPanel from './components/MonsterLoaderPanel';
import GlbZonesPanel, { type GlbSource } from './components/GlbZonesPanel';
import GoogleDriveModal from './components/GoogleDriveModal';
import PythonScriptModal from './components/PythonScriptModal';
import {
  DEFAULT_CUTOUT,
  alignBackViewToFront,
  applyPhotoTransformToPreparedView,
  buildAtlas,
  computeRelativePhotoTransform,
  fitImageToTensor,
  isPhotoTransformModified,
  loadLayerMap,
  prepareView, cutThreadsNear } from './human/imagePrep';
import { trimViewLegs, trimSideLegs, detectSideViewParts } from './human/limbParts';
import {
  buildHumanBodyTemplateGeometry,
  hasProfileDriven3DFeatures,
  maskFromCutoutAndPaint,
  rebindHumanGeometry,
  type ActiveFaceFeatureId,
  type HumanBodyInputs,
  type HumanBodyStats,
} from './human/humanBodyTemplate';
import type { HumanBuildOptions, HumanImageSet } from './human/buildHuman';
import { createCreatureAnimationClips } from './human/creatureAnimations';
import {
  averageSilhouettes,
  estimateOutlineThickness,
  maskIoU,
  mirrorMaskX,
  trimOutline,
} from './human/maskRefine';
import {
  clipNameForAnimation,
  cloneHumanRig,
  createHumanAnimationClips,
  createSkeletonBones,
  type HumanRig,
} from './human/humanRig';
import {
  exportHumanToGLBBytes,
  triggerBlobDownload,
  uint8ToBlob,
} from './human/exportHuman';
import {
  analyzeGlbZones,
  optimizeGlb,
  type ZonePlan,
} from './utils/glbZoneOptimizer';
import {
  applyNormalSmoothingToModel,
  createComicOutlineMaterial,
  createThreeToneGradientTexture,
} from './utils/geometrySmoothing';
import { getProceduralMatcapTexture, type MatcapPresetId } from './utils/matcapGenerator';
import {
  BLENDER_SCRIPT_PRESETS,
  executeBlenderPythonScript,
  type BlenderCoordinateMode,
  type ScriptExecutionResult,
} from './utils/blenderPythonEngine';
import type { MonsterTier } from './enemigos/enemyGenerator';

const EXPORT_TIER_SPECS: Record<
  MonsterTier,
  { label: string; shortLabel: string; ratio: number; maxSize: number; jpegQuality: number }
> = {
  completo: {
    label: '💎 Completo (100%)',
    shortLabel: 'Completo',
    ratio: 1.0,
    maxSize: 512,
    jpegQuality: 0.92,
  },
  high: {
    label: '✨ High (Alta · 75%)',
    shortLabel: 'High',
    ratio: 0.75,
    maxSize: 384,
    jpegQuality: 0.88,
  },
  medium: {
    label: '⚖️ Medium (Media · 50%)',
    shortLabel: 'Medium',
    ratio: 0.5,
    maxSize: 256,
    jpegQuality: 0.84,
  },
  low: {
    label: '⚡ Low (Ligero · 28%)',
    shortLabel: 'Low',
    ratio: 0.28,
    maxSize: 128,
    jpegQuality: 0.78,
  },
  minimum: {
    label: '🪶 Minimum (Mínimo · 14%)',
    shortLabel: 'Minimum',
    ratio: 0.14,
    maxSize: 64,
    jpegQuality: 0.72,
  },
};

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const animationActionsRef = useRef<Map<string, AnimationAction>>(new Map());
  const currentModelGroupRef = useRef<Group | null>(null);
  const skeletonHelperRef = useRef<SkeletonHelper | null>(null);
  const featureMarkerGroupRef = useRef<Group | null>(null);
  const currentClipsRef = useRef<AnimationClip[]>([]);
  const currentHumanStatsRef = useRef<HumanBodyStats | null>(null);
  const outlineMeshMapRef = useRef<Map<Mesh, Mesh>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pyFileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'human' | 'monsters' | 'bpy'>('human');
  const [shadingMode, setShadingMode] = useState<'cel' | 'pbr' | 'matcap' | 'normals' | 'wireframe'>(
    'pbr'
  );
  const [outlineEnabled, setOutlineEnabled] = useState(false);
  // Sube cada vez que el motor Python construye la escena: los contornos nuevos se ajustan al estado
  const [sceneRevision, setSceneRevision] = useState(0);
  const [outlineThickness] = useState(0.005);
  const [matcapPreset] = useState<MatcapPresetId>('clay');
  const [showPedestal, setShowPedestal] = useState(true);

  const [humanBusy, setHumanBusy] = useState(false);
  const [humanResult, setHumanResult] = useState<HumanPanelResult | null>(null);
  const [humanError, setHumanError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportTier, setExportTier] = useState<MonsterTier>('completo');
  const [lastExportSize, setLastExportSize] = useState<string | null>(null);
  const [activeAnimation, setActiveAnimation] = useState('idle');
  const [currentRig, setCurrentRig] = useState<HumanRig | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [editSkeletonMode, setEditSkeletonMode] = useState(false);
  const [selectedBoneName, setSelectedBoneName] = useState<string>('spine');
  const [boneSymmetry, setBoneSymmetry] = useState(true);
  const [activeFaceFeature, setActiveFaceFeature] = useState<ActiveFaceFeatureId>('none');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeGlbSource, setActiveGlbSource] = useState<GlbSource | null>(null);
  const [loadedAnimations, setLoadedAnimations] = useState<{ id: string; label: string }[]>([]);
  const [exportedGlb, setExportedGlb] = useState<{
    url: string;
    blob: Blob;
    filename: string;
    sizeMb: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [polyStats, setPolyStats] = useState({
    verts: 0,
    tris: 0,
    fps: 60,
  });

  const [bpyScript, setBpyScript] = useState(`# COORD_MODE: Z_UP
# CelShade Studio 3D - Script en Blender 5.2 Python
import bpy
import math

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Crear escultura con pedestal y cel-shading
bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=0.25, vertices=32, location=(0,0,0.125))
pedestal = bpy.context.active_object
pedestal.name = "Pz_Pedestal"

bpy.ops.mesh.primitive_torus_knot_add(radius=0.75, tube=0.18, p=2, q=3, location=(0,0,1.35))
nodo = bpy.context.active_object
nodo.name = "Pz_NudoMistico"

mat = bpy.data.materials.new(name="PBR_Nudo")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.95, 0.65, 0.15, 1.0)
bsdf.inputs["Metallic"].default_value = 0.85
bsdf.inputs["Roughness"].default_value = 0.22
bsdf.inputs["Coat Weight"].default_value = 0.9
nodo.data.materials.append(mat)`);
  const [bpySelectedPreset, setBpySelectedPreset] = useState<string>('');
  const [bpyCoordMode, setBpyCoordMode] = useState<BlenderCoordinateMode>('auto');
  const [bpyModalOpen, setBpyModalOpen] = useState(false);
  const [bpyRunning, setBpyRunning] = useState(false);
  const [bpyError, setBpyError] = useState<string | null>(null);
  const [bpySuccess, setBpySuccess] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new Scene();
    scene.background = new Color(0x0a0d14);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(38, width / height, 0.05, 120);
    camera.position.set(0, 1.4, 3.8);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 1.1, 0);
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.minDistance = 0.4;
    controls.maxDistance = 60;
    controlsRef.current = controls;

    const ambientLight = new AmbientLight(0xdbeafe, 0.7);
    scene.add(ambientLight);

    const keyLight = new DirectionalLight(0xfff7ed, 1.85);
    keyLight.position.set(2.5, 4.5, 3.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const fillLight = new DirectionalLight(0x93c5fd, 0.95);
    fillLight.position.set(-3.2, 2.2, 1.5);
    scene.add(fillLight);

    const rimLight = new DirectionalLight(0xfef08a, 1.35);
    rimLight.position.set(0, 3.5, -3.2);
    scene.add(rimLight);

    const groundGroup = new Group();
    groundGroup.name = 'pedestal_group';
    const pedestalMesh = new Mesh(
      new CylinderGeometry(1.4, 1.5, 0.08, 48),
      new MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.5,
        metalness: 0.3,
      })
    );
    pedestalMesh.position.y = -0.04;
    pedestalMesh.receiveShadow = true;
    groundGroup.add(pedestalMesh);

    const gridHelper = new GridHelper(6, 24, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.002;
    groundGroup.add(gridHelper);
    scene.add(groundGroup);

    const modelGroup = new Group();
    modelGroup.name = 'active_model_group';
    scene.add(modelGroup);
    currentModelGroupRef.current = modelGroup;

    const markerGroup = new Group();
    markerGroup.name = 'feature_marker_group';
    scene.add(markerGroup);
    featureMarkerGroupRef.current = markerGroup;

    let animId = 0;
    const clock = new Clock();
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (mixerRef.current) mixerRef.current.update(delta);
      if (markerGroup.children.length > 0) {
        const pulse = 1 + 0.12 * Math.sin(elapsed * 6.5);
        markerGroup.scale.set(pulse, pulse, pulse);
      }

      controls.update();
      renderer.render(scene, camera);

      frameCount++;
      const now = performance.now();
      const dtMs = now - lastFpsTime;
      if (dtMs >= 500) {
        const computedFps = Math.round((frameCount * 1000) / Math.max(1, dtMs));
        setPolyStats((prev) => ({
          ...prev,
          fps: Number.isFinite(computedFps) ? computedFps : 60,
        }));
        frameCount = 0;
        lastFpsTime = now;
      }
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const group = sceneRef.current.getObjectByName('pedestal_group');
    if (group) group.visible = showPedestal;
  }, [showPedestal]);

  const recalcScenePolyStats = (root: Object3D | null) => {
    if (!root) return;
    let verts = 0;
    let tris = 0;
    root.traverse((c) => {
      const m = c as Mesh;
      if (m.isMesh && m.geometry && !m.userData?.isOutlineMesh) {
        const pos = m.geometry.getAttribute('position');
        if (pos) {
          verts += pos.count;
          const idx = m.geometry.getIndex();
          tris += idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
        }
      }
    });
    setPolyStats((prev) => ({ ...prev, verts, tris }));
  };

  const frameActiveModel = (root: Object3D | null) => {
    if (!root || !cameraRef.current || !controlsRef.current) return;
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(0.8, size.x, size.y, size.z);
    controlsRef.current.target.copy(center);
    cameraRef.current.position.set(
      center.x + maxDim * 0.35,
      center.y + maxDim * 0.35,
      center.z + maxDim * 1.65
    );
    controlsRef.current.update();
  };

  useEffect(() => {
    const group = currentModelGroupRef.current;
    if (!group) return;
    const toonRamp = createThreeToneGradientTexture();
    const matcapTex = getProceduralMatcapTexture(matcapPreset);

    group.traverse((child) => {
      if ((child as Mesh).isMesh && !(child.userData && child.userData.isOutlineMesh)) {
        const mesh = child as Mesh;
        if (!mesh.userData.originalMaterial) mesh.userData.originalMaterial = mesh.material;

        if (shadingMode === 'cel') {
          const orig = mesh.userData.originalMaterial as MeshStandardMaterial;
          mesh.material = new MeshToonMaterial({
            color: orig?.color ? orig.color : new Color(0xdddddd),
            map: orig?.map || null,
            gradientMap: toonRamp,
            wireframe: false,
          });
        } else if (shadingMode === 'pbr') {
          mesh.material = mesh.userData.originalMaterial;
          if (mesh.material && 'wireframe' in mesh.material) {
            (mesh.material as MeshStandardMaterial).wireframe = false;
          }
        } else if (shadingMode === 'matcap') {
          mesh.material = new MeshMatcapMaterial({
            matcap: matcapTex,
            wireframe: false,
          });
        } else if (shadingMode === 'normals') {
          mesh.material = new MeshNormalMaterial({ wireframe: false });
        } else if (shadingMode === 'wireframe') {
          mesh.material = new MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
          });
        }

        let outline = outlineMeshMapRef.current.get(mesh);
        if (outlineEnabled && (shadingMode === 'cel' || shadingMode === 'pbr')) {
          if (!outline) {
            const outMat = createComicOutlineMaterial(outlineThickness, 0.98);
            outline = new Mesh(mesh.geometry, outMat);
            outline.name = `${mesh.name}_comic_outline`;
            outline.userData.isOutlineMesh = true;
            mesh.add(outline);
            outlineMeshMapRef.current.set(mesh, outline);
          }
          outline.visible = true;
          const outShader = outline.material as ShaderMaterial;
          if (outShader.uniforms?.outlineThickness) {
            outShader.uniforms.outlineThickness.value = outlineThickness;
          }
        } else if (outline) {
          outline.visible = false;
        }

        // Contornos creados por el motor Python (bpy): el botón "Contorno" también los apaga
        const contornoMotor = mesh.userData.outlineMesh as Mesh | undefined;
        if (contornoMotor && !outline) {
          contornoMotor.visible =
            outlineEnabled &&
            (shadingMode === 'cel' || shadingMode === 'pbr') &&
            contornoMotor.userData.wantVisible !== false;
        }
      }
    });
  }, [shadingMode, outlineEnabled, outlineThickness, matcapPreset, sceneRevision]);

  useEffect(() => {
    const markerGroup = featureMarkerGroupRef.current;
    if (!markerGroup) return;
    while (markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]);
    if (activeFaceFeature === 'none' || !currentHumanStatsRef.current?.landmarks.facePoints3D) {
      return;
    }

    const facePoints = currentHumanStatsRef.current.landmarks.facePoints3D;
    let targetPos: [number, number, number] | null = null;
    let markerColor = 0xf59e0b;

    if (activeFaceFeature === 'head') {
      targetPos = facePoints.head;
      markerColor = 0x38bdf8;
    } else if (activeFaceFeature === 'nose') {
      targetPos = facePoints.nose;
      markerColor = 0xf43f5e;
    } else if (activeFaceFeature === 'eyes') {
      targetPos = facePoints.eyes;
      markerColor = 0x10b981;
    } else if (activeFaceFeature === 'mouth') {
      targetPos = facePoints.mouth;
      markerColor = 0xa855f7;
    } else if (activeFaceFeature === 'chin') {
      targetPos = facePoints.chin;
      markerColor = 0xf59e0b;
    }

    if (targetPos) {
      const sphere = new Mesh(
        new SphereGeometry(0.022, 16, 16),
        new MeshBasicMaterial({ color: markerColor })
      );
      sphere.position.set(targetPos[0], targetPos[1], targetPos[2]);
      markerGroup.add(sphere);

      const ring = new Mesh(
        new RingGeometry(0.038, 0.048, 32),
        new MeshBasicMaterial({
          color: markerColor,
          side: DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
      );
      ring.position.set(targetPos[0], targetPos[1], targetPos[2] + 0.012);
      markerGroup.add(ring);

      const line = new Line(
        new BufferGeometry().setFromPoints([
          new Vector3(targetPos[0], targetPos[1] - 0.05, targetPos[2]),
          new Vector3(targetPos[0], targetPos[1] + 0.05, targetPos[2]),
        ]),
        new LineBasicMaterial({
          color: markerColor,
          linewidth: 2,
        })
      );
      markerGroup.add(line);
    }
  }, [activeFaceFeature]);

  useEffect(() => {
    if (!sceneRef.current || !currentModelGroupRef.current) return;
    if (showSkeleton) {
      let skinnedMesh: SkinnedMesh | null = null;
      currentModelGroupRef.current.traverse((c) => {
        if ((c as SkinnedMesh).isSkinnedMesh) skinnedMesh = c as SkinnedMesh;
      });
      if (skinnedMesh) {
        if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
        const sm = skinnedMesh as SkinnedMesh;
        const helper = new SkeletonHelper(sm.skeleton.bones[0] || sm);
        (helper.material as LineBasicMaterial).linewidth = 2;
        sceneRef.current.add(helper);
        skeletonHelperRef.current = helper;
      }
    } else if (skeletonHelperRef.current) {
      sceneRef.current.remove(skeletonHelperRef.current);
      skeletonHelperRef.current = null;
    }
  }, [showSkeleton]);

  const setCameraPreset = (view: 'front' | 'side' | 'back' | 'top' | 'reset') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const targetY = 1.25;
    const target = new Vector3(0, targetY, 0);
    ctrl.target.copy(target);
    if (view === 'front') cam.position.set(0, targetY, 3.8);
    else if (view === 'side') cam.position.set(3.8, targetY, 0);
    else if (view === 'back') cam.position.set(0, targetY, -3.8);
    else if (view === 'top') cam.position.set(0, 4.4, 0.01);
    else if (view === 'reset') cam.position.set(0, 1.45, 3.9);
    ctrl.update();
  };

  /** Carga bytes de cualquier archivo .GLB en el visor 3D con huesos y animaciones */
  const loadGlbBytesIntoScene = async (
    bytes: Uint8Array,
    filename: string,
    updateGlbPanel = true
  ) => {
    const loader = new GLTFLoader();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const gltf = await loader.parseAsync(copy.buffer, '');

    const group = currentModelGroupRef.current;
    if (!group) return;
    while (group.children.length > 0) group.remove(group.children[0]);
    outlineMeshMapRef.current.clear();

    const loadedRoot = gltf.scene || new Group();
    loadedRoot.traverse((child) => {
      const m = child as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.originalMaterial = m.material;
      }
    });

    const box = new Box3().setFromObject(loadedRoot);
    const minY = !box.isEmpty() && Number.isFinite(box.min.y) ? box.min.y : 0;
    group.position.set(0, -minY, 0);
    group.add(loadedRoot);

    currentClipsRef.current = gltf.animations || [];
    animationActionsRef.current.clear();

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new AnimationMixer(loadedRoot);
      mixerRef.current = mixer;
      const animList: { id: string; label: string }[] = [];
      gltf.animations.forEach((clip, i) => {
        const name = clip.name || `Anim_${i + 1}`;
        const action = mixer.clipAction(clip);
        animationActionsRef.current.set(name, action);
        animList.push({ id: name, label: name });
      });
      setLoadedAnimations(animList);
      const firstAction = animationActionsRef.current.get(animList[0].id);
      if (firstAction) {
        firstAction.reset().play();
        setActiveAnimation(animList[0].id);
      }
    } else {
      mixerRef.current = null;
      setLoadedAnimations([]);
    }

    recalcScenePolyStats(group);
    frameActiveModel(group);

    if (updateGlbPanel) {
      const file = new File([copy.buffer], filename, { type: 'model/gltf-binary' });
      setActiveGlbSource({ name: filename, file });
    }
  };

  /** Maneja la carga de archivos locales (.glb, .gltf o .py) desde el botón superior */
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.py')) {
        const text = await file.text();
        setBpyScript(text);
        setActiveTab('bpy');
        await runBpyCode(text, file.name, bpyCoordMode);
      } else if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        const buf = await file.arrayBuffer();
        await loadGlbBytesIntoScene(new Uint8Array(buf), file.name, true);
        setActiveTab('monsters');
      }
    } catch (err) {
      setExportError(
        `No se pudo cargar el archivo ${file.name}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const imageToSourceAndCrop = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const crop = fitImageToTensor(ctx, img);
    return {
      source: ctx.getImageData(0, 0, 256, 256).data,
      crop,
    };
  };

  const handleBuildHuman = async (images: HumanImageSet, options: HumanBuildOptions) => {
    if (!images.front) return;
    setHumanBusy(true);
    setHumanError(null);
    try {
      // Patas y rabos: los hilos que unen dos partes se cortan en el recorte de
      // cada silueta. El molde no cambia; solo recibe siluetas sin membranas.
      const viewCut = options.separateLimbs
        ? {
            ...DEFAULT_CUTOUT,
            separateThreads: true,
            threadWidth: Math.max(1, Math.min(10, options.threadWidth ?? 3)),
          }
        : DEFAULT_CUTOUT;
      const frontData = imageToSourceAndCrop(images.front);
      const frontPrep = prepareView(frontData.source, false, viewCut);
      const backData = images.back ? imageToSourceAndCrop(images.back) : null;
      const rawBackPrep = backData ? prepareView(backData.source, true, viewCut) : frontPrep;
      const sideData = images.side ? imageToSourceAndCrop(images.side) : null;
      const sidePrep = sideData ? prepareView(sideData.source, false, viewCut) : null;
      // Con "Usar solo un perfil" se ignora la foto del 2.º perfil y se usa solo el principal
      const useSideLeft = Boolean(images.sideLeft) && !options.singleProfile;
      const sideLeftData = useSideLeft && images.sideLeft ? imageToSourceAndCrop(images.sideLeft) : null;
      const sideLeftPrep = sideLeftData
        ? prepareView(sideLeftData.source, false, viewCut)
        : null;
      // Vista superior (cenital): tercer plano ortografico del casco visual.
      const topData = images.top ? imageToSourceAndCrop(images.top) : null;
      const topPrep = topData ? prepareView(topData.source, false, viewCut) : null;
      // Patas y colas: se quita lo que sobra alrededor. Grosor de las patas delanteras medido en el
      // perfil; de las traseras, medido en la espalda (en el perfil van tapadas por las delanteras).
      if (options.separateLimbs) {
        const sinkOf = (p: { threadCut?: Uint8Array }) => {
          if (!p.threadCut) p.threadCut = new Uint8Array(256 * 256);
          return p.threadCut;
        };
        const legsFront = trimViewLegs(frontPrep.cutout, 256, sinkOf(frontPrep), frontPrep.rgb);
        let frontWidth: number | null = null;
        if (legsFront.length) {
          const wsF = legsFront.map((l) => l.width).sort((a, b) => a - b);
          frontWidth = wsF[Math.floor(wsF.length / 2)];
        }
        let hindWidth: number | null = null;
        if (backData && rawBackPrep !== frontPrep) {
          const legsBack = trimViewLegs(rawBackPrep.cutout, 256, sinkOf(rawBackPrep), rawBackPrep.rgb);
          if (legsBack.length) {
            const ws = legsBack.map((l) => l.width).sort((a, b) => a - b);
            hindWidth = ws[Math.floor(ws.length / 2)];
          }
        }
        if (sidePrep) {
          const sideParts = detectSideViewParts(sidePrep.cutout, 256);
          if (sideParts) trimSideLegs(sidePrep.cutout, 256, sinkOf(sidePrep), sideParts, hindWidth, sidePrep.rgb, 2, frontWidth);
        }
      }
      // Patas y colas pinchadas en la imagen de detección: se limpian sus hilos antes de
      // derivar las máscaras, para que el molde ya salga sin ellos.
      const cleanReport: Array<{ view: 'front' | 'side'; x: number; y: number; removed: number }> = [];
      for (const c of options.cleanPoints ?? []) {
        const target = c.view === 'front' ? frontPrep : sidePrep;
        const removed = target
          ? cutThreadsNear(target, c.x, c.y, 26, Math.max(6, (options.threadWidth ?? 3) * 4))
          : 0;
        cleanReport.push({ view: c.view, x: c.x, y: c.y, removed });
      }

      const frontLayer = images.frontLayer ? loadLayerMap(images.frontLayer, frontData.crop) : null;
      const rawBackLayer = images.backLayer
        ? loadLayerMap(images.backLayer, backData?.crop ?? frontData.crop)
        : null;
      const sideLayer = images.sideLayer
        ? loadLayerMap(images.sideLayer, sideData?.crop ?? null)
        : null;
      const sideLeftLayer = useSideLeft && images.sideLeftLayer
        ? loadLayerMap(images.sideLeftLayer, sideLeftData?.crop ?? null)
        : null;
      const topLayer = images.topLayer ? loadLayerMap(images.topLayer, topData?.crop ?? null) : null;

      const pTransforms = options.photoTransforms;
      // Aplicar rotación y espejo en los tensores de 256x256; la posición X/Y y la escala del recuadro
      // se aplican analíticamente en el constructor 3D sin recortar los bordes del lienzo de 256x256.
      if (pTransforms?.front) {
        applyPhotoTransformToPreparedView(frontPrep, frontLayer, pTransforms.front, false, false);
      }
      if (backData && pTransforms?.back) {
        applyPhotoTransformToPreparedView(rawBackPrep, rawBackLayer, pTransforms.back, false, true);
      }
      if (sidePrep && pTransforms?.side) {
        applyPhotoTransformToPreparedView(sidePrep, sideLayer, pTransforms.side, false, false);
      }
      if (sideLeftPrep && pTransforms?.sideLeft) {
        applyPhotoTransformToPreparedView(sideLeftPrep, sideLeftLayer, pTransforms.sideLeft, false, false);
      }
      if (topPrep && pTransforms?.top) {
        applyPhotoTransformToPreparedView(topPrep, topLayer, pTransforms.top, false, false);
      }

      // PLANO XY: La silueta frontal la marca SIEMPRE la imagen delantera (frontMask)
      let frontMask = maskFromCutoutAndPaint(frontPrep.cutout, 256, frontLayer?.offset);
      let sideMask = sidePrep
        ? maskFromCutoutAndPaint(sidePrep.cutout, 256, sideLayer?.offset)
        : null;
      let sideLeftMask = sideLeftPrep
        ? maskFromCutoutAndPaint(sideLeftPrep.cutout, 256, sideLeftLayer?.offset)
        : null;
      let topMask = topPrep
        ? maskFromCutoutAndPaint(topPrep.cutout, 256, topLayer?.offset)
        : null;
      // Patas y rabos: el mapa de capas pintado suele ser algo más gordo que la foto y deja una
      // franja de fondo alrededor de patas y cola. Con la opción activa manda el recorte de la foto.
      const clipToPhoto = (m: Uint8Array | null, cut: Uint8Array | undefined) => {
        if (!options.separateLimbs || !m || !cut) return;
        for (let k = 0; k < m.length; k++) if (m[k] === 1 && cut[k] !== 1) m[k] = 0;
      };
      clipToPhoto(frontMask, frontPrep.cutout);
      clipToPhoto(sideMask, sidePrep?.cutout);
      clipToPhoto(sideLeftMask, sideLeftPrep?.cutout);
      clipToPhoto(topMask, topPrep?.cutout);


      // Recorte de la linea de contorno del dibujo (el arte cel-shade engorda cada silueta).
      const trimOption = options.outlineTrimPx ?? -1;
      let trimPx = 0;
      if (trimOption !== 0) {
        trimPx =
          trimOption > 0
            ? Math.min(3, Math.round(trimOption))
            : Math.min(3, Math.floor(estimateOutlineThickness(frontMask, frontPrep.rgb, 256) / 2));
      }
      if (trimPx > 0) {
        frontMask = trimOutline(frontMask, 256, trimPx);
        if (sideMask) sideMask = trimOutline(sideMask, 256, trimPx);
        if (sideLeftMask) sideLeftMask = trimOutline(sideLeftMask, 256, trimPx);
        if (topMask) topMask = trimOutline(topMask, 256, trimPx);
      }
      // Forma media de los dos perfiles cuando estan los dos.
      if (options.mergeProfiles !== false && sideMask && sideLeftMask) {
        const mirrored = mirrorMaskX(sideLeftMask, 256);
        const other =
          maskIoU(sideMask, mirrored, 256) >= maskIoU(sideMask, sideLeftMask, 256)
            ? mirrored
            : sideLeftMask;
        sideMask = averageSilhouettes(sideMask, other, 256, 0.5);
      }

      const isProfile3D =
        Boolean(options.freeformFromPhotos) ||
        (Boolean(sideMask || sideLeftMask) &&
          hasProfileDriven3DFeatures(
            frontMask,
            (sideMask ?? sideLeftMask)!,
            256,
            frontLayer,
            sideMask ? sideLayer : sideLeftLayer
          ));

      const relBackTf = computeRelativePhotoTransform(pTransforms?.front, pTransforms?.back);
      let backPrep = rawBackPrep;
      let backLayer = rawBackLayer;
      if (backData && !isProfile3D) {
        const alignedBack = alignBackViewToFront(frontPrep, rawBackPrep, frontLayer, rawBackLayer);
        backPrep = alignedBack.back;
        backLayer = alignedBack.backLayer;
        if (isPhotoTransformModified(relBackTf)) {
          applyPhotoTransformToPreparedView(backPrep, backLayer, relBackTf, true, true);
        }
      }
      let rawBackMask = backData
        ? maskFromCutoutAndPaint(backPrep.cutout, 256, backLayer?.offset, true)
        : frontMask;
      if (backData) clipToPhoto(rawBackMask, backPrep.cutout);
      if (trimPx > 0 && backData) rawBackMask = trimOutline(rawBackMask, 256, trimPx);
      const effectiveBackMask =
        isProfile3D || isPhotoTransformModified(relBackTf) ? rawBackMask : frontMask;

      // Origen de textura difusa (albedo):
      // Por defecto ('original'), la textura se toma 100% de las fotos originales (Fila 0).
      const useLayerTexture =
        options.textureSource === 'layerMap' && Boolean(images.frontLayer);

      const diffuseFrontPrep = useLayerTexture && images.frontLayer
        ? (() => {
            const p = prepareView(imageToSourceAndCrop(images.frontLayer).source, false, DEFAULT_CUTOUT);
            if (pTransforms?.front) applyPhotoTransformToPreparedView(p, null, pTransforms.front, false, false);
            return p;
          })()
        : frontPrep;
      const diffuseBackPrep = useLayerTexture && images.backLayer
        ? (() => {
            const p = prepareView(imageToSourceAndCrop(images.backLayer).source, true, DEFAULT_CUTOUT);
            if (pTransforms?.back) applyPhotoTransformToPreparedView(p, null, pTransforms.back, false, false);
            if (!isProfile3D && isPhotoTransformModified(relBackTf)) {
              applyPhotoTransformToPreparedView(p, null, relBackTf, true, false);
            }
            return p;
          })()
        : backPrep;
      const diffuseSidePrep = useLayerTexture && images.sideLayer
        ? (() => {
            const p = prepareView(imageToSourceAndCrop(images.sideLayer).source, false, DEFAULT_CUTOUT);
            if (pTransforms?.side) applyPhotoTransformToPreparedView(p, null, pTransforms.side, false, false);
            return p;
          })()
        : sidePrep;
      const diffuseSideLeftPrep = useLayerTexture && useSideLeft && images.sideLeftLayer
        ? (() => {
            const p = prepareView(imageToSourceAndCrop(images.sideLeftLayer).source, false, DEFAULT_CUTOUT);
            if (pTransforms?.sideLeft) applyPhotoTransformToPreparedView(p, null, pTransforms.sideLeft, false, false);
            return p;
          })()
        : sideLeftPrep;

      const atlas = buildAtlas(
        diffuseFrontPrep,
        diffuseBackPrep,
        options.metalMix ?? 1,
        frontLayer,
        backLayer,
        diffuseSidePrep,
        diffuseSideLeftPrep,
        sideLayer,
        sideLeftLayer
      );

      const inputs: HumanBodyInputs = {
        mask: frontMask,
        backMask: effectiveBackMask,
        w: 256,
        frontRgb: frontPrep.rgb,
        frontRelief: frontPrep.relief,
        backRelief: backPrep.relief,
        sideRelief: sidePrep ? sidePrep.relief : null,
        sideLeftRelief: sideLeftPrep ? sideLeftPrep.relief : null,
        sideMask,
        sideLeftMask,
        topMask,
        frontLayer,
        backLayer,
        sideLayer,
        sideLeftLayer,
        topLayer,
        vertexUsedMask: new Uint8Array(600000),
        maxVertices: 600000,
        atlas: {
          albedo: atlas.albedo,
          roughMetal: atlas.roughMetal,
          atlasWidth: atlas.atlasWidth,
          background: frontPrep.bg,
          backBackground: backPrep.bg,
          backMask: effectiveBackMask,
          sideProfile:
            diffuseSidePrep && sideMask
              ? {
                  inpainted: diffuseSidePrep.inpainted,
                  cutout: sideMask,
                  layer: sideLayer,
                }
              : null,
          sideLeftProfile:
            diffuseSideLeftPrep && sideLeftMask
              ? {
                  inpainted: diffuseSideLeftPrep.inpainted,
                  cutout: sideLeftMask,
                  layer: sideLeftLayer,
                }
              : null,
        },
      };

      const geometry = new BufferGeometry();
      // En el molde por perfil, el 0% de textura de perfil significa "automatico": si no, la
      // foto de frente se estira a lo largo de todo el costado de un bicho horizontal.
      const moldOptions =
        isProfile3D && (sideMask || sideLeftMask) && (options.profileTexturePct ?? 0) < 0.5
          ? { ...options, profileTexturePct: 100 }
          : options;
      const stats = buildHumanBodyTemplateGeometry(geometry, inputs, moldOptions);
      currentHumanStatsRef.current = stats;
      applyNormalSmoothingToModel(new Mesh(geometry));

      // Patas, rabos y cara: resumen de lo detectado, rasgos de la foto de frente
      // en un hueco libre del atlas y nuca sin cara. No cambia el molde.
      const extras = applyLimbAndFaceExtras({
        geometry,
        atlas,
        frontMask,
        frontView: frontPrep,
        frontImage: images.front,
        frontCrop: frontData.crop,
        frontTransformed: isPhotoTransformModified(pTransforms?.front),
        layerTexture: useLayerTexture,
        hasBack: Boolean(backData),
        views: [
          ['frente', frontPrep],
          ['espalda', backData ? rawBackPrep : null],
          ['perfil', sidePrep],
          ['2.º perfil', sideLeftPrep],
          ['cenital', topPrep],
        ],
        sideMask: sideMask ?? sideLeftMask,
        sideView: sidePrep ?? sideLeftPrep,
        landmarks: stats.landmarks,
        rigKind: stats.rigKind,
        creatureMetrics: stats.creatureMetrics,
        cleanReport,
        options,
      });

      const atlasCanvas = document.createElement('canvas');
      atlasCanvas.width = 512;
      atlasCanvas.height = 512;
      const actx = atlasCanvas.getContext('2d');
      if (actx) {
        const idata = actx.createImageData(512, 512);
        for (let i = 0; i < 262144; i++) {
          idata.data[i * 4] = atlas.albedo[i * 4];
          idata.data[i * 4 + 1] = atlas.albedo[i * 4 + 1];
          idata.data[i * 4 + 2] = atlas.albedo[i * 4 + 2];
          idata.data[i * 4 + 3] = atlas.albedo[i * 4 + 3];
        }
        actx.putImageData(idata, 0, 0);
      }

      const diffuseTexture = new CanvasTexture(atlasCanvas);
      diffuseTexture.flipY = false;
      diffuseTexture.colorSpace = SRGBColorSpace;
      diffuseTexture.wrapS = ClampToEdgeWrapping;
      diffuseTexture.wrapT = ClampToEdgeWrapping;
      diffuseTexture.needsUpdate = true;

      const baseMat = new MeshStandardMaterial({
        map: diffuseTexture,
        roughness: 0.65,
        metalness: 0.08,
      });

      const group = currentModelGroupRef.current;
      if (group) {
        while (group.children.length > 0) group.remove(group.children[0]);
        outlineMeshMapRef.current.clear();
      }

      let modelObject: Object3D;
      let animClips: AnimationClip[] = [];
      if (options.rig && stats.rig) {
        const skeletonData = createSkeletonBones(stats.rig);
        const skeleton = new Skeleton(skeletonData.bones);
        const skinnedMesh = new SkinnedMesh(geometry, baseMat);
        skinnedMesh.name = 'HumanModel_Skinned';
        skinnedMesh.castShadow = true;
        skinnedMesh.receiveShadow = true;
        skinnedMesh.add(skeletonData.root);
        skinnedMesh.bind(skeleton);

        animClips =
          stats.rigKind && stats.rigKind !== 'human' && stats.creatureMetrics
            ? createCreatureAnimationClips(stats.rig, stats.creatureMetrics)
            : createHumanAnimationClips(stats.rig);
        currentClipsRef.current = animClips;

        const mixer = new AnimationMixer(skinnedMesh);
        mixerRef.current = mixer;
        animationActionsRef.current.clear();
        animClips.forEach((clip) => {
          const action = mixer.clipAction(clip);
          animationActionsRef.current.set(clip.name, action);
        });

        const initialClipName = clipNameForAnimation(activeAnimation) || animClips[0]?.name;
        if (initialClipName) {
          const act = animationActionsRef.current.get(initialClipName);
          if (act) act.reset().play();
        }
        modelObject = skinnedMesh;
        setCurrentRig(stats.rig);
      } else {
        const mesh = new Mesh(geometry, baseMat);
        mesh.name = 'HumanModel_Static';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        modelObject = mesh;
        setCurrentRig(null);
        mixerRef.current = null;
        currentClipsRef.current = [];
      }

      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const minY = bbox && Number.isFinite(bbox.min.y) ? bbox.min.y : 0;
      const maxY = bbox && Number.isFinite(bbox.max.y) ? bbox.max.y : 2.4;
      const groundOffsetY = -minY;

      if (group) {
        group.position.set(0, groundOffsetY, 0);
        group.add(modelObject);
      }
      if (featureMarkerGroupRef.current) {
        featureMarkerGroupRef.current.position.set(0, groundOffsetY, 0);
      }
      if (controlsRef.current) {
        const modelHeight = Math.max(0.8, maxY - minY);
        controlsRef.current.target.set(0, modelHeight * 0.5, 0);
        controlsRef.current.update();
      }

      setPolyStats((prev) => ({
        ...prev,
        verts: stats.vertexCount,
        tris: stats.triangleCount,
      }));

      const availableAnimations = animClips.map((c) => ({
        id: c.name.toLowerCase().replace(/human_|rig_/g, ''),
        label: c.name,
      }));

      const sideImportancePct = Math.round((options.sideStrength ?? 1) * 100);
      const profileTexPct = Math.round(options.profileTexturePct ?? 0);

      setHumanResult({
        // La cara en alta resolución duplica los vértices del borde del parche.
        vertexCount: geometry.getAttribute('position').count,
        triangleCount: stats.triangleCount,
        hasRig: Boolean(stats.rig),
        animations:
          availableAnimations.length > 0
            ? availableAnimations
            : [
                { id: 'idle', label: 'Reposo (Idle)' },
                { id: 'walk', label: 'Caminar (Walk)' },
                { id: 'run', label: 'Correr (Run)' },
                { id: 'attack', label: 'Ataque Espada' },
              ],
        detection: extras.detection,
        detectionPreview: extras.detectionPreview,
        notes: [
          ...extras.notes,
          `Molde 3D generado con ${stats.vertexCount.toLocaleString()} vértices`,
          `Plano XY (Frente) + Plano ZY (Perfil gradual al ${sideImportancePct}%)`,
          profileTexPct > 0
            ? `Textura: Frente (+Z), Atrás (-Z) y ${profileTexPct}% de aplicación de perfil`
            : 'Textura: 100% Foto Frontal delante (+Z) y 100% Foto Trasera detrás (-Z)',
        ],
      });
    } catch (err: any) {
      console.error('Error al generar modelo humano:', err);
      setHumanError(err?.message || String(err));
    } finally {
      setHumanBusy(false);
    }
  };

  const handleAnimationChange = (id: string) => {
    setActiveAnimation(id);
    if (!mixerRef.current) return;
    const targetClipName =
      animationActionsRef.current.has(id) ? id : clipNameForAnimation(id);
    if (!targetClipName) return;
    const targetAction = animationActionsRef.current.get(targetClipName);
    if (!targetAction) return;
    animationActionsRef.current.forEach((action) => {
      action.fadeOut(0.24);
    });
    targetAction.reset().fadeIn(0.24).play();
  };

  /** Exporta y descarga el modelo activo en cualquiera de los 5 niveles: Completo, High, Medium, Low o Minimum */
  const handleExportGLB = async (requestedTier?: MonsterTier) => {
    const tierToUse: MonsterTier =
      requestedTier && EXPORT_TIER_SPECS[requestedTier] ? requestedTier : exportTier;
    const group = currentModelGroupRef.current;
    if (!group || group.children.length === 0) {
      setExportError('No hay ningún modelo 3D activo para guardar. Carga una imagen o modelo primero.');
      setTimeout(() => setExportError(null), 5000);
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const targetObj = group.children.length === 1 ? group.children[0] : group;
      const rawBytes = await exportHumanToGLBBytes(targetObj, currentClipsRef.current);

      let finalBytes = rawBytes;
      const spec = EXPORT_TIER_SPECS[tierToUse];
      if (tierToUse !== 'completo') {
        const copyBuf = new Uint8Array(rawBytes.byteLength);
        copyBuf.set(rawBytes);
        const analysis = analyzeGlbZones(copyBuf.buffer);
        const plans = new Map<number, ZonePlan>();
        for (const z of analysis.zones) {
          plans.set(z.index, { choice: { kind: 'keep' }, maxSize: spec.maxSize });
        }
        const opt = await optimizeGlb(copyBuf.buffer, plans, {
          jpegQuality: spec.jpegQuality,
          compactSkin: true,
          triangleRatio: spec.ratio,
        });
        finalBytes = opt.bytes;
      }

      const filename =
        tierToUse === 'completo'
          ? 'celshade_personaje_completo.glb'
          : `celshade_personaje_${tierToUse}.glb`;
      const blob = uint8ToBlob(finalBytes, 'model/gltf-binary');
      triggerBlobDownload(blob, filename);
      const url = URL.createObjectURL(blob);
      const mb = (finalBytes.byteLength / 1048576).toFixed(2);
      const sizeStr = `${mb} MB (${spec.shortLabel})`;
      setLastExportSize(sizeStr);
      setExportedGlb({
        url,
        blob,
        filename,
        sizeMb: sizeStr,
      });
    } catch (err) {
      console.error('Error al exportar GLB:', err);
      setExportError(
        err instanceof Error ? err.message : 'Error al generar y guardar el archivo GLB'
      );
    } finally {
      setExporting(false);
    }
  };

  /** Registra y descarga bytes GLB ya optimizados desde el panel por zonas */
  const handleDownloadOptimizedBytes = (bytes: Uint8Array, filename: string) => {
    const blob = uint8ToBlob(bytes, 'model/gltf-binary');
    triggerBlobDownload(blob, filename);
    const url = URL.createObjectURL(blob);
    const sizeStr = `${(bytes.byteLength / 1048576).toFixed(2)} MB`;
    setLastExportSize(sizeStr);
    setExportedGlb({
      url,
      blob,
      filename,
      sizeMb: sizeStr,
    });
  };

  const handleShareGlb = async () => {
    if (!exportedGlb) return;
    try {
      const file = new File([exportedGlb.blob], exportedGlb.filename, {
        type: 'model/gltf-binary',
      });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: exportedGlb.filename,
          text: `Modelo 3D exportado (${exportedGlb.sizeMb})`,
        });
      } else {
        triggerBlobDownload(exportedGlb.blob, exportedGlb.filename);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Error al compartir GLB:', err);
      }
    }
  };

  const handleUpdateRig = (newRig: HumanRig) => {
    setCurrentRig(newRig);
    const group = currentModelGroupRef.current;
    const rebindData = currentHumanStatsRef.current?.rebindData;
    if (group && rebindData) {
      group.traverse((child) => {
        if ((child as SkinnedMesh).isSkinnedMesh) {
          rebindHumanGeometry((child as SkinnedMesh).geometry, newRig, rebindData);
          // Los vértices duplicados por la cara copian los pesos de su original.
          syncFaceDuplicates((child as SkinnedMesh).geometry);
        }
      });
    }
  };

  /** Ejecuta código Blender Python 5.2 en la escena y devuelve el resultado detallado */
  const runBpyCode = async (
    codeToExecute: string,
    _customLabel?: string,
    coordModeOverride?: BlenderCoordinateMode
  ): Promise<ScriptExecutionResult> => {
    setBpyRunning(true);
    setBpyError(null);
    setBpySuccess(null);
    try {
      const group = currentModelGroupRef.current;
      if (!group) {
        return {
          success: false,
          logs: ['Error: escena 3D no inicializada'],
          executionTimeMs: 0,
          verticesModified: 0,
          error: 'Escena 3D no inicializada',
        };
      }
      group.position.set(0, 0, 0);
      outlineMeshMapRef.current.clear();

      const res = await executeBlenderPythonScript(codeToExecute, group, {
        coordinateMode: coordModeOverride ?? bpyCoordMode,
      });

      if (featureMarkerGroupRef.current) {
        featureMarkerGroupRef.current.position.set(0, 0, 0);
      }
      recalcScenePolyStats(group);
      frameActiveModel(group);

      if (res.success) {
        setBpySuccess(
          `¡Script ejecutado! (${res.objectsCreated ?? group.children.length} objetos en escena)`
        );
        window.setTimeout(() => setBpySuccess(null), 4000);
      } else if (res.error) {
        setBpyError(res.error);
      }
      return res;
    } catch (err: any) {
      const msg = err?.message || String(err);
      setBpyError(msg);
      return {
        success: false,
        logs: [msg],
        executionTimeMs: 0,
        verticesModified: 0,
        error: msg,
      };
    } finally {
      setSceneRevision((r) => r + 1);
      setBpyRunning(false);
    }
  };

  const handleRunBpy = async () => {
    await runBpyCode(bpyScript, 'Consola lateral', bpyCoordMode);
  };

  const handleGenerateAiBpy = async () => {
    if (!aiPrompt.trim() || aiGenerating) return;
    setAiGenerating(true);
    setBpyError(null);
    try {
      const res = await fetch('/api/gemini/bpy-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          coordMode: 'Z_UP',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar script con IA');
      setBpyScript(data.code);
      setBpySuccess('¡Script generado con Gemini! Ejecutando en 3D...');
      await runBpyCode(data.code, 'Gemini AI', bpyCoordMode);
    } catch (err: any) {
      setBpyError(err?.message || String(err));
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none font-sans">
      {/* Input oculto para cargar cualquier archivo .glb, .gltf o .py desde el ordenador o móvil */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.py"
        onChange={handleLocalFileUpload}
        className="hidden"
      />
      <input
        ref={pyFileInputRef}
        type="file"
        accept=".py,.txt"
        onChange={handleLocalFileUpload}
        className="hidden"
      />

      <header className="h-12 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-3 flex items-center justify-between shrink-0 z-20 overflow-x-auto no-scrollbar scrollbar-none flex-nowrap gap-2">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center font-bold text-xs text-slate-950 shadow-md shadow-amber-500/20">
              3D
            </span>
            <span className="font-bold text-sm tracking-wide text-amber-300 whitespace-nowrap">
              CelShade Studio 3D
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <div className="flex items-center bg-slate-950/70 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('human')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'human'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Humano (Fotos)
            </button>
            <button
              onClick={() => setActiveTab('monsters')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'monsters'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Skull className="w-3.5 h-3.5" />
              Monstruos & GLB
            </button>
            <button
              onClick={() => setActiveTab('bpy')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'bpy'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CodeXml className="w-3.5 h-3.5" />
              Blender Python
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Botón directo para cargar .GLB o .PY como antes */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-xs text-sky-200 border border-sky-500/40 font-semibold transition-colors whitespace-nowrap cursor-pointer"
            title="Cargar cualquier modelo .GLB / .GLTF o script .PY desde tu dispositivo"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Cargar .GLB / .PY</span>
          </button>

          <div className="flex items-center bg-slate-950/70 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setShadingMode('cel')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                shadingMode === 'cel'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Cel-Shading de 3 tonos con rampa cómic"
            >
              🎨 Cel
            </button>
            <button
              onClick={() => setShadingMode('pbr')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                shadingMode === 'pbr'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="PBR Físico estándar"
            >
              💎 PBR
            </button>
            <button
              onClick={() => setShadingMode('matcap')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                shadingMode === 'matcap'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Matcap Escultura"
            >
              🗿 Matcap
            </button>
            <button
              onClick={() => setShadingMode('wireframe')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                shadingMode === 'wireframe'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Malla Wireframe"
            >
              📐 Malla
            </button>
          </div>

          <button
            onClick={() => setOutlineEnabled(!outlineEnabled)}
            className={`px-2 py-1 rounded text-xs border flex items-center gap-1 transition-all whitespace-nowrap cursor-pointer ${
              outlineEnabled
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Activar/desactivar línea de contorno de cómic"
          >
            🖋️ Contorno
          </button>

          <div className="flex items-center gap-1 bg-slate-950/70 p-0.5 rounded border border-slate-800 text-[11px]">
            <button
              onClick={() => setCameraPreset('front')}
              className="px-1.5 py-0.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
              title="Vista Frente"
            >
              Frente
            </button>
            <button
              onClick={() => setCameraPreset('side')}
              className="px-1.5 py-0.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
              title="Vista Perfil"
            >
              Perfil
            </button>
            <button
              onClick={() => setCameraPreset('back')}
              className="px-1.5 py-0.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
              title="Vista Espalda"
            >
              Espalda
            </button>
            <button
              onClick={() => setCameraPreset('reset')}
              className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
              title="Restablecer Cámara"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={() => setDriveOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Abrir modelos desde Google Drive"
          >
            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            Drive
          </button>

          {/* Selector de nivel de descarga GLB + Botón de descarga */}
          <div className="flex items-center bg-slate-950/80 rounded-lg border border-amber-500/40 p-0.5">
            <select
              value={exportTier}
              onChange={(e) => setExportTier(e.target.value as MonsterTier)}
              className="bg-transparent text-[11px] text-amber-200 font-semibold px-1.5 py-0.5 outline-none cursor-pointer"
              title="Elige el nivel de calidad y peso del archivo .GLB"
            >
              <option value="completo" className="bg-slate-900 text-slate-100">
                💎 Completo (100%)
              </option>
              <option value="high" className="bg-slate-900 text-slate-100">
                ✨ High (75%)
              </option>
              <option value="medium" className="bg-slate-900 text-slate-100">
                ⚖️ Medium (50%)
              </option>
              <option value="low" className="bg-slate-900 text-slate-100">
                ⚡ Low (28%)
              </option>
              <option value="minimum" className="bg-slate-900 text-slate-100">
                🪶 Minimum (14%)
              </option>
            </select>
            <button
              disabled={exporting || polyStats.verts === 0}
              onClick={() => handleExportGLB(exportTier)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-xs text-slate-950 font-bold transition-all shadow disabled:opacity-50 whitespace-nowrap cursor-pointer"
              title="Exportar modelo actual a archivo .GLB en el nivel seleccionado"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exportando...' : 'Bajar GLB'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 relative flex overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 h-full w-full relative outline-none cursor-grab active:cursor-grabbing"
        >
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none flex-wrap">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded px-2.5 py-1 text-[11px] font-mono text-slate-300 flex items-center gap-3 shadow-lg">
              <span className="flex items-center gap-1">
                <Boxes className="w-3 h-3 text-amber-400" />
                {polyStats.tris.toLocaleString()} Tris
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" />
                {polyStats.verts.toLocaleString()} Verts
              </span>
              <span className="text-slate-600">|</span>
              <span
                className={`font-bold ${
                  polyStats.fps >= 50 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {polyStats.fps} FPS
              </span>
            </div>
            <button
              onClick={() => setShowPedestal(!showPedestal)}
              className="pointer-events-auto bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {showPedestal ? 'Pedestal: ON' : 'Pedestal: OFF'}
            </button>
          </div>

          {/* Botón flotante para deslizar / mostrar / ocultar menú lateral */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute top-3 right-3 z-30 py-1 px-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-sky-300 hover:text-sky-100 text-xs font-semibold flex items-center gap-1.5 shadow-xl backdrop-blur cursor-pointer transition-all active:scale-95"
            title={sidebarCollapsed ? 'Desplegar / mostrar menú de opciones' : 'Ocultar / desplazar menú para ver el modelo 3D completo'}
          >
            {sidebarCollapsed ? (
              <>
                <PanelRightOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Mostrar menú</span>
              </>
            ) : (
              <>
                <PanelRightClose className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Ocultar</span>
              </>
            )}
          </button>

          {activeFaceFeature !== 'none' && (
            <div className="absolute top-3 right-28 z-20 bg-cyan-950/80 border border-cyan-500/50 rounded-lg px-3 py-1.5 text-xs text-cyan-200 flex items-center gap-2 shadow-lg backdrop-blur-md animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Marcando en 3D: <strong className="capitalize">{activeFaceFeature}</strong>
            </div>
          )}
        </div>

        {/* Panel lateral con desplazamiento suave (scroll vertical) y opción de deslizar/plegar */}
        <aside
          className={`h-full bg-slate-950/95 backdrop-blur-md border-l border-slate-800/90 flex flex-col z-20 shadow-2xl transition-all duration-300 ease-in-out shrink-0 ${
            sidebarCollapsed
              ? 'w-0 border-l-0 opacity-0 pointer-events-none translate-x-full overflow-hidden'
              : 'w-full sm:w-[410px] md:w-[440px] opacity-100 translate-x-0 overflow-y-auto overflow-x-hidden touch-pan-y scrollbar-thin scrollbar-thumb-slate-700'
          }`}
        >
          {activeTab === 'human' && (
            <HumanFromImagesPanel
              busy={humanBusy}
              result={humanResult}
              error={humanError}
              exporting={exporting}
              lastExportSize={lastExportSize}
              activeAnimation={activeAnimation}
              currentRig={currentRig}
              showSkeleton={showSkeleton}
              editSkeletonMode={editSkeletonMode}
              selectedBoneName={selectedBoneName}
              boneSymmetry={boneSymmetry}
              activeFaceFeature={activeFaceFeature}
              onSelectFaceFeature={(feat) => setActiveFaceFeature(feat)}
              onBuild={handleBuildHuman}
              onAnimationChange={handleAnimationChange}
              onExport={(tier) => handleExportGLB(tier)}
              onToggleShowSkeleton={setShowSkeleton}
              onToggleEditSkeletonMode={setEditSkeletonMode}
              onSelectBone={setSelectedBoneName}
              onToggleBoneSymmetry={setBoneSymmetry}
              onUpdateRig={handleUpdateRig}
              onResetRigToAuto={() => {
                if (currentHumanStatsRef.current?.rig) {
                  setCurrentRig(cloneHumanRig(currentHumanStatsRef.current.rig));
                }
              }}
            />
          )}

          {activeTab === 'monsters' && (
            <div className="p-3 space-y-3 overflow-y-auto">
              {/* Carga directa de cualquier archivo .GLB local */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-300">
                  <div className="font-semibold text-sky-300">Abrir archivo .GLB / .GLTF</div>
                  <div className="text-[10px] text-slate-400">
                    Carga cualquier modelo 3D para verlo, animarlo o bajarlo en Low / Medium / Completo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Cargar .GLB</span>
                </button>
              </div>

              {/* Selector de animaciones si el GLB/Monstruo cargado tiene clips */}
              {loadedAnimations.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-semibold text-amber-300 flex items-center justify-between">
                    <span>Animaciones del modelo ({loadedAnimations.length}):</span>
                    <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSkeleton}
                        onChange={(e) => setShowSkeleton(e.target.checked)}
                      />
                      <span>Ver huesos</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {loadedAnimations.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleAnimationChange(a.id)}
                        className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer ${
                          activeAnimation === a.id
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-amber-400/50'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <MonsterLoaderPanel
                onLoad={async (source) => {
                  setActiveGlbSource(source);
                  const buf = await source.file.arrayBuffer();
                  await loadGlbBytesIntoScene(new Uint8Array(buf), source.name, false);
                }}
              />

              <GlbZonesPanel
                source={activeGlbSource}
                onPreviewBytes={(bytes, name) => {
                  void loadGlbBytesIntoScene(bytes, name, false);
                }}
                onDownloadBytes={handleDownloadOptimizedBytes}
              />
            </div>
          )}

          {activeTab === 'bpy' && (
            <div className="p-3.5 gap-3 flex flex-col h-full overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <CodeXml className="w-4 h-4 text-amber-400" />
                  <span>Blender 5.2 Python (bpy)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBpyModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold transition-all cursor-pointer shadow"
                    title="Abrir el Estudio Completo de Blender Python con los 7 Puntos, Asistente Gemini, Coordenadas Z-Up/Y-Up y Consola"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Estudio Completo</span>
                  </button>
                  <button
                    disabled={bpyRunning}
                    onClick={handleRunBpy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    {bpyRunning ? 'Ejecutando...' : 'Ejecutar'}
                  </button>
                </div>
              </div>

              {/* Plantillas y Presets de Blender Python (Ayuntamiento, Catedral, Cabañas, etc.) + Carga de .PY */}
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-200 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Modelos y Plantillas Python ({BLENDER_SCRIPT_PRESETS.length}):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => pyFileInputRef.current?.click()}
                    className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>Cargar .PY</span>
                  </button>
                </div>

                <select
                  value={bpySelectedPreset}
                  onChange={(e) => {
                    const id = e.target.value;
                    setBpySelectedPreset(id);
                    const found = BLENDER_SCRIPT_PRESETS.find((p) => p.id === id);
                    if (found) {
                      setBpyScript(found.code);
                      void runBpyCode(found.code, found.name, bpyCoordMode);
                    }
                  }}
                  className="w-full py-1.5 px-2 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-400"
                >
                  <option value="">-- Elige una escena o plantilla para cargar y ejecutar --</option>
                  <optgroup label="Generar Escenas y Monumentos 3D">
                    {BLENDER_SCRIPT_PRESETS.filter((p) => p.category === 'generate').map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Modificar / Texturizar Escena Actual">
                    {BLENDER_SCRIPT_PRESETS.filter((p) => p.category === 'modify').map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* Selector rápido de ejes Z-Up / Y-Up */}
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 pt-0.5">
                  <span>Sistema de ejes:</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { id: 'auto', label: 'Auto' },
                        { id: 'blender_z_up', label: 'Z-Up (Blender)' },
                        { id: 'studio_y_up', label: 'Y-Up (WebGL)' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setBpyCoordMode(m.id);
                          void runBpyCode(bpyScript, 'Cambio de ejes', m.id);
                        }}
                        className={`px-2 py-0.5 rounded border cursor-pointer ${
                          bpyCoordMode === m.id
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Generar escena con Gemini AI:
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej: Castillo medieval con torres y puente levadizo..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateAiBpy()}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-amber-400"
                  />
                  <button
                    disabled={aiGenerating || !aiPrompt.trim()}
                    onClick={handleGenerateAiBpy}
                    className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {aiGenerating ? 'Generando...' : 'Generar'}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-[240px] bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                <div className="h-7 bg-slate-900 px-3 flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800">
                  <span>editor.py</span>
                  <button
                    type="button"
                    onClick={() => setBpyModalOpen(true)}
                    className="text-amber-300 hover:underline cursor-pointer"
                  >
                    Abrir editor grande + 7 Puntos →
                  </button>
                </div>
                <textarea
                  value={bpyScript}
                  onChange={(e) => setBpyScript(e.target.value)}
                  className="flex-1 w-full p-2.5 bg-transparent font-mono text-[11px] leading-relaxed text-amber-100 outline-none resize-none min-h-[190px]"
                  spellCheck={false}
                />
              </div>

              {/* Descarga directa de la escena Python en los 5 niveles de GLB */}
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="text-[10px] font-semibold text-slate-300">
                  Bajar escena actual en .GLB por nivel de optimización:
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {(['completo', 'high', 'medium', 'low', 'minimum'] as MonsterTier[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={exporting || polyStats.verts === 0}
                      onClick={() => handleExportGLB(t)}
                      className="py-1 px-1 rounded bg-slate-950 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-400 text-[10px] text-amber-200 font-semibold text-center cursor-pointer disabled:opacity-40"
                    >
                      {EXPORT_TIER_SPECS[t].shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {bpyError && (
                <div className="p-2 rounded bg-rose-950/80 border border-rose-500/50 text-[11px] text-rose-200">
                  {bpyError}
                </div>
              )}
              {bpySuccess && (
                <div className="p-2 rounded bg-emerald-950/80 border border-emerald-500/50 text-[11px] text-emerald-200">
                  {bpySuccess}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Modal completo de Blender Python 5.2 (7 Puntos, Presets, Asistente Gemini, Consola) */}
      <PythonScriptModal
        isOpen={bpyModalOpen}
        onClose={() => setBpyModalOpen(false)}
        externalCode={bpyScript}
        coordinateMode={bpyCoordMode}
        onCoordinateModeChange={setBpyCoordMode}
        onRunScript={async (code, label, coord) => {
          setBpyScript(code);
          return runBpyCode(code, label, coord);
        }}
        onClearScene={() => {
          const group = currentModelGroupRef.current;
          if (group) {
            while (group.children.length > 0) group.remove(group.children[0]);
            recalcScenePolyStats(group);
          }
        }}
        getViewportSnapshot={() => {
          try {
            return rendererRef.current?.domElement.toDataURL('image/jpeg', 0.8) || null;
          } catch {
            return null;
          }
        }}
      />

      {/* Modal flotante de descarga directa para garantizar que el archivo .GLB se guarde en cualquier navegador/móvil */}
      {exportedGlb && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 p-4 rounded-xl bg-slate-900/95 border-2 border-emerald-500/80 shadow-2xl backdrop-blur-md max-w-sm w-auto space-y-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-emerald-300">¡Archivo .GLB listo para guardar!</h4>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {exportedGlb.filename} · {exportedGlb.sizeMb}
                </p>
              </div>
            </div>
            <button
              onClick={() => setExportedGlb(null)}
              className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-300 leading-snug">
            Si la descarga no se inició automáticamente en tu navegador o móvil, pulsa aquí para guardarlo directamente:
          </p>

          <div className="flex flex-col gap-2">
            <a
              href={exportedGlb.url}
              download={exportedGlb.filename}
              className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer text-center"
            >
              <Download className="w-4 h-4" />
              <span>Guardar archivo en este dispositivo</span>
            </a>

            {typeof navigator !== 'undefined' && 'canShare' in navigator && (
              <button
                type="button"
                onClick={handleShareGlb}
                className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-sky-200 font-medium text-xs flex items-center justify-center gap-2 border border-sky-500/30 cursor-pointer transition-colors"
                title="Compartir o guardar en Google Drive, Archivos o aplicaciones del móvil"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Compartir / Guardar con el móvil (Drive, Archivos)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alerta de error si falla la exportación */}
      {exportError && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 p-3.5 rounded-xl bg-rose-950/95 border-2 border-rose-500/80 shadow-2xl backdrop-blur-md max-w-sm w-auto space-y-2 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <h4 className="text-xs font-bold text-rose-300">Aviso</h4>
            </div>
            <button
              onClick={() => setExportError(null)}
              className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-rose-200 leading-snug">{exportError}</p>
        </div>
      )}

      <GoogleDriveModal
        isOpen={driveOpen}
        accessToken={driveToken}
        onClose={() => setDriveOpen(false)}
        onSelectGlbFile={(file) => {
          void file.arrayBuffer().then((buf) => {
            void loadGlbBytesIntoScene(new Uint8Array(buf), file.name, true);
            setActiveTab('monsters');
            setDriveOpen(false);
          });
        }}
        onRequestSignIn={async () => {
          setDriveToken('mock-oauth-token');
        }}
      />
    </div>
  );
}
