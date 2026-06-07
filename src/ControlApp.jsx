import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { drawCanvas } from './canvas-renderer';

const DEFAULT_STATE = {
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

const CLEAN_STATE = {
  shapes: ['circle'],
  count: 5,
  opacity: 0.3,
  speed: 0.2,
  scale: 0.8,
  rotation: 0,
  noise: 5,
  primaryColor: '#ffffff',
  secondaryColor: '#333333',
  tertiaryColor: '#888888',
  gradientMode: false,
  gradientAngle: 0,
  renderMode: 'stroke',
  bgType: 'solid',
  bgColor1: '#000000',
  bgColor2: '#000000',
  repeatMode: false,
  repeatCount: 2
};

const AVAILABLE_SHAPES = [
  { id: 'rose', name: 'Rosa' },
  { id: 'circle', name: 'Círculos' },
  { id: 'line', name: 'Líneas' },
  { id: 'polygon', name: 'Polígonos' },
  { id: 'bezier', name: 'Bézier' },
  { id: 'spiral', name: 'Espiral' },
  { id: 'particles', name: 'Partículas' },
  { id: 'star', name: 'Estrella' }
];

export default function ControlApp() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const animationFrameId = useRef(null);
  const startTime = useRef(performance.now());

  // Transition & double-buffering refs for cross-fade
  const prevVisualStateRef = useRef(null);
  const transitionAlphaRef = useRef(1.0);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);

  // Throttling socket emission variables
  const socketEmitRef = useRef(null);
  const pendingUpdatesRef = useRef({});

  // Sync state ref
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Handle socket connections
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onShadesUpdated(serverState) {
      // Trigger transition cross-fade if structural details changed
      const transitionFields = ['shapes', 'renderMode', 'bgType', 'repeatMode'];
      const requiresFade = transitionFields.some(field => serverState[field] !== undefined);
      
      if (requiresFade) {
        prevVisualStateRef.current = { ...stateRef.current };
        transitionAlphaRef.current = 0.0;
      }
      setState(serverState);
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

  // Update canvas loop with double-buffered cross-fading
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isMounted = true;

    canvasARef.current = document.createElement('canvas');
    canvasBRef.current = document.createElement('canvas');

    function render(timestamp) {
      if (!isMounted) return;
      
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const elapsed = timestamp - startTime.current;

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
        drawCanvas(ctxB, w, h, stateRef.current, elapsed);

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
        drawCanvas(ctx, w, h, stateRef.current, elapsed);
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

  // Throttled socket emission function
  const throttledEmit = (updatedFields) => {
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updatedFields };

    if (!socketEmitRef.current) {
      socketEmitRef.current = setTimeout(() => {
        if (socket.connected) {
          socket.emit('update-shades', pendingUpdatesRef.current);
        }
        pendingUpdatesRef.current = {};
        socketEmitRef.current = null;
      }, 40); // Limit to 25 transmissions/sec
    }
  };

  // Helper to change local state and emit to socket server
  const updateState = (updatedFields) => {
    // ONLY trigger cross-fade transition on structural shifts!
    const transitionFields = ['shapes', 'renderMode', 'bgType', 'repeatMode'];
    const requiresFade = transitionFields.some(field => updatedFields[field] !== undefined);
    
    if (requiresFade) {
      prevVisualStateRef.current = { ...stateRef.current };
      transitionAlphaRef.current = 0.0;
    }

    const nextState = { ...state, ...updatedFields };
    setState(nextState);
    
    if (requiresFade) {
      // Emit structural changes instantly, bypassing throttle
      if (socketEmitRef.current) {
        clearTimeout(socketEmitRef.current);
        socketEmitRef.current = null;
      }
      const mergedUpdates = { ...pendingUpdatesRef.current, ...updatedFields };
      if (socket.connected) {
        socket.emit('update-shades', mergedUpdates);
      }
      pendingUpdatesRef.current = {};
    } else {
      // Throttled sliders/colors to prevent lag spams
      throttledEmit(updatedFields);
    }
  };

  // Toggle multi-shape selection
  const toggleShape = (shapeId) => {
    let nextShapes;
    if (state.shapes.includes(shapeId)) {
      nextShapes = state.shapes.filter(s => s !== shapeId);
    } else {
      nextShapes = [...state.shapes, shapeId];
    }
    updateState({ shapes: nextShapes });
  };

  // Actions
  const handleClear = () => {
    if (socketEmitRef.current) {
      clearTimeout(socketEmitRef.current);
      socketEmitRef.current = null;
    }
    pendingUpdatesRef.current = {};
    prevVisualStateRef.current = { ...stateRef.current };
    transitionAlphaRef.current = 0.0;
    
    setState(CLEAN_STATE);
    if (socket.connected) {
      socket.emit('update-shades', CLEAN_STATE);
    }
  };

  const handleRandomize = () => {
    if (socketEmitRef.current) {
      clearTimeout(socketEmitRef.current);
      socketEmitRef.current = null;
    }
    pendingUpdatesRef.current = {};

    const shuffled = [...AVAILABLE_SHAPES].sort(() => 0.5 - Math.random());
    const shapeCount = Math.floor(1 + Math.random() * 2);
    const randomShapes = shuffled.slice(0, shapeCount).map(s => s.id);

    const colors = [
      '#00ffcc', '#ff0055', '#ffcc00', '#0099ff', '#ff00ff', 
      '#9900ff', '#ff5500', '#00ff66', '#ffffff', '#ff3366'
    ];
    const c1 = colors[Math.floor(Math.random() * colors.length)];
    let c2 = colors[Math.floor(Math.random() * colors.length)];
    let c3 = colors[Math.floor(Math.random() * colors.length)];
    while (c1 === c2) c2 = colors[Math.floor(Math.random() * colors.length)];
    while (c1 === c3 || c2 === c3) c3 = colors[Math.floor(Math.random() * colors.length)];

    const bgColors = [
      '#050508', '#070014', '#000c14', '#0b0b0f', '#10051a', '#030a05'
    ];
    const bg1 = bgColors[Math.floor(Math.random() * bgColors.length)];
    const bg2 = bgColors[Math.floor(Math.random() * bgColors.length)];

    const bgTypes = ['solid', 'gradient', 'shader'];
    const randomBgType = bgTypes[Math.floor(Math.random() * bgTypes.length)];

    const renderModes = ['stroke', 'fill', 'both'];
    const randomRenderMode = renderModes[Math.floor(Math.random() * renderModes.length)];

    const randomState = {
      shapes: randomShapes,
      count: Math.floor(30 + Math.random() * 160),
      opacity: Number((0.25 + Math.random() * 0.65).toFixed(2)),
      speed: Number((0.2 + Math.random() * 2.2).toFixed(2)),
      scale: Number((0.6 + Math.random() * 1.2).toFixed(2)),
      rotation: Math.floor(Math.random() * 180),
      noise: Math.floor(Math.random() * 80),
      primaryColor: c1,
      secondaryColor: c2,
      tertiaryColor: c3,
      gradientMode: Math.random() > 0.15,
      gradientAngle: Math.floor(Math.random() * 360),
      renderMode: randomRenderMode,
      bgType: randomBgType,
      bgColor1: bg1,
      bgColor2: bg2,
      repeatMode: Math.random() > 0.6,
      repeatCount: Math.floor(2 + Math.random() * 3)
    };

    prevVisualStateRef.current = { ...stateRef.current };
    transitionAlphaRef.current = 0.0;
    
    setState(randomState);
    if (socket.connected) {
      socket.emit('update-shades', randomState);
    }
  };

  const handleSendToBigScreen = () => {
    if (socketEmitRef.current) {
      clearTimeout(socketEmitRef.current);
      socketEmitRef.current = null;
    }
    pendingUpdatesRef.current = {};
    if (socket.connected) {
      socket.emit('update-shades', state);
      console.log('Synchronizing complete state...');
    }
  };

  return (
    <div className="control-container">
      {/* SIDEBAR: Panel de Controles */}
      <aside className="sidebar">
        <h1>Shades Creator <span>v1.2</span></h1>
        
        {/* Formas Combinables */}
        <div className="control-section">
          <h2 className="section-title">Formas (Combinables)</h2>
          <div className="shape-button-grid">
            {AVAILABLE_SHAPES.map((shape) => {
              const isActive = state.shapes && state.shapes.includes(shape.id);
              return (
                <button
                  key={shape.id}
                  type="button"
                  className={`shape-toggle-btn ${isActive ? 'active' : ''}`}
                  onClick={() => toggleShape(shape.id)}
                >
                  {shape.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Patrón de Repetición (Nuevo) */}
        <div className="control-section">
          <h2 className="section-title">Patrón de Repetición</h2>
          <div className="control-group toggle-control">
            <label className="control-label" htmlFor="repeat-toggle">Repetir Formas (Matriz)</label>
            <label className="switch">
              <input
                id="repeat-toggle"
                type="checkbox"
                checked={state.repeatMode}
                onChange={(e) => updateState({ repeatMode: e.target.checked })}
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {state.repeatMode && (
            <div className="control-group">
              <div className="control-header">
                <label className="control-label" htmlFor="repeat-count-slider">Número de Repeticiones</label>
                <span className="control-value">{Math.floor(state.repeatCount)}x{Math.floor(state.repeatCount)}</span>
              </div>
              <input
                id="repeat-count-slider"
                type="range"
                min="2"
                max="5"
                step="1"
                value={state.repeatCount}
                onChange={(e) => updateState({ repeatCount: parseInt(e.target.value) })}
              />
            </div>
          )}
        </div>

        {/* Estilo de Renderizado */}
        <div className="control-section">
          <h2 className="section-title">Estilo de Trazado</h2>
          <div className="control-group">
            <label className="control-label" htmlFor="render-mode-select">Modo de Visualización</label>
            <select
              id="render-mode-select"
              value={state.renderMode}
              onChange={(e) => updateState({ renderMode: e.target.value })}
            >
              <option value="stroke">Línea (Contornos solamente)</option>
              <option value="fill">Relleno (Sólidos transparentes)</option>
              <option value="both">Híbrido (Relleno + Contorno)</option>
            </select>
          </div>
        </div>

        {/* Modificadores */}
        <div className="control-section">
          <h2 className="section-title">Modificadores</h2>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="count-slider">Elementos</label>
              <span className="control-value">{Math.floor(state.count)}</span>
            </div>
            <input
              id="count-slider"
              type="range"
              min="5"
              max="250"
              step="1"
              value={state.count}
              onChange={(e) => updateState({ count: parseInt(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="opacity-slider">Opacidad</label>
              <span className="control-value">{Number(state.opacity).toFixed(2)}</span>
            </div>
            <input
              id="opacity-slider"
              type="range"
              min="0.05"
              max="1.0"
              step="0.01"
              value={state.opacity}
              onChange={(e) => updateState({ opacity: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="speed-slider">Velocidad</label>
              <span className="control-value">{Number(state.speed).toFixed(2)}x</span>
            </div>
            <input
              id="speed-slider"
              type="range"
              min="0.0"
              max="3.0"
              step="0.05"
              value={state.speed}
              onChange={(e) => updateState({ speed: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="scale-slider">Escala</label>
              <span className="control-value">{Number(state.scale).toFixed(2)}</span>
            </div>
            <input
              id="scale-slider"
              type="range"
              min="0.2"
              max="2.2"
              step="0.02"
              value={state.scale}
              onChange={(e) => updateState({ scale: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="rotation-slider">Rotación</label>
              <span className="control-value">{Math.floor(state.rotation)}°</span>
            </div>
            <input
              id="rotation-slider"
              type="range"
              min="0"
              max="360"
              step="1"
              value={state.rotation}
              onChange={(e) => updateState({ rotation: parseInt(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <label className="control-label" htmlFor="noise-slider">Dispersión / Ruido</label>
              <span className="control-value">{Math.floor(state.noise)}</span>
            </div>
            <input
              id="noise-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={state.noise}
              onChange={(e) => updateState({ noise: parseInt(e.target.value) })}
            />
          </div>
        </div>

        {/* Colores Combinables (3 Puntos) */}
        <div className="control-section">
          <h2 className="section-title">Paleta de Colores (3-Stops)</h2>
          
          <div className="color-grid-three">
            <div className="color-picker-wrapper">
              <label className="control-label" htmlFor="primary-color">Primario</label>
              <div className="color-picker-input-container">
                <input
                  id="primary-color"
                  type="color"
                  value={state.primaryColor}
                  onChange={(e) => updateState({ primaryColor: e.target.value })}
                />
              </div>
            </div>

            <div className="color-picker-wrapper">
              <label className="control-label" htmlFor="tertiary-color">Medio</label>
              <div className="color-picker-input-container">
                <input
                  id="tertiary-color"
                  type="color"
                  value={state.tertiaryColor}
                  onChange={(e) => updateState({ tertiaryColor: e.target.value })}
                />
              </div>
            </div>

            <div className="color-picker-wrapper">
              <label className="control-label" htmlFor="secondary-color">Secundario</label>
              <div className="color-picker-input-container">
                <input
                  id="secondary-color"
                  type="color"
                  value={state.secondaryColor}
                  onChange={(e) => updateState({ secondaryColor: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="control-group toggle-control" style={{ marginTop: '0.4rem' }}>
            <label className="control-label" htmlFor="gradient-toggle">Activar Gradiente</label>
            <label className="switch">
              <input
                id="gradient-toggle"
                type="checkbox"
                checked={state.gradientMode}
                onChange={(e) => updateState({ gradientMode: e.target.checked })}
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {state.gradientMode && (
            <div className="control-group">
              <div className="control-header">
                <label className="control-label" htmlFor="gradient-angle">Ángulo del Gradiente</label>
                <span className="control-value">{Math.floor(state.gradientAngle)}°</span>
              </div>
              <input
                id="gradient-angle"
                type="range"
                min="0"
                max="360"
                step="1"
                value={state.gradientAngle}
                onChange={(e) => updateState({ gradientAngle: parseInt(e.target.value) })}
              />
            </div>
          )}
        </div>

        {/* Fondo con Shader / Personalizable */}
        <div className="control-section">
          <h2 className="section-title">Estilo de Fondo</h2>
          
          <div className="control-group">
            <label className="control-label" htmlFor="bg-type-select">Tipo de Fondo</label>
            <select
              id="bg-type-select"
              value={state.bgType}
              onChange={(e) => updateState({ bgType: e.target.value })}
            >
              <option value="solid">Sólido</option>
              <option value="gradient">Gradiente Estático</option>
              <option value="shader">Shader Radial (Fluido)</option>
            </select>
          </div>

          <div className="color-settings" style={{ marginTop: '0.2rem' }}>
            <div className="color-picker-wrapper">
              <label className="control-label" htmlFor="bg-color-1">Color Fondo 1</label>
              <div className="color-picker-input-container">
                <input
                  id="bg-color-1"
                  type="color"
                  value={state.bgColor1}
                  onChange={(e) => updateState({ bgColor1: e.target.value })}
                />
              </div>
            </div>

            {(state.bgType === 'gradient' || state.bgType === 'shader') && (
              <div className="color-picker-wrapper">
                <label className="control-label" htmlFor="bg-color-2">Color Fondo 2</label>
                <div className="color-picker-input-container">
                  <input
                    id="bg-color-2"
                    type="color"
                    value={state.bgColor2}
                    onChange={(e) => updateState({ bgColor2: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE: Local Preview */}
      <main className="preview-panel">
        <div className="preview-card">
          <div className="preview-header">
            <h3 style={{ fontWeight: 600, fontSize: '1.1rem' }}>Previsualización Local</h3>
            <div className="preview-status">
              <span className={`status-dot ${isConnected ? 'connected' : ''}`}></span>
              <span>{isConnected ? 'Sincronizado' : 'Desconectado'}</span>
            </div>
          </div>
          
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          </div>

          <div className="button-grid">
            <button className="btn-secondary" onClick={handleClear}>
              Limpiar lienzo
            </button>
            <button className="btn-secondary" onClick={handleRandomize}>
              Generar aleatorio
            </button>
            <button className="btn-primary btn-action-send" onClick={handleSendToBigScreen}>
              Enviar a pantalla grande 🚀
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
