import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import moduleRoutes from './routes/modules.js';
import speechmaticsRoutes from './routes/speechmatics.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Routes
app.use('/api/modules', moduleRoutes);
app.use('/api', speechmaticsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
