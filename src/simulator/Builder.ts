import * as THREE from 'three';
import { state, MAT_PROPS, JOINT_PROPS } from './State';
import { getDynamicPanelMaterial, getWeightMaterial } from './Materials';

export function addToSceneAndArrays(type: string, obj: any) {
    if (type === 'node') { state.scene.add(obj.mesh); state.nodes.push(obj); }
    else if (type === 'beam') { if (!obj.isHidden) state.scene.add(obj.mesh); state.beams.push(obj); }
    else if (type === 'panel') { state.scene.add(obj.mesh); state.panels.push(obj); }
    else if (type === 'shape') { state.scene.add(obj.hitbox); state.shapes.push(obj); }
    else if (type === 'foundation') { state.scene.add(obj.mesh); state.foundations.set(`${Math.round(obj.x)}_${Math.round(obj.z)}`, obj); }
}

export function removeFromSceneAndArrays(type: string, obj: any) {
    if (type === 'node') { state.scene.remove(obj.mesh); state.nodes = state.nodes.filter((n: any) => n !== obj); }
    else if (type === 'beam') { if (!obj.isHidden) state.scene.remove(obj.mesh); state.beams = state.beams.filter((b: any) => b !== obj); }
    else if (type === 'panel') { state.scene.remove(obj.mesh); state.panels = state.panels.filter((p: any) => p !== obj); }
    else if (type === 'shape') { state.scene.remove(obj.hitbox); state.shapes = state.shapes.filter((s: any) => s !== obj); }
    else if (type === 'foundation') { state.scene.remove(obj.mesh); state.foundations.delete(`${Math.round(obj.x)}_${Math.round(obj.z)}`); }
}

export function applyPaint(type: string, obj: any, props: any) {
    if (type === 'node') {
        obj.level = props.level;
        let jProps = JOINT_PROPS[props.level];
        obj.mesh.geometry.dispose();
        obj.mesh.geometry = new THREE.SphereGeometry(jProps.radius, 16, 16);
        obj.mesh.material.color.setHex(jProps.color);
    } else if (type === 'beam') {
        obj.material = props.material;
        let fProps = MAT_PROPS[props.material];
        obj.mesh.material.color.setHex(fProps.color);
        obj.mesh.material.roughness = fProps.roughness;
        obj.mesh.material.metalness = fProps.metalness;
    } else if (type === 'panel') {
        obj.material = props.material;
        let pProps = MAT_PROPS[props.material];
        if (props.massText) {
            obj.massText = props.massText;
            obj.mesh.material = getDynamicPanelMaterial(props.material, props.massText);
        } else {
            obj.mesh.material.color.setHex(pProps.color);
            obj.mesh.material.roughness = pProps.roughness;
            obj.mesh.material.metalness = pProps.metalness;
            obj.mesh.material.map = null;
            obj.mesh.material.needsUpdate = true;
        }
    }
}

export function getOrMakeNode(pos: THREE.Vector3, forceLevel: number | null = null) {
    let isGround = Math.abs(pos.y) < 0.01;
    let level = forceLevel !== null ? forceLevel : (isGround ? 4 : state.currentJointLevel);

    let exists = state.nodes.find((n: any) => n.pos.distanceTo(pos) < 0.1);
    if (exists) {
        if (forceLevel !== null && level > exists.level) {
            if (state.currentAction) state.currentAction.paints.push({ objType: 'node', obj: exists, oldProps: { level: exists.level }, newProps: { level: level } });
            exists.level = level;
            let props = JOINT_PROPS[level];
            exists.mesh.geometry.dispose();
            exists.mesh.geometry = new THREE.SphereGeometry(props.radius, 16, 16);
            exists.mesh.material.color.setHex(props.color);
        }
        return exists;
    }

    let props = JOINT_PROPS[level];
    const geo = new THREE.SphereGeometry(props.radius, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: props.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.frustumCulled = false; 
    state.scene.add(mesh);

    let n = { 
        id: state.nextId++, 
        designPos: pos.clone(),
        pos: pos.clone(), 
        oldPos: pos.clone(), 
        originalPos: pos.clone(), 
        isFixed: isGround, 
        originalIsFixed: isGround,
        mass: 1.0, 
        mesh: mesh,
        level: level,
        broken: false,
        maxStrain: 0,
        connectedNodes: new Set(),
        hasFoundation: false,
        liquefactionLoad: 0,
        tiltBias: 1.0
    };
    if (state.currentAction) state.currentAction.added.nodes.push(n);
    state.nodes.push(n);
    return n;
}

export function getOrMakeFoundation(x: number, z: number) {
    let key = `${Math.round(x)}_${Math.round(z)}`;
    if (state.foundations.has(key)) return state.foundations.get(key);
    
    let geo = new THREE.BoxGeometry(state.GRID_SIZE + 1.6, 0.2, state.GRID_SIZE + 1.6);
    let mat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, metalness: 0.1 });
    let mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + state.GRID_SIZE/2, 0.02, z + state.GRID_SIZE/2);
    mesh.receiveShadow = true;
    state.scene.add(mesh);
    
    let f = { x: x, z: z, mesh: mesh };
    state.foundations.set(key, f);
    
    if (state.currentAction) state.currentAction.added.foundations.push(f);
    
    return f;
}

