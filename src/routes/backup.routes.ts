import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import * as backupService from '../services/backup.service';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Export all (providers + strategies as JSON)
  app.get('/api/backup', async ({ query }) => {
    const manifest = backupService.exportAll();

    const fmt = (query as any)?.format || 'json';
    if (fmt === 'json') {
      return manifest;
    }

    // For future: support other formats here
    return manifest;
  });

  // Import from backup JSON
  app.post('/api/backup', async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.providers || !body.strategies) {
      return reply.code(400).send({ error: 'Invalid backup format: missing providers or strategies' });
    }

    try {
      const result = backupService.importAll(body);
      return {
        success: true,
        imported_providers: result.imported_providers,
        imported_strategies: result.imported_strategies,
        errors: result.errors,
      };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
