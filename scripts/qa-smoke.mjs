import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 20000 + (process.pid % 20000);
const origin = 'https://courtside-family.onrender.com';
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), CORS_ORIGIN: origin, FAMILY_EMAILS: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
  stdio: 'ignore'
});
const base = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  let health = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou antes do health check (código ${child.exitCode}).`);
    try { health = await fetch(base + '/api/health'); if (health.ok) break; }
    catch {}
    await pause(200);
  }
  assert.ok(health?.ok, 'Servidor Express deve iniciar e responder ao health check.');
  const payload = await health.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.dataSource.includes('ESPN') && payload.dataSource.includes('NBA Live CDN'));

  const protectedResponse = await fetch(base + '/api/teams');
  assert.equal(protectedResponse.status, 401, 'Rotas de dados devem exigir autenticação Supabase.');

  const allowedPreflight = await fetch(base + '/api/teams', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
  });
  assert.equal(allowedPreflight.status, 204, 'Origem autorizada deve concluir o preflight CORS.');
  assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), origin);

  const blockedPreflight = await fetch(base + '/api/teams', {
    method: 'OPTIONS',
    headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null, 'Origem externa não autorizada não pode receber permissão CORS.');
  process.stdout.write('Smoke QA aprovada: servidor inicia, health check responde, API exige sessão e CORS respeita a allowlist.\\n');
} finally {
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), pause(1500)]);
}