export function removeFoundationAt(x: number, z: number) {
    let key = `${Math.round(x)}_${Math.round(z)}`;
    if (state.foundations.has(key)) {
        let f = state.foundations.get(key);
        if (state.currentAction) state.currentAction.removed.foundations.push(f);
        removeFromSceneAndArrays('foundation', f);
        return true;
    }
    return false;
}

export function checkFoundation(nx: number, nz: number) {
    let r = state.GRID_SIZE;
    let keys = [
        `${Math.round(nx)}_${Math.round(nz)}`,
        `${Math.round(nx - r)}_${Math.round(nz)}`,
        `${Math.round(nx)}_${Math.round(nz - r)}`,
        `${Math.round(nx - r)}_${Math.round(nz - r)}`
    ];
    return keys.some(k => state.foundations.has(k));
}

export function getOrMakeBeam(n1: any, n2: any, matType: string, isHidden = false) {
    if (!n1 || !n2 || n1 === n2) return null;
    let exists = state.beams.find((b: any) => ((b.n1 === n1 && b.n2 === n2) || (b.n2 === n1 && b.n1 === n2)));
    if (exists) return exists;
    
    let props = MAT_PROPS[matType] || MAT_PROPS['steel'];
    let distance = n1.pos.distanceTo(n2.pos);
    
    const geo = new THREE.CylinderGeometry(props.radius, props.radius, 1, 8); 
    geo.rotateX(Math.PI / 2); 
    const mat = new THREE.MeshStandardMaterial({ 
        color: props.color, 
        roughness: props.roughness,
        metalness: props.metalness,
        transparent: false, 
        depthWrite: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.position.copy(n1.pos).lerp(n2.pos, 0.5);
    mesh.lookAt(n2.pos);
    mesh.scale.set(1, 1, distance);
    mesh.frustumCulled = false; 
    mesh.visible = !isHidden;
    state.scene.add(mesh);
    
    let b = { id: state.nextId++, n1: n1, n2: n2, material: matType, mesh: mesh, originalDist: distance, broken: false, currentStrain: 0, isHidden: isHidden };
    if (state.currentAction) state.currentAction.added.beams.push(b);
    state.beams.push(b);
    return b;
}

export function getOrMakePanel(pNodes: any[], frameMatType = 'wood', panelMatType = 'cement') {
    let exists = state.panels.find((p: any) => p.nodes.length === pNodes.length && pNodes.every((n: any) => p.nodes.includes(n)));
    if (exists) return exists;

    let props = MAT_PROPS[panelMatType];

    for(let i=0; i<pNodes.length; i++) {
        getOrMakeBeam(pNodes[i], pNodes[(i+1)%pNodes.length], frameMatType);
    }

    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array(pNodes.length * 3);
    for(let i=0; i<pNodes.length; i++) {
        vertices[i*3] = pNodes[i].pos.x; vertices[i*3+1] = pNodes[i].pos.y; vertices[i*3+2] = pNodes[i].pos.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    if (pNodes.length === 4) geo.setIndex([0, 1, 2, 0, 2, 3]);
    else if (pNodes.length === 3) geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ 
        color: props.color, 
        roughness: props.roughness,
        metalness: props.metalness,
        side: THREE.DoubleSide, 
        transparent: false, 
        depthWrite: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; 
    state.scene.add(mesh);

    let origDists = [];
    for(let i=0; i<pNodes.length; i++) {
        for(let j=i+1; j<pNodes.length; j++) {
            origDists.push({ i: i, j: j, dist: pNodes[i].pos.distanceTo(pNodes[j].pos) });
        }
    }

    let panel = { id: state.nextId++, nodes: [...pNodes], mesh: mesh, broken: false, origDists: origDists, material: panelMatType, isWeight: false, massText: null };
    if (state.currentAction) state.currentAction.added.panels.push(panel);
    state.panels.push(panel);
    return panel;
}

export function getOrMakeWeightPanel(pNodes: any[], mass: number) {
    let exists = state.panels.find((p: any) => p.nodes.length === pNodes.length && pNodes.every((n: any) => p.nodes.includes(n)));
    if (exists) return exists;

    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array(12);
    for(let i=0; i<4; i++) {
        vertices[i*3] = pNodes[i].pos.x; vertices[i*3+1] = pNodes[i].pos.y; vertices[i*3+2] = pNodes[i].pos.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    
    const uvs = new Float32Array([ 0,0, 1,0, 1,1, 0,1 ]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const mat = getWeightMaterial(mass);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; 
    state.scene.add(mesh);

    let origDists = [];
    for(let i=0; i<pNodes.length; i++) {
        for(let j=i+1; j<pNodes.length; j++) {
            origDists.push({ i: i, j: j, dist: pNodes[i].pos.distanceTo(pNodes[j].pos) });
        }
    }

    let panel = { id: state.nextId++, nodes: [...pNodes], mesh: mesh, broken: false, origDists: origDists, material: 'weight', isWeight: true, mass: mass };
    if (state.currentAction) state.currentAction.added.panels.push(panel);
    state.panels.push(panel);
    return panel;
}

export function checkAndVoxelizeAffectedPanels() {
    let panelsToVoxelize = new Set<any>();
    
    state.nodes.forEach((n: any) => {
        state.panels.forEach((p: any) => {
            if (panelsToVoxelize.has(p)) return;
            if (p.nodes.includes(n)) return; 

            let minX = Math.min(...p.nodes.map((node: any)=>node.originalPos.x));
            let maxX = Math.max(...p.nodes.map((node: any)=>node.originalPos.x));
            let minY = Math.min(...p.nodes.map((node: any)=>node.originalPos.y));
            let maxY = Math.max(...p.nodes.map((node: any)=>node.originalPos.y));
            let minZ = Math.min(...p.nodes.map((node: any)=>node.originalPos.z));
            let maxZ = Math.max(...p.nodes.map((node: any)=>node.originalPos.z));

            let isHorizontal = (maxY - minY) < 0.1;
            let isVerticalX = (maxX - minX) < 0.1;
            let isVerticalZ = (maxZ - minZ) < 0.1;

            let margin = 0.05;

            if (isHorizontal && Math.abs(n.originalPos.y - minY) < margin) {
                if (n.originalPos.x >= minX - margin && n.originalPos.x <= maxX + margin &&
                    n.originalPos.z >= minZ - margin && n.originalPos.z <= maxZ + margin) {
                    panelsToVoxelize.add(p);
                }
            }
            else if (isVerticalX && Math.abs(n.originalPos.x - minX) < margin) {
                if (n.originalPos.y >= minY - margin && n.originalPos.y <= maxY + margin &&
                    n.originalPos.z >= minZ - margin && n.originalPos.z <= maxZ + margin) {
                    panelsToVoxelize.add(p);
                }
            }
            else if (isVerticalZ && Math.abs(n.originalPos.z - minZ) < margin) {
                if (n.originalPos.x >= minX - margin && n.originalPos.x <= maxX + margin &&
                    n.originalPos.y >= minY - margin && n.originalPos.y <= maxY + margin) {
                    panelsToVoxelize.add(p);
                }
            }
        });
    });

    panelsToVoxelize.forEach(p => {
        voxelizePanel(p);
    });
}

export function voxelizePanel(panel: any) {
    let minX = Math.min(...panel.nodes.map((n: any)=>n.originalPos.x));
    let maxX = Math.max(...panel.nodes.map((n: any)=>n.originalPos.x));
    let minY = Math.min(...panel.nodes.map((n: any)=>n.originalPos.y));
    let maxY = Math.max(...panel.nodes.map((n: any)=>n.originalPos.y));
    let minZ = Math.min(...panel.nodes.map((n: any)=>n.originalPos.z));
    let maxZ = Math.max(...panel.nodes.map((n: any)=>n.originalPos.z));

    let w = Math.round((maxX - minX) / state.GRID_SIZE);
    let h = Math.round((maxY - minY) / state.GRID_SIZE);
    let d = Math.round((maxZ - minZ) / state.GRID_SIZE);

    if (w <= 1 && d <= 1 && h <= 1) return; 

    if (state.currentAction) state.currentAction.removed.panels.push(panel);
    state.scene.remove(panel.mesh);
    state.panels = state.panels.filter((p: any) => p !== panel);
    let parentShapes = state.shapes.filter((s: any) => s.panels.includes(panel));
    parentShapes.forEach((s: any) => s.panels = s.panels.filter((p: any) => p !== panel));

    let frameMat = parentShapes.length > 0 && parentShapes[0].beams.length > 0 ? parentShapes[0].beams[0].material : 'wood';
    let panelMat = panel.material;

    if (maxY - minY < 0.1 && w > 0 && d > 0) { 
        for(let ix = 0; ix < w; ix++) {
            for(let iz = 0; iz < d; iz++) {
                let n00 = getOrMakeNode(new THREE.Vector3(minX + ix*state.GRID_SIZE, minY, minZ + iz*state.GRID_SIZE));
                let n10 = getOrMakeNode(new THREE.Vector3(minX + (ix+1)*state.GRID_SIZE, minY, minZ + iz*state.GRID_SIZE));
                let n01 = getOrMakeNode(new THREE.Vector3(minX + ix*state.GRID_SIZE, minY, minZ + (iz+1)*state.GRID_SIZE));
                let n11 = getOrMakeNode(new THREE.Vector3(minX + (ix+1)*state.GRID_SIZE, minY, minZ + (iz+1)*state.GRID_SIZE));

                let newP = getOrMakePanel([n00, n10, n11, n01], frameMat, panelMat);
                parentShapes.forEach((s: any) => {
                    if(newP && !s.panels.includes(newP)) s.panels.push(newP);
                    [n00, n10, n01, n11].forEach(n => { if(!s.nodes.includes(n)) s.nodes.push(n); });
                });
            }
        }
    } else if (maxX - minX < 0.1 && h > 0 && d > 0) { 
        for(let iy = 0; iy < h; iy++) {
            for(let iz = 0; iz < d; iz++) {
                let n00 = getOrMakeNode(new THREE.Vector3(minX, minY + iy*state.GRID_SIZE, minZ + iz*state.GRID_SIZE));
                let n10 = getOrMakeNode(new THREE.Vector3(minX, minY + (iy+1)*state.GRID_SIZE, minZ + iz*state.GRID_SIZE));
                let n01 = getOrMakeNode(new THREE.Vector3(minX, minY + iy*state.GRID_SIZE, minZ + (iz+1)*state.GRID_SIZE));
                let n11 = getOrMakeNode(new THREE.Vector3(minX, minY + (iy+1)*state.GRID_SIZE, minZ + (iz+1)*state.GRID_SIZE));

                let newP = getOrMakePanel([n00, n10, n11, n01], frameMat, panelMat);
                parentShapes.forEach((s: any) => {
                    if(newP && !s.panels.includes(newP)) s.panels.push(newP);
                    [n00, n10, n01, n11].forEach(n => { if(!s.nodes.includes(n)) s.nodes.push(n); });
                });
            }
        }
    } else if (maxZ - minZ < 0.1 && w > 0 && h > 0) { 
        for(let ix = 0; ix < w; ix++) {
            for(let iy = 0; iy < h; iy++) {
                let n00 = getOrMakeNode(new THREE.Vector3(minX + ix*state.GRID_SIZE, minY + iy*state.GRID_SIZE, minZ));
                let n10 = getOrMakeNode(new THREE.Vector3(minX + (ix+1)*state.GRID_SIZE, minY + iy*state.GRID_SIZE, minZ));
                let n01 = getOrMakeNode(new THREE.Vector3(minX + ix*state.GRID_SIZE, minY + (iy+1)*state.GRID_SIZE, minZ));
                let n11 = getOrMakeNode(new THREE.Vector3(minX + (ix+1)*state.GRID_SIZE, minY + (iy+1)*state.GRID_SIZE, minZ));

                let newP = getOrMakePanel([n00, n10, n11, n01], frameMat, panelMat);
                parentShapes.forEach((s: any) => {
                    if(newP && !s.panels.includes(newP)) s.panels.push(newP);
                    [n00, n10, n01, n11].forEach(n => { if(!s.nodes.includes(n)) s.nodes.push(n); });
                });
            }
        }
    }
}

export function placeWeightBlock(pos: THREE.Vector3, mass: number) {
    let x = pos.x, y = pos.y, z = pos.z;
    let dx = state.GRID_SIZE, dy = state.GRID_SIZE, dz = state.GRID_SIZE;

    let hbGeo = new THREE.BoxGeometry(dx, dy, dz);
    let hbMat = new THREE.MeshBasicMaterial({ visible: false });
    let hbMesh = new THREE.Mesh(hbGeo, hbMat);
    hbMesh.position.set(x + dx/2, y + dy/2, z + dz/2);
    state.scene.add(hbMesh);

    let shapeObj = { id: state.nextId++, beams: [] as any[], panels: [] as any[], nodes: [] as any[], hitbox: hbMesh, isWeightBlock: true };
    if (state.currentAction) state.currentAction.added.shapes.push(shapeObj);
    state.shapes.push(shapeObj);

    function tN(n: any) { if(n && !shapeObj.nodes.includes(n)) shapeObj.nodes.push(n); return n; }
    function tB(b: any) { if(b && !shapeObj.beams.includes(b)) shapeObj.beams.push(b); return b; }
    function tP(p: any) { if(p && !shapeObj.panels.includes(p)) shapeObj.panels.push(p); return p; }

    let n000 = tN(getOrMakeNode(new THREE.Vector3(x, y, z), 3));
    let n100 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z), 3));
    let n001 = tN(getOrMakeNode(new THREE.Vector3(x, y, z+dz), 3));
    let n101 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z+dz), 3));
    let n010 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z), 3));
    let n110 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z), 3));
    let n011 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z+dz), 3));
    let n111 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z+dz), 3));

    let faces = [
        [n000, n100, n101, n001], [n010, n110, n111, n011], [n000, n100, n110, n010],
        [n001, n101, n111, n011], [n000, n001, n011, n010], [n100, n101, n111, n110]
    ];

    faces.forEach(f => {
        for(let i=0; i<f.length; i++) tB(getOrMakeBeam(f[i], f[(i+1)%f.length], 'weight', true));
    });
    faces.forEach(f => {
        tB(getOrMakeBeam(f[0], f[2], 'weight', true)); tB(getOrMakeBeam(f[1], f[3], 'weight', true));
    });
    tB(getOrMakeBeam(n000, n111, 'weight', true)); tB(getOrMakeBeam(n100, n011, 'weight', true));
    tB(getOrMakeBeam(n001, n110, 'weight', true)); tB(getOrMakeBeam(n101, n010, 'weight', true));

    faces.forEach(f => tP(getOrMakeWeightPanel(f, mass)));

    checkAndVoxelizeAffectedPanels();
}

