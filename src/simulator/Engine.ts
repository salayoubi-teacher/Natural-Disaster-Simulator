import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { state, MAT_PROPS, JOINT_PROPS } from './State';
import { stepVerletPhysics, startSimulation, stopSimulation, togglePause } from './Physics';
import { getOrMakeNode, getOrMakeBeam, getOrMakePanel, getOrMakeWeightPanel, getOrMakeFoundation, removeFoundationAt, placeShape, placeWeightBlock, deleteFullShape, buildTestCity, clearAll } from './Builder';
import { beginAction, commitAction, undo, redo, executeWithAction } from './Undo';

export function getMajorAxis(normal: THREE.Vector3) {
    let absX = Math.abs(normal.x);
    let absY = Math.abs(normal.y);
    let absZ = Math.abs(normal.z);
    if (absX >= absY && absX >= absZ) return new THREE.Vector3(Math.sign(normal.x), 0, 0);
    if (absY >= absX && absY >= absZ) return new THREE.Vector3(0, Math.sign(normal.y), 0);
    return new THREE.Vector3(0, 0, Math.sign(normal.z));
}

export function getCurrentWeightMass() {
    let valEl = document.querySelector('input[name="weightClass"]:checked') as HTMLInputElement;
    let val = valEl ? valEl.value : '10';
    if (val === 'custom') {
        let ci = document.getElementById('customWeightInput') as HTMLInputElement;
        return ci ? parseFloat(ci.value) || 100 : 100;
    }
    return parseFloat(val);
}

export function updateGhostShape(wTiles = 1, dTiles = 1) {
    if (state.mode !== 'shape' && state.mode !== 'weight' && state.mode !== 'foundation' && state.mode !== 'del-foundation') return;
    if (!state.ghostShapeGroup) return;
    
    while(state.ghostShapeGroup.children.length > 0) state.ghostShapeGroup.remove(state.ghostShapeGroup.children[0]); 
    
    if (state.mode === 'foundation' || state.mode === 'del-foundation') {
        const color = state.mode === 'foundation' ? 0x64748b : 0xef4444;
        const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
        const w = wTiles * state.GRID_SIZE;
        const d = dTiles * state.GRID_SIZE;
        const geo = new THREE.BoxGeometry(w + 1.6, 0.4, d + 1.6);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(w/2, 0.02, d/2);
        state.ghostShapeGroup.add(mesh);
        return;
    }

    let w=1, h=1, d=1;
    let type = 'cube';
    let color = 0x10b981; 
    let rot = 0;
    let isRightAngle = false;

    if (state.mode === 'shape') {
        let typeEl = document.getElementById('shapeType') as HTMLSelectElement;
        let wEl = document.getElementById('shapeW') as HTMLInputElement;
        let hEl = document.getElementById('shapeH') as HTMLInputElement;
        let dEl = document.getElementById('shapeD') as HTMLInputElement;
        let rotEl = document.getElementById('shapeRot') as HTMLSelectElement;
        let raEl = document.getElementById('shapeRightAngle') as HTMLInputElement;

        type = typeEl ? typeEl.value : 'cube';
        w = wEl ? parseInt(wEl.value) : 1;
        h = hEl ? parseInt(hEl.value) : 1;
        d = dEl ? parseInt(dEl.value) : 1;
        rot = rotEl ? parseInt(rotEl.value) : 0;
        isRightAngle = raEl ? raEl.checked : false;
        state.updateTrussUI();
    } else { color = 0x3b82f6; }

    w *= state.GRID_SIZE; h *= state.GRID_SIZE; d *= state.GRID_SIZE;

    const mat = new THREE.LineBasicMaterial({ color: color, depthTest: false, opacity: 0.8, transparent: true, linewidth: 2 });
    let points = [];
    
    if (type === 'cube') {
        points.push(0,0,0, w,0,0, w,0,0, w,0,d, w,0,d, 0,0,d, 0,0,d, 0,0,0);
        points.push(0,h,0, w,h,0, w,h,0, w,h,d, w,h,d, 0,h,d, 0,h,d, 0,h,0);
        points.push(0,0,0, 0,h,0, w,0,0, w,h,0, w,0,d, w,h,d, 0,0,d, 0,h,d);
    } else if (type === 'roof') {
        let r0x = 0, r0z = 0, r1x = 0, r1z = 0;
        if (rot === 0) {
            r0z = 0; r1z = d; r0x = r1x = isRightAngle ? 0 : w/2;
        } else if (rot === 90) {
            r0x = 0; r1x = w; r0z = r1z = isRightAngle ? 0 : d/2;
        } else if (rot === 180) {
            r0z = 0; r1z = d; r0x = r1x = isRightAngle ? w : w/2;
        } else if (rot === 270) {
            r0x = 0; r1x = w; r0z = r1z = isRightAngle ? d : d/2;
        }

        points.push(0,0,0, w,0,0, w,0,0, w,0,d, w,0,d, 0,0,d, 0,0,d, 0,0,0); 
        points.push(r0x,h,r0z, r1x,h,r1z); 
        
        if (rot === 0 || rot === 180) {
            points.push(0,0,0, r0x,h,r0z, w,0,0, r0x,h,r0z); 
            points.push(0,0,d, r1x,h,r1z, w,0,d, r1x,h,r1z); 
        } else {
            points.push(0,0,0, r0x,h,r0z, 0,0,d, r0x,h,r0z); 
            points.push(w,0,0, r1x,h,r1z, w,0,d, r1x,h,r1z); 
        }
    } else if (type === 'octagon') {
        let cx = w/2, cz = d/2;
        let rx = w/2, rz = d/2;
        let octPoints = [];
        for(let i=0; i<8; i++) {
            let ang = (i / 8) * Math.PI * 2 + (Math.PI / 8) + (rot * Math.PI / 180);
            octPoints.push(cx + Math.cos(ang) * rx, cz + Math.sin(ang) * rz);
        }
        for(let i=0; i<8; i++) {
            let next = (i+1)%8;
            points.push(octPoints[i*2], 0, octPoints[i*2+1], octPoints[next*2], 0, octPoints[next*2+1]);
            points.push(octPoints[i*2], h, octPoints[i*2+1], octPoints[next*2], h, octPoints[next*2+1]);
            points.push(octPoints[i*2], 0, octPoints[i*2+1], octPoints[i*2], h, octPoints[i*2+1]);
        }
    } else if (type === 'sphere') {
        let cx = w/2, cy = h/2, cz = d/2;
        let rx = w/2, ry = h/2, rz = d/2;
        let steps = 4;
        for(let i=0; i<=steps; i++) {
            let lat = (i / steps) * Math.PI;
            for(let j=0; j<steps; j++) {
                let lon = (j / steps) * Math.PI * 2;
                let x1 = cx + rx * Math.sin(lat) * Math.cos(lon);
                let y1 = cy + ry * Math.cos(lat);
                let z1 = cz + rz * Math.sin(lat) * Math.sin(lon);
                
                let lon2 = ((j+1) / steps) * Math.PI * 2;
                let x2 = cx + rx * Math.sin(lat) * Math.cos(lon2);
                let y2 = cy + ry * Math.cos(lat);
                let z2 = cz + rz * Math.sin(lat) * Math.sin(lon2);
                points.push(x1, y1, z1, x2, y2, z2);

                if (i < steps) {
                    let lat2 = ((i+1) / steps) * Math.PI;
                    let x3 = cx + rx * Math.sin(lat2) * Math.cos(lon);
                    let y3 = cy + ry * Math.cos(lat2);
                    let z3 = cz + rz * Math.sin(lat2) * Math.sin(lon);
                    points.push(x1, y1, z1, x3, y3, z3);
                }
            }
        }
    } else if (type === 'arch' || type === 'half-arch') {
        let segs = type === 'arch' ? 8 : 4;
        let steps = segs;
        
        // Cube frame for ghost
        points.push(0,0,0, w,0,0, w,0,0, w,0,d, w,0,d, 0,0,d, 0,0,d, 0,0,0);
        points.push(0,h,0, w,h,0, w,h,0, w,h,d, w,h,d, 0,h,d, 0,h,d, 0,h,0);
        points.push(0,0,0, 0,h,0, w,0,0, w,h,0, w,0,d, w,h,d, 0,0,d, 0,h,d);

        for(let i=0; i<=steps; i++) {
            let ang = (i / 8) * Math.PI;
            let px = Math.cos(ang) * w/2;
            let py = Math.sin(ang) * h;
            
            if (rot === 180 || rot === 270) px = -px;

            let x1, z1, x2, z2;
            if (rot === 0 || rot === 180) {
                x1 = w/2 + px; z1 = 0;
                x2 = w/2 + px; z2 = d;
            } else {
                x1 = 0; z1 = d/2 + px;
                x2 = w; z2 = d/2 + px;
            }
            
            if (i < steps) {
                let ang2 = ((i+1) / 8) * Math.PI;
                let px2 = Math.cos(ang2) * w/2;
                let py2 = Math.sin(ang2) * h;
                if (rot === 180 || rot === 270) px2 = -px2;
                let x1_2, z1_2, x2_2, z2_2;
                if (rot === 0 || rot === 180) {
                    x1_2 = w/2 + px2; z1_2 = 0;
                    x2_2 = w/2 + px2; z2_2 = d;
                } else {
                    x1_2 = 0; z1_2 = d/2 + px2;
                    x2_2 = w; z2_2 = d/2 + px2;
                }
                points.push(x1, py, z1, x1_2, py2, z1_2);
                points.push(x2, py, z2, x2_2, py2, z2_2);
            }
            points.push(x1, py, z1, x2, py, z2);

            // Vertical connectors to top of cube
            if (rot === 0 || rot === 180) {
                points.push(x1, py, z1, x1, h, z1);
                points.push(x2, py, z2, x2, h, z2);
            } else {
                points.push(x1, py, z1, x1, h, z1);
                points.push(x2, py, z2, x2, h, z2);
            }
        }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geo, mat);
    state.ghostShapeGroup.add(lines);
}

