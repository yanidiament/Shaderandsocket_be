import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const httpServer = createServer(app);

// ES Module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Socket.io server attached to the same HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Shared state between creator and viewer
let currentShadesState = {
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('shades-updated', currentShadesState);

  // Handle state updates from the creator
  socket.on('update-shades', (newState) => {
    // Merge incoming partial state with current state
    currentShadesState = { ...currentShadesState, ...newState };
    // Broadcast to ALL connected clients (including creator for confirmation)
    io.emit('shades-updated', currentShadesState);
    console.log('State updated and broadcast to all clients');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Route for control panel (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Route for viewer (viewer.html)
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'viewer.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Control panel: http://localhost:${PORT}/`);
  console.log(`Viewer: http://localhost:${PORT}/viewer`);
});
