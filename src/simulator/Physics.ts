import * as THREE from 'three';
import { state, MAT_PROPS, JOINT_PROPS } from './State';
import { checkFoundation } from './Builder';

export function spawnTsunamiWave(height: number, strength: number) {
    let geo = new THREE.PlaneGeometry(80, height, 32, 16);
    let pos = geo.attributes.position;
    for (let i=0; i<pos.count; i++) {
        let y = pos.getY(i); 
        let ny = (y / height) + 0.5; 
        let curl = Math.sin(ny * Math.PI) * (height * 0.4); 
        pos.setZ(i, curl);
    }
    geo.computeVertexNormals();
    let mat = new THREE.MeshStandardMaterial({ 
        color: 0x0ea5e9, transparent: true, opacity: 0.85, 
        roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide 
    });
    let mesh = new THREE.Mesh(geo, mat);
    
    let startZ = -50;
    mesh.position.set(0, state.currentWaterLevel + height/2, startZ);
    state.scene.add(mesh);
    
    state.tsunamiState.waves.push({
        mesh: mesh,
        z: startZ,
        speed: 10 + strength * 4.0, 
        height: height,
        strength: strength,
        hitNodes: new Set()
    });
}

export function spawnMeteor(size: number) {
    let radius = size * (0.5 + Math.random() * 1.5);
    let geo = new THREE.DodecahedronGeometry(radius, 1);
    let mat = new THREE.MeshStandardMaterial({
        color: 0x444444,
        emissive: 0xff4400,
        emissiveIntensity: 0.5,
        roughness: 0.9,
        metalness: 0.1
    });
    let mesh = new THREE.Mesh(geo, mat);
    
    let startX = (Math.random() - 0.5) * 60;
    let startZ = (Math.random() - 0.5) * 60;
    let startY = 60 + Math.random() * 20;
    
    mesh.position.set(startX, startY, startZ);
    
    let light = new THREE.PointLight(0xffaa00, 2, 50);
    mesh.add(light);
    
    state.scene.add(mesh);
    
    // Trail
    let trailGeo = new THREE.BufferGeometry();
    let trailPos = new Float32Array(30 * 3);
    for(let i=0; i<30; i++) {
        trailPos[i*3] = startX;
        trailPos[i*3+1] = startY;
        trailPos[i*3+2] = startZ;
    }
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    let trailMat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8, linewidth: 2 });
    let trail = new THREE.Line(trailGeo, trailMat);
    state.scene.add(trail);

    let targetX = (Math.random() - 0.5) * 30;
    let targetZ = (Math.random() - 0.5) * 30;
    
    let dx = targetX - startX;
    let dy = 0 - startY;
    let dz = targetZ - startZ;
    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    let speed = 40 + Math.random() * 20;
    
    state.meteorState.meteors.push({
        mesh: mesh,
        trail: trail,
        trailPos: trailPos,
        trailIdx: 0,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        vz: (dz / dist) * speed,
        radius: radius,
        active: true
    });
}

export function startSimulation(mode: string) {
    if (state.nodes.length === 0) return state.showMessage("Build something first!");
    
    state.simMode = mode;
    state.simActive = true;
    state.simPaused = false;
    state.maxPeakHeight = 0;
    const peakEl = document.getElementById('peakHeightDisplay');
    if (peakEl) peakEl.innerText = '0.0m';
    
    const startControls = document.getElementById('sim-controls-start');
    if (startControls) startControls.classList.add('hidden');
    
    let activeControls = document.getElementById('sim-controls-active');
    if (activeControls) {
        activeControls.classList.remove('hidden');
        activeControls.classList.add('flex');
    }
    
    let pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
        pauseBtn.innerHTML = '⏸️ Pause';
        pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-500');
        pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-500');
    }

    if(state.massSprite) state.massSprite.visible = false;
    
    if (state.ghostNode) state.ghostNode.visible = false;
    if (state.gridHelper) state.gridHelper.visible = false;
    if (state.ghostShapeGroup) state.ghostShapeGroup.visible = false;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.add('opacity-50', 'pointer-events-none'));
    state.updateUndoRedoUI(); 

    startPhysics();
} 

export function stopSimulation() {
    state.simMode = 'none';
    state.simActive = false;
    state.simPaused = false;
    
    const startControls = document.getElementById('sim-controls-start');
    if (startControls) startControls.classList.remove('hidden');
    
    let activeControls = document.getElementById('sim-controls-active');
    if (activeControls) {
        activeControls.classList.add('hidden');
        activeControls.classList.remove('flex');
    }
    
    if (state.windLines) state.windLines.visible = false;
    if (state.waterMesh) state.waterMesh.visible = false;
    if (state.tornadoMesh) state.tornadoMesh.visible = false;
    
    if (state.tsunamiState && state.tsunamiState.waves) {
        state.tsunamiState.waves.forEach((w: any) => {
            state.scene.remove(w.mesh);
            w.mesh.geometry.dispose();
            w.mesh.material.dispose();
        });
    }
    if (state.meteorState) {
        if (state.meteorState.meteors) {
            state.meteorState.meteors.forEach((m: any) => {
                state.scene.remove(m.mesh);
                if (m.trail) state.scene.remove(m.trail);
            });
        }
        if (state.meteorState.scorchMarks) {
            state.meteorState.scorchMarks.forEach((s: any) => {
                state.tableMesh?.remove(s);
            });
        }
        if (state.meteorState.explosionLights) {
            state.meteorState.explosionLights.forEach((l: any) => {
                state.scene.remove(l);
            });
        }
        if (state.meteorState.smokeParticles) {
            state.meteorState.smokeParticles.forEach((p: any) => {
                state.scene.remove(p.mesh);
                p.mesh.material.dispose();
                p.mesh.geometry.dispose();
            });
        }
        state.meteorState.meteors = [];
        state.meteorState.scorchMarks = [];
        state.meteorState.explosionLights = [];
        state.meteorState.smokeParticles = [];
    }
    for(let i=0; i<state.MAX_SPLASHES; i++) {
        state.splashLife[i] = -1;
        if (state.splashPoints) state.splashPoints.geometry.attributes.position.array[i*3+1] = -999;
    }
    if (state.splashPoints) state.splashPoints.geometry.attributes.position.needsUpdate = true;

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('opacity-50', 'pointer-events-none'));
    
    // Reset mode UI
    const modeBtn = document.getElementById('btn-' + state.mode);
    if (modeBtn) modeBtn.classList.add('active');
    
    stopPhysics();
    state.updateUndoRedoUI(); 
}

