import React, { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import { drawCanvas, lerpState } from './canvas-renderer';

const INITIAL_STATE = {
  shapes: ['rose'],
  count: 150,
  opacity: 0.6,
  speed: 1.0,
  scale: 1.0,
  rotation: 0,
  noise: 20,
  primaryColor: '#00ffcc',
  secondaryColor: '#ff0055',
  tertiaryColor: '#ffcc00',
  gradientMode: true,
  gradientAngle: 45,
  renderMode: 'stroke',
  bgType: 'solid',
  bgColor1: '#050508',
  bgColor2: '#161625',
  repeatMode: false,
  repeatCount: 2
};

const LERP_FACTOR = 0.05;

export default function ViewerApp() {
  const canvasRef = useRef(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const targetStateRef = useRef(INITIAL_STATE);
  const currentStateRef = useRef(INITIAL_STATE);
  
  // Transition / Double-buffering refs for cross-fade
  const prevVisualStateRef = useRef(null);
  const transitionAlphaRef = useRef(1.0);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);

  const animationFrameId = useRef(null);
  const startTime = useRef(performance.now());
  const [showStatus, setShowStatus] = useState(true);

  useEffect(() => {
    if (isConnected) {
      const timer = setTimeout(() => setShowStatus(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowStatus(true);
    }
  }, [isConnected]);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onShadesUpdated(newState) {
      // ONLY trigger a visual cross-fade if shapes, render mode, background type, or repeat mode changed.
      const transitionFields = ['shapes', 'renderMode', 'bgType', 'repeatMode'];
      const requiresFade = transitionFields.some(field => newState[field] !== undefined);
      
      if (requiresFade) {
        // Capture snapshot of current visual state before transition starts
        prevVisualStateRef.current = { ...currentStateRef.current };
        transitionAlphaRef.current = 0.0;
      }

      targetStateRef.current = {
        ...targetStateRef.current,
        ...newState
      };
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('shades-updated', onShadesUpdated);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('shades-updated', onShadesUpdated);
    };
  }, []);

  // Continuous animation and lerp loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isMounted = true;

    canvasARef.current = document.createElement('canvas');
    canvasBRef.current = document.createElement('canvas');

    function render(timestamp) {
      if (!isMounted) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Perform parameter lerp
      currentStateRef.current = lerpState(
        currentStateRef.current,
        targetStateRef.current,
        LERP_FACTOR
      );

      const elapsed = timestamp - startTime.current;

      // Double-buffered visual cross-fade transition
      if (transitionAlphaRef.current < 1.0 && prevVisualStateRef.current) {
        transitionAlphaRef.current = Math.min(1.0, transitionAlphaRef.current + 0.035);

        const canvasA = canvasARef.current;
        const canvasB = canvasBRef.current;

        if (canvasA.width !== canvas.width || canvasA.height !== canvas.height) {
          canvasA.width = canvas.width;
          canvasA.height = canvas.height;
          canvasB.width = canvas.width;
          canvasB.height = canvas.height;
        }

        const ctxA = canvasA.getContext('2d');
        const ctxB = canvasB.getContext('2d');

        ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawCanvas(ctxA, w, h, prevVisualStateRef.current, elapsed);
        drawCanvas(ctxB, w, h, currentStateRef.current, elapsed);

        ctx.clearRect(0, 0, w, h);
        
        ctx.save();
        ctx.globalAlpha = 1.0 - transitionAlphaRef.current;
        ctx.drawImage(canvasA, 0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = transitionAlphaRef.current;
        ctx.drawImage(canvasB, 0, 0, w, h);
        ctx.restore();
      } else {
        // Direct draw if not actively transitioning
        drawCanvas(ctx, w, h, currentStateRef.current, elapsed);
      }

      animationFrameId.current = requestAnimationFrame(render);
    }

    animationFrameId.current = requestAnimationFrame(render);

    return () => {
      isMounted = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <div className="viewer-container">
      <canvas ref={canvasRef} className="viewer-canvas" />
      
      {showStatus && (
        <div className="viewer-status">
          <span 
            className="status-dot" 
            style={{ 
              display: 'inline-block',
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: isConnected ? '#00ffcc' : '#ef4444',
              marginRight: '6px',
              boxShadow: isConnected ? '0 0 8px #00ffcc' : 'none'
            }}
          />
          <span>{isConnected ? 'Sincronizado' : 'Buscando servidor...'}</span>
        </div>
      )}
    </div>
  );
}
