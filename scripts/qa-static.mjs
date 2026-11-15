import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const server = read('server/index.js');
const styles = read('src/styles.css');
const worker = read('public/sw.js');
const schema = read('supabase/schema.sql');
const manifest = read('public/manifest.webmanifest');

const featureBlock = app.match(/const featureKeys=\[([^\]]+)\]/);
assert.ok(featureBlock, 'Lista de funcionalidades não encontrada.');
const features = [...featureBlock[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.ok(features.length >= 30, 'A lista de funcionalidades parece incompleta.');
assert.equal(new Set(features).size, features.length, 'Há funcionalidades duplicadas.');

const navSource = app.slice(0, app.indexOf('const featureKeys='));
const navKeys = [...navSource.matchAll(/\['([A-Za-z][A-Za-z0-9]*)',[A-Za-z][A-Za-z0-9]*\]/g)].map(match => match[1]);
assert.ok(navKeys.length >= 45, 'A navegação parece incompleta.');
assert.equal(new Set(navKeys).size, navKeys.length, 'Há itens duplicados na navegação.');
for (const key of features) assert.ok(navKeys.includes(key), 'Funcionalidade fora da navegação: ' + key);

const renderedPages = new Set([...app.matchAll(/page\s*===?\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
for (const key of features) assert.ok(renderedPages.has(key), 'Página sem condição de renderização: ' + key);

const routes = [...server.matchAll(/app\.(get|post|put|delete|patch)\(['"]([^'"]+)/g)].map(match => match[1].toUpperCase() + ' ' + match[2]);
assert.ok(routes.includes('GET /api/games/live'), 'Endpoint de placar ao vivo ausente.');
assert.ok(routes.includes('GET /api/games/:id/stats'), 'Endpoint de box score ausente.');
assert.ok(server.includes("app.use('/api', requireFamily)"), 'Proteção das rotas da API ausente.');
assert.ok(app.includes("api('/api/games/live',{cache:false})"), 'Frontend não consulta o placar ao vivo sem cache.');
assert.ok(app.includes('window.setInterval(refreshLive,15000)'), 'Atualização automática do placar não está configurada para 15 segundos.');
assert.ok(app.includes('setLiveUnavailable(true)'), 'Falhas do feed ao vivo devem ser identificadas na interface.');
assert.ok(app.includes('live-warning'), 'A interface deve diferenciar visualmente o feed indisponível.');
assert.ok(app.includes('g.display_clock'), 'Relógio da partida não é exibido no cartão.');
assert.ok(server.includes('display_clock:'), 'Backend não entrega o relógio da partida.');
assert.ok(server.includes("const today = saoPauloDate(new Date().toISOString())"), 'Calendário CDN deve usar a data local de São Paulo.');
assert.ok(server.includes("espn-scoreboard-day:"), 'Consultas diárias ESPN devem usar cache para reduzir chamadas repetidas.');
assert.ok(server.includes("90 * 1000"), 'Cache diário ESPN deve ter TTL definido.');
assert.ok(app.includes("scorePending:'Placar em atualização'"), 'Cards de jogos devem explicar placar pendente sem inventar zero.');
assert.ok(app.includes("noScore:'Placar indisponível'"), 'Cards de jogos finalizados sem score devem explicar a ausência de dado.');
assert.ok(app.includes("vs:'VS'"), 'Jogos agendados devem mostrar VS em vez de estatística fictícia ou N/D.');

assert.ok(app.includes("cache:cacheGet?fetchOptions.cache:'no-store'"), 'Atualização forçada ainda pode usar cache HTTP do navegador.');

assert.ok(styles.includes('@media'), 'Regras responsivas não encontradas.');
assert.ok(styles.includes('prefers-reduced-motion'), 'Preferência de movimento reduzido não respeitada.');
assert.ok(worker.includes("url.pathname.startsWith('/api/')"), 'Service worker deve deixar respostas da API fora do cache offline.');
assert.ok(schema.includes('enable row level security'), 'RLS não está habilitado no esquema.');
assert.ok(manifest.includes('"display": "standalone"'), 'Manifest PWA inválido ou incompleto.');
assert.ok(!/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(app), 'Há botão com ação vazia.');

console.log('Courtside QA estática aprovada: ' + features.length + ' funcionalidades, ' + navKeys.length + ' itens de navegação e ' + routes.length + ' rotas verificadas.');