export function togglePause() {
    state.simPaused = !state.simPaused;
    let pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
        if (state.simPaused) {
            pauseBtn.innerHTML = '▶️ Resume';
            pauseBtn.classList.remove('bg-yellow-600', 'hover:bg-yellow-500');
            pauseBtn.classList.add('bg-green-600', 'hover:bg-green-500');
        } else {
            pauseBtn.innerHTML = '⏸️ Pause';
            pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-500');
            pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-500');
        }
    }
}

function startPhysics() {
    state.shakeTime = 0; state.settleFrames = 0; state.tablePos.set(0, -0.5, 0);
    (window as any).currentMagnitude = 0;
    (window as any).targetMagnitude = 0;
    state.currentWaterLevel = -2.0;
    
    if (state.tsunamiState && state.tsunamiState.waves) {
        state.tsunamiState.waves.forEach((w: any) => { state.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); });
    }
    if (state.meteorState) {
        if (state.meteorState.meteors) {
            state.meteorState.meteors.forEach((m: any) => {
                state.scene.remove(m.mesh);
                if (m.trail) state.scene.remove(m.trail);
            });
        }
        if (state.meteorState.scorchMarks) {
            state.meteorState.scorchMarks.forEach((s: any) => {
                state.tableMesh?.remove(s);
            });
        }
        if (state.meteorState.explosionLights) {
            state.meteorState.explosionLights.forEach((l: any) => {
                state.scene.remove(l);
            });
        }
        if (state.meteorState.smokeParticles) {
            state.meteorState.smokeParticles.forEach((p: any) => {
                state.scene.remove(p.mesh);
                p.mesh.material.dispose();
                p.mesh.geometry.dispose();
            });
        }
        state.meteorState.meteors = [];
        state.meteorState.scorchMarks = [];
        state.meteorState.explosionLights = [];
        state.meteorState.smokeParticles = [];
    }
    for(let i=0; i<state.MAX_SPLASHES; i++) {
        state.splashLife[i] = -1;
        if (state.splashPoints) state.splashPoints.geometry.attributes.position.array[i*3+1] = -999;
    }
    if (state.splashPoints) state.splashPoints.geometry.attributes.position.needsUpdate = true;

    if (state.simMode === 'hurricane') {
        if (state.windLines) state.windLines.visible = false;
        if (state.waterMesh) state.waterMesh.visible = false;
        if (state.tornadoMesh) state.tornadoMesh.visible = false;
    } else if (state.simMode === 'tsunami') {
        if (state.windLines) state.windLines.visible = false;
        if (state.tornadoMesh) state.tornadoMesh.visible = false;
        if (state.waterMesh) {
            state.waterMesh.visible = true;
            state.waterMesh.position.y = -2.0;
        }
        if (state.splashPoints) {
            (state.splashPoints.material as THREE.PointsMaterial).color.setHex(0xffffff);
        }
        
        const countEl = document.getElementById('tsunami-count-num') as HTMLInputElement;
        const freqEl = document.getElementById('tsunami-freq-num') as HTMLInputElement;
        const heightEl = document.getElementById('tsunami-height') as HTMLInputElement;
        const strEl = document.getElementById('tsunami-str') as HTMLInputElement;
        
        state.tsunamiState = {
            waves: [],
            spawned: 0,
            timer: 0,
            targetCount: countEl ? parseInt(countEl.value) : 3,
            freq: freqEl ? parseFloat(freqEl.value) : 4.0,
            height: heightEl ? parseFloat(heightEl.value) : 12,
            strength: strEl ? parseFloat(strEl.value) : 6.0
        };
    } else if (state.simMode === 'tornado') {
        if (state.windLines) state.windLines.visible = false;
        if (state.waterMesh) state.waterMesh.visible = false;
        if (state.tornadoMesh) {
            state.tornadoMesh.visible = false;
            let tPositions = state.tornadoMesh.geometry.attributes.position.array;
            for(let i=0; i<state.TORNADO_PARTICLES; i++) tPositions[i*3+1] = 999;
            state.tornadoMesh.geometry.attributes.position.needsUpdate = true;
        }
        
        const infEl = document.getElementById('sim-infinite') as HTMLInputElement;
        const durEl = document.getElementById('sim-duration') as HTMLInputElement;
        const efEl = document.getElementById('tornado-ef-num') as HTMLInputElement;
        
        let tTime = (infEl && infEl.checked) ? 20 : (durEl ? parseFloat(durEl.value) : 15);

        state.tornadoState.efScale = efEl ? parseInt(efEl.value) : 3;
        state.tornadoState.x = -35; 
        state.tornadoState.baseZ = (Math.random() - 0.5) * 15; 
        state.tornadoState.z = state.tornadoState.baseZ;
        state.tornadoState.vx = 70.0 / Math.max(1, tTime); 
        state.tornadoState.wobblePhase = 0;
    } else if (state.simMode === 'meteor') {
        if (state.windLines) state.windLines.visible = false;
        if (state.waterMesh) state.waterMesh.visible = false;
        if (state.tornadoMesh) state.tornadoMesh.visible = false;
        if (state.splashPoints) {
            (state.splashPoints.material as THREE.PointsMaterial).color.setHex(0xffaa00);
        }
        
        const countEl = document.getElementById('meteor-count') as HTMLInputElement;
        const sizeEl = document.getElementById('meteor-size') as HTMLInputElement;
        const durEl = document.getElementById('sim-duration') as HTMLInputElement;
        
        let count = countEl ? parseInt(countEl.value) : 10;
        let size = sizeEl ? parseFloat(sizeEl.value) : 1.5;
        let tTime = durEl ? parseFloat(durEl.value) : 15;
        
        state.meteorState = {
            meteors: [],
            scorchMarks: [],
            explosionLights: [],
            smokeParticles: [],
            count: count,
            size: size,
            timer: 0,
            spawned: 0,
            spawnRate: tTime / Math.max(1, count),
            activeQuake: 0
        };
    } else {
        if (state.windLines) state.windLines.visible = false;
        if (state.waterMesh) state.waterMesh.visible = false;
        if (state.tornadoMesh) state.tornadoMesh.visible = false;
    }

    state.elapsedSimTime = 0;
    (window as any).lastDt = null; 
    state.physicsAccumulator = 0;
    state.lastFrameTime = performance.now();
    
    const infEl = document.getElementById('sim-infinite') as HTMLInputElement;
    const durEl = document.getElementById('sim-duration') as HTMLInputElement;
    
    state.isInfiniteSim = infEl ? infEl.checked : false;
    state.targetSimTime = durEl ? parseFloat(durEl.value) : 15;
    state.totalInitialMass = 0;

    state.nodes.forEach((n: any) => { 
        n.mass = 1.0; 
        n.originalPos.copy(n.designPos);
        n.pos.copy(n.designPos); 
        n.oldPos.copy(n.designPos); 
        n.broken = false;
        n.isFixed = n.originalIsFixed;
        n.maxStrain = 0;
        n.connectedNodes = new Set(); 
        
        if (n.originalIsFixed) {
            n.hasFoundation = checkFoundation(n.originalPos.x, n.originalPos.z);
        }
    });

    state.panels.forEach((p: any) => {
        p.broken = false; p.mesh.visible = true; 
        p.mesh.position.set(0,0,0); p.mesh.rotation.set(0,0,0); 

        if (p.isWeight) {
            p.mesh.material.transparent = true;
            p.mesh.material.depthWrite = true;
            p.mesh.material.opacity = 1.0;
            p.mesh.material.color.setHex(0xffffff);
            let massToAdd = p.mass * 5.0; 
            p.nodes.forEach((n: any) => n.mass += massToAdd / p.nodes.length);
            state.totalInitialMass += p.mass;
        } else {
            let props = MAT_PROPS[p.material];
            p.mesh.material.transparent = p.massText ? true : false;
            p.mesh.material.depthWrite = true;
            p.mesh.material.opacity = props.panelOpacity || 1.0;
            p.mesh.material.color.setHex(p.massText ? 0xffffff : props.color);
            let massToAdd = (state.GRID_SIZE * state.GRID_SIZE) * 2.0 * props.massMulti; 
            p.nodes.forEach((n: any) => n.mass += massToAdd / p.nodes.length);
            state.totalInitialMass += (state.GRID_SIZE * state.GRID_SIZE) * 2.0 * props.massMulti;
        }
    });

    state.beams.forEach((b: any) => {
        b.broken = false;
        
        b.n1.connectedNodes.add(b.n2);
        b.n2.connectedNodes.add(b.n1);

        if (!b.isHidden) {
            let props = MAT_PROPS[b.material];
            b.mesh.visible = true; 
            b.mesh.material.transparent = false;
            b.mesh.material.depthWrite = true;
            b.mesh.material.opacity = 1.0; 
            b.mesh.material.color.setHex(props.color);
            let massToAdd = b.originalDist * props.massMulti;
            b.n1.mass += massToAdd / 2; b.n2.mass += massToAdd / 2;
            state.totalInitialMass += massToAdd;
        }
    });

    let visited = new Set();
    state.nodes.forEach((n: any) => {
        if (!visited.has(n)) {
            let compMass = 0;
            let groundNodes: any[] = [];
            let queue = [n];
            visited.add(n);
            
            while(queue.length > 0) {
                let curr = queue.shift();
                compMass += curr.mass;
                if (curr.originalIsFixed && curr.originalPos.y === 0) groundNodes.push(curr);
                
                curr.connectedNodes.forEach((adj: any) => {
                    if (!visited.has(adj)) {
                        visited.add(adj);
                        queue.push(adj);
                    }
                });
            }

            if (groundNodes.length > 0) {
                let loadPerNode = compMass / groundNodes.length;
                groundNodes.forEach(gn => {
                    if (!gn.tiltBias) gn.tiltBias = 0.8 + Math.random() * 0.4; 
                    gn.liquefactionLoad = loadPerNode * gn.tiltBias;
                });
            }
        }
    });

    const intactEl = document.getElementById('intactMassDisplay');
    const destEl = document.getElementById('destroyedMassDisplay');
    const timeEl = document.getElementById('timeDisplay');
    
    if (intactEl) intactEl.innerText = state.totalInitialMass.toFixed(1) + 't';
    if (destEl) destEl.innerText = '0.0t';
    
    let timeStr = state.isInfiniteSim ? `0.0s / ∞` : `0.0s / ${state.targetSimTime.toFixed(1)}s`;
    if (timeEl) timeEl.innerText = timeStr;
}

