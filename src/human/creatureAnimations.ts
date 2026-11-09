import * as THREE from 'three';
import type { HumanRig } from './humanRig';
import type { CreatureMetrics } from './creatureRig';

// ============================================================================
// ANIMACIONES DE CRIATURA
// Clips procedurales para el esqueleto de `creatureRig.ts`. Los huesos nacen con
// rotación identidad, así que sus ejes locales coinciden con los del mundo:
//   X = ancho, Y = alto, Z = largo (cabeza en +Z).
// Una pata apunta hacia -Y, de modo que girarla sobre X la balancea adelante y
// atrás: ángulo POSITIVO = la pata va hacia atrás, NEGATIVO = hacia delante.
// ============================================================================

type Euler3 = [number, number, number];
type Pose = Record<string, Euler3>;
type PoseFn = (u: number) => Pose;
type RootFn = (u: number) => [number, number, number];

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => v * v * (3 - 2 * v);
/** Rampa 0 -> 1 -> 0 suave entre `a` y `b`. */
const bump = (u: number, a: number, b: number) => {
  if (u <= a || u >= b) return 0;
  return Math.sin((Math.PI * (u - a)) / (b - a));
};
/** Rampa suave de 0 a 1 entre `a` y `b` que luego se queda arriba. */
const ramp = (u: number, a: number, b: number) => smooth(clamp01((u - a) / Math.max(1e-6, b - a)));

const LEGS = [
  { prefix: 'LeftFront', front: true, side: 1 },
  { prefix: 'RightFront', front: true, side: -1 },
  { prefix: 'LeftHind', front: false, side: 1 },
  { prefix: 'RightHind', front: false, side: -1 },
] as const;

type GaitPhases = { LeftFront: number; RightFront: number; LeftHind: number; RightHind: number };

/**
 * Ciclo de una pata. `swing` es la fracción del ciclo en que el pie va por el
 * aire; durante ese tramo la articulación intermedia se pliega para que la pata
 * no barra el suelo. La delantera dobla hacia ATRÁS (codo) y la trasera hacia
 * DELANTE (corvejón): es la diferencia que hace que se lea como un animal y no
 * como una mesa andando.
 */
function legPose(
  pose: Pose,
  prefix: string,
  front: boolean,
  s: number,
  swingAmp: number,
  flexAmp: number,
  duty = 0.6
) {
  const sw = s < duty ? 0 : (s - duty) / (1 - duty);
  const lift = s < duty ? 0 : Math.sin(Math.PI * sw);
  const upper = -swingAmp * Math.cos(TAU * s);
  const flexSign = front ? 1 : -1;
  const flex = flexSign * flexAmp * lift;
  pose[`${prefix}UpperLeg`] = [upper, 0, 0];
  pose[`${prefix}LowerLeg`] = [flex, 0, 0];
  pose[`${prefix}Foot`] = [-flex * 0.55 - upper * 0.35, 0, 0];
  pose[`${prefix}Toe`] = [-0.25 * lift, 0, 0];
  pose[`${prefix}Shoulder`] = [upper * 0.18, 0, 0];
}

function gait(
  u: number,
  phases: GaitPhases,
  swingAmp: number,
  flexAmp: number,
  duty = 0.6
): Pose {
  const pose: Pose = {};
  for (const leg of LEGS) {
    const p = phases[leg.prefix as keyof GaitPhases];
    legPose(pose, leg.prefix, leg.front, (u + p) % 1, swingAmp, flexAmp, duty);
  }
  return pose;
}

/** Cola: onda que recorre los cuatro tramos con retardo. */
function tailPose(pose: Pose, u: number, amp: number, freq = 1, droop = 0) {
  for (let k = 0; k < 4; k++) {
    const d = k * 0.14;
    pose[`Tail${k + 1}`] = [droop * (0.4 + 0.3 * k), amp * Math.sin(TAU * (u * freq - d)), 0];
  }
}

/** Columna: ondulación lateral suave y flexión vertical opcional. */
function spinePose(pose: Pose, lateral: number, flex: number) {
  pose.Hips = [flex * 0.35, lateral * 0.5, 0];
  pose.Spine1 = [flex, lateral, 0];
  pose.Spine2 = [flex, lateral * 0.8, 0];
  pose.Chest = [flex * 0.6, lateral * 0.4, 0];
}

