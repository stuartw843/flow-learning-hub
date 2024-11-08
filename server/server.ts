import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import moduleRoutes from './routes/modules.js';
import speechmaticsRoutes from './routes/speechmatics.js';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.join(__dirname, '../../dist');

app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientPath));
}

// API Routes
app.use('/api/modules', moduleRoutes);
app.use('/api', speechmaticsRoutes);

// Handle client-side routing in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Serving static files from: ${clientPath}`);
  }
});
