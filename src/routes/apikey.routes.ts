import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { getDb } from '../db/connection';

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // List all API keys (masked)
  app.get('/api/keys', async () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ak.id, ak.strategy_id, ak.key_value, s.name as strategy_name, ak.is_active, ak.created_at
      FROM api_keys ak
      LEFT JOIN strategies s ON ak.strategy_id = s.id
      ORDER BY ak.created_at DESC
    `).all() as any[];
    return rows.map(r => ({
      ...r,
      key_value: r.key_value,
      key_preview: r.key_value ? r.key_value.substring(0, 8) + '...' + r.key_value.substring(r.key_value.length - 4) : r.id.substring(0, 8) + '...' + r.id.substring(r.id.length - 4),
    }));
  });

  // Create new API key (or specify custom key_value)
  app.post('/api/keys', async (request, reply) => {
    const { strategy_id, key_value } = request.body as any;
    if (!strategy_id) {
      return reply.code(400).send({ error: 'strategy_id is required' });
    }

    const db = getDb();
    const id = uuidv4();
    // Use custom key if provided, otherwise generate random
    const finalKeyValue = key_value || 'akdn-' + uuidv4().replace(/-/g, '');

    // Check if key_value already exists
    const existing = db.prepare('SELECT id FROM api_keys WHERE key_value = ?').get(finalKeyValue);
    if (existing) {
      return reply.code(400).send({ error: 'API key already exists' });
    }

    db.prepare(`
      INSERT INTO api_keys (id, strategy_id, key_value, is_active)
      VALUES (?, ?, ?, 1)
    `).run(id, strategy_id, finalKeyValue);

    return {
      id,
      key_value: finalKeyValue,
      strategy_id,
      is_active: 1,
    };
  });

  // Update API key (change key_value or strategy)
  app.put('/api/keys/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { key_value, strategy_id, is_active } = request.body as any;

    const db = getDb();
    const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as any;
    if (!key) {
      return reply.code(404).send({ error: 'API key not found' });
    }

    // If changing key_value, check uniqueness
    if (key_value && key_value !== key.key_value) {
      const existing = db.prepare('SELECT id FROM api_keys WHERE key_value = ? AND id != ?').get(key_value, id);
      if (existing) {
        return reply.code(400).send({ error: 'API key already exists' });
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (key_value) { updates.push('key_value = ?'); values.push(key_value); }
    if (strategy_id) { updates.push('strategy_id = ?'); values.push(strategy_id); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return { success: true };
  });

  // Toggle API key active status
  app.put('/api/keys/:id/toggle', async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();
    const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as any;
    if (!key) {
      return reply.code(404).send({ error: 'API key not found' });
    }

    const newStatus = key.is_active ? 0 : 1;
    db.prepare('UPDATE api_keys SET is_active = ? WHERE id = ?').run(newStatus, id);

    return { success: true, is_active: newStatus };
  });

  // Delete API key
  app.delete('/api/keys/:id', async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    return { success: true };
  });
}