function wingPose(pose: Pose, rig: HumanRig, fn: (side: 1 | -1) => { root: Euler3; hum: Euler3; rad: Euler3; hand: Euler3; fin: Euler3 }) {
  if (!rig.bones.some((b) => b.name === 'LeftWingRoot')) return;
  for (const [name, side] of [['Left', 1], ['Right', -1]] as Array<['Left' | 'Right', 1 | -1]>) {
    const v = fn(side);
    pose[`${name}WingRoot`] = v.root;
    pose[`${name}WingHumerus`] = v.hum;
    pose[`${name}WingRadius`] = v.rad;
    pose[`${name}WingHand`] = v.hand;
    pose[`${name}WingFinger`] = v.fin;
  }
}

/** Alas plegadas contra el lomo: pose base de todos los clips terrestres. */
function wingsFolded(pose: Pose, rig: HumanRig) {
  wingPose(pose, rig, (side) => ({
    root: [0, 0, side * -1.05],
    hum: [0, side * 0.5, side * -0.55],
    rad: [0, side * 1.15, 0],
    hand: [0, side * 0.9, 0],
    fin: [0, side * 0.5, 0],
  }));
}

const WALK_PHASES: GaitPhases = { LeftHind: 0, LeftFront: 0.25, RightHind: 0.5, RightFront: 0.75 };
const TROT_PHASES: GaitPhases = { LeftFront: 0, RightHind: 0, RightFront: 0.5, LeftHind: 0.5 };
const RUN_PHASES: GaitPhases = { LeftHind: 0, RightHind: 0.12, LeftFront: 0.5, RightFront: 0.62 };

interface ClipDef {
  name: string;
  duration: number;
  fps?: number;
  loop: boolean;
  pose: PoseFn;
  root?: RootFn;
}

