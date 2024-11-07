import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDatabase } from './db.js';
import moduleRoutes from './routes/modules.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Routes
app.use('/api/modules', moduleRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
