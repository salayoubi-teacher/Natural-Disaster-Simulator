import * as THREE from 'three';

export const state: any = {
    scene: null, camera: null, renderer: null, controls: null,
    tableMesh: null, tablePos: new THREE.Vector3(0, -0.5, 0),
    activeLayer: 0, GRID_SIZE: 2, placementPlane: null, gridHelper: null,
    nodes: [], beams: [], panels: [], shapes: [], foundations: new Map(),
    mode: 'shape', currentJointLevel: 2, currentFrameMaterial: 'wood', currentPanelMaterial: 'cement',
    placingBeamStart: null, placingPanelNodes: [], nextId: 1,
    massSprite: null, currentHoveredMass: null,
    windLines: null, WIND_COUNT: 800, waterMesh: null, currentWaterLevel: -2.0,
    tsunamiState: { waves: [], spawned: 0, timer: 0, targetCount: 0, freq: 0, height: 0, strength: 0 },
    meteorState: { meteors: [], scorchMarks: [], explosionLights: [], smokeParticles: [], count: 10, size: 1.0, timer: 0, spawned: 0, spawnRate: 0.5, activeQuake: 0 },
    MAX_SPLASHES: 3000, splashPoints: null, splashLife: new Float32Array(3000), splashPos: new Float32Array(3000 * 3), splashVel: new Float32Array(3000 * 3), splashCount: 0,
    tornadoState: { x: 0, z: 0, vx: 0, baseZ: 0, wobblePhase: 0, efScale: 0 }, tornadoMesh: null, TORNADO_PARTICLES: 5000, tornadoLifes: new Float32Array(5000),
    simActive: false, simPaused: false, simMode: 'none', shakeTime: 0, settleFrames: 0,
    elapsedSimTime: 0, targetSimTime: 15, isInfiniteSim: false, totalInitialMass: 0, lastFrameTime: 0, physicsAccumulator: 0,
    raycaster: new THREE.Raycaster(), mouse: new THREE.Vector2(), ghostNode: null, tempLine: null, ghostShapeGroup: null, pointerDownCoords: { x: 0, y: 0 }, lastMouseEvent: { clientX: 0, clientY: 0 },
    foundationDragStart: null,
    isRightClicking: false, moveKeys: { w: false, a: false, s: false, d: false },
    globalJointStrengthMultiplier: 1.0, globalMaterialStrengthMultiplier: 1.0,
    sunLight: null, sunLightIntensity: 1.0, sunLightEnabled: true, sunShadowsEnabled: true,
    maxPeakHeight: 0,
    undoStack: [], redoStack: [], currentAction: null,
    
    // Callbacks to UI
    updateUndoRedoUI: () => {},
    showMessage: (msg: string) => {},
    updateLayerUI: () => {},
    updateTrussUI: () => {},
    updateGhostShape: () => {},
    onMouseMove: (e: any) => {},
};

export const MAT_PROPS: any = {
    wood: { color: 0x5c4033, radius: 0.15, massMulti: 1.0, stiffness: 0.5, breakLimit: 0.36, roughness: 0.9, metalness: 0.0, panelOpacity: 0.95 },
    cement: { color: 0xe5e5e5, radius: 0.20, massMulti: 4.0, stiffness: 0.98, breakLimit: 0.03, roughness: 1.0, metalness: 0.0, panelOpacity: 1.0 },
    steel: { color: 0x374151, radius: 0.20, massMulti: 13.0, stiffness: 0.95, breakLimit: 0.09, roughness: 0.7, metalness: 0.5, panelOpacity: 0.98 },
    weight: { color: 0x1e3a8a, radius: 0.25, massMulti: 10.0, stiffness: 0.99, breakLimit: 1.5, roughness: 0.4, metalness: 0.6, panelOpacity: 1.0 }
};

export const JOINT_PROPS: any = {
    1: { name: 'Nailed', color: 0x94a3b8, radius: 0.18, breakLimit: 0.12 }, 
    2: { name: 'Bolted', color: 0xd97706, radius: 0.22, breakLimit: 0.48 }, 
    3: { name: 'Welded', color: 0x2563eb, radius: 0.28, breakLimit: 1.50 },
    4: { name: 'Anchor', color: 0xef4444, radius: 0.35, breakLimit: 999999 }  
};