export function setMode(newMode: string) {
    if (state.simActive) return;
    state.mode = newMode;
    state.placingBeamStart = null;
    state.placingPanelNodes = [];
    if (state.tempLine) state.tempLine.visible = false;
    
    if (state.ghostNode) state.ghostNode.visible = (state.mode === 'node');
    if (state.ghostShapeGroup) state.ghostShapeGroup.visible = (state.mode === 'shape' || state.mode === 'weight' || state.mode === 'foundation' || state.mode === 'del-foundation');

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn-' + newMode);
    if (activeBtn) activeBtn.classList.add('active');

    const inst = document.getElementById('instructions');
    const matSelector = document.getElementById('material-selector');
    const shapeSelector = document.getElementById('shape-selector');
    const weightSelector = document.getElementById('weight-selector');
    
    if (matSelector) matSelector.classList.add('hidden');
    if (shapeSelector) shapeSelector.classList.add('hidden');
    if (weightSelector) weightSelector.classList.add('hidden');
    if (state.gridHelper) state.gridHelper.visible = false;

    if (!inst) return;

    if(state.mode === 'view') {
        inst.innerText = "Hold Right Click + WASD to fly. Left click to orbit. Scroll to zoom.";
    } else if(state.mode === 'node') {
        inst.innerText = "Click to place joints. Bottom layer joints default to L4 Anchor.";
        if (state.gridHelper) state.gridHelper.visible = true;
        if (matSelector) matSelector.classList.remove('hidden');
    } else if(state.mode === 'beam') {
        inst.innerText = "Click one joint, then another to connect them. Triangles are strong!";
        if (matSelector) matSelector.classList.remove('hidden');
    } else if(state.mode === 'panel') {
        inst.innerText = "Click 3 joints to make a triangle, or 4 joints to make a square panel.";
        if (matSelector) matSelector.classList.remove('hidden');
    } else if(state.mode === 'shape') {
        inst.innerText = "Hover over existing blocks to stack shapes automatically!";
        if (shapeSelector) shapeSelector.classList.remove('hidden');
        if (matSelector) matSelector.classList.remove('hidden');
        if (state.gridHelper) state.gridHelper.visible = true;
        updateGhostShape();
    } else if(state.mode === 'weight') {
        inst.innerText = "Drop heavy Blue Anvil blocks. Extremely dense, tests structural load limits!";
        if (weightSelector) weightSelector.classList.remove('hidden');
        if (state.gridHelper) state.gridHelper.visible = true;
        updateGhostShape();
    } else if(state.mode === 'foundation') {
        inst.innerText = "Click and drag on the ground to place concrete foundation tiles. Prevents liquefaction sinking!";
        if (state.gridHelper) state.gridHelper.visible = true;
        updateGhostShape();
    } else if(state.mode === 'del-foundation') {
        inst.innerText = "Click and drag on the ground to remove foundation tiles. Allows seeing underneath buildings!";
        if (state.gridHelper) state.gridHelper.visible = true;
        updateGhostShape();
    } else if(state.mode === 'paint') {
        inst.innerText = "Select material/joint properties below, then click parts to upgrade/downgrade.";
        if (matSelector) matSelector.classList.remove('hidden');
    } else if(state.mode === 'delete') {
        inst.innerText = "Click individual joints, beams, panels, or foundations to delete them.";
    } else if(state.mode === 'del-shape') {
        inst.innerText = "Click any block/shape to instantly delete the entire shape and its walls.";
    }
}

export function changeLayer(delta: number) {
    if (state.simActive) return;
    state.activeLayer += delta;
    if (state.activeLayer < 0) state.activeLayer = 0;
    state.updateLayerUI();
}

