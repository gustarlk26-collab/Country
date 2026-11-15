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
assert.ok(server.includes("if (data.length) {"), 'Placar vazio da ESPN deve acionar a fonte alternativa.');
assert.ok(server.includes('NBA Live CDN scoreboard'), 'Fonte alternativa do placar ao vivo deve estar identificada.');
assert.ok(routes.includes('GET /api/games/:id/stats'), 'Endpoint de box score ausente.');
assert.ok(server.includes("app.use('/api', requireFamily)"), 'Proteção das rotas da API ausente.');
assert.ok(server.indexOf("app.get('/api/health'") < server.indexOf("app.use('/api', requireFamily)"), 'Health check deve continuar acessível ao Render antes da autenticação familiar.');
const routeKeys = [...server.matchAll(/app\.(get|post|put|delete|patch)\(['"]([^'"]+)/g)].map(match => match[1].toUpperCase() + ' ' + match[2]);
assert.ok(routeKeys.length >= 20, 'A API parece ter perdido rotas.');
assert.equal(new Set(routeKeys).size, routeKeys.length, 'Há rotas HTTP duplicadas.');
assert.ok(schema.includes('auth.uid() = user_id'), 'As políticas Supabase devem restringir os dados ao usuário autenticado.');
assert.ok(schema.includes('with check (auth.uid() = user_id)'), 'As gravações Supabase devem validar o proprietário do registro.');
assert.ok(server.includes('fgm: numberOrNull(r.FGM)'), 'Médias não devem transformar campos vazios em zero.');
assert.ok(server.includes('rows.filter(r => Number(r.GP) > 0).map(r => ({'), 'Ranking recente não deve incluir atletas sem jogos na amostra.');
assert.ok(server.includes("apis/common/v3/sports/basketball/nba/athletes/"), 'Perfil deve ter uma fonte alternativa ESPN para dados de temporada.');
assert.ok(server.includes("overview.statistics||overview.stats?.statistics"), 'Fallback ESPN deve ler somente o bloco estatístico documentado.');
assert.ok(app.includes("const fallbackStats=bio?.stats||{}"), 'Perfil deve usar a fonte alternativa apenas para campos sem dado primário.');

assert.ok(app.includes("raw==null||raw===''||!Number.isFinite(Number(raw))?NaN:Number(raw)"), 'Props não podem interpretar estatística ausente como zero.');
assert.ok(app.includes('alphaAverages.filter(p=>p[statMetric]!=null'), 'Rankings estatísticos devem excluir métricas ausentes.');
assert.ok(app.includes("const raw=p[m.key],value=raw==null||raw===''?null:Number(raw)"), 'Perfil de estilo não pode transformar estatística ausente em zero.');
assert.ok(app.includes("].filter(x=>x.value!=null&&x.value!=='')"), 'Biografia deve ocultar campos que a fonte não forneceu.');
assert.ok(app.includes("Sem partidas no período"), 'Ferramentas de forma devem explicar quando não há amostra.');


assert.ok(app.includes("api('/api/games/live',{cache:false})"), 'Frontend não consulta o placar ao vivo sem cache.');
assert.ok(app.includes('window.setInterval(refreshLive,15000)'), 'Atualização automática do placar não está configurada para 15 segundos.');
assert.ok(app.includes('setLiveUnavailable(true)'), 'Falhas do feed ao vivo devem ser identificadas na interface.');
assert.ok(app.includes('live-warning'), 'A interface deve diferenciar visualmente o feed indisponível.');
assert.ok(app.includes('g.display_clock'), 'Relógio da partida não é exibido no cartão.');
assert.ok(server.includes('display_clock:'), 'Backend não entrega o relógio da partida.');
assert.ok(server.includes("const today = saoPauloDate(new Date().toISOString())"), 'Calendário CDN deve usar a data local de São Paulo.');
assert.ok(server.includes("espn-scoreboard-day:"), 'Consultas diárias ESPN devem usar cache para reduzir chamadas repetidas.');
assert.ok(server.includes('Math.min(20, dates.length)'), 'Calendário ESPN deve limitar concorrência para evitar carregamento sequencial lento.');
assert.ok(server.includes("90 * 1000"), 'Cache diário ESPN deve ter TTL definido.');
assert.ok(app.includes("scorePending:'Placar em atualização'"), 'Cards de jogos devem explicar placar pendente sem inventar zero.');
assert.ok(app.includes("rawStatus.includes('postpon')?copy.postponed"), 'Partidas adiadas não podem aparecer como agendadas.');
assert.ok(app.includes("rawStatus.includes('cancel')?copy.cancelled"), 'Partidas canceladas devem manter o status correto.');
assert.ok(app.includes("noScore:'Placar indisponível'"), 'Cards de jogos finalizados sem score devem explicar a ausência de dado.');
assert.ok(app.includes("vs:'VS'"), 'Jogos agendados devem mostrar VS em vez de estatística fictícia ou N/D.');

assert.ok(app.includes("cache:cacheGet?fetchOptions.cache:'no-store'"), 'Atualização forçada ainda pode usar cache HTTP do navegador.');

assert.ok(styles.includes('@media'), 'Regras responsivas não encontradas.');
assert.ok(styles.includes('prefers-reduced-motion'), 'Preferência de movimento reduzido não respeitada.');
assert.ok(worker.includes("url.pathname.startsWith('/api/')"), 'Service worker deve deixar respostas da API fora do cache offline.');
assert.ok(schema.includes('enable row level security'), 'RLS não está habilitado no esquema.');
assert.ok(manifest.includes('"display": "standalone"'), 'Manifest PWA inválido ou incompleto.');
assert.ok(!/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(app), 'Há botão com ação vazia.');
const buttons = [...app.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
assert.ok(buttons.length >= 40, 'A interface parece ter perdido seus controles principais.');
assert.ok(buttons.every(tag => /\bonClick\s*=/.test(tag) || /\btype\s*=\s*["']submit["']/.test(tag) || /\bdisabled(?:\s|=|>)/.test(tag)), 'Existe botão sem ação, sem submit e sem estado desabilitado.');
const forms = [...app.matchAll(/<form\b[^>]*>/g)].map(match => match[0]);
assert.ok(forms.every(tag => /\bonSubmit\s*=/.test(tag)), 'Existe formulário sem ação de envio.');
const anchors = [...app.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
assert.ok(anchors.every(tag => /\bhref\s*=/.test(tag)), 'Existe link sem destino.');


console.log('Courtside QA estática aprovada: ' + features.length + ' funcionalidades, ' + navKeys.length + ' itens de navegação e ' + routes.length + ' rotas verificadas.');
