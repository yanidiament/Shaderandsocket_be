import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());

// Configuramos las rutas para poder leer archivos locales usando ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Le decimos a Express que busque y sirva los archivos estáticos de tu frontend
app.use(express.static(path.join(__dirname, 'dist')));

// Ruta principal para el Panel de Control (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Ruta específica para el Visualizador de Arte (viewer.html)
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'viewer.html'));
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', 
    methods: ['GET', 'POST']
  }
});

// Default shared canvas state
let currentShadesState = {
  shape: 'rose', 
  count: 150,
  opacity: 0.6,
  speed: 1.0,
  scale: 1.0,
  rotation: 0,
  noise: 20,
  primaryColor: '#00ffcc',
  secondaryColor: '#ff0055',
  gradientMode: true,
  gradientAngle: 45
};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Immediately sync the newly connected client with the current state
  socket.emit('shades-updated', currentShadesState);

  // Listen for changes from control panels
  socket.on('update-shades', (newState) => {
    // Merge updates into our global state
    currentShadesState = { ...currentShadesState, ...newState };
    
    // Broadcast updated state to all OTHER clients (e.g. viewers)
    socket.broadcast.emit('shades-updated', currentShadesState);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});