export function placeShape(pos: THREE.Vector3, type: string, w: number, h: number, d: number, rot: number, isRightAngle: boolean, usePanels: boolean, frameMat: string, panelMat: string) {
    let x = pos.x, y = pos.y, z = pos.z;
    let dx = w * state.GRID_SIZE, dy = h * state.GRID_SIZE, dz = d * state.GRID_SIZE;

    let trussSidesEl = document.getElementById('trussSides') as HTMLInputElement;
    let trussTopEl = document.getElementById('trussTop') as HTMLInputElement;
    let trussBottomEl = document.getElementById('trussBottom') as HTMLInputElement;

    let trussSides = trussSidesEl ? trussSidesEl.checked : true;
    let trussTop = trussTopEl ? trussTopEl.checked : false;
    let trussBottom = trussBottomEl ? trussBottomEl.checked : false;

    let hbGeo = new THREE.BoxGeometry(dx, dy, dz);
    let hbMat = new THREE.MeshBasicMaterial({ visible: false });
    let hbMesh = new THREE.Mesh(hbGeo, hbMat);
    hbMesh.position.set(x + dx/2, y + dy/2, z + dz/2);
    state.scene.add(hbMesh);

    let shapeObj = { id: state.nextId++, beams: [] as any[], panels: [] as any[], nodes: [] as any[], hitbox: hbMesh, isWeightBlock: false };
    if (state.currentAction) state.currentAction.added.shapes.push(shapeObj);
    state.shapes.push(shapeObj);

    function tN(n: any) { if(n && !shapeObj.nodes.includes(n)) shapeObj.nodes.push(n); return n; }
    function tB(b: any) { if(b && !shapeObj.beams.includes(b)) shapeObj.beams.push(b); return b; }
    function tP(p: any) { if(p && !shapeObj.panels.includes(p)) shapeObj.panels.push(p); return p; }

    let n000 = tN(getOrMakeNode(new THREE.Vector3(x, y, z)));
    let n100 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z)));
    let n001 = tN(getOrMakeNode(new THREE.Vector3(x, y, z+dz)));
    let n101 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z+dz)));

    let newPanels: any[] = [];

    if (type === 'cube') {
        let n010 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z)));
        let n110 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z)));
        let n011 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z+dz)));
        let n111 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z+dz)));

        let faces = [
            [n000, n100, n101, n001], [n010, n110, n111, n011], [n000, n100, n110, n010],
            [n001, n101, n111, n011], [n000, n001, n011, n010], [n100, n101, n111, n110]
        ];

        faces.forEach(f => {
            for(let i=0; i<f.length; i++) tB(getOrMakeBeam(f[i], f[(i+1)%f.length], frameMat));
        });

        if (usePanels) faces.forEach(f => newPanels.push(tP(getOrMakePanel(f, frameMat, panelMat))));
        
        if (trussBottom) { tB(getOrMakeBeam(faces[0][0], faces[0][2], frameMat)); tB(getOrMakeBeam(faces[0][1], faces[0][3], frameMat)); }
        if (trussTop) { tB(getOrMakeBeam(faces[1][0], faces[1][2], frameMat)); tB(getOrMakeBeam(faces[1][1], faces[1][3], frameMat)); }
        if (trussSides) {
            [faces[2], faces[3], faces[4], faces[5]].forEach(f => {
                tB(getOrMakeBeam(f[0], f[2], frameMat)); tB(getOrMakeBeam(f[1], f[3], frameMat));
            });
        }
    } else if (type === 'roof') {
        let r0x = 0, r0z = 0, r1x = 0, r1z = 0;
        if (rot === 0) {
            r0z = 0; r1z = dz; r0x = r1x = isRightAngle ? 0 : dx/2;
        } else if (rot === 90) {
            r0x = 0; r1x = dx; r0z = r1z = isRightAngle ? 0 : dz/2;
        } else if (rot === 180) {
            r0z = 0; r1z = dz; r0x = r1x = isRightAngle ? dx : dx/2;
        } else if (rot === 270) {
            r0x = 0; r1x = dx; r0z = r1z = isRightAngle ? dz : dz/2;
        }

        let r0 = tN(getOrMakeNode(new THREE.Vector3(x + r0x, y + dy, z + r0z)));
        let r1 = tN(getOrMakeNode(new THREE.Vector3(x + r1x, y + dy, z + r1z)));

        let quadFaces: any[] = [];
        let triFaces: any[] = [];

        if (rot === 0 || rot === 180) {
            quadFaces = [[n000, n100, n101, n001], [n000, r0, r1, n001], [n100, r0, r1, n101]];
            triFaces = [[n000, n100, r0], [n001, n101, r1]];
        } else {
            quadFaces = [[n000, n100, n101, n001], [n000, n100, r1, r0], [n001, n101, r1, r0]];
            triFaces = [[n000, n001, r0], [n100, n101, r1]];
        }

        quadFaces.forEach(f => {
            for(let i=0; i<f.length; i++) tB(getOrMakeBeam(f[i], f[(i+1)%f.length], frameMat));
        });
        triFaces.forEach(f => {
            for(let i=0; i<f.length; i++) tB(getOrMakeBeam(f[i], f[(i+1)%f.length], frameMat));
        });

        if (usePanels) {
            quadFaces.forEach(f => newPanels.push(tP(getOrMakePanel(f, frameMat, panelMat)))); 
            triFaces.forEach(f => newPanels.push(tP(getOrMakePanel(f, frameMat, panelMat))));
        } 
        
        if (trussBottom) { tB(getOrMakeBeam(quadFaces[0][0], quadFaces[0][2], frameMat)); tB(getOrMakeBeam(quadFaces[0][1], quadFaces[0][3], frameMat)); }
        
        if (trussSides) {
            tB(getOrMakeBeam(quadFaces[1][0], quadFaces[1][2], frameMat));
            tB(getOrMakeBeam(quadFaces[1][1], quadFaces[1][3], frameMat));
            tB(getOrMakeBeam(quadFaces[2][0], quadFaces[2][2], frameMat));
            tB(getOrMakeBeam(quadFaces[2][1], quadFaces[2][3], frameMat));
        }
    } else if (type === 'octagon') {
        let cx = x + dx/2, cz = z + dz/2;
        let rx = dx/2, rz = dz/2;
        let bottomNodes = [];
        let topNodes = [];
        for(let i=0; i<8; i++) {
            let ang = (i / 8) * Math.PI * 2 + (Math.PI / 8) + (rot * Math.PI / 180);
            bottomNodes.push(tN(getOrMakeNode(new THREE.Vector3(cx + Math.cos(ang) * rx, y, cz + Math.sin(ang) * rz))));
            topNodes.push(tN(getOrMakeNode(new THREE.Vector3(cx + Math.cos(ang) * rx, y + dy, cz + Math.sin(ang) * rz))));
        }
        for(let i=0; i<8; i++) {
            let next = (i+1)%8;
            tB(getOrMakeBeam(bottomNodes[i], bottomNodes[next], frameMat));
            tB(getOrMakeBeam(topNodes[i], topNodes[next], frameMat));
            tB(getOrMakeBeam(bottomNodes[i], topNodes[i], frameMat));
            if (usePanels) {
                newPanels.push(tP(getOrMakePanel([bottomNodes[i], bottomNodes[next], topNodes[next], topNodes[i]], frameMat, panelMat)));
            }
            if (trussSides) tB(getOrMakeBeam(bottomNodes[i], topNodes[next], frameMat));
        }
        if (usePanels) {
            newPanels.push(tP(getOrMakePanel(bottomNodes, frameMat, panelMat)));
            newPanels.push(tP(getOrMakePanel(topNodes, frameMat, panelMat)));
        }
    } else if (type === 'sphere') {
        let cx = x + dx/2, cy = y + dy/2, cz = z + dz/2;
        let rx = dx/2, ry = dy/2, rz = dz/2;
        let steps = 4;
        let sphereNodes: any[][] = [];
        for(let i=0; i<=steps; i++) {
            let lat = (i / steps) * Math.PI;
            sphereNodes[i] = [];
            for(let j=0; j<steps; j++) {
                let lon = (j / steps) * Math.PI * 2;
                let px = cx + rx * Math.sin(lat) * Math.cos(lon);
                let py = cy + ry * Math.cos(lat);
                let pz = cz + rz * Math.sin(lat) * Math.sin(lon);
                sphereNodes[i][j] = tN(getOrMakeNode(new THREE.Vector3(px, py, pz)));
            }
        }
        for(let i=0; i<steps; i++) {
            for(let j=0; j<steps; j++) {
                let nextJ = (j+1)%steps;
                tB(getOrMakeBeam(sphereNodes[i][j], sphereNodes[i][nextJ], frameMat));
                tB(getOrMakeBeam(sphereNodes[i][j], sphereNodes[i+1][j], frameMat));
                if (usePanels) {
                    newPanels.push(tP(getOrMakePanel([sphereNodes[i][j], sphereNodes[i][nextJ], sphereNodes[i+1][nextJ], sphereNodes[i+1][j]], frameMat, panelMat)));
                }
                if (trussSides) tB(getOrMakeBeam(sphereNodes[i][j], sphereNodes[i+1][nextJ], frameMat));
            }
        }
    } else if (type === 'arch' || type === 'half-arch') {
        let segs = type === 'arch' ? 8 : 4;
        let archNodes1 = [];
        let archNodes2 = [];

        // Cube frame nodes
        let n000 = tN(getOrMakeNode(new THREE.Vector3(x, y, z)));
        let n100 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z)));
        let n001 = tN(getOrMakeNode(new THREE.Vector3(x, y, z+dz)));
        let n101 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y, z+dz)));
        let n010 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z)));
        let n110 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z)));
        let n011 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z+dz)));
        let n111 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z+dz)));

        // Cube frame beams
        let cubeFaces = [
            [n000, n100, n101, n001], [n010, n110, n111, n011], [n000, n100, n110, n010],
            [n001, n101, n111, n011], [n000, n001, n011, n010], [n100, n101, n111, n110]
        ];
        cubeFaces.forEach(f => {
            for(let i=0; i<f.length; i++) tB(getOrMakeBeam(f[i], f[(i+1)%f.length], frameMat));
        });

        for(let i=0; i<=segs; i++) {
            let ang = (i / 8) * Math.PI;
            let px = Math.cos(ang) * dx/2;
            let py = Math.sin(ang) * dy;
            
            if (rot === 180 || rot === 270) px = -px;

            let x1, z1, x2, z2;
            if (rot === 0 || rot === 180) {
                x1 = x + dx/2 + px; z1 = z;
                x2 = x + dx/2 + px; z2 = z + dz;
            } else {
                x1 = x; z1 = z + dz/2 + px;
                x2 = x + dx; z2 = z + dz/2 + px;
            }
            let a1 = tN(getOrMakeNode(new THREE.Vector3(x1, y + py, z1)));
            let a2 = tN(getOrMakeNode(new THREE.Vector3(x2, y + py, z2)));
            archNodes1.push(a1);
            archNodes2.push(a2);

            // Connect arch to cube top
            let top1, top2;
            if (rot === 0 || rot === 180) {
                top1 = tN(getOrMakeNode(new THREE.Vector3(x1, y+dy, z)));
                top2 = tN(getOrMakeNode(new THREE.Vector3(x2, y+dy, z+dz)));
            } else {
                top1 = tN(getOrMakeNode(new THREE.Vector3(x, y+dy, z1)));
                top2 = tN(getOrMakeNode(new THREE.Vector3(x+dx, y+dy, z2)));
            }
            tB(getOrMakeBeam(a1, top1, frameMat));
            tB(getOrMakeBeam(a2, top2, frameMat));

            // Extra structural support: connect each arch node to the closest corners of the frame
            let corners = [n000, n100, n001, n101, n010, n110, n011, n111];
            let closest1 = corners[0], minDist1 = Infinity;
            let closest2 = corners[0], minDist2 = Infinity;
            
            corners.forEach(c => {
                let d1 = a1.pos.distanceTo(c.pos);
                if (d1 < minDist1) { minDist1 = d1; closest1 = c; }
                let d2 = a2.pos.distanceTo(c.pos);
                if (d2 < minDist2) { minDist2 = d2; closest2 = c; }
            });
            
            tB(getOrMakeBeam(a1, closest1, frameMat));
            tB(getOrMakeBeam(a2, closest2, frameMat));

            // For full arch peak (i=4), connect to all top corners for extra stability
            if (type === 'arch' && i === 4) {
                [n010, n110, n011, n111].forEach(c => {
                    tB(getOrMakeBeam(a1, c, frameMat));
                    tB(getOrMakeBeam(a2, c, frameMat));
                });
            }
        }
        for(let i=0; i<segs; i++) {
            tB(getOrMakeBeam(archNodes1[i], archNodes1[i+1], frameMat));
            tB(getOrMakeBeam(archNodes2[i], archNodes2[i+1], frameMat));
            tB(getOrMakeBeam(archNodes1[i], archNodes2[i], frameMat));
            if (i === segs - 1) tB(getOrMakeBeam(archNodes1[i+1], archNodes2[i+1], frameMat));
            
            if (usePanels) {
                newPanels.push(tP(getOrMakePanel([archNodes1[i], archNodes1[i+1], archNodes2[i+1], archNodes2[i]], frameMat, panelMat)));
            }
            if (trussSides) tB(getOrMakeBeam(archNodes1[i], archNodes2[i+1], frameMat));
        }
    }

    checkAndVoxelizeAffectedPanels();

    let totalMass = 0;
    shapeObj.beams.forEach(b => { totalMass += b.originalDist * MAT_PROPS[frameMat].massMulti; });
    shapeObj.panels.forEach(p => { totalMass += (state.GRID_SIZE * state.GRID_SIZE) * 2.0 * MAT_PROPS[panelMat].massMulti; });
    
    if (totalMass > 0 && usePanels) {
        let massText = totalMass.toFixed(1) + 't';
        newPanels.forEach(p => {
            p.massText = massText;
            if (p.mesh) p.mesh.material = getDynamicPanelMaterial(panelMat, massText);
        });
    }
}

