import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import { encrypt, decrypt } from '../db/encrypt';

export interface BackupManifest {
  version: number;
  exported_at: string;
  providers: ProviderBackup[];
  strategies: StrategyBackup[];
}

export interface ProviderBackup {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  api_type: string;
  model_id: string;
  proxy_url: string;
  custom_headers: string;
  prompt_token_limit: number;
  completion_token_limit: number;
}

export interface StrategyBackup {
  id: string;
  name: string;
  mode: 'priority' | 'round_robin';
  prompt_token_limit: number;
  completion_token_limit: number;
  provider_ids: { provider_id: string; priority: number }[];
}

/**
 * Export all providers (decrypted) and strategies.
 */
export function exportAll(): BackupManifest {
  const db = getDb();

  const providerRows = db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as any[];
  const providers: ProviderBackup[] = providerRows.map(p => {
    let apiKey = '***masked***';
    try { apiKey = decrypt(p.api_key); } catch {}
    return {
      id: p.id,
      name: p.name,
      base_url: p.base_url,
      api_key: apiKey,
      api_type: p.api_type || 'openai-completions',
      model_id: p.model_id,
      proxy_url: p.proxy_url || '',
      custom_headers: p.custom_headers || '',
      prompt_token_limit: p.prompt_token_limit || 0,
      completion_token_limit: p.completion_token_limit || 0,
    };
  });

  const strategyRows = db.prepare('SELECT * FROM strategies ORDER BY created_at ASC').all() as any[];
  const strategies: StrategyBackup[] = strategyRows.map(s => {
    const spRows = db.prepare(
      'SELECT provider_id, priority FROM strategy_providers WHERE strategy_id = ? ORDER BY priority ASC'
    ).all(s.id) as any[];
    return {
      id: s.id,
      name: s.name,
      mode: s.mode,
      prompt_token_limit: s.prompt_token_limit || 0,
      completion_token_limit: s.completion_token_limit || 0,
      provider_ids: spRows,
    };
  });

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    providers,
    strategies,
  };
}

/**
 * Import providers and strategies from a backup manifest.
 * Generates new UUIDs for all records and rebuilds provider→strategy mappings.
 * Returns { imported_providers, imported_strategies } counts.
 */
export function importAll(manifest: BackupManifest, options: {
  duplicate_handling: 'skip' | 'overwrite' | 'replace';
} = { duplicate_handling: 'replace' }): { imported_providers: number; imported_strategies: number; errors: string[] } {
  if (!manifest || manifest.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  const db = getDb();
  const errors: string[] = [];
  let imported_providers = 0;
  let imported_strategies = 0;

  // Map old provider ID → new provider ID
  const providerIdMap = new Map<string, string>();

  const tx = db.transaction(() => {
    // 1. Import providers
    for (const p of manifest.providers) {
      try {
        // Check for duplicate by name+base_url
        const existing = db.prepare(
          'SELECT id FROM providers WHERE name = ? AND base_url = ?'
        ).get(p.name, p.base_url) as any;

        if (existing) {
          if (options.duplicate_handling === 'skip') {
            providerIdMap.set(p.id, existing.id);
            continue;
          } else if (options.duplicate_handling === 'overwrite') {
            // Delete the existing one — will be re-inserted
            db.prepare('DELETE FROM providers WHERE id = ?').run(existing.id);
          } else {
            // replace: delete all existing then re-import
            db.prepare('DELETE FROM providers WHERE name = ? AND base_url = ?').run(p.name, p.base_url);
          }
        }

        const newId = uuidv4();
        const encryptedKey = encrypt(p.api_key);
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

        db.prepare(`
          INSERT INTO providers (id, name, base_url, api_key, api_type, model_id, model_name,
            proxy_url, custom_headers, prompt_token_limit, completion_token_limit, health_reset_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newId, p.name, p.base_url, encryptedKey,
          p.api_type || 'openai-completions',
          p.model_id, p.model_id,
          p.proxy_url || '', p.custom_headers || '',
          p.prompt_token_limit || 0, p.completion_token_limit || 0,
          now, now, now,
        );

        providerIdMap.set(p.id, newId);
        imported_providers++;
      } catch (err: any) {
        errors.push(`Provider "${p.name}": ${err.message}`);
      }
    }

    // 2. Import strategies
    for (const s of manifest.strategies) {
      try {
        // Resolve old provider IDs → new provider IDs
        const resolvedProviderIds = s.provider_ids
          .map(p => ({ provider_id: providerIdMap.get(p.provider_id), priority: p.priority }))
          .filter(p => p.provider_id !== undefined);

        if (resolvedProviderIds.length === 0) {
          errors.push(`Strategy "${s.name}": no valid providers after import — skipped`);
          continue;
        }

        // Check for duplicate by name
        const existing = db.prepare('SELECT id FROM strategies WHERE name = ?').get(s.name) as any;
        if (existing) {
          if (options.duplicate_handling === 'skip') {
            continue;
          }
          // Delete existing strategy (cascade deletes strategy_providers and api_keys)
          db.prepare('DELETE FROM strategies WHERE id = ?').run(existing.id);
        }

        const newId = uuidv4();
        const keyId = uuidv4();
        const keyValue = 'akdn-' + uuidv4().replace(/-/g, '');
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

        db.prepare(`
          INSERT INTO strategies (id, name, mode, prompt_token_limit, completion_token_limit, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(newId, s.name, s.mode, s.prompt_token_limit || 0, s.completion_token_limit || 0, now, now);

        db.prepare(`
          INSERT INTO api_keys (id, strategy_id, key_value, is_active, created_at)
          VALUES (?, ?, ?, 1, ?)
        `).run(keyId, newId, keyValue, now);

        for (const rp of resolvedProviderIds) {
          db.prepare(`
            INSERT INTO strategy_providers (strategy_id, provider_id, priority)
            VALUES (?, ?, ?)
          `).run(newId, rp.provider_id, rp.priority);
        }

        imported_strategies++;
      } catch (err: any) {
        errors.push(`Strategy "${s.name}": ${err.message}`);
      }
    }
  });

  tx();

  return { imported_providers, imported_strategies, errors };
}
