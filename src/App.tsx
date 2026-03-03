/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import UI from './components/UI';
import { initEngine } from './simulator/Engine';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (containerRef.current && !initialized.current) {
      initialized.current = true;
      initEngine(containerRef.current);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-200 font-sans select-none">
      <div 
        ref={containerRef} 
        id="canvas-container" 
        className="absolute top-0 left-0 w-full h-full z-0 outline-none" 
        tabIndex={0}
      ></div>
      <div id="crosshair"></div>
      
      <UI />
    </div>
  );
}
