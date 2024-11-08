import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

interface Module {
  id?: number;
  title: string;
  content: string;
  plain_content: string;
  style: string;
  persona: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

// Get all modules
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const modules = await db!.all<Module[]>('SELECT * FROM modules ORDER BY display_order ASC');
    res.json(modules);
  } catch (error) {
    console.error('Failed to fetch modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Get single module
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const module = await db!.get<Module>('SELECT * FROM modules WHERE id = ?', req.params.id);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    res.json(module);
  } catch (error) {
    console.error('Failed to fetch module:', error);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

// Create module
router.post('/', async (req: Request, res: Response) => {
  const { title, content, plain_content, style, persona } = req.body as Module;
  try {
    const db = await getDb();
    const maxOrder = await db!.get('SELECT MAX(display_order) as maxOrder FROM modules');
    const nextOrder = (maxOrder?.maxOrder || 0) + 1;
    
    const result = await db!.run(
      'INSERT INTO modules (title, content, plain_content, style, persona, display_order) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, plain_content || '', style || '', persona || '', nextOrder]
    );
    const newModule = await db!.get<Module>('SELECT * FROM modules WHERE id = ?', result.lastID);
    res.status(201).json(newModule);
  } catch (error) {
    console.error('Failed to create module:', error);
    res.status(500).json({ error: 'Failed to create module' });
  }
});

// Update module
router.put('/:id', async (req: Request, res: Response) => {
  console.log('Updating module with ID:', req.params.id);
  try {
    const db = await getDb();
    const currentModule = await db!.get<Module>('SELECT * FROM modules WHERE id = ?', req.params.id);
    if (!currentModule) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    
    if (req.body.title !== undefined) {
      updates.push('title = ?');
      values.push(req.body.title);
    }
    if (req.body.content !== undefined) {
      updates.push('content = ?');
      values.push(req.body.content);
    }
    if (req.body.plain_content !== undefined) {
      updates.push('plain_content = ?');
      values.push(req.body.plain_content);
    }
    if (req.body.style !== undefined) {
      updates.push('style = ?');
      values.push(req.body.style);
    }
    if (req.body.persona !== undefined) {
      updates.push('persona = ?');
      values.push(req.body.persona);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    const query = `UPDATE modules SET ${updates.join(', ')} WHERE id = ?`;
    await db!.run(query, values);

    const updatedModule = await db!.get<Module>('SELECT * FROM modules WHERE id = ?', req.params.id);
    res.json(updatedModule);
  } catch (error) {
    console.error('Failed to update module:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// Reorder modules
router.post('/reorder', async (req: Request, res: Response) => {
  const { orderedIds } = req.body as { orderedIds: number[] };
  try {
    const db = await getDb();
    await db!.run('BEGIN TRANSACTION');
    
    for (let i = 0; i < orderedIds.length; i++) {
      await db!.run(
        'UPDATE modules SET display_order = ? WHERE id = ?',
        [i + 1, orderedIds[i]]
      );
    }
    
    await db!.run('COMMIT');
    const modules = await db!.all<Module[]>('SELECT * FROM modules ORDER BY display_order ASC');
    res.json(modules);
  } catch (error) {
    const db = await getDb();
    await db!.run('ROLLBACK');
    console.error('Failed to reorder modules:', error);
    res.status(500).json({ error: 'Failed to reorder modules' });
  }
});

// Delete module
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await db!.run('DELETE FROM modules WHERE id = ?', req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete module:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

export default router;
