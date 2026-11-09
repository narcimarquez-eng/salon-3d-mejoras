import * as THREE from 'three';

/**
 * Genera proceduralmente un enemigo de videojuego optimizado ("Gólem Abisal Low-Poly")
 * compuesto por 16 partes jerárquicas bien definidas y colores vibrantes de alto contraste (~5,400 triángulos).
 * Diseñado específicamente para que sus detalles anatómicos (pectorales, crestas, hombreras, garras y núcleo)
 * se distingan con máxima claridad al esculpir, suavizar normales o ejecutar scripts Python.
 */
export function createLowPolyEnemyFallback(): THREE.Group {
  const enemyGroup = new THREE.Group();
  enemyGroup.name = 'Golem_Enemigo_LowPoly';

  // Materiales con alto contraste luminoso para que nunca se vea oscuro ni plano
  const armorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e11d48'), // Carmesí Coral Intenso
    roughness: 0.38,
    metalness: 0.18,
  });

  const carapaceMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#475569'), // Acero Azulado Claro
    roughness: 0.52,
    metalness: 0.25,
  });

  const hornMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fbbf24'), // Oro / Marfil Cálido
    roughness: 0.28,
    metalness: 0.12,
  });

  const coreEyeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#38bdf8'),
    emissive: new THREE.Color('#0ea5e9'),
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });

  // 1. Torso Anatómico Musculado (Icosaedro subdividido con relieve pectoral y abdominal)
  const torsoGeo = new THREE.IcosahedronGeometry(1.02, 3);
  const torsoPos = torsoGeo.attributes.position;
  for (let i = 0; i < torsoPos.count; i++) {
    let x = torsoPos.getX(i);
    let y = torsoPos.getY(i);
    let z = torsoPos.getZ(i);
    const chestScale = y > 0 ? 1.24 : 0.86;
    x *= chestScale;
    z *= 0.92;
    // Pliegues pectorales y costillas marcadas para que SSAO y el pincel de escultura resalten
    const ripple = Math.sin(y * 6.5) * 0.055 + Math.cos(x * 5.2) * 0.042;
    x += x * ripple;
    z += z * ripple;
    torsoPos.setXYZ(i, x, y, z);
  }
  const torsoMesh = new THREE.Mesh(torsoGeo, armorMat);
  torsoMesh.name = 'Torso_Principal';
  torsoMesh.position.set(0, 1.42, 0);
  enemyGroup.add(torsoMesh);

  // 2. Núcleo Energético Pectoral (Aro blindado + Cristal luminoso en el pecho)
  const chestRingGeo = new THREE.TorusGeometry(0.28, 0.065, 10, 24);
  const chestRingMesh = new THREE.Mesh(chestRingGeo, hornMat);
  chestRingMesh.position.set(0, 1.56, 0.86);
  enemyGroup.add(chestRingMesh);

  const chestCoreGeo = new THREE.OctahedronGeometry(0.22, 2);
  const chestCoreMesh = new THREE.Mesh(chestCoreGeo, coreEyeMat);
  chestCoreMesh.position.set(0, 1.56, 0.88);
  enemyGroup.add(chestCoreMesh);

  // 3. Cabeza / Casco Acorazado con Mandíbula
  const headGeo = new THREE.DodecahedronGeometry(0.56, 2);
  headGeo.scale(1.08, 0.95, 1.18);
  const headMesh = new THREE.Mesh(headGeo, carapaceMat);
  headMesh.name = 'Cabeza_Casco';
  headMesh.position.set(0, 2.48, 0.2);
  enemyGroup.add(headMesh);

  const jawGeo = new THREE.BoxGeometry(0.68, 0.28, 0.58, 3, 2, 3);
  const jawMesh = new THREE.Mesh(jawGeo, armorMat);
  jawMesh.position.set(0, 2.15, 0.34);
  enemyGroup.add(jawMesh);

  // 4. Ojo Cíclope Energético Superior
  const eyeSocketGeo = new THREE.TorusGeometry(0.22, 0.065, 10, 20);
  const eyeSocketMesh = new THREE.Mesh(eyeSocketGeo, hornMat);
  eyeSocketMesh.position.set(0, 2.52, 0.72);
  enemyGroup.add(eyeSocketMesh);

  const eyeCoreGeo = new THREE.IcosahedronGeometry(0.17, 2);
  const eyeCoreMesh = new THREE.Mesh(eyeCoreGeo, coreEyeMat);
  eyeCoreMesh.position.set(0, 2.52, 0.75);
  enemyGroup.add(eyeCoreMesh);

  // 5 & 6. Cuernos Curvos Grandes Laterales
  const hornGeo = new THREE.ConeGeometry(0.21, 0.96, 10, 5);
  const posH = hornGeo.attributes.position;
  for (let i = 0; i < posH.count; i++) {
    const hy = posH.getY(i);
    posH.setZ(i, posH.getZ(i) + Math.pow((hy + 0.45) * 0.85, 2) * 0.38);
  }

  const leftHorn = new THREE.Mesh(hornGeo.clone(), hornMat);
  leftHorn.position.set(-0.56, 2.84, 0.16);
  leftHorn.rotation.z = 0.48;
  leftHorn.rotation.x = 0.22;
  enemyGroup.add(leftHorn);

  const rightHorn = new THREE.Mesh(hornGeo.clone(), hornMat);
  rightHorn.position.set(0.56, 2.84, 0.16);
  rightHorn.rotation.z = -0.48;
  rightHorn.rotation.x = 0.22;
  enemyGroup.add(rightHorn);

  // 7 & 8. Hombreras Colosales con Púas (Pauldrons)
  const shoulderGeo = new THREE.IcosahedronGeometry(0.64, 2);
  shoulderGeo.scale(1.22, 0.88, 1.05);

  const leftShoulder = new THREE.Mesh(shoulderGeo.clone(), armorMat);
  leftShoulder.position.set(-1.26, 1.96, 0);
  leftShoulder.rotation.z = 0.32;
  enemyGroup.add(leftShoulder);

  const rightShoulder = new THREE.Mesh(shoulderGeo.clone(), armorMat);
  rightShoulder.position.set(1.26, 1.96, 0);
  rightShoulder.rotation.z = -0.32;
  enemyGroup.add(rightShoulder);

  // Púas sobre las hombreras
  const spikeGeo = new THREE.ConeGeometry(0.14, 0.48, 8, 2);
  const leftSpike = new THREE.Mesh(spikeGeo.clone(), hornMat);
  leftSpike.position.set(-1.55, 2.38, 0);
  leftSpike.rotation.z = 0.55;
  enemyGroup.add(leftSpike);

  const rightSpike = new THREE.Mesh(spikeGeo.clone(), hornMat);
  rightSpike.position.set(1.55, 2.38, 0);
  rightSpike.rotation.z = -0.55;
  enemyGroup.add(rightSpike);

  // 9 & 10. Brazos y Guanteletes Pesados
  const armGeo = new THREE.CapsuleGeometry(0.38, 0.82, 6, 12);
  const leftArm = new THREE.Mesh(armGeo.clone(), carapaceMat);
  leftArm.position.set(-1.46, 1.08, 0.22);
  leftArm.rotation.z = 0.16;
  leftArm.rotation.x = -0.38;
  enemyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo.clone(), carapaceMat);
  rightArm.position.set(1.46, 1.08, 0.22);
  rightArm.rotation.z = -0.16;
  rightArm.rotation.x = -0.38;
  enemyGroup.add(rightArm);

  // 11. Cinturón Acorazado
  const beltGeo = new THREE.CylinderGeometry(0.78, 0.86, 0.32, 14, 2);
  const beltMesh = new THREE.Mesh(beltGeo, hornMat);
  beltMesh.position.set(0, 0.78, 0);
  enemyGroup.add(beltMesh);

  // 12 & 13. Piernas / Grebas Acorazadas apoyadas en Y = 0
  const legGeo = new THREE.CylinderGeometry(0.36, 0.46, 0.88, 12, 4);
  const leftLeg = new THREE.Mesh(legGeo.clone(), carapaceMat);
  leftLeg.position.set(-0.52, 0.44, 0);
  enemyGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo.clone(), carapaceMat);
  rightLeg.position.set(0.52, 0.44, 0);
  enemyGroup.add(rightLeg);

  // 14. Cresta Dorsal de Placas Óseas en la Espalda
  for (let i = 0; i < 4; i++) {
    const spineGeo = new THREE.ConeGeometry(0.18 - i * 0.02, 0.54 - i * 0.05, 8, 2);
    const spineMesh = new THREE.Mesh(spineGeo, hornMat);
    spineMesh.position.set(0, 2.12 - i * 0.36, -0.84 + i * 0.06);
    spineMesh.rotation.x = -1.15;
    enemyGroup.add(spineMesh);
  }

  return enemyGroup;
}