export function deleteFullShape(shapeObj: any) {
    if (state.currentAction) state.currentAction.removed.shapes.push(shapeObj);
    state.scene.remove(shapeObj.hitbox);
    state.shapes = state.shapes.filter((s: any) => s !== shapeObj);

    shapeObj.panels.forEach((p: any) => {
        let isShared = state.shapes.some((s: any) => s.panels.includes(p));
        if (!isShared) {
            if (state.currentAction) state.currentAction.removed.panels.push(p);
            state.scene.remove(p.mesh);
            state.panels = state.panels.filter((panel: any) => panel !== p);
        }
    });

    shapeObj.beams.forEach((b: any) => {
        let isShared = state.shapes.some((s: any) => s.beams.includes(b));
        if (!isShared) {
            if (state.currentAction) state.currentAction.removed.beams.push(b);
            if (!b.isHidden) state.scene.remove(b.mesh);
            state.beams = state.beams.filter((beam: any) => beam !== b);
        }
    });

    state.nodes = state.nodes.filter((n: any) => {
        let usedByBeam = state.beams.some((b: any) => b.n1 === n || b.n2 === n);
        let usedByPanel = state.panels.some((p: any) => p.nodes.includes(n));
        if (!usedByBeam && !usedByPanel) {
            if (state.currentAction) state.currentAction.removed.nodes.push(n);
            state.scene.remove(n.mesh);
            return false;
        }
        return true;
    });
}