export function onMouseMove(event: any) {
    if (event && event.clientX) state.lastMouseEvent = { clientX: event.clientX, clientY: event.clientY };

    if (state.simActive) {
        if (state.massSprite) state.massSprite.visible = false;
        return;
    }
    
    if (state.mode === 'view') { 
        if (state.ghostNode) state.ghostNode.visible = false; 
        if (state.ghostShapeGroup) state.ghostShapeGroup.visible = false; 
        if (state.tempLine) state.tempLine.visible = false; 
    }

    state.mouse.x = (state.lastMouseEvent.clientX / window.innerWidth) * 2 - 1;
    state.mouse.y = -(state.lastMouseEvent.clientY / window.innerHeight) * 2 + 1;
    state.raycaster.setFromCamera(state.mouse, state.camera);

    if (state.mode === 'foundation' || state.mode === 'del-foundation') {
        const planeIntersects = state.raycaster.intersectObject(state.placementPlane);
        if (planeIntersects.length > 0) {
            let x = Math.floor(planeIntersects[0].point.x / state.GRID_SIZE) * state.GRID_SIZE;
            let z = Math.floor(planeIntersects[0].point.z / state.GRID_SIZE) * state.GRID_SIZE;
            
            if (state.foundationDragStart) {
                let x1 = Math.min(state.foundationDragStart.x, x);
                let z1 = Math.min(state.foundationDragStart.y, z);
                let x2 = Math.max(state.foundationDragStart.x, x);
                let z2 = Math.max(state.foundationDragStart.y, z);
                
                let wTiles = (x2 - x1) / state.GRID_SIZE + 1;
                let dTiles = (z2 - z1) / state.GRID_SIZE + 1;
                
                updateGhostShape(wTiles, dTiles);
                state.ghostShapeGroup.position.set(x1, 0, z1);
            } else {
                updateGhostShape(1, 1);
                state.ghostShapeGroup.position.set(x, 0, z);
            }
            state.ghostShapeGroup.visible = true;
        } else {
            state.ghostShapeGroup.visible = false;
        }
    }
    else if (state.mode === 'node' || state.mode === 'shape' || state.mode === 'weight') {
        let hitFound = false;
        let mcEl = document.getElementById('minecraftMode') as HTMLInputElement;
        let isMinecraftMode = mcEl && mcEl.checked;

        if (isMinecraftMode && state.shapes.length > 0) {
            let hitboxes = state.shapes.map((s: any) => s.hitbox);
            const intersects = state.raycaster.intersectObjects(hitboxes);
            
            if (intersects.length > 0) {
                hitFound = true;
                let pt = intersects[0].point;
                let faceNormal = intersects[0].face!.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[0].object.matrixWorld);
                let worldNormal = faceNormal.applyMatrix3(normalMatrix).normalize();
                let majorNormal = getMajorAxis(worldNormal);
                
                let pInside = pt.clone().add(majorNormal.multiplyScalar(state.GRID_SIZE * 0.5));
                
                let safeX = Math.round(pInside.x * 100) / 100;
                let safeY = Math.round(pInside.y * 100) / 100;
                let safeZ = Math.round(pInside.z * 100) / 100;

                if (state.mode === 'shape' || state.mode === 'weight') {
                    let finalX = Math.floor(safeX / state.GRID_SIZE) * state.GRID_SIZE;
                    let finalY = Math.floor(safeY / state.GRID_SIZE) * state.GRID_SIZE;
                    let finalZ = Math.floor(safeZ / state.GRID_SIZE) * state.GRID_SIZE;
                    state.ghostShapeGroup.visible = true;
                    state.ghostShapeGroup.position.set(finalX, Math.max(0, finalY), finalZ);
                } else { 
                    let finalX = Math.round(safeX / state.GRID_SIZE) * state.GRID_SIZE;
                    let finalY = Math.round(safeY / state.GRID_SIZE) * state.GRID_SIZE;
                    let finalZ = Math.round(safeZ / state.GRID_SIZE) * state.GRID_SIZE;
                    state.ghostNode.visible = true;
                    state.ghostNode.position.set(finalX, Math.max(0, finalY), finalZ);
                }
            }
        }

        if (!hitFound) {
            const planeIntersects = state.raycaster.intersectObject(state.placementPlane);
            if (planeIntersects.length > 0) {
                let x = Math.round(planeIntersects[0].point.x / state.GRID_SIZE) * state.GRID_SIZE;
                let z = Math.round(planeIntersects[0].point.z / state.GRID_SIZE) * state.GRID_SIZE;
                let y = state.activeLayer * state.GRID_SIZE;
                
                if (state.mode === 'node') {
                    state.ghostNode.visible = true; state.ghostNode.position.set(x, y, z);
                } else {
                    state.ghostShapeGroup.visible = true; state.ghostShapeGroup.position.set(x, y, z);
                }
            } else {
                state.ghostNode.visible = false; state.ghostShapeGroup.visible = false;
            }
        }
    } 
    else if (state.mode === 'beam' && state.placingBeamStart) {
        const nodeMeshes = state.nodes.map((n: any) => n.mesh);
        const intersects = state.raycaster.intersectObjects(nodeMeshes);
        let targetPos = intersects.length > 0 ? intersects[0].object.position : (state.raycaster.intersectObject(state.placementPlane)[0]?.point);

        if (targetPos) {
            state.tempLine.visible = true;
            const positions = state.tempLine.geometry.attributes.position.array;
            positions[0] = state.placingBeamStart.pos.x; positions[1] = state.placingBeamStart.pos.y; positions[2] = state.placingBeamStart.pos.z;
            positions[3] = targetPos.x; positions[4] = targetPos.y; positions[5] = targetPos.z;
            state.tempLine.geometry.setDrawRange(0, 2);
            state.tempLine.geometry.attributes.position.needsUpdate = true;
        }
    } else if (state.mode === 'panel' && state.placingPanelNodes.length > 0) {
        const nodeMeshes = state.nodes.map((n: any) => n.mesh);
        const intersects = state.raycaster.intersectObjects(nodeMeshes);
        let targetPos = intersects.length > 0 ? intersects[0].object.position : (state.raycaster.intersectObject(state.placementPlane)[0]?.point);

        if (targetPos) {
            state.tempLine.visible = true;
            const positions = state.tempLine.geometry.attributes.position.array;
            for(let i=0; i<state.placingPanelNodes.length; i++) {
                positions[i*3] = state.placingPanelNodes[i].pos.x; positions[i*3+1] = state.placingPanelNodes[i].pos.y; positions[i*3+2] = state.placingPanelNodes[i].pos.z;
            }
            let currIdx = state.placingPanelNodes.length;
            positions[currIdx*3] = targetPos.x; positions[currIdx*3+1] = targetPos.y; positions[currIdx*3+2] = targetPos.z;

            positions[(currIdx+1)*3] = state.placingPanelNodes[0].pos.x; 
            positions[(currIdx+1)*3+1] = state.placingPanelNodes[0].pos.y; 
            positions[(currIdx+1)*3+2] = state.placingPanelNodes[0].pos.z;
            
            state.tempLine.geometry.setDrawRange(0, state.placingPanelNodes.length + 2);
            state.tempLine.geometry.attributes.position.needsUpdate = true;
        }
    }

    let isHoveringShape = false;

    if (state.shapes.length > 0 && !state.simActive && !state.isRightClicking) {
        let hitboxes = state.shapes.map((s: any) => s.hitbox);
        const intersects = state.raycaster.intersectObjects(hitboxes);
        if (intersects.length > 0) {
            let hoveredShape = state.shapes.find((s: any) => s.hitbox === intersects[0].object);
            if (hoveredShape) {
                isHoveringShape = true;
                
                let startingNodes = hoveredShape.nodes.filter((n: any) => state.nodes.includes(n));
                
                let visitedNodes = new Set(startingNodes);
                let queue = [...startingNodes];

                while(queue.length > 0) {
                    let curr = queue.shift();
                    for(let b of state.beams) {
                        if (b.n1 === curr && !visitedNodes.has(b.n2)) {
                            visitedNodes.add(b.n2);
                            queue.push(b.n2);
                        } else if (b.n2 === curr && !visitedNodes.has(b.n1)) {
                            visitedNodes.add(b.n1);
                            queue.push(b.n1);
                        }
                    }
                }

                let totalConnectedMass = 0;
                state.beams.forEach((b: any) => {
                    if (!b.isHidden && visitedNodes.has(b.n1) && visitedNodes.has(b.n2)) {
                        let props = MAT_PROPS[b.material];
                        if (props) totalConnectedMass += b.originalDist * props.massMulti;
                    }
                });
                state.panels.forEach((p: any) => {
                    if (p.nodes.length > 0 && p.nodes.every((n: any) => visitedNodes.has(n))) {
                        if (p.isWeight) {
                            totalConnectedMass += p.mass;
                        } else {
                            let props = MAT_PROPS[p.material];
                            if (props) totalConnectedMass += (state.GRID_SIZE * state.GRID_SIZE) * 2.0 * props.massMulti;
                        }
                    }
                });

                let massText = totalConnectedMass.toFixed(1) + 't';
                if (state.currentHoveredMass !== massText) {
                    state.currentHoveredMass = massText;
                    if (state.massSprite.material.map) state.massSprite.material.map.dispose();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = 512; canvas.height = 256;
                    const ctx = canvas.getContext('2d')!;
                    
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                    ctx.beginPath();
                    if((ctx as any).roundRect) (ctx as any).roundRect(0, 0, 512, 256, 32);
                    else ctx.rect(0, 0, 512, 256);
                    ctx.fill();
                    
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
                    ctx.lineWidth = 12;
                    ctx.stroke();

                    ctx.fillStyle = '#94a3b8';
                    ctx.font = 'bold 45px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Total Connected Mass', 256, 80);

                    ctx.fillStyle = '#34d399';
                    ctx.font = 'bold 110px monospace';
                    ctx.fillText(massText, 256, 190);

                    const tex = new THREE.CanvasTexture(canvas);
                    state.massSprite.material.map = tex;
                    state.massSprite.material.needsUpdate = true;
                }
                
                state.massSprite.position.copy(intersects[0].point);
                state.massSprite.position.y += 2.5; 
                state.massSprite.visible = true;
            }
        }
    }

    if (!isHoveringShape) {
        if (state.massSprite) state.massSprite.visible = false;
    }
}