function buildClipDefs(rig: HumanRig, m: CreatureMetrics): ClipDef[] {
  const H = m.height;
  const hasWings = m.hasWings;
  const defs: ClipDef[] = [];

  // --- Reposo: respiración, cola viva, cabeza atenta ------------------------
  defs.push({
    name: 'Idle',
    duration: 3.0,
    loop: true,
    pose: (u) => {
      const pose: Pose = {};
      const br = Math.sin(TAU * u);
      spinePose(pose, 0.015 * Math.sin(TAU * u * 0.5), 0.022 * br);
      tailPose(pose, u, 0.1, 0.5, 0.05);
      pose.Neck = [-0.03 * br, 0.05 * Math.sin(TAU * u * 0.33), 0];
      pose.Head = [0.02 * br, 0.07 * Math.sin(TAU * u * 0.33 + 0.6), 0];
      for (const leg of LEGS) {
        pose[`${leg.prefix}UpperLeg`] = [0.012 * br, 0, 0];
        pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 0.02 * br, 0, 0];
      }
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, 0.004 * H * Math.sin(TAU * u), 0],
  });

  // --- Marcha, trote y galope ----------------------------------------------
  const locomotion = (
    name: string,
    duration: number,
    phases: GaitPhases,
    swingAmp: number,
    flexAmp: number,
    duty: number,
    bob: number,
    spineFlex: number,
    tailAmp: number
  ) => {
    defs.push({
      name,
      duration,
      loop: true,
      pose: (u) => {
        const pose = gait(u, phases, swingAmp, flexAmp, duty);
        spinePose(pose, 0.05 * Math.sin(TAU * u), spineFlex * Math.sin(2 * TAU * u));
        tailPose(pose, u, tailAmp, 1, -0.03);
        pose.Neck = [0.03 * Math.sin(2 * TAU * u), 0.03 * Math.sin(TAU * u), 0];
        pose.Head = [-0.04 * Math.sin(2 * TAU * u), 0, 0];
        wingsFolded(pose, rig);
        return pose;
      },
      root: (u) => [0, bob * H * -Math.cos(2 * TAU * u), 0],
    });
  };
  locomotion('Walk', 1.20, WALK_PHASES, 0.34, 0.55, 0.62, 0.008, 0.0, 0.10);
  locomotion('Trot', 0.78, TROT_PHASES, 0.46, 0.80, 0.52, 0.016, 0.0, 0.13);
  locomotion('Run', 0.55, RUN_PHASES, 0.62, 1.05, 0.42, 0.030, 0.11, 0.16);

  // --- Salto sobre la presa -------------------------------------------------
  defs.push({
    name: 'Pounce',
    duration: 1.55,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const crouch = bump(u, 0.0, 0.42);
      const leap = ramp(u, 0.36, 0.56) * (1 - ramp(u, 0.78, 1.0));
      const land = ramp(u, 0.80, 0.97);
      for (const leg of LEGS) {
        const hind = !leg.front;
        const fold = crouch * (hind ? 0.75 : 0.5);
        const ext = leap * (hind ? -0.85 : -0.55);
        pose[`${leg.prefix}UpperLeg`] = [fold * 0.55 + (hind ? 0.5 : -0.3) * leap + land * 0.2, 0, 0];
        pose[`${leg.prefix}LowerLeg`] = [(hind ? -1 : 1) * (fold + Math.abs(ext) * 0.3 + land * 0.35), 0, 0];
        pose[`${leg.prefix}Foot`] = [-(hind ? -1 : 1) * fold * 0.5, 0, 0];
      }
      spinePose(pose, 0, -0.16 * crouch + 0.2 * leap - 0.1 * land);
      tailPose(pose, u, 0.05, 1, -0.3 * crouch + 0.35 * leap);
      pose.Neck = [0.12 * crouch - 0.18 * leap, 0, 0];
      pose.Head = [0.1 * crouch - 0.1 * leap, 0, 0];
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [
      0,
      H * (-0.085 * bump(u, 0, 0.42) + 0.22 * bump(u, 0.38, 0.86) - 0.05 * bump(u, 0.82, 1)),
      m.length * 0.30 * ramp(u, 0.40, 0.84),
    ],
  });

  // --- Zarpazo ---------------------------------------------------------------
  defs.push({
    name: 'Attack',
    duration: 1.15,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const rear = bump(u, 0.0, 0.55);
      const swipe = bump(u, 0.30, 0.78);
      for (const leg of LEGS) {
        if (!leg.front) {
          pose[`${leg.prefix}UpperLeg`] = [-0.12 * rear, 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [0.25 * rear, 0, 0];
        }
      }
      pose.RightFrontUpperLeg = [-1.05 * rear + 1.5 * swipe, 0, -0.35 * swipe];
      pose.RightFrontLowerLeg = [0.9 * rear - 0.7 * swipe, 0, 0];
      pose.RightFrontFoot = [-0.4 * rear + 0.5 * swipe, 0, 0];
      pose.LeftFrontUpperLeg = [-0.55 * rear, 0, 0.15 * rear];
      pose.LeftFrontLowerLeg = [0.5 * rear, 0, 0];
      spinePose(pose, -0.12 * swipe, -0.22 * rear);
      tailPose(pose, u, 0.22, 2, -0.2 * rear);
      pose.Neck = [0.16 * rear, -0.18 * swipe, 0];
      pose.Head = [0.1 * rear, -0.2 * swipe, 0];
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, H * 0.06 * bump(u, 0, 0.55), m.length * 0.05 * bump(u, 0.3, 0.8)],
  });

  // --- Mordisco ---------------------------------------------------------------
  defs.push({
    name: 'Bite',
    duration: 0.95,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const wind = bump(u, 0.0, 0.42);
      const lunge = bump(u, 0.34, 0.86);
      spinePose(pose, 0, 0.1 * wind - 0.14 * lunge);
      pose.Neck = [0.28 * wind - 0.42 * lunge, 0, 0];
      pose.Head = [0.2 * wind - 0.3 * lunge, 0, 0];
      tailPose(pose, u, 0.14, 2, -0.1);
      for (const leg of LEGS) {
        pose[`${leg.prefix}UpperLeg`] = [0.1 * lunge * (leg.front ? -1 : 1), 0, 0];
        pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 0.14 * lunge, 0, 0];
      }
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, 0, m.length * 0.07 * bump(u, 0.3, 0.9)],
  });

  // --- Impacto recibido --------------------------------------------------------
  defs.push({
    name: 'Hit',
    duration: 0.6,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const k = bump(u, 0, 1) * (1 - u * 0.35);
      spinePose(pose, 0.2 * k, 0.26 * k);
      pose.Neck = [-0.3 * k, 0.12 * k, 0];
      pose.Head = [-0.25 * k, 0.1 * k, 0];
      tailPose(pose, u, 0.3, 2, 0.2 * k);
      for (const leg of LEGS) {
        pose[`${leg.prefix}UpperLeg`] = [0.3 * k * (leg.front ? 1 : -1), 0, 0];
        pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 0.4 * k, 0, 0];
      }
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, -H * 0.03 * bump(u, 0, 1), -m.length * 0.05 * bump(u, 0, 0.8)],
  });

  // --- Muerte: las patas ceden y el cuerpo se desploma de costado -------------
  defs.push({
    name: 'Death',
    duration: 1.9,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const fall = ramp(u, 0.08, 0.62);
      const settle = ramp(u, 0.55, 1.0);
      spinePose(pose, 0.25 * fall, 0.3 * fall);
      pose.Hips = [0.3 * fall, 0.25 * fall, 0.9 * fall];
      pose.Neck = [0.5 * fall, 0.2 * fall, 0.3 * fall];
      pose.Head = [0.35 * fall + 0.15 * settle, 0, 0.2 * fall];
      tailPose(pose, u, 0.06 * (1 - fall), 1, 0.5 * fall);
      for (const leg of LEGS) {
        pose[`${leg.prefix}UpperLeg`] = [(leg.front ? 0.8 : -0.7) * fall, 0, leg.side * 0.35 * fall];
        pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 1.0 * fall, 0, 0];
        pose[`${leg.prefix}Foot`] = [-(leg.front ? 1 : -1) * 0.5 * fall, 0, 0];
      }
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, -H * 0.42 * ramp(u, 0.1, 0.72), 0],
  });

  // --- Sentado ------------------------------------------------------------------
  defs.push({
    name: 'Sit',
    duration: 1.6,
    loop: false,
    pose: (u) => {
      const pose: Pose = {};
      const k = ramp(u, 0.05, 0.62);
      spinePose(pose, 0, -0.30 * k);
      pose.Hips = [-0.42 * k, 0, 0];
      for (const leg of LEGS) {
        if (leg.front) {
          pose[`${leg.prefix}UpperLeg`] = [0.3 * k, 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [-0.1 * k, 0, 0];
        } else {
          pose[`${leg.prefix}UpperLeg`] = [0.95 * k, 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [-1.5 * k, 0, 0];
          pose[`${leg.prefix}Foot`] = [0.75 * k, 0, 0];
        }
      }
      tailPose(pose, u, 0.12, 0.6, 0.35 * k);
      pose.Neck = [-0.12 * k, 0, 0];
      wingsFolded(pose, rig);
      return pose;
    },
    root: (u) => [0, -H * 0.17 * ramp(u, 0.05, 0.62), -m.length * 0.04 * ramp(u, 0.05, 0.62)],
  });

  // --- Clips de alas -------------------------------------------------------------
  if (hasWings) {
    defs.push({
      name: 'Flap',
      duration: 0.9,
      loop: true,
      pose: (u) => {
        const pose: Pose = {};
        const a = Math.sin(TAU * u);
        const lag = Math.sin(TAU * (u - 0.1));
        wingPose(pose, rig, (side) => ({
          root: [0, 0, side * (0.45 * a)],
          hum: [0, 0, side * (0.75 * a)],
          rad: [0, side * 0.18 * (1 - lag) , side * (0.5 * lag)],
          hand: [0, side * 0.12 * (1 - lag), side * (0.35 * lag)],
          fin: [0, 0, side * (0.22 * lag)],
        }));
        spinePose(pose, 0, -0.05 * a);
        tailPose(pose, u, 0.08, 1, -0.1);
        for (const leg of LEGS) {
          pose[`${leg.prefix}UpperLeg`] = [0.25 * (leg.front ? -1 : 1), 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 0.55, 0, 0];
        }
        return pose;
      },
      root: (u) => [0, H * 0.03 * Math.sin(TAU * (u - 0.25)), 0],
    });

    defs.push({
      name: 'Glide',
      duration: 2.4,
      loop: true,
      pose: (u) => {
        const pose: Pose = {};
        const rip = 0.06 * Math.sin(TAU * u);
        wingPose(pose, rig, (side) => ({
          root: [0, 0, side * (0.10 + rip)],
          hum: [0, 0, side * (0.05 + rip * 0.7)],
          rad: [0, side * 0.05, side * rip * 0.5],
          hand: [0, 0, side * rip * 0.4],
          fin: [0, 0, side * rip * 0.3],
        }));
        tailPose(pose, u, 0.05, 0.5, -0.12);
        for (const leg of LEGS) {
          pose[`${leg.prefix}UpperLeg`] = [0.3 * (leg.front ? -1 : 1), 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * 0.6, 0, 0];
        }
        return pose;
      },
    });

    defs.push({
      name: 'Fold',
      duration: 1.0,
      loop: false,
      pose: (u) => {
        const pose: Pose = {};
        const k = ramp(u, 0.0, 0.85);
        wingPose(pose, rig, (side) => ({
          root: [0, 0, side * -1.05 * k],
          hum: [0, side * 0.5 * k, side * -0.55 * k],
          rad: [0, side * 1.15 * k, 0],
          hand: [0, side * 0.9 * k, 0],
          fin: [0, side * 0.5 * k, 0],
        }));
        tailPose(pose, u, 0.06, 0.6, 0);
        return pose;
      },
    });

    defs.push({
      name: 'TakeOff',
      duration: 1.3,
      loop: false,
      pose: (u) => {
        const pose: Pose = {};
        const crouch = bump(u, 0, 0.34);
        const beat = Math.sin(TAU * Math.max(0, (u - 0.26)) * 2.2);
        const open = ramp(u, 0.18, 0.46);
        wingPose(pose, rig, (side) => ({
          root: [0, 0, side * (-1.05 * (1 - open) + 0.55 * beat * open)],
          hum: [0, side * 0.5 * (1 - open), side * (-0.55 * (1 - open) + 0.85 * beat * open)],
          rad: [0, side * 1.15 * (1 - open), side * 0.4 * beat * open],
          hand: [0, side * 0.9 * (1 - open), side * 0.3 * beat * open],
          fin: [0, side * 0.5 * (1 - open), side * 0.2 * beat * open],
        }));
        const lift = ramp(u, 0.34, 0.92);
        for (const leg of LEGS) {
          pose[`${leg.prefix}UpperLeg`] = [0.6 * crouch + (leg.front ? -0.3 : 0.35) * lift, 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * (0.7 * crouch + 0.6 * lift), 0, 0];
        }
        spinePose(pose, 0, -0.2 * crouch + 0.12 * lift);
        tailPose(pose, u, 0.1, 1.5, -0.25 * lift);
        return pose;
      },
      root: (u) => [0, H * (-0.09 * bump(u, 0, 0.34) + 0.5 * ramp(u, 0.34, 1.0)), 0],
    });

    defs.push({
      name: 'Land',
      duration: 1.1,
      loop: false,
      pose: (u) => {
        const pose: Pose = {};
        const brake = bump(u, 0.0, 0.55);
        const close = ramp(u, 0.45, 1.0);
        wingPose(pose, rig, (side) => ({
          root: [0, 0, side * (0.9 * brake - 1.05 * close)],
          hum: [0, side * 0.5 * close, side * (1.0 * brake - 0.55 * close)],
          rad: [0, side * (0.3 * brake + 1.15 * close), 0],
          hand: [0, side * (0.2 * brake + 0.9 * close), 0],
          fin: [0, side * 0.5 * close, 0],
        }));
        const absorb = bump(u, 0.40, 0.92);
        for (const leg of LEGS) {
          pose[`${leg.prefix}UpperLeg`] = [(leg.front ? -0.5 : 0.45) * (1 - close) + 0.3 * absorb, 0, 0];
          pose[`${leg.prefix}LowerLeg`] = [(leg.front ? 1 : -1) * (0.8 * (1 - close) + 0.5 * absorb), 0, 0];
        }
        spinePose(pose, 0, 0.1 * brake - 0.12 * absorb);
        tailPose(pose, u, 0.12, 1.5, -0.2 * brake);
        return pose;
      },
      root: (u) => [0, H * (0.45 * (1 - ramp(u, 0.1, 0.62)) - 0.06 * bump(u, 0.55, 0.95)), 0],
    });
  }

  // --- Poses de referencia ---------------------------------------------------
  defs.push({
    name: 'RestPose',
    duration: 1.0,
    loop: false,
    pose: () => {
      const pose: Pose = {};
      for (const b of rig.bones) pose[b.name] = [0, 0, 0];
      return pose;
    },
  });

  return defs;
}

/**
 * Hornea los clips a `THREE.AnimationClip`. Solo se escriben pistas de los
 * huesos que el clip toca, y la traslación va sobre `Hips`, sumada a su
 * posición de reposo.
 */
export function createCreatureAnimationClips(
  rig: HumanRig,
  metrics: CreatureMetrics
): THREE.AnimationClip[] {
  const defs = buildClipDefs(rig, metrics);
  const hips = rig.bones.find((b) => b.name === 'Hips');
  const clips: THREE.AnimationClip[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  for (const def of defs) {
    const fps = def.fps ?? 24;
    const frames = Math.max(2, Math.round(def.duration * fps) + 1);
    const times = new Float32Array(frames);
    const perBone = new Map<string, number[]>();
    const rootPos: number[] = [];

    for (let f = 0; f < frames; f++) {
      const u = f / (frames - 1);
      times[f] = u * def.duration;
      const pose = def.pose(def.loop && f === frames - 1 ? 0 : u);
      for (const [bone, rot] of Object.entries(pose)) {
        if (!rig.bones.some((b) => b.name === bone)) continue;
        let arr = perBone.get(bone);
        if (!arr) { arr = []; perBone.set(bone, arr); }
        e.set(rot[0], rot[1], rot[2], 'XYZ');
        q.setFromEuler(e);
        arr.push(q.x, q.y, q.z, q.w);
      }
      if (def.root && hips) {
        const d = def.root(def.loop && f === frames - 1 ? 0 : u);
        rootPos.push(hips.head[0] + d[0], hips.head[1] + d[1], hips.head[2] + d[2]);
      }
    }

    const tracks: THREE.KeyframeTrack[] = [];
    for (const [bone, values] of perBone) {
      if (values.length !== frames * 4) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, Array.from(times), values));
    }
    if (rootPos.length === frames * 3) {
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position', Array.from(times), rootPos));
    }
    if (!tracks.length) continue;
    const clip = new THREE.AnimationClip(def.name, def.duration, tracks);
    clips.push(clip);
  }
  return clips;
}