function stopPhysics() {
    state.tablePos.set(0, -0.5, 0); state.tableMesh.position.copy(state.tablePos);
    
    state.foundations.forEach((f: any) => {
        f.mesh.position.x = f.x + state.GRID_SIZE/2;
        f.mesh.position.z = f.z + state.GRID_SIZE/2;
    });

    state.nodes.forEach((n: any) => { 
        n.originalPos.copy(n.designPos);
        n.pos.copy(n.designPos); 
        n.oldPos.copy(n.designPos); 
        n.mesh.position.copy(n.pos); 
        n.broken = false;
        n.isFixed = n.originalIsFixed;
        n.maxStrain = 0;
        n.mesh.material.color.setHex(JOINT_PROPS[n.level].color);
        
        n.mesh.material.transparent = false;
        n.mesh.material.depthWrite = true;
        n.mesh.material.opacity = 1.0;
        n.mesh.visible = true;
    });
    
    state.beams.forEach((b: any) => {
        b.broken = false;
        if (!b.isHidden) {
            b.mesh.visible = true; 
            b.mesh.material.transparent = false;
            b.mesh.material.depthWrite = true;
            b.mesh.material.opacity = 1.0;
            b.mesh.position.copy(b.n1.pos).lerp(b.n2.pos, 0.5); b.mesh.lookAt(b.n2.pos);
            b.mesh.scale.set(1, 1, b.originalDist);
            b.mesh.material.color.setHex(MAT_PROPS[b.material].color);
        }
    });

    state.panels.forEach((p: any) => {
        p.broken = false; p.mesh.visible = true; 
        p.mesh.position.set(0,0,0); p.mesh.rotation.set(0,0,0); 

        if (p.isWeight) {
            p.mesh.material.transparent = true;
            p.mesh.material.depthWrite = true;
            p.mesh.material.opacity = 1.0;
            p.mesh.material.color.setHex(0xffffff);
        } else {
            let props = MAT_PROPS[p.material];
            p.mesh.material.transparent = p.massText ? true : false;
            p.mesh.material.depthWrite = true;
            p.mesh.material.opacity = props.panelOpacity || 1.0;
            p.mesh.material.color.setHex(p.massText ? 0xffffff : props.color);
        }

        const posAttr = p.mesh.geometry.attributes.position;
        for(let i=0; i<p.nodes.length; i++) {
            posAttr.array[i*3] = p.nodes[i].originalPos.x; posAttr.array[i*3+1] = p.nodes[i].originalPos.y; posAttr.array[i*3+2] = p.nodes[i].originalPos.z;
        }
        posAttr.needsUpdate = true;
    });
    
    const heightEl = document.getElementById('heightDisplay');
    if (heightEl) heightEl.innerText = '0.0m';
}