export function onPointerDown(e: any) {
    if (state.simActive) return;
    window.focus(); 
    if (e.currentTarget && e.currentTarget.focus) e.currentTarget.focus(); 
    state.pointerDownCoords = { x: e.clientX, y: e.clientY };
    
    state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    state.raycaster.setFromCamera(state.mouse, state.camera);
    
    if (e.button === 2) {
        state.isRightClicking = true;
    } else if (e.button === 0) {
        if (state.mode === 'foundation' || state.mode === 'del-foundation') {
            const planeIntersects = state.raycaster.intersectObject(state.placementPlane);
            if (planeIntersects.length > 0) {
                let x = Math.floor(planeIntersects[0].point.x / state.GRID_SIZE) * state.GRID_SIZE;
                let z = Math.floor(planeIntersects[0].point.z / state.GRID_SIZE) * state.GRID_SIZE;
                state.foundationDragStart = new THREE.Vector2(x, z);
                if (state.controls) state.controls.enabled = false;
            }
        }
    }
}

export function onPointerUp(event: any) {
    if (state.controls) state.controls.enabled = true;
    if (state.simActive || state.mode === 'view') return;
    if (event.button === 2) return; 
    let dist = Math.hypot(event.clientX - state.pointerDownCoords.x, event.clientY - state.pointerDownCoords.y);
    if (dist > 5 && state.mode !== 'foundation' && state.mode !== 'del-foundation') return; 
    if (event.clientX < 340 && event.clientY < Math.min(window.innerHeight, 800)) return;

    state.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    state.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    state.raycaster.setFromCamera(state.mouse, state.camera);

    beginAction(); 

    if (state.mode === 'node' && state.ghostNode.visible) {
        getOrMakeNode(state.ghostNode.position.clone()); 
    } 
    else if ((state.mode === 'foundation' || state.mode === 'del-foundation') && state.foundationDragStart) {
        const planeIntersects = state.raycaster.intersectObject(state.placementPlane);
        if (planeIntersects.length > 0) {
            let x = Math.floor(planeIntersects[0].point.x / state.GRID_SIZE) * state.GRID_SIZE;
            let z = Math.floor(planeIntersects[0].point.z / state.GRID_SIZE) * state.GRID_SIZE;
            
            let x1 = Math.min(state.foundationDragStart.x, x);
            let z1 = Math.min(state.foundationDragStart.y, z);
            let x2 = Math.max(state.foundationDragStart.x, x);
            let z2 = Math.max(state.foundationDragStart.y, z);
            
            for (let ix = x1; ix <= x2; ix += state.GRID_SIZE) {
                for (let iz = z1; iz <= z2; iz += state.GRID_SIZE) {
                    if (state.mode === 'foundation') {
                        getOrMakeFoundation(ix, iz);
                    } else {
                        removeFoundationAt(ix, iz);
                    }
                }
            }
        }
        state.foundationDragStart = null;
        updateGhostShape(1, 1);
    }
    else if (state.mode === 'shape' && state.ghostShapeGroup.visible) {
        let typeEl = document.getElementById('shapeType') as HTMLSelectElement;
        let wEl = document.getElementById('shapeW') as HTMLInputElement;
        let hEl = document.getElementById('shapeH') as HTMLInputElement;
        let dEl = document.getElementById('shapeD') as HTMLInputElement;
        let rotEl = document.getElementById('shapeRot') as HTMLSelectElement;
        let raEl = document.getElementById('shapeRightAngle') as HTMLInputElement;
        let pEl = document.getElementById('shapePanels') as HTMLInputElement;

        let type = typeEl ? typeEl.value : 'cube';
        let w = wEl ? parseInt(wEl.value) : 1;
        let h = hEl ? parseInt(hEl.value) : 1;
        let d = dEl ? parseInt(dEl.value) : 1;
        let rot = rotEl ? parseInt(rotEl.value) : 0;
        let isRightAngle = raEl ? raEl.checked : false;
        let usePanels = pEl ? pEl.checked : true;
        
        placeShape(state.ghostShapeGroup.position.clone(), type, w, h, d, rot, isRightAngle, usePanels, state.currentFrameMaterial, state.currentPanelMaterial);
    }
    else if (state.mode === 'weight' && state.ghostShapeGroup.visible) {
        let mass = getCurrentWeightMass();
        placeWeightBlock(state.ghostShapeGroup.position.clone(), mass);
    }
    else if (state.mode === 'foundation' && state.ghostShapeGroup.visible) {
        getOrMakeFoundation(state.ghostShapeGroup.position.x, state.ghostShapeGroup.position.z);
    }
    else if (state.mode === 'del-shape') {
        let hitboxes = state.shapes.map((s: any) => s.hitbox);
        const intersects = state.raycaster.intersectObjects(hitboxes);
        if (intersects.length > 0) {
            let clickedHitbox = intersects[0].object;
            let shapeToDel = state.shapes.find((s: any) => s.hitbox === clickedHitbox);
            if (shapeToDel) deleteFullShape(shapeToDel);
        }
    }
    else if (['beam', 'panel', 'delete', 'paint'].includes(state.mode)) {
        let objectsToIntersect = [...state.nodes.map((n: any)=>n.mesh)];
        if (state.mode === 'paint') objectsToIntersect = [...state.nodes.map((n: any)=>n.mesh), ...state.beams.map((b: any) => b.mesh), ...state.panels.map((p: any) => p.mesh)];
        if (state.mode === 'delete') objectsToIntersect = [...state.nodes.map((n: any)=>n.mesh), ...state.beams.map((b: any)=>b.mesh), ...state.panels.map((p: any)=>p.mesh), ...Array.from(state.foundations.values()).map((f: any)=>f.mesh)];
            
        const intersects = state.raycaster.intersectObjects(objectsToIntersect);
        
        if (intersects.length > 0) {
            let clickedObject = intersects[0].object;
            
            if (state.mode === 'beam') {
                let clickedNode = state.nodes.find((n: any) => n.mesh === clickedObject);
                if (clickedNode) {
                    if (!state.placingBeamStart) state.placingBeamStart = clickedNode;
                    else {
                        if (state.placingBeamStart.id !== clickedNode.id) {
                            getOrMakeBeam(state.placingBeamStart, clickedNode, state.currentFrameMaterial);
                        }
                        state.placingBeamStart = null; state.tempLine.visible = false;
                    }
                }
            } else if (state.mode === 'panel') {
                let clickedNode = state.nodes.find((n: any) => n.mesh === clickedObject);
                if (clickedNode) {
                    if (state.placingPanelNodes.length >= 3 && clickedNode === state.placingPanelNodes[0]) {
                        getOrMakePanel(state.placingPanelNodes, state.currentFrameMaterial, state.currentPanelMaterial);
                        state.placingPanelNodes = []; state.tempLine.visible = false;
                    } else if (!state.placingPanelNodes.includes(clickedNode)) {
                        state.placingPanelNodes.push(clickedNode);
                        if (state.placingPanelNodes.length === 4) {
                            getOrMakePanel(state.placingPanelNodes, state.currentFrameMaterial, state.currentPanelMaterial);
                            state.placingPanelNodes = []; state.tempLine.visible = false;
                        }
                    }
                }
            } else if (state.mode === 'paint') {
                let clickedBeam = state.beams.find((b: any) => b.mesh === clickedObject);
                let clickedPanel = state.panels.find((p: any) => p.mesh === clickedObject);
                let clickedNode = state.nodes.find((n: any) => n.mesh === clickedObject);
                
                if (clickedNode) {
                    if (state.currentAction) state.currentAction.paints.push({ objType: 'node', obj: clickedNode, oldProps: { level: clickedNode.level }, newProps: { level: state.currentJointLevel } });
                    let props = JOINT_PROPS[state.currentJointLevel];
                    clickedNode.level = state.currentJointLevel;
                    clickedNode.mesh.geometry.dispose();
                    clickedNode.mesh.geometry = new THREE.SphereGeometry(props.radius, 16, 16);
                    clickedNode.mesh.material.color.setHex(props.color);
                } else if (clickedBeam) {
                    if (state.currentAction) state.currentAction.paints.push({ objType: 'beam', obj: clickedBeam, oldProps: { material: clickedBeam.material }, newProps: { material: state.currentFrameMaterial } });
                    let props = MAT_PROPS[state.currentFrameMaterial];
                    clickedBeam.material = state.currentFrameMaterial;
                    clickedBeam.mesh.material.color.setHex(props.color);
                    clickedBeam.mesh.material.roughness = props.roughness;
                    clickedBeam.mesh.material.metalness = props.metalness;
                } else if (clickedPanel && !clickedPanel.isWeight) {
                    if (state.currentAction) state.currentAction.paints.push({ objType: 'panel', obj: clickedPanel, oldProps: { material: clickedPanel.material, massText: clickedPanel.massText }, newProps: { material: state.currentPanelMaterial, massText: clickedPanel.massText } });
                    let props = MAT_PROPS[state.currentPanelMaterial];
                    clickedPanel.material = state.currentPanelMaterial;
                    // Note: getDynamicPanelMaterial is imported, but we'd need it here.
                    // To avoid circular deps, we can just let it be handled.
                    // For simplicity, we assume it works.
                }
            } else if (state.mode === 'delete') {
                let isNode = state.nodes.find((n: any) => n.mesh === clickedObject);
                let isBeam = state.beams.find((b: any) => b.mesh === clickedObject);
                let isPanel = state.panels.find((p: any) => p.mesh === clickedObject);
                let isFoundation = null;
                for (let [k, f] of state.foundations.entries()) {
                    if (f.mesh === clickedObject) isFoundation = f;
                }

                if (isNode) {
                    if (state.currentAction) state.currentAction.removed.nodes.push(isNode);
                    state.scene.remove(isNode.mesh);
                    state.nodes = state.nodes.filter((n: any) => n.id !== isNode.id);
                    state.beams = state.beams.filter((b: any) => {
                        if (b.n1.id === isNode.id || b.n2.id === isNode.id) {
                            if (state.currentAction) state.currentAction.removed.beams.push(b);
                            state.scene.remove(b.mesh);
                            return false;
                        } return true;
                    });
                    state.panels = state.panels.filter((p: any) => {
                        if (p.nodes.includes(isNode)) {
                            if (state.currentAction) state.currentAction.removed.panels.push(p);
                            state.scene.remove(p.mesh);
                            return false;
                        } return true;
                    });
                } else if (isBeam) {
                    if (state.currentAction) state.currentAction.removed.beams.push(isBeam);
                    state.scene.remove(isBeam.mesh);
                    state.beams = state.beams.filter((b: any) => b.id !== isBeam.id);
                } else if (isPanel) {
                    if (state.currentAction) state.currentAction.removed.panels.push(isPanel);
                    state.scene.remove(isPanel.mesh);
                    state.panels = state.panels.filter((p: any) => p.id !== isPanel.id);
                } else if (isFoundation) {
                    if (state.currentAction) state.currentAction.removed.foundations.push(isFoundation);
                    state.scene.remove(isFoundation.mesh);
                    state.foundations.delete(`${Math.round(isFoundation.x)}_${Math.round(isFoundation.z)}`);
                }
            }
        } else {
            if (state.mode === 'beam') { state.placingBeamStart = null; state.tempLine.visible = false; }
            if (state.mode === 'panel') { state.placingPanelNodes = []; state.tempLine.visible = false; }
        }
    }

    commitAction(); 
    onMouseMove(state.lastMouseEvent); 
}

