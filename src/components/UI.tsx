import React, { useEffect, useState } from 'react';
import { state } from '../simulator/State';
import { setMode, changeLayer, updateGhostShape } from '../simulator/Engine';
import { startSimulation, stopSimulation, togglePause } from '../simulator/Physics';
import { buildTestCity, clearAll } from '../simulator/Builder';
import { undo, redo, executeWithAction } from '../simulator/Undo';

export default function UI() {
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        // Setup global UI callbacks for the engine
        state.updateUndoRedoUI = () => {
            const uBtn = document.getElementById('btn-undo') as HTMLButtonElement;
            const rBtn = document.getElementById('btn-redo') as HTMLButtonElement;
            if (uBtn) uBtn.disabled = state.undoStack.length === 0 || state.simActive;
            if (rBtn) rBtn.disabled = state.redoStack.length === 0 || state.simActive;
        };

        state.showMessage = (msg: string) => {
            const box = document.getElementById('msg-box');
            if (!box) return;
            box.innerText = msg;
            box.classList.remove('hidden');
            box.classList.remove('toast-animate');
            void box.offsetWidth; 
            box.classList.add('toast-animate');
            setTimeout(() => {
                box.classList.add('hidden');
                box.classList.remove('toast-animate');
            }, 3000);
        };

        state.updateLayerUI = () => {
            const layerDisplay = document.getElementById('layerDisplay');
            if (layerDisplay) layerDisplay.innerText = `Layer ${state.activeLayer}`;
            const targetY = state.activeLayer * state.GRID_SIZE;
            if (state.placementPlane) state.placementPlane.position.y = targetY;
            if (state.gridHelper) {
                state.gridHelper.position.y = targetY + 0.01;
                if (state.activeLayer === 0) { state.gridHelper.material.color.setHex(0x10b981); } 
                else { state.gridHelper.material.color.setHex(0x3b82f6); }
            }
            if (state.mode === 'shape' || state.mode === 'weight' || state.mode === 'foundation') updateGhostShape();
        };

        state.updateTrussUI = () => {
            const typeEl = document.getElementById('shapeType') as HTMLSelectElement;
            let type = typeEl ? typeEl.value : 'cube';
            let isRoof = (type === 'roof');
            let isArch = (type === 'arch' || type === 'half-arch');
            
            let tTop = document.getElementById('trussTop') as HTMLInputElement;
            if (tTop) { tTop.disabled = isRoof; if (isRoof) tTop.checked = false; }
            
            let raEl = document.getElementById('shapeRightAngle');
            if (raEl) (raEl.parentElement as HTMLElement).style.display = isRoof ? 'flex' : 'none';

            let roofSettings = document.getElementById('roof-settings');
            if (roofSettings) roofSettings.style.display = 'flex';
        };

        // Initialize UI state
        setMode('shape');
        state.updateTrussUI();
    }, []);

    const handleWeightTypeChange = () => {
        let valEl = document.querySelector('input[name="weightClass"]:checked') as HTMLInputElement;
        let val = valEl ? valEl.value : '10';
        let customDiv = document.getElementById('custom-weight-div');
        if (customDiv) {
            if (val === 'custom') {
                customDiv.classList.remove('hidden'); customDiv.classList.add('flex');
            } else {
                customDiv.classList.add('hidden'); customDiv.classList.remove('flex');
            }
        }
        updateGhostShape();
    };

    return (
        <>
            <div id="msg-box" className="hidden absolute top-6 left-1/2 transform -translate-x-1/2 bg-red-500/90 backdrop-blur-md border border-red-400 text-white px-6 py-2 rounded-full shadow-2xl z-50 font-semibold tracking-wide pointer-events-none"></div>

            <div className="absolute top-4 left-4 w-[340px] glass-panel rounded-xl p-4 shadow-2xl overflow-y-auto max-h-[95vh] bg-slate-900/85 backdrop-blur-md border border-white/10 text-slate-200 select-none">
                <h1 className="text-xl font-bold mb-1 text-blue-400 leading-tight">Mr.Alayoubi's Natural Disaster Simulator <span className="text-sm text-slate-500 align-middle">v4.0</span></h1>
                <p className="text-[10px] text-emerald-400 mb-4 font-semibold uppercase tracking-wider mt-1">Dynamic Mass & Rotation Engine</p>

                <div className="mb-3">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Build Layer (Elevation)</h2>
                    <div className="flex items-center justify-between bg-slate-800 rounded p-1.5 border border-slate-700">
                        <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={() => changeLayer(-1)}>▼ Down</button>
                        <span id="layerDisplay" className="font-mono text-lg font-bold text-white">Layer 0</span>
                        <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={() => changeLayer(1)}>▲ Up</button>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1 text-center">Rotate camera: Right Click+Drag | Move: WASD</p>
                </div>

                <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Tools</h2>
                        <div className="flex gap-1">
                            <button id="btn-undo" className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px] text-white transition-colors flex items-center gap-1" onClick={undo} disabled>↩️ Undo</button>
                            <button id="btn-redo" className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-[10px] text-white transition-colors flex items-center gap-1" onClick={redo} disabled>↪️ Redo</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 mb-1">
                        <button id="btn-view" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('view')}>👁️ View</button>
                        <button id="btn-shape" className="mode-btn active px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('shape')}>🧱 Shape</button>
                        <button id="btn-weight" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-blue-900/50 hover:border-blue-500 hover:text-blue-300" onClick={() => setMode('weight')}>🏋️ Wght</button>
                        <button id="btn-foundation" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('foundation')}>🔲 Found.</button>
                        <button id="btn-del-foundation" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('del-foundation')}>🗑️ Found.</button>
                        
                        <button id="btn-node" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('node')}>+ Joint</button>
                        <button id="btn-beam" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('beam')}>+ Beam</button>
                        <button id="btn-panel" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('panel')}>⬛ Panel</button>
                        <button id="btn-paint" className="mode-btn px-1 py-1.5 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('paint')}>🎨 Paint</button>
                        
                        <button id="btn-delete" className="mode-btn px-1 py-1.5 col-span-2 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-slate-700" onClick={() => setMode('delete')}>🗑️ Del Part</button>
                        <button id="btn-del-shape" className="mode-btn px-1 py-1.5 col-span-2 rounded border border-slate-600 text-[9px] font-medium transition-colors hover:bg-red-900/50 hover:text-red-300" onClick={() => setMode('del-shape')}>💣 Del Block</button>
                    </div>

                    <div id="shape-selector" className="animate-fade-in mb-2 bg-slate-800/50 p-2 rounded border border-slate-700">
                        <select id="shapeType" className="bg-slate-700 text-white text-xs p-1.5 w-full rounded mb-2 border border-slate-600 outline-none" onChange={updateGhostShape}>
                            <option value="cube">Cube / Box Base</option>
                            <option value="roof">Triangular Wedge / Roof</option>
                            <option value="octagon">Octagon Column</option>
                            <option value="sphere">Sphere / Dome</option>
                            <option value="arch">Full Arch (8 seg)</option>
                            <option value="half-arch">Half Arch (4 seg)</option>
                        </select>
                        
                        <div className="flex justify-between items-center text-xs text-slate-300 mb-2">
                           <div className="flex flex-col items-center"><span>W</span><input id="shapeW" type="number" min="1" max="10" defaultValue="1" className="w-10 bg-slate-800 p-1 text-center rounded border border-slate-600" onChange={updateGhostShape}/></div>
                           <div className="flex flex-col items-center"><span>H</span><input id="shapeH" type="number" min="1" max="10" defaultValue="1" className="w-10 bg-slate-800 p-1 text-center rounded border border-slate-600" onChange={updateGhostShape}/></div>
                           <div className="flex flex-col items-center"><span>D</span><input id="shapeD" type="number" min="1" max="10" defaultValue="1" className="w-10 bg-slate-800 p-1 text-center rounded border border-slate-600" onChange={updateGhostShape}/></div>
                        </div>

                        <div className="flex gap-2 mt-1 mb-2 items-center" id="roof-settings">
                            <label className="text-[10px] text-slate-300 flex items-center gap-1 cursor-pointer" style={{display: 'none'}}>
                                <input type="checkbox" id="shapeRightAngle" className="accent-blue-500" onChange={updateGhostShape}/> Right Angle
                            </label>
                            <select id="shapeRot" className="bg-slate-700 text-white text-[10px] p-1 rounded border border-slate-600 outline-none w-full" onChange={updateGhostShape}>
                                <option value="0">Rot 0° (Z)</option>
                                <option value="90">Rot 90° (X)</option>
                                <option value="180">Rot 180° (-Z)</option>
                                <option value="270">Rot 270° (-X)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-slate-300 flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="shapePanels" defaultChecked className="accent-blue-500"/> Include Solid Panels
                            </label>
                            <div id="truss-settings" className="mt-1 p-1 bg-slate-900/50 rounded border border-slate-600">
                                <h4 className="text-[9px] text-slate-400 mb-1">Add Diagonal Trusses:</h4>
                                <div className="flex justify-between text-[9px] text-slate-300">
                                    <label><input type="checkbox" id="trussSides" className="accent-blue-500" defaultChecked/> Sides</label>
                                    <label><input type="checkbox" id="trussTop" className="accent-blue-500"/> Top</label>
                                    <label><input type="checkbox" id="trussBottom" className="accent-blue-500"/> Bot.</label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="weight-selector" className="hidden animate-fade-in mb-2 bg-slate-800/50 p-2 rounded border border-blue-900/50">
                        <div className="grid grid-cols-3 gap-1 mb-1">
                            <label className="cursor-pointer">
                                <input type="radio" name="weightClass" value="10" defaultChecked className="hidden peer" onChange={handleWeightTypeChange}/>
                                <div className="text-center text-[10px] py-1 rounded border border-blue-900 bg-blue-900/30 text-blue-400 peer-checked:bg-blue-700 peer-checked:text-white peer-checked:border-blue-500 transition-all font-semibold">Light (10t)</div>
                            </label>
                            <label className="cursor-pointer">
                                <input type="radio" name="weightClass" value="50" className="hidden peer" onChange={handleWeightTypeChange}/>
                                <div className="text-center text-[10px] py-1 rounded border border-blue-900 bg-blue-900/30 text-blue-400 peer-checked:bg-blue-700 peer-checked:text-white peer-checked:border-blue-500 transition-all font-semibold">Heavy (50t)</div>
                            </label>
                            <label className="cursor-pointer">
                                <input type="radio" name="weightClass" value="custom" className="hidden peer" onChange={handleWeightTypeChange}/>
                                <div className="text-center text-[10px] py-1 rounded border border-blue-900 bg-blue-900/30 text-blue-400 peer-checked:bg-blue-700 peer-checked:text-white peer-checked:border-blue-500 transition-all font-semibold">Custom</div>
                            </label>
                        </div>
                        <div id="custom-weight-div" className="hidden justify-between items-center text-xs text-slate-300">
                            <span>Mass (tons):</span>
                            <input id="customWeightInput" type="number" min="1" max="1000" defaultValue="100" className="w-16 bg-slate-900 p-1 text-center rounded border border-blue-600 outline-none focus:border-blue-400" onChange={updateGhostShape}/>
                        </div>
                    </div>

                    <div className="mb-2">
                        <label className="text-[10px] text-emerald-400 flex items-center gap-2 cursor-pointer font-semibold">
                            <input type="checkbox" id="minecraftMode" defaultChecked className="accent-emerald-500"/> Auto-Snap / Stack Blocks
                        </label>
                    </div>

                    <div id="material-selector" className="animate-fade-in space-y-2">
                        <div>
                            <h4 className="text-[9px] text-slate-400 mb-1 uppercase tracking-wide">Joint Strength (Connections)</h4>
                            <div className="flex gap-1 mb-1">
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="jointLevel" value="1" className="hidden peer" onChange={(e) => state.currentJointLevel = parseInt(e.target.value)}/>
                                    <div className="text-center text-[9px] py-1 rounded border border-slate-500 bg-slate-600/30 text-slate-300 peer-checked:bg-slate-500 peer-checked:text-white peer-checked:border-slate-400 transition-all font-semibold">L1: Nailed</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="jointLevel" value="2" defaultChecked className="hidden peer" onChange={(e) => state.currentJointLevel = parseInt(e.target.value)}/>
                                    <div className="text-center text-[9px] py-1 rounded border border-amber-600 bg-amber-600/30 text-amber-500 peer-checked:bg-amber-600 peer-checked:text-white peer-checked:border-amber-500 transition-all font-semibold">L2: Bolted</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="jointLevel" value="3" className="hidden peer" onChange={(e) => state.currentJointLevel = parseInt(e.target.value)}/>
                                    <div className="text-center text-[9px] py-1 rounded border border-blue-600 bg-blue-600/30 text-blue-400 peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-500 transition-all font-semibold">L3: Welded</div>
                                </label>
                                <label className="flex-1 cursor-pointer" title="Only breakable by moving earth">
                                    <input type="radio" name="jointLevel" value="4" className="hidden peer" onChange={(e) => state.currentJointLevel = parseInt(e.target.value)}/>
                                    <div className="text-center text-[9px] py-1 rounded border border-red-800 bg-red-800/30 text-red-400 peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-500 transition-all font-semibold">L4: Anchor</div>
                                </label>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-[9px] text-slate-400 mb-1 uppercase tracking-wide">Frame Material (Beams)</h4>
                            <div className="flex gap-1 mb-1">
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="frameMaterial" value="wood" defaultChecked className="hidden peer" onChange={(e) => state.currentFrameMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-orange-900 bg-orange-900/30 text-orange-500 peer-checked:bg-orange-800 peer-checked:text-white peer-checked:border-orange-600 transition-all font-semibold">Wood</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="frameMaterial" value="cement" className="hidden peer" onChange={(e) => state.currentFrameMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-slate-300 bg-slate-100/30 text-slate-200 peer-checked:bg-white peer-checked:text-slate-900 peer-checked:border-white transition-all font-semibold">Cement</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="frameMaterial" value="steel" className="hidden peer" onChange={(e) => state.currentFrameMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-slate-700 bg-slate-900 text-slate-400 peer-checked:bg-slate-700 peer-checked:text-white peer-checked:border-slate-500 transition-all font-semibold">Steel</div>
                                </label>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-[9px] text-slate-400 mb-1 uppercase tracking-wide">Panel Material (Walls)</h4>
                            <div className="flex gap-1 mb-1">
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="panelMaterial" value="wood" className="hidden peer" onChange={(e) => state.currentPanelMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-orange-900 bg-orange-900/30 text-orange-500 peer-checked:bg-orange-800 peer-checked:text-white peer-checked:border-orange-600 transition-all font-semibold">Wood</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="panelMaterial" value="cement" defaultChecked className="hidden peer" onChange={(e) => state.currentPanelMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-slate-300 bg-slate-100/30 text-slate-200 peer-checked:bg-white peer-checked:text-slate-900 peer-checked:border-white transition-all font-semibold">Cement</div>
                                </label>
                                <label className="flex-1 cursor-pointer">
                                    <input type="radio" name="panelMaterial" value="steel" className="hidden peer" onChange={(e) => state.currentPanelMaterial = e.target.value}/>
                                    <div className="text-center text-[10px] py-1 rounded border border-slate-700 bg-slate-900 text-slate-400 peer-checked:bg-slate-700 peer-checked:text-white peer-checked:border-slate-500 transition-all font-semibold">Steel</div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-3 bg-slate-800 rounded p-2 text-[10px] text-slate-300 italic leading-snug" id="instructions">
                    Hover over existing blocks to stack shapes automatically!
                </div>

                <div className="mb-3 p-2 bg-slate-800/80 border border-slate-600 rounded">
                    <h4 className="text-[9px] text-slate-400 mb-1 uppercase tracking-wide font-semibold">Global Strength Modifiers</h4>
                    <div className="flex flex-col gap-2 text-[10px] text-slate-200">
                        <div className="flex justify-between items-center">
                            <span>Joint Strength:</span>
                            <div className="flex items-center gap-1">
                                <input type="range" id="joint-mult" min="0.1" max="20" step="0.1" defaultValue="1.0" className="w-16 accent-blue-500" onChange={(e) => {
                                    state.globalJointStrengthMultiplier = parseFloat(e.target.value);
                                    (document.getElementById('joint-mult-val') as HTMLInputElement).value = parseFloat(e.target.value).toFixed(1);
                                }}/>
                                <input type="number" id="joint-mult-val" min="0.1" step="0.1" defaultValue="1.0" className="w-12 bg-slate-700 text-blue-400 font-mono text-[10px] px-1 py-1 rounded border border-slate-500 focus:outline-none focus:border-blue-400 text-center" onChange={(e) => {
                                    let val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                        state.globalJointStrengthMultiplier = val;
                                        (document.getElementById('joint-mult') as HTMLInputElement).value = val.toString();
                                    }
                                }}/>
                                <span className="text-slate-400">x</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Material Strength:</span>
                            <div className="flex items-center gap-1">
                                <input type="range" id="mat-mult" min="0.1" max="20" step="0.1" defaultValue="1.0" className="w-16 accent-emerald-500" onChange={(e) => {
                                    state.globalMaterialStrengthMultiplier = parseFloat(e.target.value);
                                    (document.getElementById('mat-mult-val') as HTMLInputElement).value = parseFloat(e.target.value).toFixed(1);
                                }}/>
                                <input type="number" id="mat-mult-val" min="0.1" step="0.1" defaultValue="1.0" className="w-12 bg-slate-700 text-emerald-400 font-mono text-[10px] px-1 py-1 rounded border border-slate-500 focus:outline-none focus:border-emerald-400 text-center" onChange={(e) => {
                                    let val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                        state.globalMaterialStrengthMultiplier = val;
                                        (document.getElementById('mat-mult') as HTMLInputElement).value = val.toString();
                                    }
                                }}/>
                                <span className="text-slate-400">x</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-2">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Simulation Settings</h2>
                    
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Earthquake Magnitude:</label>
                        <input type="number" id="intensity-num" min="0" max="10" step="0.1" defaultValue="5.0" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-center" onChange={(e) => {
                            let val = parseFloat(e.target.value);
                            if (!isNaN(val)) (document.getElementById('intensity') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="intensity" min="0" max="10" step="0.1" defaultValue="5.0" className="w-full mb-2 accent-blue-500" onChange={(e) => {
                        (document.getElementById('intensity-num') as HTMLInputElement).value = parseFloat(e.target.value).toFixed(1);
                    }}/>
                    
                    <div className="flex justify-between items-center mb-1 border-t border-slate-700 pt-1">
                        <label className="text-[10px] text-slate-400">Hurricane Cat (Saffir-Simpson):</label>
                        <input type="number" id="hurricane-num" min="1" max="5" step="1" defaultValue="3" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-cyan-400 text-center" onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (!isNaN(val)) (document.getElementById('hurricane-cat') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="hurricane-cat" min="1" max="5" step="1" defaultValue="3" className="w-full mb-2 accent-cyan-400" onChange={(e) => {
                        (document.getElementById('hurricane-num') as HTMLInputElement).value = e.target.value;
                    }}/>

                    <div className="flex justify-between items-center mb-1 mt-1 border-t border-slate-700 pt-1">
                        <label className="text-[10px] text-slate-400">Tsunami Height (m):</label>
                        <input type="number" id="tsunami-height-num" min="1" max="30" step="1" defaultValue="12" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-indigo-400 text-center" onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (!isNaN(val)) (document.getElementById('tsunami-height') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="tsunami-height" min="1" max="30" step="1" defaultValue="12" className="w-full mb-1 accent-indigo-400" onChange={(e) => {
                        (document.getElementById('tsunami-height-num') as HTMLInputElement).value = e.target.value;
                    }}/>
                    
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Tsunami Strength:</label>
                        <input type="number" id="tsunami-str-num" min="1" max="10" step="0.1" defaultValue="6.0" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-indigo-400 text-center" onChange={(e) => {
                            let val = parseFloat(e.target.value);
                            if (!isNaN(val)) (document.getElementById('tsunami-str') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="tsunami-str" min="1" max="10" step="0.1" defaultValue="6.0" className="w-full mb-2 accent-indigo-400" onChange={(e) => {
                        (document.getElementById('tsunami-str-num') as HTMLInputElement).value = parseFloat(e.target.value).toFixed(1);
                    }}/>

                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Wave Count:</label>
                        <input type="number" id="tsunami-count-num" min="1" max="20" step="1" defaultValue="3" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-indigo-400 text-center"/>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] text-slate-400">Wave Frequency (s):</label>
                        <input type="number" id="tsunami-freq-num" min="1" max="10" step="0.5" defaultValue="4.0" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-indigo-400 text-center"/>
                    </div>
                    
                    <div className="flex justify-between items-center mb-1 border-t border-slate-700 pt-1">
                        <label className="text-[10px] text-slate-400">Tornado (EF Scale):</label>
                        <input type="number" id="tornado-ef-num" min="0" max="5" step="1" defaultValue="3" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-purple-400 text-center" onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (!isNaN(val)) (document.getElementById('tornado-ef') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="tornado-ef" min="0" max="5" step="1" defaultValue="3" className="w-full mb-2 accent-purple-400" onChange={(e) => {
                        (document.getElementById('tornado-ef-num') as HTMLInputElement).value = e.target.value;
                    }}/>

                    <div className="flex justify-between items-center mb-1 border-t border-slate-700 pt-1">
                        <label className="text-[10px] text-slate-400">Meteor Count:</label>
                        <input type="number" id="meteor-count-num" min="1" max="50" step="1" defaultValue="10" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-orange-500 text-center" onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (!isNaN(val)) (document.getElementById('meteor-count') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="meteor-count" min="1" max="50" step="1" defaultValue="10" className="w-full mb-1 accent-orange-500" onChange={(e) => {
                        (document.getElementById('meteor-count-num') as HTMLInputElement).value = e.target.value;
                    }}/>

                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Meteor Size:</label>
                        <input type="number" id="meteor-size-num" min="0.5" max="5.0" step="0.1" defaultValue="1.5" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-600 focus:outline-none focus:border-orange-500 text-center" onChange={(e) => {
                            let val = parseFloat(e.target.value);
                            if (!isNaN(val)) (document.getElementById('meteor-size') as HTMLInputElement).value = val.toString();
                        }}/>
                    </div>
                    <input type="range" id="meteor-size" min="0.5" max="5.0" step="0.1" defaultValue="1.5" className="w-full mb-2 accent-orange-500" onChange={(e) => {
                        (document.getElementById('meteor-size-num') as HTMLInputElement).value = parseFloat(e.target.value).toFixed(1);
                    }}/>

                    <div className="mb-3 p-2 bg-slate-800/50 rounded border border-slate-600">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] text-slate-400 flex items-center gap-1">Duration (sec):</label>
                            <div className="flex items-center gap-2">
                                <label className="text-[9px] text-slate-300 flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" id="sim-infinite" className="accent-blue-500" onChange={(e) => {
                                        const dur = document.getElementById('sim-duration') as HTMLInputElement;
                                        if (dur) {
                                            dur.disabled = e.target.checked;
                                            dur.classList.toggle('opacity-50', e.target.checked);
                                        }
                                    }}/> Infinite
                                </label>
                                <input type="number" id="sim-duration" min="1" max="300" step="1" defaultValue="15" className="w-12 bg-slate-700 text-white text-[10px] px-1 py-1 rounded border border-slate-500 focus:outline-none text-center"/>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-400">Time Speed (<span id="time-scale-val" className="font-mono text-blue-400">1.00</span>x):</label>
                            <input type="range" id="time-scale" min="0.1" max="2.0" step="0.05" defaultValue="1.0" className="w-24 accent-blue-500" onChange={(e) => {
                                const val = document.getElementById('time-scale-val');
                                if (val) val.innerText = parseFloat(e.target.value).toFixed(2);
                            }}/>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <label className="text-[9px] text-slate-400" title="Forces physics to match real world time, but may lag visually if CPU is overloaded. Uncheck to prefer smooth slow-mo drops instead.">Force Real-Time (Ignore Lag):</label>
                            <input type="checkbox" id="real-time-sync" className="accent-emerald-500 w-3 h-3"/>
                        </div>
                    </div>
                    
                    <div id="sim-controls-start" className="grid grid-cols-3 gap-1 mb-2">
                        <button id="btn-test-grav" className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('gravity')}>
                            ⬇️ Static
                        </button>
                        <button id="btn-test-quake" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('quake')}>
                            ▶️ Quake
                        </button>
                        <button id="btn-test-hurricane" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('hurricane')}>
                            🌀 Hurricane
                        </button>
                        <button id="btn-test-tsunami" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 col-span-1 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('tsunami')}>
                            🌊 Tsunami
                        </button>
                        <button id="btn-test-tornado" className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('tornado')}>
                            🌪️ Tornado
                        </button>
                        <button id="btn-test-meteor" className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-1.5 rounded shadow-lg transition-transform active:scale-95 text-[10px]" onClick={() => startSimulation('meteor')}>
                            ☄️ Meteor
                        </button>
                    </div>
                    
                    <div id="sim-controls-active" className="hidden gap-1 mb-2">
                        <button id="btn-pause" className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded shadow-lg transition-transform active:scale-95 text-xs" onClick={togglePause}>
                            ⏸️ Pause
                        </button>
                        <button id="btn-stop" className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded shadow-lg transition-transform active:scale-95 text-xs" onClick={stopSimulation}>
                            ⏹️ Reset
                        </button>
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-1">
                        <div className="flex gap-1">
                            <button className="flex-1 bg-indigo-800 hover:bg-indigo-700 text-white py-1 rounded text-[10px] transition-colors" onClick={() => executeWithAction(() => buildTestCity('low'))}>
                                🏙️ Low City
                            </button>
                            <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1 rounded text-[10px] transition-colors" onClick={() => executeWithAction(() => buildTestCity('med'))}>
                                🏙️ Med City
                            </button>
                            <button className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white py-1 rounded text-[10px] transition-colors" onClick={() => executeWithAction(() => buildTestCity('high'))}>
                                🏙️ High City
                            </button>
                        </div>
                        {showClearConfirm ? (
                            <div className="flex gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <button 
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1 rounded text-[10px] font-bold transition-colors" 
                                    onClick={() => { executeWithAction(clearAll); setShowClearConfirm(false); }}
                                >
                                    CONFIRM CLEAR
                                </button>
                                <button 
                                    className="px-3 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-[10px] transition-colors" 
                                    onClick={() => setShowClearConfirm(false)}
                                >
                                    CANCEL
                                </button>
                            </div>
                        ) : (
                            <button 
                                className="w-full bg-slate-700 hover:bg-red-600 text-white py-1 rounded text-[10px] transition-colors" 
                                onClick={() => setShowClearConfirm(true)}
                            >
                                🗑️ Clear All
                            </button>
                        )}
                    </div>
                </div>

                <div className="mb-3 border-t border-slate-700 pt-2">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Environment</h2>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Sunlight:</label>
                        <input type="checkbox" defaultChecked={state.sunLightEnabled} className="accent-amber-400" onChange={(e) => {
                            state.sunLightEnabled = e.target.checked;
                            if (state.sunLight) state.sunLight.visible = state.sunLightEnabled;
                        }}/>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Sun Intensity:</label>
                        <input type="range" min="0" max="3" step="0.1" defaultValue={state.sunLightIntensity} className="w-24 accent-amber-400" onChange={(e) => {
                            state.sunLightIntensity = parseFloat(e.target.value);
                            if (state.sunLight) state.sunLight.intensity = state.sunLightIntensity;
                        }}/>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Sun Angle:</label>
                        <input type="range" min="-40" max="40" step="1" defaultValue="10" className="w-24 accent-amber-400" onChange={(e) => {
                            if (state.sunLight) {
                                state.sunLight.position.x = parseFloat(e.target.value);
                                state.sunLight.position.z = 10; // Keep Z constant for simplicity or add another slider
                            }
                        }}/>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400">Sun Shadows:</label>
                        <input type="checkbox" defaultChecked={state.sunShadowsEnabled} className="accent-amber-400" onChange={(e) => {
                            state.sunShadowsEnabled = e.target.checked;
                            if (state.sunLight) state.sunLight.castShadow = state.sunShadowsEnabled;
                        }}/>
                    </div>
                </div>

                <div className="border-t border-slate-700 mt-2 pt-2">
                    <div className="grid gap-1 mb-2">
                        <div className="flex justify-between items-end bg-slate-800 p-1.5 rounded border border-slate-700">
                            <span className="text-[10px] font-semibold text-slate-400">Time Elapsed:</span>
                            <span className="text-sm font-mono font-bold text-amber-400" id="timeDisplay">0.0s</span>
                        </div>
                        <div className="flex justify-between items-end bg-slate-800 p-1.5 rounded border border-slate-700">
                            <span className="text-[10px] font-semibold text-slate-400">Intact Mass:</span>
                            <span className="text-sm font-mono font-bold text-emerald-400" id="intactMassDisplay">0.0t</span>
                        </div>
                        <div className="flex justify-between items-end bg-slate-800 p-1.5 rounded border border-slate-700">
                            <span className="text-[10px] font-semibold text-slate-400">Destroyed Mass:</span>
                            <span className="text-sm font-mono font-bold text-red-400" id="destroyedMassDisplay">0.0t</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-end px-1">
                        <span className="text-xs text-slate-400">Max Survival Height:</span>
                        <span className="text-xl font-mono font-bold text-blue-400" id="heightDisplay">0.0m</span>
                    </div>
                    <div className="flex justify-between items-end px-1 mt-1">
                        <span className="text-xs text-slate-400">Max Peak Height:</span>
                        <span className="text-xl font-mono font-bold text-orange-400" id="peakHeightDisplay">0.0m</span>
                    </div>
                </div>
            </div>
        </>
    );
}
