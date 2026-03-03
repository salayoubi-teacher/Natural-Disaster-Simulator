import { state } from './State';
import { applyPaint, addToSceneAndArrays, removeFromSceneAndArrays } from './Builder';

export function beginAction() {
    state.currentAction = {
        added: { nodes: [], beams: [], panels: [], shapes: [], foundations: [] },
        removed: { nodes: [], beams: [], panels: [], shapes: [], foundations: [] },
        paints: []
    };
}

export function commitAction() {
    if (!state.currentAction) return;
    let hasAdd = state.currentAction.added.nodes.length || state.currentAction.added.beams.length || state.currentAction.added.panels.length || state.currentAction.added.shapes.length || state.currentAction.added.foundations.length;
    let hasRem = state.currentAction.removed.nodes.length || state.currentAction.removed.beams.length || state.currentAction.removed.panels.length || state.currentAction.removed.shapes.length || state.currentAction.removed.foundations.length;
    let hasPaint = state.currentAction.paints.length;
    
    if (hasAdd || hasRem || hasPaint) {
        state.undoStack.push(state.currentAction);
        state.redoStack = []; 
        state.updateUndoRedoUI();
    }
    state.currentAction = null;
}

export function executeWithAction(func: () => void) {
    beginAction();
    func();
    commitAction();
}

export function undo() {
    if (state.undoStack.length === 0 || state.simActive) return;
    let action = state.undoStack.pop();
    
    for (let i = action.paints.length - 1; i >= 0; i--) {
        let p = action.paints[i];
        applyPaint(p.objType, p.obj, p.oldProps);
    }
    
    action.added.shapes.forEach((s: any) => removeFromSceneAndArrays('shape', s));
    action.added.panels.forEach((p: any) => removeFromSceneAndArrays('panel', p));
    action.added.beams.forEach((b: any) => removeFromSceneAndArrays('beam', b));
    action.added.nodes.forEach((n: any) => removeFromSceneAndArrays('node', n));
    action.added.foundations.forEach((f: any) => removeFromSceneAndArrays('foundation', f));

    action.removed.nodes.forEach((n: any) => addToSceneAndArrays('node', n));
    action.removed.beams.forEach((b: any) => addToSceneAndArrays('beam', b));
    action.removed.panels.forEach((p: any) => addToSceneAndArrays('panel', p));
    action.removed.shapes.forEach((s: any) => addToSceneAndArrays('shape', s));
    action.removed.foundations.forEach((f: any) => addToSceneAndArrays('foundation', f));

    state.redoStack.push(action);
    state.updateUndoRedoUI();
    state.onMouseMove(state.lastMouseEvent);
}

export function redo() {
    if (state.redoStack.length === 0 || state.simActive) return;
    let action = state.redoStack.pop();

    action.removed.shapes.forEach((s: any) => removeFromSceneAndArrays('shape', s));
    action.removed.panels.forEach((p: any) => removeFromSceneAndArrays('panel', p));
    action.removed.beams.forEach((b: any) => removeFromSceneAndArrays('beam', b));
    action.removed.nodes.forEach((n: any) => removeFromSceneAndArrays('node', n));
    action.removed.foundations.forEach((f: any) => removeFromSceneAndArrays('foundation', f));

    action.added.nodes.forEach((n: any) => addToSceneAndArrays('node', n));
    action.added.beams.forEach((b: any) => addToSceneAndArrays('beam', b));
    action.added.panels.forEach((p: any) => addToSceneAndArrays('panel', p));
    action.added.shapes.forEach((s: any) => addToSceneAndArrays('shape', s));
    action.added.foundations.forEach((f: any) => addToSceneAndArrays('foundation', f));

    action.paints.forEach((p: any) => applyPaint(p.objType, p.obj, p.newProps));

    state.undoStack.push(action);
    state.updateUndoRedoUI();
    state.onMouseMove(state.lastMouseEvent);
}