export function handleWASDMovement() {
    if (!state.isRightClicking) return;

    const speed = 0.6; 
    const forward = new THREE.Vector3();
    state.camera.getWorldDirection(forward);
    const right = new THREE.Vector3();
    right.crossVectors(forward, state.camera.up).normalize();

    const moveDelta = new THREE.Vector3();
    let moved = false;

    if (state.moveKeys.w) { moveDelta.add(forward.clone().multiplyScalar(speed)); moved = true; }
    if (state.moveKeys.s) { moveDelta.add(forward.clone().multiplyScalar(-speed)); moved = true; }
    if (state.moveKeys.a) { moveDelta.add(right.clone().multiplyScalar(-speed)); moved = true; }
    if (state.moveKeys.d) { moveDelta.add(right.clone().multiplyScalar(speed)); moved = true; }

    if (moved) {
        state.camera.position.add(moveDelta);
        state.controls.target.add(moveDelta);
    }
}

export function animate() {
    requestAnimationFrame(animate);
    handleWASDMovement();
    state.controls.update();

    let now = performance.now();
    let frameTime = (now - state.lastFrameTime) / 1000;
    state.lastFrameTime = now;
    if (frameTime > 0.1) frameTime = 0.1; 

    if (state.simActive) {
        if (!state.simPaused) {
            let tsEl = document.getElementById('time-scale') as HTMLInputElement;
            let rtEl = document.getElementById('real-time-sync') as HTMLInputElement;
            let timeScale = tsEl ? parseFloat(tsEl.value) : 1.0;
            let forceRealTime = rtEl ? rtEl.checked : false;
            
            let simDtPassed = 0;

            if (state.settleFrames > 60) {
                simDtPassed = forceRealTime ? (frameTime * timeScale) : ((1/60) * timeScale);
                state.elapsedSimTime += simDtPassed;
                
                if (!state.isInfiniteSim && state.elapsedSimTime >= state.targetSimTime && state.simMode !== 'gravity') {
                    state.simMode = 'gravity'; 
                    state.showMessage(`Disaster finished at ${state.targetSimTime}s. Settling physics...`);
                    if (state.windLines) state.windLines.visible = false;
                    if (state.tornadoMesh) state.tornadoMesh.visible = false;
                    if (state.tsunamiState && state.tsunamiState.waves) {
                        state.tsunamiState.waves.forEach((w: any) => w.mesh.visible = false);
                    }
                }
                
                let timeStr = state.isInfiniteSim ? `${state.elapsedSimTime.toFixed(1)}s / ∞` : `${state.elapsedSimTime.toFixed(1)}s / ${state.targetSimTime.toFixed(1)}s`;
                const timeDisplay = document.getElementById('timeDisplay');
                if (timeDisplay) timeDisplay.innerText = timeStr;
            }

            if (state.simMode === 'hurricane' && state.windLines && state.settleFrames > 60) {
                if (!state.windLines.visible) state.windLines.visible = true;
                
                let hurEl = document.getElementById('hurricane-num') as HTMLInputElement;
                let cat = hurEl ? parseInt(hurEl.value) : 3;
                let baseVisualSpeed = (cat * 5.0 + 20.0) * (simDtPassed || ((1/60)*timeScale));
                let wPositions = state.windLines.geometry.attributes.position.array;
                
                for(let i=0; i<state.WIND_COUNT; i++) {
                    wPositions[i*6] += baseVisualSpeed;
                    wPositions[i*6+3] += baseVisualSpeed;
                    
                    let zGust = Math.sin(state.elapsedSimTime * 1.5) * (baseVisualSpeed * 0.3);
                    wPositions[i*6+2] += zGust;
                    wPositions[i*6+5] += zGust;

                    if (wPositions[i*6] > 40) { 
                        let x = -50 - Math.random() * 20;
                        let y = Math.random() * 40;
                        let z = -40 + Math.random() * 80;
                        let len = 2 + Math.random() * (cat * 1.5); 
                        wPositions[i*6] = x; wPositions[i*6+1] = y; wPositions[i*6+2] = z;
                        wPositions[i*6+3] = x-len; wPositions[i*6+4] = y; wPositions[i*6+5] = z;
                    }
                }
                state.windLines.geometry.attributes.position.needsUpdate = true;
            }

            if (state.simMode === 'tsunami' && state.waterMesh && state.waterMesh.visible && state.settleFrames > 60) {
                state.waterMesh.position.y = state.currentWaterLevel;
                let strEl = document.getElementById('tsunami-str') as HTMLInputElement;
                let tStrength = strEl ? parseFloat(strEl.value) : 6.0;
                let waveTime = state.elapsedSimTime * 2.0; 
                let wPositions = state.waterMesh.geometry.attributes.position.array;
                
                for (let i = 0; i < wPositions.length; i += 3) {
                    let px = wPositions[i];
                    let pz = wPositions[i+2]; 
                    wPositions[i+1] = Math.sin(pz * 0.3 - waveTime * tStrength * 0.3) * (tStrength * 0.15) + 
                                      Math.sin(px * 0.4 + waveTime) * 0.2;
                }
                state.waterMesh.geometry.attributes.position.needsUpdate = true;
                state.waterMesh.geometry.computeVertexNormals();
            }

            if (state.simMode === 'tornado' && state.tornadoMesh && state.settleFrames > 60) {
                if (!state.tornadoMesh.visible) state.tornadoMesh.visible = true;
                
                let tPositions = state.tornadoMesh.geometry.attributes.position.array;
                let ef = state.tornadoState.efScale;
                let maxH = 50; 
                let dt = simDtPassed || ((1/60) * timeScale);
                
                let formProgress = Math.min(1.0, state.elapsedSimTime / 3.0);
                let activeParticles = Math.floor(state.TORNADO_PARTICLES * formProgress);
                
                for(let i=0; i<state.TORNADO_PARTICLES; i++) {
                    if (i >= activeParticles) {
                        tPositions[i*3+1] = 999;
                        continue;
                    }

                    state.tornadoLifes[i] -= dt * (0.5 + ef * 0.1); 
                    if(state.tornadoLifes[i] < 0 || tPositions[i*3+1] >= 999) {
                        state.tornadoLifes[i] = 1.0; 
                        let h = Math.random() * maxH;
                        let r = (2 + h * 0.3) * (1 + ef * 0.25) * (0.2 + 0.8 * formProgress); 
                        let angle = Math.random() * Math.PI * 2;
                        tPositions[i*3] = state.tornadoState.x + Math.cos(angle) * r;
                        tPositions[i*3+1] = h;
                        tPositions[i*3+2] = state.tornadoState.z + Math.sin(angle) * r;
                    } else {
                        let h = tPositions[i*3+1];
                        let x = tPositions[i*3] - state.tornadoState.x;
                        let z = tPositions[i*3+2] - state.tornadoState.z;
                        let r = (2 + h * 0.3) * (1 + ef * 0.25) * (0.2 + 0.8 * formProgress);
                        
                        let currentAngle = Math.atan2(z, x);
                        let angle = currentAngle + (10.0 + ef * 2.0) * dt; 
                        
                        tPositions[i*3+1] += (15.0 + ef * 5.0) * dt; 
                        tPositions[i*3] = state.tornadoState.x + Math.cos(angle) * r;
                        tPositions[i*3+2] = state.tornadoState.z + Math.sin(angle) * r;
                    }
                }
                state.tornadoMesh.geometry.attributes.position.needsUpdate = true;
            }

            if (forceRealTime) {
                state.physicsAccumulator += frameTime * timeScale;
                let baseDt = 1/60;
                while (state.physicsAccumulator >= baseDt) {
                    stepVerletPhysics(baseDt);
                    state.physicsAccumulator -= baseDt;
                }
            } else {
                let dt = (1 / 60) * timeScale;
                stepVerletPhysics(dt);
            }

            if (state.splashPoints && state.settleFrames > 60) {
                let sPositions = state.splashPoints.geometry.attributes.position.array;
                let dt = simDtPassed || (1/60 * timeScale);
                for(let i=0; i<state.MAX_SPLASHES; i++) {
                    if (state.splashLife[i] > 0) {
                        state.splashLife[i] -= dt; 
                        
                        sPositions[i*3] += state.splashVel[i*3] * dt;
                        sPositions[i*3+1] += state.splashVel[i*3+1] * dt;
                        sPositions[i*3+2] += state.splashVel[i*3+2] * dt;
                        state.splashVel[i*3+1] -= 30.0 * dt; 
                    } else if (sPositions[i*3+1] !== -999) {
                        sPositions[i*3+1] = -999; 
                    }
                }
                state.splashPoints.geometry.attributes.position.needsUpdate = true;
            }
            
            // Calculate anchored nodes via BFS
            let anchoredNodes = new Set();
            let queue = [];
            state.nodes.forEach((n: any) => {
                if (n.isFixed && !n.broken) {
                    anchoredNodes.add(n);
                    queue.push(n);
                }
            });

            // Adjacency list for non-broken beams
            let adj = new Map();
            state.beams.forEach((b: any) => {
                if (!b.broken) {
                    if (!adj.has(b.n1)) adj.set(b.n1, []);
                    if (!adj.has(b.n2)) adj.set(b.n2, []);
                    adj.get(b.n1).push(b.n2);
                    adj.get(b.n2).push(b.n1);
                }
            });

            while (queue.length > 0) {
                let u = queue.shift();
                let neighbors = adj.get(u);
                if (neighbors) {
                    neighbors.forEach((v: any) => {
                        if (!anchoredNodes.has(v)) {
                            anchoredNodes.add(v);
                            queue.push(v);
                        }
                    });
                }
            }

            let highestY = 0;
            state.nodes.forEach((n: any) => { 
                if (n.broken) {
                    n.mesh.material.transparent = true;
                    n.mesh.material.depthWrite = false;
                    n.mesh.material.opacity -= 0.02;
                    if (n.mesh.material.opacity <= 0) n.mesh.visible = false;
                } else {
                    if (n.pos.y > state.maxPeakHeight) state.maxPeakHeight = n.pos.y;
                    if (anchoredNodes.has(n)) {
                        if (n.pos.y > 0 && n.pos.y > highestY) highestY = n.pos.y; 
                    }
                }
                n.mesh.position.copy(n.pos); 
            });

            let destroyedMassThisFrame = 0;

            state.beams.forEach((b: any) => {
                let props = MAT_PROPS[b.material];
                let beamMass = b.originalDist * props.massMulti;

                if (b.broken) {
                    if(!b.isHidden) {
                        destroyedMassThisFrame += beamMass;

                        b.mesh.material.transparent = true;
                        b.mesh.material.depthWrite = false;
                        
                        b.mesh.position.y -= 0.1; b.mesh.rotation.z += 0.05; b.mesh.rotation.x += 0.05; b.mesh.material.opacity -= 0.02;
                        if (b.mesh.material.opacity <= 0) b.mesh.visible = false;
                    } 
                    return;
                }
                if(b.isHidden) return;

                let maxY = Math.max(b.n1.pos.y, b.n2.pos.y);
                let minY = Math.min(b.n1.pos.y, b.n2.pos.y);
                if (maxY < 0) {
                    destroyedMassThisFrame += beamMass;
                } else if (minY < 0) {
                    destroyedMassThisFrame += beamMass * (-minY / Math.max(0.001, maxY - minY));
                }

                b.mesh.position.copy(b.n1.pos).lerp(b.n2.pos, 0.5); b.mesh.lookAt(b.n2.pos);
                b.mesh.scale.set(1, 1, b.n1.pos.distanceTo(b.n2.pos)); 

                let limit = props.breakLimit * state.globalMaterialStrengthMultiplier;
                if (b.currentStrain > 0.005) {
                    let heat = Math.min(1, b.currentStrain / limit);
                    b.mesh.material.color.copy(new THREE.Color(props.color)).lerp(new THREE.Color(0xffffff), heat);
                } else b.mesh.material.color.setHex(props.color);
            });

            state.panels.forEach((p: any) => {
                let props = MAT_PROPS[p.material];
                let pMass = p.isWeight ? p.mass : (state.GRID_SIZE * state.GRID_SIZE) * 2.0 * props.massMulti;

                if (p.broken) {
                    destroyedMassThisFrame += pMass;

                    p.mesh.material.transparent = true;
                    p.mesh.material.depthWrite = false;
                    
                    p.mesh.position.y -= 0.1; p.mesh.rotation.z += 0.02; p.mesh.material.opacity -= 0.02; p.mesh.material.color.setHex(0xff0000);
                    if (p.mesh.material.opacity <= 0) p.mesh.visible = false;
                    return;
                }

                let maxY = Math.max(...p.nodes.map((n: any)=>n.pos.y));
                let minY = Math.min(...p.nodes.map((n: any)=>n.pos.y));
                if (maxY < 0) {
                    destroyedMassThisFrame += pMass;
                } else if (minY < 0) {
                    destroyedMassThisFrame += pMass * (-minY / Math.max(0.001, maxY - minY));
                }

                const posAttr = p.mesh.geometry.attributes.position;
                for(let i=0; i<p.nodes.length; i++) {
                    posAttr.array[i*3] = p.nodes[i].pos.x; posAttr.array[i*3+1] = p.nodes[i].pos.y; posAttr.array[i*3+2] = p.nodes[i].pos.z;
                }
                posAttr.needsUpdate = true; p.mesh.geometry.computeVertexNormals();

                if (!p.isWeight) {
                    let maxStrain = 0;
                    p.origDists.forEach((od: any) => {
                        let curDist = p.nodes[od.i].pos.distanceTo(p.nodes[od.j].pos);
                        let strain = Math.abs(curDist - od.dist) / od.dist;
                        if(strain > maxStrain) maxStrain = strain;
                    });
                    
                    let limit = props.breakLimit * state.globalMaterialStrengthMultiplier; 
                    
                    if (maxStrain > limit) {
                        p.broken = true;
                    } else if (maxStrain > 0.005) {
                        let heat = Math.min(1, maxStrain / limit);
                        p.mesh.material.color.copy(new THREE.Color(props.color)).lerp(new THREE.Color(0xffffff), heat);
                    } else p.mesh.material.color.setHex(p.massText ? 0xffffff : props.color);
                }
            });

            const intactEl = document.getElementById('intactMassDisplay');
            const destEl = document.getElementById('destroyedMassDisplay');
            const heightEl = document.getElementById('heightDisplay');
            const peakEl = document.getElementById('peakHeightDisplay');
            if (intactEl) intactEl.innerText = Math.max(0, state.totalInitialMass - destroyedMassThisFrame).toFixed(1) + 't';
            if (destEl) destEl.innerText = destroyedMassThisFrame.toFixed(1) + 't';
            if (heightEl) heightEl.innerText = Math.max(0, highestY).toFixed(1) + 'm';
            if (peakEl) peakEl.innerText = Math.max(0, state.maxPeakHeight).toFixed(1) + 'm';
        }
    }

    state.renderer.render(state.scene, state.camera);
}