export function stepVerletPhysics(dt: number) {
    if (!(window as any).lastDt) (window as any).lastDt = dt;
    let dtRatio = dt / (window as any).lastDt;
    (window as any).lastDt = dt;

    state.settleFrames++; 
    let dx = 0, dz = 0;
    let windAccelX = 0, windAccelZ = 0;
    let hurricaneCat = 0;

    if (state.settleFrames > 60) {
        if (state.simMode === 'quake') {
            const intEl = document.getElementById('intensity') as HTMLInputElement;
            (window as any).targetMagnitude = intEl ? parseFloat(intEl.value) : 5.0;
            if (typeof (window as any).currentMagnitude === 'undefined') (window as any).currentMagnitude = 0;
            (window as any).currentMagnitude += ((window as any).targetMagnitude - (window as any).currentMagnitude) * 0.02; 
            
            let amplitude = 0.2 + Math.pow(1.5, (window as any).currentMagnitude - 5) * 0.8; 
            let frequency = Math.pow(1.2, (window as any).currentMagnitude - 5); 
            state.shakeTime += dt * frequency;
            
            dx = Math.sin(state.shakeTime * 2.5) * 0.75 + Math.sin(state.shakeTime * 7.1) * 0.40;
            dz = Math.cos(state.shakeTime * 1.8) * 0.60 + Math.cos(state.shakeTime * 5.9) * 0.30;
            
            let jolt = Math.max(0, (window as any).currentMagnitude - 5) * 0.15;
            dx += Math.sin(state.shakeTime * 18.0) * jolt;
            dz += Math.cos(state.shakeTime * 21.0) * jolt;

            dx *= amplitude; dz *= amplitude;
        }
        else if (state.simMode === 'hurricane') {
            const hurEl = document.getElementById('hurricane-num') as HTMLInputElement;
            hurricaneCat = hurEl ? parseInt(hurEl.value) : 3;
            
            let baseWind = Math.pow(hurricaneCat, 1.8) * 4.0 + 10.0; 
            let gustMultiplier = Math.pow(hurricaneCat, 1.5) * 5.0;
            
            state.shakeTime += dt;
            let gustX = Math.sin(state.shakeTime * 2.5) * gustMultiplier + Math.sin(state.shakeTime * 5.1) * (gustMultiplier * 0.5);
            
            windAccelX = baseWind + Math.max(0, gustX); 
            windAccelZ = Math.sin(state.shakeTime * 1.5) * (baseWind * 0.3); 
        }
        else if (state.simMode === 'tsunami') {
            let riseTime = state.isInfiniteSim ? 30 : state.targetSimTime * 0.8;
            (window as any).riseProgress = Math.min(1.0, state.elapsedSimTime / Math.max(0.1, riseTime));
            state.currentWaterLevel = -2.0 + (state.tsunamiState.height + 2.0) * (window as any).riseProgress;

            state.tsunamiState.timer -= dt;
            if (state.tsunamiState.timer <= 0 && state.tsunamiState.spawned < state.tsunamiState.targetCount) {
                spawnTsunamiWave(state.tsunamiState.height, state.tsunamiState.strength);
                state.tsunamiState.spawned++;
                state.tsunamiState.timer = state.tsunamiState.freq;
            }
        }
        else if (state.simMode === 'tornado') {
            state.tornadoState.wobblePhase += dt * (1.0 + state.tornadoState.efScale * 0.2); 
            state.tornadoState.x += state.tornadoState.vx * dt; 
            
            let wobble = Math.sin(state.tornadoState.wobblePhase * 1.5) * 10.0 + 
                         Math.cos(state.tornadoState.wobblePhase * 3.1) * 5.0;
            let erraticNoise = (Math.random() - 0.5) * 3.0;
            
            state.tornadoState.z = state.tornadoState.baseZ + wobble + erraticNoise;
        }
        else if (state.simMode === 'meteor') {
            state.meteorState.timer -= dt;
            if (state.meteorState.timer <= 0 && state.meteorState.spawned < state.meteorState.count) {
                spawnMeteor(state.meteorState.size);
                state.meteorState.spawned++;
                state.meteorState.timer = state.meteorState.spawnRate * (0.5 + Math.random());
            }
            
            if (state.meteorState.activeQuake > 0) {
                state.meteorState.activeQuake -= dt;
                let q = state.meteorState.activeQuake;
                dx = (Math.random() - 0.5) * q * 2.0;
                dz = (Math.random() - 0.5) * q * 2.0;
            }
            
            for (let i = state.meteorState.meteors.length - 1; i >= 0; i--) {
                let m = state.meteorState.meteors[i];
                if (!m.active) continue;
                
                m.mesh.position.x += m.vx * dt;
                m.mesh.position.y += m.vy * dt;
                m.mesh.position.z += m.vz * dt;
                
                m.mesh.rotation.x += dt * 5;
                m.mesh.rotation.y += dt * 3;
                
                // Update trail
                for (let j = 0; j < 29; j++) {
                    m.trailPos[j * 3] = m.trailPos[(j + 1) * 3];
                    m.trailPos[j * 3 + 1] = m.trailPos[(j + 1) * 3 + 1];
                    m.trailPos[j * 3 + 2] = m.trailPos[(j + 1) * 3 + 2];
                }
                m.trailPos[29 * 3] = m.mesh.position.x;
                m.trailPos[29 * 3 + 1] = m.mesh.position.y;
                m.trailPos[29 * 3 + 2] = m.mesh.position.z;
                m.trail.geometry.attributes.position.needsUpdate = true;
                
                // Spawn smoke particle
                if (Math.random() > 0.3) {
                    let smokeGeo = new THREE.DodecahedronGeometry(m.radius * 0.8, 0);
                    let smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.8 });
                    let smoke = new THREE.Mesh(smokeGeo, smokeMat);
                    smoke.position.copy(m.mesh.position);
                    smoke.position.x += (Math.random() - 0.5) * m.radius;
                    smoke.position.y += (Math.random() - 0.5) * m.radius;
                    smoke.position.z += (Math.random() - 0.5) * m.radius;
                    smoke.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    state.scene.add(smoke);
                    state.meteorState.smokeParticles.push({
                        mesh: smoke,
                        life: 1.0,
                        vx: (Math.random() - 0.5) * 2.0,
                        vy: 2.0 + Math.random() * 2.0,
                        vz: (Math.random() - 0.5) * 2.0
                    });
                }
                
                // Check collision
                let hit = false;
                if (m.mesh.position.y <= m.radius) {
                    hit = true;
                    m.mesh.position.y = m.radius;
                } else {
                    for (let n of state.nodes) {
                        let dist = n.pos.distanceTo(m.mesh.position);
                        if (dist < m.radius + 1.0) {
                            hit = true;
                            break;
                        }
                    }
                }
                
                if (hit) {
                    m.active = false;
                    state.scene.remove(m.mesh);
                    state.scene.remove(m.trail);
                    
                    // Explosion light burst
                    let expLight = new THREE.PointLight(0xff4400, 5, m.radius * 20);
                    expLight.position.copy(m.mesh.position);
                    state.scene.add(expLight);
                    state.meteorState.explosionLights.push({ light: expLight, life: 1.0 });
                    
                    // Explosion force
                    let force = m.radius * 15.0;
                    let radiusSq = (m.radius * 4.0) * (m.radius * 4.0);
                    
                    state.nodes.forEach((n: any) => {
                        let distSq = n.pos.distanceToSquared(m.mesh.position);
                        if (distSq < radiusSq) {
                            let dist = Math.sqrt(distSq);
                            let push = (1.0 - dist / (m.radius * 4.0)) * force;
                            
                            if (!n.isFixed) {
                                let dirX = (n.pos.x - m.mesh.position.x) / dist;
                                let dirY = (n.pos.y - m.mesh.position.y) / dist;
                                let dirZ = (n.pos.z - m.mesh.position.z) / dist;
                                
                                n.pos.x += dirX * push / Math.max(0.1, n.mass);
                                n.pos.y += dirY * push / Math.max(0.1, n.mass);
                                n.pos.z += dirZ * push / Math.max(0.1, n.mass);
                            }
                            n.maxStrain = Math.max(n.maxStrain, push * 0.5);
                        }
                    });
                    
                    // Scorch mark attached to tableMesh
                    let scorchGeo = new THREE.PlaneGeometry(m.radius * 4, m.radius * 4);
                    scorchGeo.rotateX(-Math.PI / 2);
                    let scorchMat = new THREE.MeshBasicMaterial({
                        color: 0x111111,
                        transparent: true,
                        opacity: 0.8,
                        depthWrite: false
                    });
                    let scorch = new THREE.Mesh(scorchGeo, scorchMat);
                    // tableMesh is at y=-0.5, so local y=0.55 puts it at world y=0.05
                    scorch.position.set(m.mesh.position.x - state.tablePos.x, 0.55, m.mesh.position.z - state.tablePos.z);
                    if (state.tableMesh) {
                        state.tableMesh.add(scorch);
                    }
                    state.meteorState.scorchMarks.push(scorch);
                    
                    // Camera shake
                    state.meteorState.activeQuake = Math.max(state.meteorState.activeQuake, m.radius * 0.5);
                    
                    // Splashes/Debris
                    for(let k=0; k<10; k++) {
                        let idx = state.splashCount % state.MAX_SPLASHES;
                        state.splashLife[idx] = 0.5 + Math.random() * 1.0; 
                        state.splashVel[idx*3] = (Math.random() - 0.5) * 20; 
                        state.splashVel[idx*3+1] = 10 + Math.random() * 20; 
                        state.splashVel[idx*3+2] = (Math.random() - 0.5) * 20; 
                        
                        if (state.splashPoints) {
                            let sPositions = state.splashPoints.geometry.attributes.position.array;
                            sPositions[idx*3] = m.mesh.position.x;
                            sPositions[idx*3+1] = m.mesh.position.y;
                            sPositions[idx*3+2] = m.mesh.position.z;
                        }
                        state.splashCount++;
                    }
                    
                    state.meteorState.meteors.splice(i, 1);
                }
            }
            
            // Update explosion lights
            for (let i = state.meteorState.explosionLights.length - 1; i >= 0; i--) {
                let el = state.meteorState.explosionLights[i];
                el.life -= dt * 2.0;
                if (el.life <= 0) {
                    state.scene.remove(el.light);
                    state.meteorState.explosionLights.splice(i, 1);
                } else {
                    el.light.intensity = el.life * 5;
                }
            }
            
            // Update smoke particles
            for (let i = state.meteorState.smokeParticles.length - 1; i >= 0; i--) {
                let p = state.meteorState.smokeParticles[i];
                p.life -= dt * 1.5;
                if (p.life <= 0) {
                    state.scene.remove(p.mesh);
                    p.mesh.material.dispose();
                    p.mesh.geometry.dispose();
                    state.meteorState.smokeParticles.splice(i, 1);
                } else {
                    p.mesh.position.x += p.vx * dt;
                    p.mesh.position.y += p.vy * dt;
                    p.mesh.position.z += p.vz * dt;
                    p.mesh.scale.setScalar(1.0 + (1.0 - p.life) * 2.0);
                    p.mesh.material.opacity = p.life * 0.8;
                }
            }
        }
    }

    let tvx = dx - state.tablePos.x; let tvz = dz - state.tablePos.z;
    state.tablePos.set(dx, -0.5, dz); state.tableMesh.position.copy(state.tablePos);

    state.foundations.forEach((f: any) => {
        f.mesh.position.x = f.x + state.GRID_SIZE/2 + dx;
        f.mesh.position.z = f.z + state.GRID_SIZE/2 + dz;
    });

    state.nodes.forEach((n: any) => {
        if (state.simMode === 'quake' && n.originalIsFixed && !n.hasFoundation && n.originalPos.y <= 0 && state.settleFrames > 60) {
            let liquefactionFactor = Math.max(0, (window as any).currentMagnitude - 4.0) * 0.008; 
            let sinkRate = (n.liquefactionLoad || 0) * liquefactionFactor * dt;
            if (n.originalPos.y > -20) {
                n.originalPos.y -= sinkRate; 
            }
        }

        if (n.isFixed) {
            n.pos.x = n.originalPos.x + dx; n.pos.y = n.originalPos.y; n.pos.z = n.originalPos.z + dz;
            n.oldPos.x = n.pos.x - tvx; n.oldPos.y = n.pos.y; n.oldPos.z = n.pos.z - tvz;
        } else {
            let gravityAccel = -15.0; 
            let tempx = n.pos.x; let tempy = n.pos.y; let tempz = n.pos.z;
            let friction = 0.99; 
            
            let vx = (n.pos.x - n.oldPos.x) * friction * dtRatio; 
            let vy = (n.pos.y - n.oldPos.y) * friction * dtRatio + gravityAccel * dt * dt; 
            let vz = (n.pos.z - n.oldPos.z) * friction * dtRatio;

            if (state.simMode === 'hurricane' && state.settleFrames > 60) {
                let heightFactor = Math.max(0.1, Math.min(2.0, n.pos.y / 12.0)); 
                
                let turbulenceX = (Math.random() - 0.5) * hurricaneCat * 4.0;
                let turbulenceZ = (Math.random() - 0.5) * hurricaneCat * 4.0;

                vx += (windAccelX * heightFactor + turbulenceX) * dt * dt;
                vz += (windAccelZ * heightFactor + turbulenceZ) * dt * dt;
            }
            
            if (state.simMode === 'tsunami' && state.settleFrames > 60 && n.pos.y < state.currentWaterLevel) {
                const strEl = document.getElementById('tsunami-str') as HTMLInputElement;
                let tStrength = strEl ? parseFloat(strEl.value) : 6.0;
                
                let buoyantAccel = Math.min(25.0, 35.0 / Math.max(0.1, n.mass)); 
                vy += buoyantAccel * dt * dt; 
                
                let floodForce = tStrength * 0.8;
                let drag = Math.min(0.1, (0.02 * floodForce) / Math.max(0.1, n.mass));
                
                vx += (0 - vx) * drag * dtRatio;
                vz += (floodForce * 2.0 - vz) * drag * dtRatio;
                
                let depth = state.currentWaterLevel - n.pos.y;
                if (depth < 0.5 && vy > 0) {
                    vy *= 0.8;
                }
            }

            if (state.simMode === 'tornado' && state.settleFrames > 60) {
                let tdx = n.pos.x - state.tornadoState.x;
                let tdz = n.pos.z - state.tornadoState.z;
                let distToCore = Math.sqrt(tdx*tdx + tdz*tdz);
                let ef = state.tornadoState.efScale;

                let funnelRadius = (2.0 + n.pos.y * 0.4) * (1.0 + ef * 0.3);

                if (distToCore < funnelRadius * 1.5) {
                    let forceMag = (ef + 1) * 12.0; 
                    let updraft = forceMag * 1.8;

                    let intensity = Math.max(0.1, 1.0 - (distToCore / (funnelRadius * 1.5)));

                    let tanX = -tdz / Math.max(0.1, distToCore);
                    let tanZ = tdx / Math.max(0.1, distToCore);
                    let pullX = -tdx / Math.max(0.1, distToCore);
                    let pullZ = -tdz / Math.max(0.1, distToCore);

                    let isDebris = n.broken;
                    if (isDebris) {
                        vy += updraft * intensity * dt * dt * 60; 
                        vx += (tanX * forceMag * 2.5 + pullX * forceMag * 1.5) * intensity * dt * dt * 60;
                        vz += (tanZ * forceMag * 2.5 + pullZ * forceMag * 1.5) * intensity * dt * dt * 60;
                    } else {
                        vx += (tanX * forceMag + pullX * forceMag) * intensity * dt * dt * 60 * 0.5;
                        vz += (tanZ * forceMag + pullZ * forceMag) * intensity * dt * dt * 60 * 0.5;
                        vy += (updraft * intensity * dt * dt * 60 * 0.5);

                        n.maxStrain = Math.max(n.maxStrain, (intensity * forceMag * 0.08) / Math.max(1, n.mass));
                    }
                }
            }

            let speedLimit = 4.0;
            if (state.simMode === 'hurricane' || state.simMode === 'tsunami') speedLimit = 8.0; 
            if (state.simMode === 'tornado') speedLimit = 15.0; 
            
            let speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
            if (speed > speedLimit) {
                vx = (vx / speed) * speedLimit;
                vy = (vy / speed) * speedLimit;
                vz = (vz / speed) * speedLimit;
            }
            
            n.pos.x += vx; n.pos.y += vy; n.pos.z += vz;

            if (n.pos.y < -25) {
                n.pos.y = -25; n.pos.x = tempx + (n.pos.x - tempx) * 0.5; n.pos.z = tempz + (n.pos.z - tempz) * 0.5;
            }
            n.oldPos.set(tempx, tempy, tempz);
        }
    });

    if (state.simMode === 'tsunami' && state.settleFrames > 60) {
        for (let i = state.tsunamiState.waves.length - 1; i >= 0; i--) {
            let w = state.tsunamiState.waves[i];
            w.z += w.speed * dt;
            w.mesh.position.z = w.z;
            w.mesh.position.y = state.currentWaterLevel + w.height / 2;

            let waveThickness = 4.0; 

            state.nodes.forEach((n: any) => {
                if (n.pos.y <= state.currentWaterLevel + w.height && n.pos.z < w.z + 1.0 && n.pos.z > w.z - waveThickness) {
                    
                    if (!w.hitNodes.has(n.id)) {
                        w.hitNodes.add(n.id);
                        
                        let massFactor = 1.0 / Math.max(0.1, n.mass);
                        let force = w.strength * 2.5; 
                        
                        if (!n.isFixed) {
                            n.pos.z += force * massFactor;
                            n.pos.y += force * 0.3 * massFactor; 
                        }
                        n.maxStrain = Math.max(n.maxStrain, force * 0.1);
                        
                        for(let k=0; k<6; k++) {
                            let idx = state.splashCount % state.MAX_SPLASHES;
                            
                            state.splashLife[idx] = 0.5 + Math.random() * 0.5; 
                            state.splashVel[idx*3] = (Math.random() - 0.5) * 15; 
                            state.splashVel[idx*3+1] = 10 + Math.random() * 15; 
                            state.splashVel[idx*3+2] = w.speed * 0.5 + Math.random() * 10; 
                            
                            if (state.splashPoints) {
                                let sPositions = state.splashPoints.geometry.attributes.position.array;
                                sPositions[idx*3] = n.pos.x;
                                sPositions[idx*3+1] = n.pos.y;
                                sPositions[idx*3+2] = n.pos.z;
                            }
                            
                            state.splashCount++;
                        }
                    }
                    
                    if (!n.isFixed) {
                        let drag = Math.min(0.8, (w.strength * 0.1) / Math.max(0.1, n.mass));
                        n.pos.z += (w.speed * dt * drag);
                    }
                }
            });

            if (w.z > 60) {
                state.scene.remove(w.mesh);
                w.mesh.geometry.dispose();
                w.mesh.material.dispose();
                state.tsunamiState.waves.splice(i, 1);
            }
        }
    }

    for (let i = 0; i < 40; i++) {
        state.beams.forEach((b: any) => {
            if (b.broken) return;

            let diffX = b.n2.pos.x - b.n1.pos.x; let diffY = b.n2.pos.y - b.n1.pos.y; let diffZ = b.n2.pos.z - b.n1.pos.z;
            let dist = Math.sqrt(diffX*diffX + diffY*diffY + diffZ*diffZ);
            if (dist < 0.0001) dist = 0.0001; 

            let difference = (dist - b.originalDist) / dist;
            let strain = Math.abs(dist - b.originalDist) / b.originalDist;

            if (i === 0) {
                b.currentStrain = strain;
                b.n1.maxStrain = Math.max(b.n1.maxStrain || 0, strain);
                b.n2.maxStrain = Math.max(b.n2.maxStrain || 0, strain);

                if (state.settleFrames > 60 && strain > MAT_PROPS[b.material].breakLimit * state.globalMaterialStrengthMultiplier) {
                    b.broken = true; if(!b.isHidden) b.mesh.material.color.setHex(0xff0000); 
                    return;
                }
            }

            let stiffness = MAT_PROPS[b.material].stiffness;
            let scalar = (difference * 0.5) * stiffness; 
            let offsetX = diffX * scalar; let offsetY = diffY * scalar; let offsetZ = diffZ * scalar;
            
            let maxSnap = 0.1;
            let snapMag = Math.sqrt(offsetX*offsetX + offsetY*offsetY + offsetZ*offsetZ);
            if (snapMag > maxSnap) {
                offsetX = (offsetX/snapMag) * maxSnap;
                offsetY = (offsetY/snapMag) * maxSnap;
                offsetZ = (offsetZ/snapMag) * maxSnap;
            }

            let m1 = b.n1.isFixed ? 0 : 1 / b.n1.mass; let m2 = b.n2.isFixed ? 0 : 1 / b.n2.mass;
            let mSum = m1 + m2;

            if (mSum > 0) {
                let w1 = m1 / mSum; let w2 = m2 / mSum;
                if (!b.n1.isFixed) { b.n1.pos.x += offsetX * w1; b.n1.pos.y += offsetY * w1; b.n1.pos.z += offsetZ * w1; }
                if (!b.n2.isFixed) { b.n2.pos.x -= offsetX * w2; b.n2.pos.y -= offsetY * w2; b.n2.pos.z -= offsetZ * w2; }
            }
        });

        state.panels.forEach((p: any) => {
            if (p.broken) return;

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            let avgY = 0;
            let origAvgY = 0;
            let pLen = p.nodes.length;
            
            for(let i = 0; i < pLen; i++) {
                let pn = p.nodes[i];
                if (pn.pos.x < minX) minX = pn.pos.x;
                if (pn.pos.x > maxX) maxX = pn.pos.x;
                if (pn.pos.y < minY) minY = pn.pos.y;
                if (pn.pos.y > maxY) maxY = pn.pos.y;
                if (pn.pos.z < minZ) minZ = pn.pos.z;
                if (pn.pos.z > maxZ) maxZ = pn.pos.z;
                avgY += pn.pos.y;
                origAvgY += pn.originalPos.y;
            }
            avgY /= pLen;
            origAvgY /= pLen;
            
            let isFlatFloor = (maxY - minY) < 0.8;

            minX -= 0.25; maxX += 0.25;
            minY -= 0.25; maxY += 0.25;
            minZ -= 0.25; maxZ += 0.25;

            state.nodes.forEach((n: any) => {
                if (n.pos.x < minX || n.pos.x > maxX || 
                    n.pos.y < minY || n.pos.y > maxY || 
                    n.pos.z < minZ || n.pos.z > maxZ) return;
                
                if (p.nodes.includes(n)) return; 

                if (Math.abs(n.originalPos.y - origAvgY) < 0.2) return;

                let isConnected = false;
                for(let i=0; i<pLen; i++) {
                    if (n.connectedNodes.has(p.nodes[i])) {
                        isConnected = true; break;
                    }
                }
                if (isConnected) return;
                
                let m1 = n.isFixed ? 0 : 1 / n.mass;
                let pMass = 0;
                for(let i=0; i<pLen; i++) pMass += p.nodes[i].isFixed ? 0 : p.nodes[i].mass;
                
                let m2 = pMass === 0 ? 0 : 1 / pMass;
                let mSum = m1 + m2;
                if (mSum === 0) return;
                
                let w1 = m1 / mSum; 
                let w2 = m2 / mSum;

                if (isFlatFloor) {
                    let distY = n.pos.y - avgY;
                    let normalY = distY >= 0 ? 1 : -1;
                    let err = 0.25 - Math.abs(distY);
                    
                    if (err > 0) {
                        let push = err * 0.5; 
                        if (!n.isFixed) {
                            n.pos.y += normalY * push * w1;
                            n.pos.x += (n.oldPos.x - n.pos.x) * 0.2; 
                            n.pos.z += (n.oldPos.z - n.pos.z) * 0.2;
                        }
                        for(let i=0; i<pLen; i++) { 
                            if (!p.nodes[i].isFixed) p.nodes[i].pos.y -= normalY * (push * w2) / pLen; 
                        }
                    }
                } else {
                    let dX1 = n.pos.x - minX;
                    let dX2 = maxX - n.pos.x;
                    let dY1 = n.pos.y - minY;
                    let dY2 = maxY - n.pos.y;
                    let dZ1 = n.pos.z - minZ;
                    let dZ2 = maxZ - n.pos.z;

                    let minPush = Math.min(dX1, dX2, dY1, dY2, dZ1, dZ2);
                    let pushX = 0, pushY = 0, pushZ = 0;

                    if (minPush === dX1) pushX = -dX1;
                    else if (minPush === dX2) pushX = dX2;
                    else if (minPush === dY1) pushY = -dY1;
                    else if (minPush === dY2) pushY = dY2;
                    else if (minPush === dZ1) pushZ = -dZ1;
                    else if (minPush === dZ2) pushZ = dZ2;

                    let pushAmt = minPush * 0.5; 

                    if (!n.isFixed) {
                        n.pos.x += Math.sign(pushX) * (Math.abs(pushX)>0 ? pushAmt : 0) * w1;
                        n.pos.y += Math.sign(pushY) * (Math.abs(pushY)>0 ? pushAmt : 0) * w1;
                        n.pos.z += Math.sign(pushZ) * (Math.abs(pushZ)>0 ? pushAmt : 0) * w1;
                    }
                    for(let i=0; i<pLen; i++) { 
                        if (!p.nodes[i].isFixed) {
                            p.nodes[i].pos.x -= Math.sign(pushX) * (Math.abs(pushX)>0 ? pushAmt : 0) * w2 / pLen;
                            p.nodes[i].pos.y -= Math.sign(pushY) * (Math.abs(pushY)>0 ? pushAmt : 0) * w2 / pLen;
                            p.nodes[i].pos.z -= Math.sign(pushZ) * (Math.abs(pushZ)>0 ? pushAmt : 0) * w2 / pLen;
                        }
                    }
                }
            });
        });

        for (let j = 0; j < state.nodes.length; j++) {
            let n1 = state.nodes[j];
            for (let k = j + 1; k < state.nodes.length; k++) {
                let n2 = state.nodes[k];
                if (Math.abs(n1.pos.x - n2.pos.x) > 1.2 || Math.abs(n1.pos.y - n2.pos.y) > 1.2 || Math.abs(n1.pos.z - n2.pos.z) > 1.2) continue;

                let diffX = n2.pos.x - n1.pos.x; let diffY = n2.pos.y - n1.pos.y; let diffZ = n2.pos.z - n1.pos.z;
                let distSq = diffX * diffX + diffY * diffY + diffZ * diffZ;
                let horizontalDistSq = diffX * diffX + diffZ * diffZ;
                let isVerticalStack = (horizontalDistSq < 0.5); 
                
                let minDist = isVerticalStack ? 0.05 : 0.6; 
                
                if (distSq < minDist * minDist && distSq > 0.0001) {
                    let origDX = n2.originalPos.x - n1.originalPos.x;
                    let origDY = n2.originalPos.y - n1.originalPos.y;
                    let origDZ = n2.originalPos.z - n1.originalPos.z;
                    if (origDX*origDX + origDY*origDY + origDZ*origDZ < minDist * minDist) continue;

                    if (n1.connectedNodes.has(n2)) continue;

                    let dist = Math.sqrt(distSq);
                    let difference = (dist - minDist) / dist; 
                    
                    let scalar = difference * 0.5;
                    let ox = diffX * scalar; let oy = diffY * scalar; let oz = diffZ * scalar;

                    if (isVerticalStack) {
                        ox = diffX * scalar * 0.01; oz = diffZ * scalar * 0.01;
                        oy = Math.sign(diffY) * (Math.abs(diffY) - minDist) * 0.5;
                    }

                    let maxRepel = 0.2;
                    let pushMag = Math.sqrt(ox*ox + oy*oy + oz*oz);
                    if (pushMag > maxRepel) {
                        ox = (ox/pushMag) * maxRepel; oy = (oy/pushMag) * maxRepel; oz = (oz/pushMag) * maxRepel;
                    }

                    let m1 = n1.isFixed ? 0 : 1 / n1.mass; let m2 = n2.isFixed ? 0 : 1 / n2.mass;
                    let mSum = m1 + m2;

                    if (mSum > 0) {
                        let w1 = m1 / mSum; let w2 = m2 / mSum;
                        if (!n1.isFixed) { n1.pos.x += ox * w1; n1.pos.y += oy * w1; n1.pos.z += oz * w1; }
                        if (!n2.isFixed) { n2.pos.x -= ox * w2; n2.pos.y -= oy * w2; n2.pos.z -= oz * w2; }
                    }
                }
            }
        }
    }

    if (state.settleFrames > 60) {
        state.nodes.forEach((n: any) => {
            if (!n.broken) {
                let limit = JOINT_PROPS[n.level].breakLimit * state.globalJointStrengthMultiplier;
                if (n.maxStrain > limit) {
                    n.broken = true;
                    n.isFixed = false; 
                    n.mesh.material.color.setHex(0xff0000); 
                }
            }
            n.maxStrain = 0; 
        });

        state.beams.forEach((b: any) => {
            if (!b.broken && (b.n1.broken || b.n2.broken)) {
                b.broken = true;
                if(!b.isHidden) b.mesh.material.color.setHex(0xff0000);
            }
        });

        state.panels.forEach((p: any) => {
            if (!p.broken && p.nodes.some((n: any) => n.broken)) { p.broken = true; }
        });
    }
}
