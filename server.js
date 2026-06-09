import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();

// ES Module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});