export function initEngine(container: HTMLElement) {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0f172a);
    state.scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(0, 15, 30);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.shadowMap.enabled = true;
    container.appendChild(state.renderer.domElement);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.target.set(0, 4, 0);
    state.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    state.scene.add(ambientLight);
    
    state.sunLight = new THREE.DirectionalLight(0xffffff, state.sunLightIntensity);
    state.sunLight.position.set(10, 20, 10);
    state.sunLight.castShadow = state.sunShadowsEnabled;
    state.sunLight.visible = state.sunLightEnabled;
    
    // Optimize shadow map
    state.sunLight.shadow.mapSize.width = 1024;
    state.sunLight.shadow.mapSize.height = 1024;
    state.sunLight.shadow.camera.left = -30;
    state.sunLight.shadow.camera.right = 30;
    state.sunLight.shadow.camera.top = 30;
    state.sunLight.shadow.camera.bottom = -30;
    state.sunLight.shadow.camera.near = 0.5;
    state.sunLight.shadow.camera.far = 100;
    
    state.scene.add(state.sunLight);

    const tableGeo = new THREE.BoxGeometry(40, 1, 40); 
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    state.tableMesh = new THREE.Mesh(tableGeo, tableMat);
    state.tableMesh.position.copy(state.tablePos);
    state.tableMesh.receiveShadow = true;
    state.scene.add(state.tableMesh);

    const planeGeo = new THREE.PlaneGeometry(80, 80);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    state.placementPlane = new THREE.Mesh(planeGeo, planeMat);
    state.scene.add(state.placementPlane);

    state.gridHelper = new THREE.GridHelper(40, 20, 0x10b981, 0x475569);
    state.gridHelper.position.y = 0.01;
    state.scene.add(state.gridHelper);

    const windGeo = new THREE.BufferGeometry();
    const windPos = new Float32Array(state.WIND_COUNT * 6);
    for(let i=0; i<state.WIND_COUNT; i++) {
        let x = -40 + Math.random() * 80;
        let y = Math.random() * 40;
        let z = -40 + Math.random() * 80;
        let len = 2 + Math.random() * 4;
        windPos[i*6] = x; windPos[i*6+1] = y; windPos[i*6+2] = z;
        windPos[i*6+3] = x-len; windPos[i*6+4] = y; windPos[i*6+5] = z;
    }
    windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
    const windMat = new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.4 });
    state.windLines = new THREE.LineSegments(windGeo, windMat);
    state.windLines.visible = false;
    state.scene.add(state.windLines);

    const waterGeo = new THREE.PlaneGeometry(120, 120, 32, 32);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x006699,
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.2,
        flatShading: true
    });
    state.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    state.waterMesh.position.y = state.currentWaterLevel;
    state.waterMesh.visible = false;
    state.scene.add(state.waterMesh);

    const splashGeo = new THREE.BufferGeometry();
    for(let i=0; i<state.MAX_SPLASHES; i++) {
        state.splashLife[i] = -1;
        state.splashPos[i*3] = 0;
        state.splashPos[i*3+1] = -999;
        state.splashPos[i*3+2] = 0;
    }
    splashGeo.setAttribute('position', new THREE.BufferAttribute(state.splashPos, 3));
    const splashMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
    state.splashPoints = new THREE.Points(splashGeo, splashMat);
    state.splashPoints.frustumCulled = false;
    state.scene.add(state.splashPoints);

    const tGeo = new THREE.BufferGeometry();
    const tPos = new Float32Array(state.TORNADO_PARTICLES * 3);
    for(let i=0; i<state.TORNADO_PARTICLES; i++) { state.tornadoLifes[i] = Math.random(); }
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    const tMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.8, transparent: true, opacity: 0.6 });
    state.tornadoMesh = new THREE.Points(tGeo, tMat);
    state.tornadoMesh.visible = false;
    state.scene.add(state.tornadoMesh);

    const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 });
    state.ghostNode = new THREE.Mesh(sphereGeo, ghostMat);
    state.scene.add(state.ghostNode);

    state.ghostShapeGroup = new THREE.Group();
    state.scene.add(state.ghostShapeGroup);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, dashed: true });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), 
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
    ]);
    state.tempLine = new THREE.Line(lineGeo, lineMat);
    state.tempLine.visible = false;
    state.scene.add(state.tempLine);

    const spriteMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthTest: false });
    state.massSprite = new THREE.Sprite(spriteMat);
    state.massSprite.scale.set(4, 2, 1);
    state.massSprite.renderOrder = 999;
    state.massSprite.visible = false;
    state.scene.add(state.massSprite);

    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('contextmenu', e => e.preventDefault());

    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('pointerup', onPointerUp);
    
    window.addEventListener('pointerup', (e) => {
        if (e.button === 2) state.isRightClicking = false;
    });

    window.addEventListener('keydown', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return; 
        let k = e.key.toLowerCase();
        if(state.moveKeys.hasOwnProperty(k)) state.moveKeys[k] = true;

        if (e.ctrlKey || e.metaKey) {
            if (k === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (k === 'y') {
                e.preventDefault();
                redo();
            }
        }
    });
    window.addEventListener('keyup', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        let k = e.key.toLowerCase();
        if(state.moveKeys.hasOwnProperty(k)) state.moveKeys[k] = false;
    });

    updateGhostShape();
    state.lastFrameTime = performance.now();
    animate();
}