export const CREATURE_ANIMATIONS = [
  { id: 'idle', clipName: 'Idle', label: 'Reposo (Idle)' },
  { id: 'walk', clipName: 'Walk', label: 'Paso (Walk)' },
  { id: 'trot', clipName: 'Trot', label: 'Trote (Trot)' },
  { id: 'run', clipName: 'Run', label: 'Galope (Run)' },
  { id: 'pounce', clipName: 'Pounce', label: 'Salto sobre la presa (Pounce)' },
  { id: 'attack', clipName: 'Attack', label: 'Zarpazo (Attack)' },
  { id: 'bite', clipName: 'Bite', label: 'Mordisco (Bite)' },
  { id: 'hit', clipName: 'Hit', label: 'Impacto (Hit)' },
  { id: 'death', clipName: 'Death', label: 'Muerte (Death)' },
  { id: 'sit', clipName: 'Sit', label: 'Sentado (Sit)' },
  { id: 'flap', clipName: 'Flap', label: 'Aletear (Flap)' },
  { id: 'glide', clipName: 'Glide', label: 'Planear (Glide)' },
  { id: 'fold', clipName: 'Fold', label: 'Plegar alas (Fold)' },
  { id: 'take_off', clipName: 'TakeOff', label: 'Despegue (TakeOff)' },
  { id: 'land', clipName: 'Land', label: 'Aterrizaje (Land)' },
] as const;