export function clearAll() {
    if (state.simActive) {
        // We will call stopSimulation from Physics, but we can't import it directly due to circular deps.
        // So we'll emit an event or just let the UI handle it.
    }
    state.nodes.forEach((n: any) => { if (state.currentAction) state.currentAction.removed.nodes.push(n); state.scene.remove(n.mesh); });
    state.beams.forEach((b: any) => { if (state.currentAction) state.currentAction.removed.beams.push(b); if(!b.isHidden) state.scene.remove(b.mesh); });
    state.panels.forEach((p: any) => { if (state.currentAction) state.currentAction.removed.panels.push(p); state.scene.remove(p.mesh); });
    state.shapes.forEach((s: any) => { if (state.currentAction) state.currentAction.removed.shapes.push(s); state.scene.remove(s.hitbox); });
    state.foundations.forEach((f: any) => { if (state.currentAction) state.currentAction.removed.foundations.push(f); state.scene.remove(f.mesh); });
    state.nodes = []; state.beams = []; state.panels = []; state.shapes = []; state.foundations.clear();
    
    const timeDisplay = document.getElementById('timeDisplay');
    const intactMassDisplay = document.getElementById('intactMassDisplay');
    const destroyedMassDisplay = document.getElementById('destroyedMassDisplay');
    const heightDisplay = document.getElementById('heightDisplay');
    const peakHeightDisplay = document.getElementById('peakHeightDisplay');
    if (timeDisplay) timeDisplay.innerText = '0.0s';
    if (intactMassDisplay) intactMassDisplay.innerText = '0.0t';
    if (destroyedMassDisplay) destroyedMassDisplay.innerText = '0.0t';
    if (heightDisplay) heightDisplay.innerText = '0.0m';
    if (peakHeightDisplay) peakHeightDisplay.innerText = '0.0m';
    state.maxPeakHeight = 0;
}

