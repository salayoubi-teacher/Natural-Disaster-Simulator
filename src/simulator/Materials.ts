import * as THREE from 'three';
import { MAT_PROPS } from './State';

const panelTextures: any = {};
export function getDynamicPanelMaterial(matType: string, text: string) {
    let key = matType + '_' + text;
    if (!panelTextures[key]) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        
        let props = MAT_PROPS[matType];
        ctx.fillStyle = '#' + props.color.toString(16).padStart(6, '0');
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, 496, 496);

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        if (matType === 'steel' || matType === 'cement') ctx.fillStyle = 'rgba(0,0,0,0.5)'; 
        ctx.font = 'bold 70px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 256);

        panelTextures[key] = new THREE.CanvasTexture(canvas);
    }
    let props = MAT_PROPS[matType];
    return new THREE.MeshStandardMaterial({
        map: panelTextures[key], 
        roughness: props.roughness, 
        metalness: props.metalness, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: props.panelOpacity || 1.0
    });
}

const weightTextures: any = {};
export function getWeightMaterial(mass: number) {
    let key = 'm_' + mass;
    if (!weightTextures[key]) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, '#1e40af'); 
        grad.addColorStop(1, '#0f172a'); 
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 32;
        ctx.strokeRect(16, 16, 480, 480);

        ctx.fillStyle = 'rgba(0,0,0, 0.4)';
        ctx.fillRect(156, 360, 200, 40); 
        ctx.fillRect(216, 280, 80, 80); 
        ctx.beginPath();
        ctx.moveTo(100, 280); ctx.lineTo(412, 280); ctx.lineTo(412, 200); ctx.lineTo(150, 200);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 120px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mass + 'T', 256, 130);

        weightTextures[key] = new THREE.CanvasTexture(canvas);
    }
    return new THREE.MeshStandardMaterial({
        map: weightTextures[key], roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide,
        transparent: true, opacity: 1.0
    });
}