export function buildTestCity(density = 'med') {
    clearAll();
    
    const plotSize = 8; 
    let startX, endX, startZ, endZ;
    let emptyLotChance, houseProb, aptProb;

    if (density === 'low') {
        startX = -8; endX = 8;     
        startZ = -8; endZ = 8;  
        emptyLotChance = 0.4;
        houseProb = 0.70; 
        aptProb = 0.95;   
    } else if (density === 'high') {
        startX = -16; endX = 8;     
        startZ = -16; endZ = 8;
        emptyLotChance = 0.2;
        houseProb = 0.35; 
        aptProb = 0.75;   
    } else { 
        startX = -16; endX = 8;     
        startZ = -16; endZ = 8;
        emptyLotChance = 0.3;
        houseProb = 0.55; 
        aptProb = 0.85;   
    }
    
    let backupJoint = state.currentJointLevel;
    
    let cbSides = document.getElementById('trussSides') as HTMLInputElement;
    let cbTop = document.getElementById('trussTop') as HTMLInputElement;
    let cbBottom = document.getElementById('trussBottom') as HTMLInputElement;
    
    let oldTrussSides = cbSides ? cbSides.checked : true;
    let oldTrussTop = cbTop ? cbTop.checked : false;
    let oldTrussBottom = cbBottom ? cbBottom.checked : false;

    if (cbTop) cbTop.checked = false;
    if (cbBottom) cbBottom.checked = false;

    for (let x = startX; x <= endX; x += plotSize) {
        for (let z = startZ; z <= endZ; z += plotSize) {
            if (Math.random() < emptyLotChance) continue; 
            
            let bType = Math.random();
            let bW, bD, bH, stories, hasRoof, frameM, panelM, jointL;
            
            if (bType < houseProb) { 
                bW = Math.floor(Math.random() * 2) + 1; 
                bD = Math.floor(Math.random() * 2) + 1; 
                bH = 1; 
                stories = Math.floor(Math.random() * 2) + 1; 
                hasRoof = true;
                frameM = 'wood';
                panelM = Math.random() < 0.5 ? 'wood' : 'cement';
                jointL = Math.floor(Math.random() * 2) + 1; 
                if (cbSides) cbSides.checked = true;
            } else if (bType < aptProb) { 
                bW = Math.floor(Math.random() * 2) + 2; 
                bD = Math.floor(Math.random() * 2) + 2; 
                bH = 1;
                stories = Math.floor(Math.random() * 3) + 2; 
                hasRoof = Math.random() < 0.2;
                frameM = 'cement';
                panelM = 'cement';
                jointL = Math.floor(Math.random() * 2) + 2; 
                if (cbSides) cbSides.checked = Math.random() < 0.5; 
            } else { 
                bW = Math.floor(Math.random() * 2) + 2; 
                bD = Math.floor(Math.random() * 2) + 2; 
                bH = 1;
                stories = Math.floor(Math.random() * 4) + 3; 
                hasRoof = false;
                frameM = 'steel';
                panelM = Math.random() < 0.6 ? 'steel' : 'cement';
                jointL = Math.floor(Math.random() * 2) + 3; 
                if (cbSides) cbSides.checked = true; 
            }
            
            state.currentJointLevel = jointL; 
            
            let maxOffsetX = (plotSize / state.GRID_SIZE) - bW;
            let maxOffsetZ = (plotSize / state.GRID_SIZE) - bD;
            
            let offsetX = Math.floor(Math.random() * (maxOffsetX + 1)) * state.GRID_SIZE;
            let offsetZ = Math.floor(Math.random() * (maxOffsetZ + 1)) * state.GRID_SIZE;
            
            let startPos = new THREE.Vector3(x + offsetX, 0, z + offsetZ);
            
            for (let ix = 0; ix < bW; ix++) {
                for (let iz = 0; iz < bD; iz++) {
                    getOrMakeFoundation(startPos.x + ix*state.GRID_SIZE, startPos.z + iz*state.GRID_SIZE);
                }
            }

            for (let i = 0; i < stories; i++) {
                let y = i * bH * state.GRID_SIZE;
                let w = bW;
                let d = bD;
                let px = startPos.x;
                let pz = startPos.z;
                
                if (i === stories - 1 && stories > 2 && w > 1 && d > 1 && Math.random() < 0.5) {
                    w -= 1;
                    d -= 1;
                    if (Math.random() < 0.5) px += state.GRID_SIZE;
                    if (Math.random() < 0.5) pz += state.GRID_SIZE;
                }
                
                placeShape(new THREE.Vector3(px, y, pz), 'cube', w, bH, d, 0, false, true, frameM, panelM);
                
                if (i === stories - 1 && hasRoof) {
                    let rRot = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
                    placeShape(new THREE.Vector3(px, y + bH * state.GRID_SIZE, pz), 'roof', w, 1, d, rRot, false, true, frameM, frameM);
                }
            }
        }
    }
    
    state.currentJointLevel = backupJoint;
    if (cbSides) cbSides.checked = oldTrussSides;
    if (cbTop) cbTop.checked = oldTrussTop;
    if (cbBottom) cbBottom.checked = oldTrussBottom;
}
