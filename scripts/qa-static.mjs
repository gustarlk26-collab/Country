import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const server = read('server/index.js');
const styles = read('src/styles.css');
const worker = read('public/sw.js');
const schema = read('supabase/schema.sql');
const manifest = read('public/manifest.webmanifest');
const signupEmail = read('supabase/templates/confirm-signup.html');
const recoveryEmail = read('supabase/templates/reset-password.html');
const html = read('index.html');
const arena = read('public/courtside-arena.svg');
const render = read('render.yml');
assert.ok(signupEmail.includes('{{ .ConfirmationURL }}') && signupEmail.includes('Confirmar meu e-mail') && signupEmail.includes('COURTSIDE FAMILY'), 'Template de confirmação do Supabase deve ser personalizado e preservar o link seguro oficial.');
assert.ok(recoveryEmail.includes('{{ .ConfirmationURL }}') && recoveryEmail.includes('Redefinir minha senha') && recoveryEmail.includes('COURTSIDE FAMILY'), 'Template de recuperação do Supabase deve ser personalizado e preservar o link seguro oficial.');
const teamMetaBlock = server.match(/const TEAM_META = \{([\s\S]*?)\n\};/);
const teamAbbrs = [...(teamMetaBlock?.[1] || '').matchAll(/\d{10}:\['([A-Z]{3})'/g)].map(match => match[1]);
const espnTeamMap = server.match(/const ESPN_TEAM_IDS = \{([^}]+)\}/)?.[1] || '';

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
for (const key of navKeys) assert.ok(renderedPages.has(key), 'Item de navegação sem tela implementada: ' + key);
assert.ok(app.includes("{p.gamesPlayed??'Não disponível'} jogos"), 'Evolução não deve inventar zero para jogos ausentes.');
assert.ok(app.includes('const numberFormatCache=new Map()') && app.includes('numberFormatter(numberLocale,d).format(Number(value))'), 'As páginas devem reutilizar formatadores numéricos para reduzir trabalho repetido durante renderizações.');
assert.ok(styles.includes('@media(max-width:900px)') && styles.includes('backdrop-filter:none!important') && styles.includes('.feature-hub:before{animation:none!important}'), 'O layout deve reduzir filtros e animações custosas em telas menores.');
assert.ok(server.includes("cached('nba-live-scoreboard:' + today, () => nbaLiveScoreboard(today), 5000)"), 'O placar NBA Live deve deduplicar chamadas simultâneas sem armazenar dados por muito tempo.');
assert.ok(app.includes("if(updates.length)setGames(current=>{") && !app.includes("else setGames(current=>current.filter(game=>gameLocalDate(game)!==dateNow(0)))"), 'Feed ao vivo vazio não pode apagar a agenda do dia; a ausência de eventos ao vivo não significa ausência de jogos agendados ou finalizados.');
assert.ok(app.includes("String(v).trim()===''"), 'Interface deve rejeitar strings vazias ou com espaços em vez de convertê-las em zero.');
assert.ok(app.includes('rosterRequestRef.current') && app.includes('if(request!==rosterRequestRef.current)return;'), 'Elenco deve impedir que uma resposta antiga sobrescreva o time atualmente selecionado.');
assert.ok(app.includes('shotRequestRef.current+=1') && app.includes('request!==shotRequestRef.current'), 'Mapa de arremessos deve descartar respostas de um jogador selecionado anteriormente.');
assert.ok(app.includes('calendarRangeDays<=90') && app.includes('disabled={!calendarRangeValid||busy}'), 'Calendário personalizado deve bloquear datas inválidas e intervalos acima de 90 dias.');
assert.ok(app.includes('campaignValid=Number.isFinite(w)&&Number.isFinite(l)&&w>=0&&l>=0&&w+l>0') && app.includes("'Campanha indisponível'"), 'Simulador não deve converter campanha ausente em 0 vitórias ou calcular percentual parcial.');
assert.ok(app.includes("String(value).trim()===''"), 'Formatadores globais devem rejeitar strings vazias ou com espaços em vez de mostrá-las como zero.');
assert.ok(app.includes("Alguns dados podem ficar indisponíveis.") && app.includes('A fonte não retornou médias para este jogador'), 'Perfil deve informar falhas e ausência de estatísticas em vez de ocultar respostas vazias.');
assert.ok(server.includes("String(value).trim() === ''"), 'API deve rejeitar campos numéricos vazios em vez de convertê-los em zero.');
assert.ok(app.includes(".filter(m=>m.value!=null&&Number.isFinite(m.value))"), 'Perfil estatístico deve descartar métricas não numéricas.');
assert.ok(server.includes("if (!/^\\d{10}$/.test(String(game.gameId || '')) || !home.teamTricode || !away.teamTricode) return null;"), 'NBA Live deve descartar partidas sem ID válido ou equipes sem tricode.');

const routes = [...server.matchAll(/app\.(get|post|put|delete|patch)\(['"]([^'"]+)/g)].map(match => match[1].toUpperCase() + ' ' + match[2]);
assert.ok(routes.includes('GET /api/games/live'), 'Endpoint de placar ao vivo ausente.');
assert.equal(teamAbbrs.length, 30, 'Diretório NBA deve conter as 30 franquias.');
assert.equal(new Set(teamAbbrs).size, 30, 'Diretório de franquias contém abreviações duplicadas.');
const logoBlock = app.match(/const TEAM_LOGO_IDS=\{([^}]+)\}/)?.[1] || '';
const logoEntries = [...logoBlock.matchAll(/([A-Z]{3}):(\d+)/g)].map(match => [match[1], Number(match[2])]);
assert.equal(logoEntries.length, 30, 'Diretório de escudos oficiais deve conter as 30 franquias.');
assert.deepEqual(logoEntries.map(([abbr]) => abbr).sort(), teamAbbrs.slice().sort(), 'Escudos devem cobrir exatamente as 30 abreviações oficiais.');
assert.ok(app.includes("const teamLogoId=abbr=>TEAM_LOGO_IDS[String(abbr??'').toUpperCase()==='UTAH'?'UTA':String(abbr??'').toUpperCase()]||null") && app.includes("teamLogoId(c.abbreviation)"), 'Escudo do Utah deve ser resolvido tanto pelo código oficial UTA quanto pelo alias UTAH nos placares por quarto.');

assert.ok(server.includes("app.get('/api/team-stats'") && server.includes("NBA Stats base") && server.includes("NBA Stats advanced"), 'Comparador de franquias deve consumir estatísticas oficiais da NBA.');
assert.ok(server.includes("team-stats-gamefinder:") && server.includes("needsGameFallback") && server.includes("data.length!==30") && server.includes("NBA Stats game finder (médias calculadas dos jogos oficiais)"), 'Comparador deve consolidar dados oficiais e retornar exatamente as 30 franquias, sem duplicações.');
assert.ok(server.includes("nba('teamestimatedmetrics'") && server.includes("estimated.E_PACE") && server.includes("estimated.E_OFF_RATING") && server.includes("estimated.E_DEF_RATING") && server.includes("estimated.E_NET_RATING") && server.includes("NBA Stats team estimated metrics"), 'Ritmo e ratings devem tentar a fonte oficial NBA Team Estimated Metrics antes de permanecer indisponíveis.');
assert.ok(server.includes('const ids=Object.keys(TEAM_META);') && !server.includes('new Set([...Object.keys(TEAM_META),...baseById.keys(),...advById.keys()])'), 'Comparador deve limitar a saída às 30 franquias conhecidas e ignorar IDs inesperados das fontes.');
assert.ok(server.includes('counts:{pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0,fg3m:0,fg3a:0}') && server.includes('games.counts?.[field]||0') && server.includes("if(raw==null||typeof raw==='boolean'||String(raw).trim()==='')continue;"), 'Fallback do comparador não pode converter campos ausentes do Game Finder em médias zero.');
assert.ok(server.includes('decided:0') && server.includes('games.decided?games.wins:null') && server.includes('games.decided?games.losses:null'), 'Fallback não deve criar campanha 0–0 quando o Game Finder não publicou resultados W/L.');
assert.ok(app.includes("setTeamStatsBusy(true)") && app.includes("setTeamStatsMeta({season:r.season,source:r.source,updatedAt:r.updatedAt})"), 'Comparador deve exibir carregamento e metadados reais da fonte.');
assert.ok(app.includes("FRANQUIA A") && app.includes("FRANQUIA B") && app.includes("Trocar franquias") && app.includes("Atualizar dados"), 'Comparador de franquias deve permitir selecionar, inverter e atualizar as equipes.');
assert.ok(app.includes("Rating ofensivo") && app.includes("Rating defensivo") && app.includes("Aproveitamento de 3 pontos") && app.includes("Pontos por jogo"), 'Comparador deve apresentar métricas de produção e eficiência.');
assert.ok(app.includes("!['win_pct','fg_pct','fg3_pct','off_rating','def_rating','net_rating','pts','reb','ast','stl','blk'].includes(metric)") && app.includes("const lower=metric==='def_rating'"), 'Comparador deve indicar vantagem em campanha, eficiência e produção por jogo, mantendo jogos disputados e ritmo como métricas descritivas.');
assert.ok(app.includes("if(!Array.isArray(r.data)||!r.data.length)throw new Error('A fonte não retornou estatísticas de franquias.')"), 'Comparador não deve tratar resposta vazia como comparação válida.');

for (const abbr of teamAbbrs) assert.ok(new RegExp('(?:^|[,\\{])' + abbr + ':').test(espnTeamMap), 'ID ESPN ausente para franquia: ' + abbr);
assert.ok(server.includes("const [espnResult, nbaResult] = await Promise.allSettled([") && server.includes("if (espnResult.status === 'rejected' && nbaResult.status === 'rejected')") && server.includes('const merged = new Map(espnData.map(game => [String(game.id), game]));'), 'Placar ao vivo deve combinar ESPN e NBA Live e só falhar quando ambas as fontes falharem.');
assert.ok(server.includes("if (!succeeded) throw new Error('ESPN não respondeu ao placar diário.')"), 'Placar ao vivo deve aproveitar datas ESPN válidas e só falhar quando nenhuma consulta responder.');
assert.ok(server.includes('NBA Live CDN scoreboard'), 'Fonte alternativa do placar ao vivo deve estar identificada.');
assert.ok(server.includes("home_team_score: scoreboardScore(home.score, state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled')") && server.includes("visitor_team_score: scoreboardScore(away.score, state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled')"), 'Placar ESPN deve rejeitar valores inválidos e não tratar pontuação de partida agendada como placar real.');
assert.ok(server.includes('score: scoreboardScore(team.score, summaryStatus)') && server.includes('map(period => scoreboardScore(period?.score, summaryStatus))') && server.includes('map(line => scoreboardScore(line.displayValue ?? line.value, summaryStatus))'), 'Resumos por período NBA Live e ESPN devem rejeitar pontuações inválidas sem produzir NaN ou zero fictício.');
assert.ok(app.includes("if(g.status_state==='scheduled'){setBusy(false);return;}") && app.includes("setBoxGame(g);setBoxStats([]);setPage('boxscore');setError('');"), 'Box score não deve consultar estatísticas antes do início de uma partida agendada; deve mostrar o estado pré-jogo correto.');
assert.ok(routes.includes('GET /api/games/:id/stats'), 'Endpoint de box score ausente.');
assert.ok(server.includes('const expectedTeamIds = new Set((body.header?.competitions?.[0]?.competitors || []).map(side => Number(side.team?.id))') && server.includes('expectedTeamIds.size === 2 && expectedTeamIds.has(Number(group.team?.id))'), 'Box score ESPN deve aceitar somente grupos vinculados às duas equipes oficiais da partida.');
assert.ok(server.includes('async function nbaGameIdFromEspn(eventId)'), 'Fallback deve converter IDs ESPN em IDs oficiais da NBA quando necessário.');
assert.ok(server.includes("Number(game.gameType) === 2"), 'Confronto direto deve consultar jogos da temporada regular NBA no fallback CDN.');
assert.ok(server.includes('(stateCode===2||stateCode===3)?finiteNumberOrNull(game.homeTeamScore):null'), 'Confronto direto não deve interpretar placar pré-jogo como zero real.');
assert.ok(server.includes("const final=game.state==='post'||/\\bfinal\\b/i.test(String(game.status||''))"), 'Confronto direto não deve declarar vencedor antes do fim da partida.');
assert.ok(server.includes("Calendário NBA CDN HTTP " ) && server.includes('nenhum jogo regular encontrado para'), 'Confronto direto deve ter fallback NBA CDN quando a ESPN falhar.');
assert.ok(server.includes('game.gameDateTimeUTC?saoPauloDate(game.gameDateTimeUTC)'), 'Conciliação de IDs de partidas deve usar a mesma data local brasileira nas duas fontes.');
assert.ok(server.includes('async function nbaLivePeriodSummary(gameId)'), 'Parciais por quarto devem ter fallback NBA Live.');
assert.ok(server.includes("'NBA Live CDN boxscore'"), 'A origem alternativa dos parciais deve ser identificada.');
assert.ok(server.includes("const summaryStatus = game.gameStatus === 1 ? 'scheduled' : 'in_progress';") && server.includes("const summaryStatus = competition.status?.type?.state === 'pre' ? 'scheduled' : 'in_progress';"), 'Resumo por período deve respeitar partidas agendadas nas fontes NBA Live e ESPN.');
assert.ok(server.includes('scoreboardScore(team.score, summaryStatus)') && server.includes('scoreboardScore(line.displayValue ?? line.value, summaryStatus)'), 'Placar e parciais de partidas agendadas não podem exibir zeros não publicados.');
assert.ok(server.includes("app.use('/api', requireFamily)"), 'Proteção das rotas da API ausente.');
assert.ok(server.includes("const httpServer = app.listen(PORT, '0.0.0.0'") && server.includes('httpServer.keepAliveTimeout = 65_000;') && server.includes('httpServer.headersTimeout = 66_000;'), 'Servidor Node deve manter keep-alive e headers timeout compatíveis com o proxy do Render para reduzir resets 502.');
assert.ok(server.indexOf("app.get('/api/health'") < server.indexOf("app.use('/api', requireFamily)"), 'Health check deve continuar acessível ao Render antes da autenticação familiar.');
const routeKeys = [...server.matchAll(/app\.(get|post|put|delete|patch)\(['"]([^'"]+)/g)].map(match => match[1].toUpperCase() + ' ' + match[2]);
assert.ok(routeKeys.length >= 20, 'A API parece ter perdido rotas.');
assert.equal(new Set(routeKeys).size, routeKeys.length, 'Há rotas HTTP duplicadas.');
assert.ok(schema.includes('auth.uid() = user_id'), 'As políticas Supabase devem restringir os dados ao usuário autenticado.');
assert.ok(schema.includes('with check (auth.uid() = user_id)'), 'As gravações Supabase devem validar o proprietário do registro.');
assert.ok((server.match(/const numberOrNull = value => value == null \|\| typeof value === 'boolean' \|\| String\(value\)\.trim\(\) === '' \|\| !Number\.isFinite\(Number\(value\)\) \? null : Number\(value\);/g) || []).length >= 4 && server.includes('fgm:pair.made') && server.includes('fga:pair.attempted'), 'Todos os endpoints estatísticos devem rejeitar campos vazios e booleanos em vez de convertê-los em zero.');
assert.ok(server.includes('const nonNegative = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>=0?parsed:null; };') && server.includes('const percentage = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>=0&&parsed<=1?parsed:null; };'), 'Médias de jogadores devem rejeitar contagens negativas e percentuais fora de 0 a 1.');
assert.ok(server.includes("const data = rows.filter(r => { const id=Number(r.PLAYER_ID),gp=numberOrNull(r.GP); return Number.isSafeInteger(id)&&id>0&&String(r.PLAYER_NAME||'').trim()&&gp!=null&&gp>0; }).map(r => ({") && server.includes('gamesPlayed: positive(r.GP)'), 'Médias devem rejeitar linhas sem ID oficial, nome ou jogos disputados válidos.');
assert.ok(app.includes('supabase.auth.signInWithPassword') && app.includes('supabase.auth.signUp') && app.includes('supabase.auth.onAuthStateChange') && app.includes('subscription.unsubscribe()') && app.includes('supabase?.auth.signOut()'), 'Fluxos de login, cadastro, sincronização e encerramento de sessão devem permanecer implementados.');
assert.ok(app.includes('emailRedirectTo:`${window.location.origin}/`') && app.includes("event==='SIGNED_IN'&&new URLSearchParams(window.location.hash.slice(1)).get('type')==='signup'") && app.includes('E-mail confirmado! Sua conta está ativada.'), 'Confirmação de e-mail deve retornar à origem do Courtside Family, ativar a sessão e apresentar confirmação amigável.');
assert.ok(server.includes("const email = (user.email || '').toLowerCase();") && server.includes('FAMILY_EMAILS.includes(email)') && server.includes("fetch(`${SUPABASE_URL}/auth/v1/user`"), 'API deve validar o token no Supabase e aplicar a lista de e-mails autorizados no backend.');
assert.ok(styles.includes('@media(max-width:950px)') && styles.includes('@media(max-width:650px)') && styles.includes('@media(max-width:390px)') && styles.includes('overflow-x:auto') && styles.includes('prefers-reduced-motion'), 'CSS deve manter breakpoints desktop/mobile, rolagem interna de tabelas e movimento reduzido.');
assert.ok(server.includes('const attempts = (made, attempted) => { const m=nonNegative(made), a=nonNegative(attempted); return m!=null&&a!=null&&m>a?{made:null,attempted:null}:{made:m,attempted:a}; };') && server.includes('...(()=>{const pair=attempts(r.FGM,r.FGA);return {fgm:pair.made,fga:pair.attempted};})()') && server.includes('...(()=>{const pair=attempts(r.FG3M,r.FG3A);return {fg3m:pair.made,fg3a:pair.attempted};})()') && server.includes('...(()=>{const pair=attempts(r.FTM,r.FTA);return {ftm:pair.made,fta:pair.attempted};})()'), 'Médias devem rejeitar pares de arremessos com convertidos acima das tentativas sem inventar valores.');
assert.ok(server.includes('if (!match) return { made: null, attempted: null };') && server.includes('return made <= attempted ? { made, attempted } : { made: null, attempted: null };'), 'Arremessos ausentes ou impossíveis no box score ESPN não podem virar zero fictício.');
assert.ok(server.includes('!Number.isSafeInteger(athleteId) || athleteId <= 0 || !fullName.trim()'), 'Box score ESPN não deve criar linhas com atletas sem ID ou nome válido.');
assert.ok(server.includes('const min = stats.minutes ?? null;'), 'Box score NBA Live não deve inventar 0:00 quando os minutos não foram publicados.');
assert.match(server, /function scoreboardScore\(value, statusState\)/, 'Placares devem validar o estado da partida antes de exibir pontuação.');
assert.match(server, /statusState === 'scheduled' \|\| value == null \|\| \(typeof value === 'string' && value\.trim\(\) === ''\)/, 'Partidas agendadas ou com pontuação ausente, inclusive texto em branco, não podem exibir zero fictício.');
assert.match(server, /Number\.isSafeInteger\(score\) && score >= 0 \? score : null/, 'Placar deve aceitar apenas inteiros não negativos.');
assert.match(server, /function validPeriod\(value\)/, 'Períodos devem ser inteiros positivos.');
assert.match(server, /function periodLabel\(value\)/, 'Rótulos devem identificar corretamente quartos e prorrogações.');
assert.match(server, /function validGameClock\(value, period\)/, 'Relógio deve rejeitar formatos e valores inválidos e considerar o período.');
assert.ok(server.includes(String.raw`raw.match(/^(\d{1,2}):([0-5]\d)$/)`) && server.includes(String.raw`raw.match(/^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)`), 'Relógio deve reconhecer MM:SS e durações ISO 8601 com dígitos reais.');
assert.ok(server.includes('const maxMinutes = Number(period) > 4 ? 5 : 12') && server.includes('minutes < maxMinutes || (minutes === maxMinutes && seconds === 0)'), 'Relógio deve respeitar 12:00 nos quartos e 5:00 nas prorrogações.');
assert.ok(server.includes('validGameClock(g.gameClock, g.period)') && server.includes('validGameClock(statusInfo.displayClock, period)'), 'Feeds devem informar o período ao validar o relógio.');
assert.match(server, /if \(value == null \|\| String\(value\)\.trim\(\) === ''\) return null;/, 'Minutos ausentes não podem ser convertidos em zero.');
assert.match(server, /Number\.isFinite\(numeric\) && numeric >= 0 \? numeric : null/, 'Minutos inválidos ou negativos devem permanecer indisponíveis.');
assert.ok(server.includes("teams.filter(team => team && Number.isSafeInteger(Number(team.teamId)) && Number(team.teamId) > 0 && /^[A-Z]{3}$/.test(String(team.teamTricode || '')))") && server.includes('(p.teamId == null || Number(p.teamId) === Number(team.teamId))'), 'Box score NBA Live deve validar a equipe e rejeitar atleta associado a outra equipe.');
assert.ok(server.includes('Number.isSafeInteger(Number(p.personId)) && Number(p.personId) > 0') && server.includes('const uniqueRows = dedupeGamePlayers(rows);') && server.includes('function dedupeGamePlayers(rows)'), 'Box score NBA Live deve rejeitar atletas inválidos e eliminar duplicatas ou conflitos de equipe pelo ID do atleta.');
assert.ok(server.includes("GameID:id,EndPeriod:'10',EndRange:'0',RangeType:'0',StartPeriod:'0',StartRange:'0'") && server.includes('boxscoretraditionalv3'), 'Box score histórico deve consultar o endpoint V3 com o ID NBA de dez dígitos e os parâmetros de período obrigatórios.');
assert.ok(server.includes('const uniqueData=dedupeGamePlayers(data.filter(row=>Number.isSafeInteger(row.id)') && server.includes('const uniqueRows = dedupeGamePlayers(rows.filter(row => Number.isSafeInteger(Number(row.id))'), 'Box scores históricos e ESPN devem validar IDs e nomes e remover duplicatas por equipe e atleta.');
assert.ok(server.includes('const uniqueData=dedupeGamePlayers(data.filter(row=>Number.isSafeInteger(row.id)') && server.includes('const uniqueRows = dedupeGamePlayers(rows.filter(row => Number.isSafeInteger(Number(row.id))'), 'Box scores históricos e ESPN devem validar IDs e nomes e remover duplicatas por equipe e atleta.');
assert.match(server, /!Number\.isSafeInteger\(Number\(stats\[key\]\)\)\s*\|\|\s*Number\(stats\[key\]\)\s*<\s*0/, 'Game Score deve rejeitar componentes negativos ou fracionários.');
assert.match(server, /s\.fgm\s*>\s*s\.fga\s*\|\|\s*s\.ftm\s*>\s*s\.fta/, 'Game Score deve rejeitar totais de arremessos impossíveis.');
assert.ok(server.includes('rows.filter(r => numberOrNull(r.GP) > 0).map(r => ({') && server.includes('gamesPlayed: numberOrNull(r.GP)'), 'Ranking recente deve rejeitar GP ausente/inválido e informar apenas jogos válidos na amostra.');
const recordsEndpoint=server.slice(server.indexOf("app.get('/api/records'"),server.indexOf("app.get('/api/news'"));
assert.ok(recordsEndpoint.includes("nba('alltimeleadersgrids'") && recordsEndpoint.includes("TopX:'10'") && recordsEndpoint.includes('Number.isSafeInteger(Number(raw))') && recordsEndpoint.includes('Number.isSafeInteger(id)&&id>0') && !recordsEndpoint.includes("nba('leagueleaders'"), 'Recordes históricos devem usar AllTimeLeadersGrids e validar IDs, inteiros e valores de carreira.');
assert.ok(recordsEndpoint.includes("raw==null||typeof raw==='boolean'||String(raw).trim()===''||!Number.isSafeInteger(Number(raw))||Number(raw)<0?null:Number(raw)") && recordsEndpoint.includes("player_name:playerName||null") && recordsEndpoint.includes('.filter(row=>row.player_id!=null&&row.player_name&&row.value!=null)'), 'Líderes históricos devem rejeitar valores ausentes, booleanos, strings vazias, negativos e atletas sem identificação.');
assert.ok(server.includes("apis/common/v3/sports/basketball/nba/athletes/"), 'Perfil deve ter uma fonte alternativa ESPN para dados de temporada.');
assert.ok(app.includes('Atualizar recordes') && app.includes('A NBA Stats não retornou líderes válidos nesta categoria. Nenhum número foi estimado.') && app.includes('Tentar novamente'), 'Recordes históricos devem permitir atualização manual e explicar categorias sem dados, sem deixar cartões vazios.');
assert.ok(server.includes("overview.statistics||overview.stats?.statistics"), 'Fallback ESPN deve ler somente o bloco estatístico documentado.');
assert.ok(server.includes("/athletes/'+player.espn_id+'/stats'"), 'Fallback ESPN deve consultar estatísticas detalhadas da temporada.');
assert.ok(server.includes('statsPayload.categories||statsPayload.statCategories'), 'Fallback detalhado deve mapear categorias e rótulos reais da ESPN.');
assert.ok(server.includes("categoryKey==='total'||categoryKey==='totals'") && server.includes('if(categoryKey===\'total\'||categoryKey===\'totals\')continue;'), 'Perfil por jogo deve ignorar categorias ESPN explicitamente identificadas como totais da temporada.');
assert.ok(server.includes("source:Object.keys(detailedStats).length?'ESPN athlete profile + season statistics'") && server.includes("if(!nameMatches.length&&requestedName&&requestedTeam)") && server.includes("cached('espn:active-players',espnPlayers,30*60*1000)"), 'Perfil deve informar a fonte estatística e buscar no diretório global se o roster atual não localizar o atleta.');
assert.ok(server.includes('Array.isArray(rawCategories)?rawCategories:Object.values(rawCategories)'), 'Parser ESPN deve tolerar payload de categorias em array ou objeto.');
assert.ok(app.includes("adv.error)setError('Métricas avançadas do perfil indisponíveis:") && app.includes('As médias básicas foram preservadas.'), 'Falhas ao atualizar métricas avançadas do perfil devem ser comunicadas sem ocultar as médias básicas.');
assert.ok(app.includes('A partida ainda não começou. As estatísticas individuais aparecem após a publicação do box score.') && app.includes('Atualizar box score') && app.includes('A fonte ainda não publicou as estatísticas individuais desta partida.'), 'Box score deve distinguir jogo agendado, estatísticas ainda não publicadas e permitir nova consulta.');
assert.ok(app.includes("const fallbackStats=bio?.stats||{}"), 'Perfil deve usar a fonte alternativa apenas para campos sem dado primário.');
assert.ok(app.includes('if(targetName)return candidateName===targetName') && app.includes('if(targetName)return rowName===targetName'), 'Perfil deve conciliar IDs ESPN e NBA Stats pelo nome e franquia antes de comparar IDs de provedores diferentes.');
assert.ok(app.includes("normalizePlayerKey(f.player_name)===normalizePlayerKey(name)"), 'Favoritos devem reconhecer o mesmo atleta mesmo com IDs diferentes entre fontes.');
assert.ok(app.includes("'name:'+normalizePlayerKey(f.player_name)"), 'Estado visual dos favoritos deve ser consistente em todas as páginas.');
assert.ok(app.includes("(!targetTeam||!candidateTeam||candidateTeam===targetTeam)") && app.includes("(!targetTeam||!rowTeam||rowTeam===targetTeam)"), 'Conciliação por nome deve respeitar a equipe quando disponível.');
assert.ok(app.includes("const profileAdvancedRow=advancedRow||advancedKeys.some(key=>advancedBase[key]!=null)?advancedBase:null"), 'Perfil deve aproveitar métricas avançadas ESPN quando a fonte principal não retornar valores.');
assert.ok(app.includes("selectedProfile.advanced||null"), 'Atualizações periódicas não podem apagar o fallback do perfil.');

assert.ok(app.includes("x[propMetric]!=null&&x[propMetric]!==''&&Number.isFinite(Number(x[propMetric]))") && app.includes("Number.isFinite(v)?fmt(v):'Não disponível'") && app.includes('Nenhum atleta ou número foi estimado.'), 'Props devem listar somente jogadores com valor oficial válido para a métrica escolhida, preservar zeros reais e explicar quando não há dados.');
assert.ok(app.includes("const fantasyScore=p=>{const values=[p?.pts,p?.reb,p?.ast,p?.stl,p?.blk,p?.turnover];if(values.some(value=>value==null||value===''||!Number.isFinite(Number(value))))return null"), 'Fantasy não pode pontuar estatísticas ausentes como zero.');
assert.ok(app.includes('roster.length===fantasyIds.length&&roster.every(p=>') && app.includes("['pts','reb','ast','stl','blk','turnover'].every(k=>p[k]!=null") && app.includes('const totals=complete?roster.reduce('), 'Total fantasy e totais de pontos/rebotes/assistências só podem aparecer quando todos os atletas selecionados têm dados completos.');
assert.ok(app.includes('].filter(column=>rows.some(row=>row[column.key]!=null))'), 'Evolução do jogador deve ocultar colunas sem dados oficiais.');
assert.ok(app.includes('alphaAverages.filter(p=>p[statMetric]!=null'), 'Rankings estatísticos devem excluir métricas ausentes.');
assert.ok(app.includes('averages.filter(p=>p[category.key]!=null'), 'Destaques por categoria devem excluir valores ausentes.');
assert.ok(app.includes("riskPct!==''") && app.includes('Number(riskPct)<=100'), 'Calculadora de banca deve validar campos vazios e limites de risco.');
assert.ok(app.includes("scenarioValid=scenarioExtraWins!==''&&Number.isFinite(extra)&&extra>=0&&extra<=82"), 'Simulador de campanha deve validar o intervalo hipotético.');
assert.ok(app.includes('metricColumns.some(column=>p[column.key]!=null)'), 'Tabela avançada deve excluir atletas sem métricas oficiais.');
assert.ok(app.includes('featureKeys.includes(page)&&<section className="panel feature-workspace">'), 'Páginas de ferramentas devem manter o contêiner e cabeçalho compartilhados.');
assert.ok(app.includes('rows.some(p=>p[column.key]!=null)'), 'Tabela avançada deve ocultar colunas sem valores publicados.');
assert.ok(app.includes("page==='pace'&&(()=>{const rows=alphaTeamStats;") && app.includes('<th>PACE</th><th>OFF RTG</th><th>DEF RTG</th><th>NET RTG</th>'), 'Painel Pace deve manter as 30 franquias e contextualizar ritmo, eficiência ofensiva e defensiva com dados oficiais.');
assert.ok(app.includes('p.team?.abbreviation===teamA&&p.pts!=null'), 'Destaques de franquia devem ignorar pontos ausentes.');
assert.ok(app.includes('Nenhum valor será estimado.'), 'Painéis de times devem explicar a ausência de métricas sem inventar números.');
assert.ok(app.includes("const raw=p[m.key],value=raw==null||raw===''?null:Number(raw)"), 'Perfil de estilo não pode transformar estatística ausente em zero.');
assert.ok(app.includes("].filter(x=>x.value!=null&&x.value!=='')"), 'Biografia deve ocultar campos que a fonte não forneceu.');
assert.ok(app.includes("Number.isFinite(new Date(playerBio.birth_date).getTime())?new Date(playerBio.birth_date).toLocaleDateString"), 'Biografia deve validar datas antes de exibi-las.');
assert.ok(app.includes("Sem partidas no período"), 'Ferramentas de forma devem explicar quando não há amostra.');


assert.ok(app.includes("api('/api/games/live',{cache:false})"), 'Frontend não consulta o placar ao vivo sem cache.');
assert.ok(app.includes('window.setInterval(refreshLive,15000)'), 'Atualização automática do placar não está configurada para 15 segundos.');
assert.ok(app.includes('overviewGames=useMemo') && app.includes('sortedGames.filter(g=>g.status_state===\'in_progress\')') && app.includes('GameList games={overviewGames.slice(0,8)}'), 'Visão geral deve manter jogos ao vivo visíveis mesmo quando atravessam a meia-noite local.');

const liveMergeStart=app.indexOf('if(updates.length)setGames(current=>{');
const liveMergeEnd=app.indexOf('const selectedGame=boxGameRef.current;',liveMergeStart);
const liveMerge=app.slice(liveMergeStart,liveMergeEnd);
assert.ok(liveMerge.includes('byId.set(String(game.id),{...previous,...game})') && !liveMerge.includes('home_team_score:game.home_team_score??previous.home_team_score'), 'O feed ao vivo não pode preservar placares antigos quando a fonte atual não confirma um valor novo.');
assert.ok(app.includes("const statusRank={scheduled:0,in_progress:1,final:2}") && app.includes("if(previousRank>incomingRank)") && app.includes("current.filter(item=>['in_progress','final'].includes(item.status_state)"), 'O calendário deve aceitar atualizações novas no mesmo estágio ou posteriores e preservar somente estados ao vivo mais recentes quando a resposta estiver atrasada.');
assert.ok(app.includes("clockUnavailable:'Relógio oficial indisponível'") && app.includes("const clock=live?' · '+(g.period_label?g.period_label+' ':'')+(g.display_clock?formatGameClock(g.display_clock):copy.clockUnavailable):'';"), 'Jogos ao vivo sem relógio validado devem informar a indisponibilidade em vez de exibir um minuto incorreto.');
assert.ok(app.includes('const settingsRequestRef=useRef(0)') && app.includes('if(request!==settingsRequestRef.current)return') && app.includes("setLang(data?.language||'pt');setTheme(data?.theme||'dark')"), 'Configurações não podem ser sobrescritas por respostas atrasadas de outro usuário e devem aplicar padrões quando não houver registro.');
assert.ok(app.includes('settingsSaving') && app.includes('disabled={!settingsLoaded||settingsSaving}') && app.includes('setSettingsSaving(true)'), 'Salvar configurações deve aguardar o carregamento e impedir envios duplicados.');
assert.ok(app.includes('settingsSaveRequestRef.current+=1;setSettingsSaving(false)') && app.includes('settingsSaveRequestRef.current+=1;setSettingsSaving(false);setSettingsLoaded(false)'), 'Trocar ou encerrar a sessão deve cancelar o estado visual de salvamento anterior.');
assert.ok(app.includes('setLiveUnavailable(true)'), 'Falhas do feed ao vivo devem ser identificadas na interface.');
assert.ok(app.includes('live-warning'), 'A interface deve diferenciar visualmente o feed indisponível.');
assert.ok(app.includes('g.display_clock'), 'Relógio da partida não é exibido no cartão.');
assert.ok(app.includes("pt:'Aguardando atualização',en:'Waiting for update',es:'Esperando actualización'"), 'Rodapé deve informar estado inicial sem exibir Não disponível.');
assert.ok(app.includes("s?.min==null?'Não disponível':fmt(s.min)") && app.includes("s?.pts==null?'Não disponível':fmt(s.pts)"), 'Elenco em rotação deve identificar explicitamente estatísticas não retornadas, sem células vazias ou zeros falsos.');
assert.ok(app.includes("return team[row.key]==null?'Sem dado':fmt(team[row.key],1)") && app.includes("return 'Sem dados'"), 'Comparação de franquias deve sinalizar métricas ausentes sem inventar números.');
assert.ok(app.includes("(p.position||p.jersey)&&<small>"), 'Ficha do elenco deve ocultar metadados não publicados.');
assert.ok(server.includes('display_clock:'), 'Backend não entrega o relógio da partida.');
assert.ok(server.includes('validGameClock(g.gameClock, g.period)') && server.includes('validGameClock(game.gameClock, period)'), 'Feeds principal e alternativo devem validar o relógio antes de exibi-lo, considerando o período.');
assert.ok(server.includes('function finiteNumberOrNull(value)'), 'Placar não pode transformar texto não numérico em NaN.');
assert.ok(server.includes('Number.isInteger(m) && Number.isInteger(a) && m >= 0 && a > 0 && m <= a ? m / a : null'), 'Percentuais devem rejeitar conversões negativas, fracionárias ou maiores que tentativas e manter Não disponível quando ausentes.');
assert.ok(server.includes('return made <= attempted ? { made, attempted } : { made: null, attempted: null };'), 'Parser de box score deve rejeitar conversões maiores que o total de tentativas.');
assert.ok(server.includes('function validatedAttemptPair(made, attempted)') && server.includes("validatedAttemptPair(fgParsed.made ?? pick('FGM'), fgParsed.attempted ?? pick('FGA'))"), 'Parser ESPN deve validar campos separados de arremessos de quadra.');
assert.ok(server.includes("validatedAttemptPair(ftParsed.made ?? pick('FTM'), ftParsed.attempted ?? pick('FTA'))"), 'Parser ESPN deve validar campos separados de lance livre.');
assert.ok(server.includes("r.LOC_X != null && r.LOC_X !== '' && r.LOC_Y != null && r.LOC_Y !== ''"), 'Mapa de arremessos não pode colocar tentativas sem coordenadas em 0,0.');
assert.ok(server.includes('r.SHOT_MADE_FLAG != null && (Number(r.SHOT_MADE_FLAG) === 0 || Number(r.SHOT_MADE_FLAG) === 1)'), 'Mapa de arremessos deve exigir resultado oficial válido.');
assert.ok(server.includes("const resultText = String(action.shotResult || '').toLowerCase()"), 'Feed alternativo deve usar o resultado explícito do arremesso, não o placar acumulado do time.');
assert.ok(server.includes('if (!made && !missed) continue;'), 'Mapa alternativo deve descartar resultados de arremesso não identificados.');
assert.ok(server.includes("if (rawX == null || rawX === '' || rawY == null || rawY === '') continue;"), 'Feed alternativo não pode converter coordenadas ausentes em zero.');
assert.equal((server.match(/fg_pct:\s*shootingPct\(/g)||[]).length, 3, 'Todos os feeds de box score devem usar o cálculo seguro de aproveitamento.');
assert.ok(server.includes("home_team_score: scoreboardScore(home.score, state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled')"), 'Pontuação da casa deve aceitar somente placares oficiais inteiros e não usar valores do calendário agendado.');
assert.ok(server.includes("if (date !== today && state !== 'in') return []"), 'Partidas ao vivo após meia-noite devem continuar visíveis no horário local.');
assert.ok(server.includes('if (localDate !== today && state !== 2) return null'), 'Fallback NBA Live deve preservar jogos que seguem ao vivo após meia-noite.');
assert.ok(server.includes('async function nbaLiveScoreboard(today)') && server.includes('nbaLiveScoreboard(today)') && server.includes("source: espnResult.status === 'fulfilled' && nbaResult.status === 'fulfilled' ? 'ESPN + NBA Live CDN'") && server.includes("game.status_state === 'in_progress' || game.status_state === 'final'"), 'Placar ao vivo deve consultar NBA Live CDN a cada atualização e combinar estado, período, relógio e placar com o calendário ESPN.');
assert.ok(server.includes("display_clock: statusState === 'in_progress' && period != null ? validGameClock(game.gameClock, period) : null") && server.includes('scoreboardScore(home.score, statusState)'), 'Relógio e placar do NBA Live devem ser validados pela situação real da partida antes de chegar à interface.');
assert.ok(server.includes("if (!/^\\d{10}$/.test(String(game.gameId || ''))"), 'NBA Live deve validar o ID numérico de dez dígitos com regex de dígitos.');
assert.ok(app.includes("api(`/api/games/${encodeURIComponent(g.id)}/stats`,{cache:false})"), 'A abertura manual do box score deve ignorar o cache local para não exibir estatísticas antigas.');
assert.ok(app.includes("boxGame?.status_state==='in_progress'?' · '+(boxGame?.display_clock?formatGameClock(boxGame.display_clock):'Relógio oficial indisponível')"), 'Box score deve exibir o período e o relógio oficial validado da partida ao vivo.');

assert.ok(server.includes("const today = saoPauloDate(new Date().toISOString())"), 'Calendário CDN deve usar a data local de São Paulo.');
assert.ok(server.includes("cached('nba:season-schedule'"), 'Calendário oficial da NBA deve ser armazenado em cache para reduzir chamadas externas.');
assert.ok(server.includes('async function nbaScheduleStandings(season=seasonFor())') && server.includes('Number(game.gameType)!==2||Number(game.gameStatus)!==3') && server.includes('win_pct:record.gp?record.wins/record.gp:null'), 'Classificação deve ter fallback de campanha calculado exclusivamente por placares finais da temporada regular no calendário oficial da NBA.');
assert.ok(server.includes('const scheduleByAbbr=new Map(scheduleRows.map(row=>[row.team.abbreviation,row]));') && server.includes('validCount(scheduleFallback.wins)') && server.includes('validCount(scheduleFallback.losses)') && server.includes('validPct(scheduleFallback.win_pct)'), 'Fallback do calendário oficial deve preencher campanhas ausentes sem fabricar estatísticas.');
assert.ok(server.includes('if(!Object.keys(r).length&&!fallback.team&&!scheduleFallback.team)return null;') && server.includes('playoff_rank:null'), 'Fallback por calendário deve incluir franquias sem resposta NBA/ESPN e não inventar seeds oficiais sem os critérios de desempate da liga.');

assert.equal((server.match(/cached\('nba:season-schedule'/g)||[]).length, 6, 'Calendário NBA deve compartilhar o mesmo cache no calendário, no confronto direto, na resolução de IDs, no preenchimento de placares finais e no fallback do histórico de confrontos.');
assert.ok(server.includes('30 * 60 * 1000'), 'Cache do calendário alternativo deve expirar em trinta minutos.');
assert.ok(server.includes("espn-scoreboard-day:"), 'Consultas diárias ESPN devem usar cache para reduzir chamadas repetidas.');
assert.ok(server.includes("if (failures.length) throw new Error('Calendário ESPN incompleto ('"), 'Calendário parcial da ESPN deve acionar o calendário completo da NBA CDN.');
assert.ok(server.includes("espn:roster:' + abbreviation"), 'Elencos ESPN devem ser armazenados em cache por franquia.');
assert.ok(server.includes('Number.isSafeInteger(player.id) && player.id > 0') && server.includes('new Map(roster.map(player => [player.id, player]))'), 'Elencos devem descartar IDs inválidos e deduplicar jogadores por ID oficial.');
assert.ok(server.includes('const unique = new Map(), conflicts = new Set();') && server.includes('canonicalTeamAbbr(previous.team?.abbreviation || \'\') !== canonicalTeamAbbr(player.team?.abbreviation || \'\')') && server.includes('unique.delete(id);\n        conflicts.add(id);'), 'Elencos globais devem rejeitar IDs repetidos vinculados a franquias diferentes.');
assert.ok(server.includes('async function espnTeamRoster(abbreviation)') && server.includes('const data=await espnTeamRoster(abbreviation);'), 'A página de elenco deve consultar somente a franquia selecionada, sem carregar os 30 elencos.');
assert.ok(server.includes('Math.min(6, teams.length)'), 'Consultas de elenco devem limitar concorrência para evitar bloqueios da ESPN.');
assert.ok(server.includes('const ids=Object.keys(TEAM_META);') && server.includes('data.length!==30'), 'Estatísticas do comparador devem consolidar exatamente as 30 franquias sem duplicações.');
assert.ok(server.includes("if(base.length)sources.push('NBA Stats base')") && server.includes("if(advanced.length)sources.push('NBA Stats advanced')") && server.includes("if(estimatedRows.length)sources.push('NBA Stats team estimated metrics')") && server.includes("if(gameRows.length)sources.push('NBA Stats game finder (médias calculadas dos jogos oficiais)')") && server.includes("if(fallback.length)sources.push('ESPN standings')"), 'A resposta deve identificar corretamente todas as fontes que forneceram estatísticas dos times.');
assert.ok(server.includes('if (a.win_pct == null && b.win_pct != null) return 1;') && server.includes('if (b.win_pct == null && a.win_pct != null) return -1;'), 'Classificação ESPN deve manter percentuais ausentes no fim sem tratá-los como zero real.');
assert.ok(server.includes('const rawWinPct = finiteNumberOrNull(stats.winPercent ?? stats.win_pct);') && server.includes('const winPct = rawWinPct != null && rawWinPct >= 0 && rawWinPct <= 1 ? rawWinPct : null;'), 'Classificação ESPN deve rejeitar percentuais ausentes, não numéricos ou fora do intervalo real de 0 a 1.');
assert.ok(server.includes('const percentage=value=>{const parsed=number(value);return parsed!=null&&parsed>=0&&parsed<=1?parsed:null;}') && server.includes('const winPct=percentage(row.W_PCT)??percentage(standing.win_pct)??(games.decided>0&&wins!=null&&losses!=null?wins/(wins+losses):null)') && server.includes('const validPct=value=>{const n=finiteNumberOrNull(value);return n!=null&&n>=0&&n<=1?n:null;}') && server.includes('win_pct:winPct'), 'Classificação e estatísticas dos times devem validar percentuais NBA Stats e usar ESPN como fallback confirmado.');
assert.ok(server.includes('const nonNegative=value=>{const parsed=number(value);return parsed!=null&&parsed>=0?parsed:null;}') && server.includes('const positive=value=>{const parsed=number(value);return parsed!=null&&parsed>0?parsed:null;}') && server.includes('pace:positive(adv.PACE)??positive(estimated.E_PACE)') && server.includes('off_rating:positive(adv.OFF_RATING)??positive(estimated.E_OFF_RATING)') && server.includes('def_rating:positive(adv.DEF_RATING)??positive(estimated.E_DEF_RATING)') && server.includes('net_rating:number(adv.NET_RATING)??number(estimated.E_NET_RATING)'), 'Métricas avançadas dos times devem rejeitar contagens negativas e Pace/ratings não positivos, preservando Net Rating negativo legítimo.');
assert.ok(server.includes('if(a.net_rating==null&&b.net_rating!=null)return 1;') && server.includes('if(b.net_rating==null&&a.net_rating!=null)return -1;') && app.includes('if(a.net_rating==null&&b.net_rating!=null)return 1;') && app.includes('if(b.net_rating==null&&a.net_rating!=null)return -1;'), 'Rankings de força devem manter times sem Net Rating no fim, sem comparar Net Rating e Win% na mesma escala.');
assert.ok(app.includes("averages.filter(p=>p[c.key]!=null&&Number.isFinite(Number(p[c.key])))") && app.includes("game?.visitor_team?.abbreviation&&p.pts!=null&&Number.isFinite(Number(p.pts))") && app.includes("game?.home_team?.abbreviation&&p.pts!=null&&Number.isFinite(Number(p.pts))"), 'Rankings e líderes não devem incluir estatísticas ausentes como se fossem zero.');
assert.ok(app.includes('Estatísticas oficiais indisponíveis para esta categoria.'), 'Categorias de premiação sem dados devem explicar a indisponibilidade em vez de ficar vazias.');
assert.ok(server.includes('row.TEAM_ABBREVIATION||adv.TEAM_ABBREVIATION||meta?.[0]') && server.includes('const teamId=Number(id),meta=TEAM_META[teamId]') && server.includes('advById.get(id)') && server.includes('baseById.get(id)'), 'Times retornados somente pelas estatísticas avançadas devem manter código e ID oficiais.');
assert.ok(server.includes('if(!base.length&&!advanced.length&&!fallback.length&&!gameRows.length)throw new Error') && server.includes('const ids=Object.keys(TEAM_META);') && !server.includes('new Set([...Object.keys(TEAM_META),...baseById.keys(),...advById.keys()])') && server.includes('data.length!==30'), 'Comparador deve preservar exatamente as 30 franquias conhecidas e falhar quando nenhuma fonte retornar dados.');
assert.ok(app.includes("team[row.key]==null?'Sem dado':fmt(team[row.key],1)") && app.includes("x.wins==null||x.losses==null?'Sem dado':x.wins+'–'+x.losses"), 'Comparador de franquias deve identificar métricas e campanhas ausentes sem deixar células vazias ou inventar números.');
assert.ok(app.includes("teamA===teamB?<p className=\"franchise-warning\">A comparação está pausada: selecione duas franquias diferentes.</p>:teamStatsBusy&&!teamStats.length?") , 'Comparador deve interromper a tabela quando a mesma franquia estiver selecionada nos dois lados.');
assert.ok(app.includes("page==='defense'&&(()=>{const rows=alphaTeamStats.filter(x=>[x.def_rating,x.net_rating,x.stl,x.blk].some(value=>value!=null))") && app.includes('<th>DEF RTG</th>') && app.includes("x.def_rating==null?'Não disponível':fmt(x.def_rating,1)") && app.includes("x.net_rating==null?'Não disponível':fmt(x.net_rating,1)"), 'Análise defensiva deve ordenar as franquias e exibir somente métricas reais retornadas, sem transformar campos ausentes em zero.');
assert.ok(app.includes("label:'Rating defensivo',key:'def_rating'") && app.includes("label:'Roubos por jogo',key:'stl'") && app.includes("label:'Tocos por jogo',key:'blk'") && app.includes("team[row.key]==null?'Sem dado':fmt(team[row.key],1)"), 'Comparador deve identificar ratings defensivos, roubos e tocos ausentes com rótulos honestos.');

assert.ok(server.includes('const [nbaResult,espnResult]=await Promise.allSettled([') && server.includes("cached('espn:standings',espnStandings,5*60*1000)") && server.includes("if(!nbaRows.length&&!espnRows.length&&!scheduleRows.length)throw new Error('NBA Stats, ESPN e calendário oficial da NBA não retornaram classificação.')"), 'Classificação vazia da NBA Stats deve acionar o fallback ESPN e preservar o tratamento quando ambas falharem.');
assert.ok(server.includes('const nbaByAbbr=new Map(nbaRows.map') && server.includes('const data=Object.values(TEAM_META).map(meta=>') && server.includes('const abbreviation=meta[0],r=nbaByAbbr.get(abbreviation)||{},fallback=espnByAbbr.get(abbreviation)||{}'), 'Classificação deve unir NBA Stats e ESPN por franquia, incluindo Utah quando uma das fontes retornar uma tabela parcial.');

assert.ok(server.includes("IsOnlyCurrentSeason: '1'"), 'Fallback do diretório não deve misturar atletas históricos com elenco atual.');
assert.ok(server.includes('Number(p.ROSTERSTATUS) === 1'), 'Fallback NBA Stats deve exibir somente atletas no elenco ativo.');
assert.ok(server.includes("Array.isArray(body.injuries) ? body.injuries : Array.isArray(body.teams)"), 'Parser de lesões deve validar o formato do payload antes de percorrer equipes.');
assert.ok(server.includes("(group.athlete || group.name) ? [group] : []"), 'Parser de lesões deve aceitar também registros diretos, além de grupos por equipe.');
assert.ok(server.includes("entries.forEach(item => unique.set(item.team + '|' + item.name, item))"), 'Relatórios de lesões devem remover duplicatas por atleta e equipe.');
assert.ok(server.includes("detail: typeof detail === 'string'") && server.includes(".replace(/left ankle/gi,'tornozelo esquerdo')") && server.includes(".replace(/hamstring/gi,'posterior da coxa')"), 'Relatórios de lesões devem aceitar somente detalhes textuais e traduzir termos comuns, sem renderizar objetos como [object Object].');
assert.ok(app.includes('let refreshing=false;') && app.includes('let active=true;') && app.includes("if(!active||document.visibilityState!=='visible'||refreshing)return;") && app.includes('finally { refreshing=false; }') && app.includes('return()=>{active=false;window.clearInterval(timer);};'), 'Atualização periódica deve evitar sobreposição, pausar quando a aba estiver oculta e descartar respostas após trocar de tela.');
assert.ok(app.includes("const teamsTask=api('/api/teams'") && app.includes("const gamesTask=api(`/api/games?start=${from}&end=${to}${force?'&refresh=1':''}`") && app.includes("await Promise.all([teamsTask,gamesTask])") && app.includes("setTeams(Array.isArray(result?.data)?result.data:[])") && app.includes("setGamesLoaded(true)"), 'Times e calendário devem ser exibidos independentemente assim que cada consulta paralela concluir, sem esperar pela mais lenta.');
assert.ok(server.includes('Math.min(8, dates.length)'), 'Calendário ESPN deve limitar concorrência para reduzir bloqueios da fonte externa.');
assert.ok(server.includes("90 * 1000"), 'Cache diário ESPN deve ter TTL definido.');
assert.ok(app.includes('if(!left||!right)return false') && app.includes('return Boolean(date&&home&&away&&date===String(right.date||\'\')'), 'Comparação de partidas exige dois objetos válidos e data/abreviações completas quando os IDs diferem.');
assert.ok(app.includes('boxRequest!==boxRequestRef.current||!sameGame(boxGameRef.current,activeGame)'), 'Atualização automática do box score não pode sobrescrever a partida selecionada depois que a requisição começou.');
assert.ok(app.includes("useEffect(()=>{if(page!=='boxscore')boxRequestRef.current+=1;},[page])"), 'Requisições de box score devem ser invalidadas ao sair da tela.');
assert.ok(app.includes('const boxRequestRef=useRef(0)') && app.includes('const request=++boxRequestRef.current') && app.includes('if(request!==boxRequestRef.current)return') && app.includes('if(request===boxRequestRef.current)setBusy(false)'), 'Respostas atrasadas de box scores não podem sobrescrever a partida selecionada mais recentemente.');
assert.ok(app.includes("scorePending:'Placar em atualização'"), 'Cards de jogos devem explicar placar pendente sem inventar zero.');
assert.ok(app.includes("rawStatus.includes('postpon')?copy.postponed"), 'Partidas adiadas não podem aparecer como agendadas.');
assert.ok(server.includes("rawStatus === 'ppd' ? 'Adiado'"), 'Fallback NBA CDN deve preservar partidas com status PPD.');
assert.ok(server.includes("rawStatus.includes('cancel') ? 'Cancelado'"), 'Fallback NBA CDN deve preservar partidas canceladas.');
assert.ok(app.includes("rawStatus.includes('cancel')?copy.cancelled"), 'Partidas canceladas devem manter o status correto.');
assert.ok(app.includes("noScore:'Placar indisponível'"), 'Cards de jogos finalizados sem score devem explicar a ausência de dado.');
assert.ok(app.includes("{p.gamesPlayed??'Não disponível'} jogos"), 'Cards de atletas não podem transformar jogos disputados ausentes em zero.');
assert.ok(app.includes("vs:'VS'"), 'Jogos agendados devem mostrar VS em vez de estatística fictícia ou Não disponível.');

assert.ok(app.includes("cache:cacheGet?fetchOptions.cache:'no-store'"), 'Atualização forçada ainda pode usar cache HTTP do navegador.');

assert.ok(styles.includes('@media'), 'Regras responsivas não encontradas.');
assert.ok(app.includes('profile-hero-headshot') && app.includes('1040x760') && app.includes('decoding="async"') && app.includes('Array.isArray(playerBio.family)') && app.includes('playerBio.family.filter(relative=>relative!=null)'), 'Perfil deve validar relações da biografia antes de renderizar para evitar crash com dados incompletos.');
assert.ok(server.includes("return (centimeters/100).toFixed(2).replace('.',',')+' m'") && server.includes("kilograms.toFixed(1)") && server.includes("return lbText+' lb ('") && server.includes("const normalizeMvpName=value=>") && server.includes("position:String(r.PLAYER_POSITION||r.POSITION||rosterMatch?.position||'').trim()||null"), 'Altura deve aparecer somente em metros e o MVP deve enriquecer a posição com elencos ESPN.');
assert.ok(server.includes('const displayText=value=>') && server.includes('.map(displayText).filter(Boolean)') && server.includes('biography:displayText(athlete.biography)'), 'API de biografia deve normalizar campos textuais e familiares antes de enviar dados ao React.');
assert.ok(server.includes('const teamData=player.team&&typeof player.team===\'object\'?{') && server.includes('const formatPlayerHeight=value=>') && server.includes('raw.match(/^(\\\\d+)\\\\s*(?:-|[\'′])') && server.includes('const formatPlayerWeight=value=>') && server.includes('weight:formatPlayerWeight(nbaInfo.WEIGHT)||formatPlayerWeight(athlete.displayWeight||player.weight)') && server.includes('birth_place:birthplace') && server.includes('college:school') && server.includes('career_summary:careerSummary||null') && server.includes("nba('commonallplayers'") && server.includes('const nbaPlayerId=nbaMatches.length===1?String(nbaMatches[0].PERSON_ID') && server.includes("nba('commonplayerinfo',{PlayerID:nbaPlayerId,LeagueID:'00'})") && server.includes("nba('playercareerstats',{PlayerID:nbaPlayerId,LeagueID:'00',PerMode:'PerGame'})") && server.includes("nba('playerawards',{PlayerID:nbaPlayerId})") && server.includes('biography:displayText(athlete.biography)||displayText(athlete.description)||profileNarrative') && server.includes('awards:awardRows.map') && server.includes('career_seasons:careerRows.map') && server.includes('headshot:photoUrl'), 'Biografia deve combinar campos normalizados da NBA Stats e ESPN, incluindo formação, naturalidade completa e trajetória verificável.');
assert.ok(app.includes("{player.position&&String(player.position).trim()&&<small className=\"subline\">{positionName(player.position,lang)}</small>}"), 'A tabela de jogadores não deve exibir Não disponível abaixo do nome quando a posição estiver ausente.');
assert.ok(app.includes("Dados físicos, formação, draft e histórico: NBA Stats. Perfil editorial: ESPN.") && app.includes("playerBio.career_summary") && app.includes("playerBio.draft") && app.includes("playerBio.awards") && app.includes("playerBio.career_seasons") && app.includes("playerBio.biography"), 'A aba de biografia deve apresentar informações pessoais, trajetória e draft quando confirmados pelas fontes.');
assert.ok(app.includes('className="player-card-image"') && styles.includes('.profile-picker-card .player-card-image img') && styles.includes('.profile-picker-card::before,.profile-picker-card::after'), 'Cards de jogadores devem isolar e centralizar as fotos sem artefatos de layout.');
assert.ok(!app.includes("style.visibility='hidden'"), 'Falha de headshot não deve deixar espaços vazios na interface.');
assert.ok(styles.includes('prefers-reduced-motion'), 'Preferência de movimento reduzido não respeitada.');
assert.ok(worker.includes("url.pathname.startsWith('/api/')"), 'Service worker deve deixar respostas da API fora do cache offline.');
assert.ok(schema.includes('enable row level security'), 'RLS não está habilitado no esquema.');
assert.ok(manifest.includes('"display": "standalone"'), 'Manifest PWA inválido ou incompleto.');
assert.ok(render.includes('npm run test:qa') && render.includes('node --check server/index.js'), 'Deploy Render deve executar QA e checagem de sintaxe antes de publicar.');
assert.ok(!/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(app), 'Há botão com ação vazia.');
const buttons = [...app.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
assert.ok(buttons.length >= 40, 'A interface parece ter perdido seus controles principais.');
assert.ok(buttons.every(tag => /\bonClick\s*=/.test(tag) || /\btype\s*=\s*["']submit["']/.test(tag) || /\bdisabled(?:\s|=|>)/.test(tag)), 'Existe botão sem ação, sem submit e sem estado desabilitado.');
const forms = [...app.matchAll(/<form\b[^>]*>/g)].map(match => match[0]);
assert.ok(forms.every(tag => /\bonSubmit\s*=/.test(tag)), 'Existe formulário sem ação de envio.');
const anchors = [...app.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
assert.ok(anchors.every(tag => /\bhref\s*=/.test(tag)), 'Existe link sem destino.');


assert.ok(server.includes('function dedupeGamePlayers(rows)') && server.includes('else if (previous.team !== team) { byId.delete(id); conflicts.add(id); }') && server.includes('const uniqueRows = dedupeGamePlayers(rows);') && /const uniqueData\s*=\s*dedupeGamePlayers\(data\.filter/.test(server), 'Box scores devem remover IDs duplicados associados a equipes diferentes, sem escolher uma equipe arbitrariamente.');
assert.ok(server.includes('score: scoreboardScore(team.score, summaryStatus)') && server.includes('map(period => scoreboardScore(period?.score, summaryStatus))'), 'Parciais NBA Live devem rejeitar placares negativos, fracionários ou inválidos sem convertê-los em zero.');
assert.ok(server.includes('map(line => scoreboardScore(line.displayValue ?? line.value, summaryStatus))'), 'Parciais ESPN devem rejeitar placares negativos, fracionários ou inválidos sem convertê-los em zero.');
assert.ok(app.includes("p<=4?`Q${p}`:`OT${p-4}`"), 'Tela de parciais deve identificar corretamente todas as prorrogações, inclusive OT3 e posteriores.');

assert.ok(app.includes("trim().toLowerCase()!=='dickalex84@gmail.com'"), 'A homenagem deve ser exclusiva ao e-mail autorizado, sem diferenciar maiúsculas ou espaços.'); 
assert.ok(app.includes("courtside_father_welcome_seen===true") && app.includes("updateUser({data:{courtside_father_welcome_seen:true}})"), 'A homenagem deve persistir a execução única no metadata da conta.'); 
assert.ok(app.includes("setFatherWelcome(true)") && app.includes("setFatherWelcome(false)") && app.includes("12500"), 'A homenagem deve abrir após cadastro/login elegível e encerrar automaticamente.'); 
assert.ok(app.includes('Pai, este projeto também tem um pouco de você.') && app.includes('Obrigado por acreditar em mim'), 'A homenagem deve conter as duas mensagens emocionais aprovadas no fluxo.'); 
assert.ok(styles.includes('.father-welcome-ball') && styles.includes('@keyframes fatherBall') && styles.includes('@keyframes fatherParticle') && styles.includes('6.4s') && styles.includes('8.8s'), 'A homenagem precisa incluir bola, partículas e revelação de texto em tempos distintos.'); 
assert.ok(styles.includes('.father-welcome-skip') && styles.includes('prefers-reduced-motion:reduce'), 'A homenagem deve permitir pular a animação e respeitar movimento reduzido.'); 
assert.ok(styles.includes('COURTSIDE PREMIUM VISUAL SYSTEM') && styles.includes('#ff9b42') && styles.includes('backdrop-filter:blur(14px)'), 'A identidade premium deve incluir paleta quente e superfícies de vidro.'); 

assert.ok(server.includes("app.use(cors({ origin(origin, callback)") && server.includes("ALLOWED_ORIGINS.includes(origin)") && server.includes("credentials: false") && server.includes("allowedHeaders: ['Authorization','Content-Type']"), 'CORS deve aceitar Bearer sem cookies e restringir origens à lista autorizada.');
assert.ok(app.includes("const attempts=method==='GET'?3:1") && app.includes("new URL(path,window.location.origin).toString()") && app.includes("Falha de conexão com a API") && app.includes("900*(attempt+1)"), 'O cliente deve repetir falhas de rede transitórias em GET e apresentar diagnóstico claro.');
assert.ok(app.includes('Carregando jogadores…') && app.includes('Nenhum jogador encontrado para esta busca.') && app.includes('Tentar novamente') && app.includes('role="status"'), 'Lista de jogadores deve distinguir carregamento, busca sem resultados e falha recuperável.');
assert.ok(app.includes('Carregando recordes históricos…') && app.includes('Não foi possível carregar os recordes históricos:') && app.includes('Nenhum recorde histórico foi retornado pela fonte.') && app.includes('Tentar carregar novamente'), 'Arquivo histórico deve distinguir carregamento, erro e ausência de registros com nova tentativa.');
assert.ok(app.includes('NBA Stats não retornou valores válidos de') && app.includes('Atualizar médias oficiais') && app.includes('Média por jogo da temporada regular, consultada na NBA Stats.'), 'Análise de props deve identificar a fonte oficial e permitir atualização quando a métrica não tiver dados.');
assert.ok(app.includes('Não foi possível atualizar os jogos ao vivo.') && app.includes('Aguardando a primeira atualização dos jogos ao vivo…') && app.includes('Dados atualizados às') && app.includes('Atualização automática a cada 15 segundos.'), 'Central ao vivo deve informar estado da atualização, falha e horário da última sincronização.');
assert.ok(app.includes('Carregando métricas defensivas das franquias…') && app.includes('Falha ao consultar métricas defensivas:') && app.includes('Tentar carregar novamente') && app.includes('As métricas defensivas não foram fornecidas pela fonte nesta consulta.'), 'Análise defensiva deve distinguir carregamento, erro e ausência de métricas com recuperação.');
assert.ok(app.includes("api('/api/team-stats')") && app.includes('request!==teamStatsRequestRef.current') && app.includes('setTeamStatsMeta({season:r.season,source:r.source,updatedAt:r.updatedAt});setTeamStatsError(\'\');'), 'Atualização automática das métricas de franquias deve reutilizar cache recente e proteger a resposta mais recente com seus metadados.');
assert.ok(app.includes('DEF RTG e NET RTG são pontos por 100 posses; roubos e tocos são médias por jogo.') && app.includes('teamStatsMeta?.source') && app.includes('teamStatsMeta?.updatedAt'), 'Análise defensiva deve explicar as unidades e identificar temporada, fonte e horário dos dados.');
assert.ok(app.includes('Carregando classificação oficial…') && app.includes('Não foi possível carregar a classificação:') && app.includes('A fonte não retornou classificação para esta consulta.') && app.includes('Tentar carregar classificação novamente'), 'Playoffs deve distinguir carregamento, falha e ausência de classificação, com nova tentativa.');
assert.ok(app.includes("['East','West'].map(conference=>") && app.includes('<th>Seed</th><th>Franquia</th><th>Campanha</th><th>Aproveitamento</th>') && app.includes('const ar=Number(a.playoff_rank),br=Number(b.playoff_rank)') && app.includes('return aRank-bRank') && server.includes('playoff_rank:') && !app.includes('<DataTable rows={standings}'), 'Playoffs devem separar classificação Leste/Oeste, ordenar seeds por aproveitamento e usar tabela própria, sem cabeçalhos de jogadores.');
const playoffBlock=app.slice(app.indexOf("page==='playoffs'&&"),app.indexOf("page==='records'&&",app.indexOf("page==='playoffs'&&")));
assert.ok(playoffBlock.includes("Number.isSafeInteger(s.playoff_rank)&&s.playoff_rank>0?s.playoff_rank:'Não disponível'") && !playoffBlock.includes('<td>{i+1}</td>'), 'Playoffs devem exibir apenas o seed oficial retornado pela fonte; não podem fabricar uma posição sequencial quando o seed estiver ausente.');
assert.ok(app.includes("if(targetName)return candidateName===targetName") && app.includes("if(targetName)return rowName===targetName"), 'Perfil do jogador deve reconciliar IDs ESPN e NBA Stats pelo nome e franquia antes de comparar IDs de provedores diferentes.');
assert.ok(app.includes("const playerLoadedSearchRef=useRef('')") && app.includes("const append=!reset&&Boolean(playerCursor)&&query===playerLoadedSearchRef.current") && app.includes("setPlayers(old=>append?[...old,...incoming]:incoming)"), 'Paginação de jogadores deve reiniciar automaticamente quando a busca mudar e só concatenar páginas da mesma consulta.');
console.log('Courtside QA estática aprovada: ' + features.length + ' funcionalidades, ' + navKeys.length + ' itens de navegação e ' + routes.length + ' rotas verificadas.');

assert.ok(styles.includes('COURTSIDE ARENA ATMOSPHERE') && styles.includes('radial-gradient(ellipse at 50% 0%') && styles.includes('arenaLightSweep'), 'Fundo deve incluir geometria sutil de quadra e iluminação de arena em movimento.');
assert.ok(styles.includes('@keyframes courtsideRise') && styles.includes('.content > *:nth-child(5)'), 'Conteúdo deve ter animação de entrada escalonada.');
assert.ok(styles.includes('@keyframes liveBeacon') && styles.includes('.metric-card:after'), 'Jogos ao vivo e cards de métricas devem ter efeitos visuais dedicados.');
assert.ok(styles.includes('prefers-reduced-motion:reduce') && styles.includes('.layout:after,.content > *,.live i{animation:none!important}'), 'Novos efeitos devem respeitar preferência por movimento reduzido.');

assert.ok(server.includes(String.raw`const normalizePlayerSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();`) && server.includes('normalizePlayerSearch(`${p.first_name} ${p.last_name}`).includes(search)') && server.includes('normalizePlayerSearch(p.DISPLAY_FIRST_LAST).includes(search)'), 'Busca de jogadores deve ignorar acentos e aplicar o mesmo filtro nas fontes ESPN e NBA Stats.');
assert.ok(server.includes(String.raw`const requestedName=String(req.query.name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')`) && server.includes(String.raw`const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()`), 'Perfil deve normalizar nomes removendo apenas marcas diacríticas, sem apagar letras do nome.');
assert.ok(server.includes("const requestedTeamCandidate=canonicalTeamAbbr(String(req.query.team||'').trim())") && server.includes("espnTeamRoster(requestedTeam)"), 'Perfil deve resolver o atleta pelo elenco ESPN da franquia selecionada e validar códigos agregados.');
assert.ok(app.includes("&team='+encodeURIComponent(targetTeam)") && app.includes("Biografia de '+fullName+' indisponível no momento:"), 'Perfil deve enviar a franquia e exibir falhas da biografia sem ocultá-las.');
assert.ok(styles.includes('photo-1560553814-060afcd8904a') && styles.includes('background-attachment:fixed'), 'Layout deve usar fotografia real de arena como fundo.');
assert.ok(styles.includes('backdrop-filter:blur(14px)') && styles.includes('background-color:rgba(12,13,15,.84)'), 'Painéis devem preservar legibilidade com vidro desfocado sobre a fotografia.');

assert.ok(app.includes("new URL(path,window.location.origin).toString()") && app.includes("const attempts=method==='GET'?3:1") && app.includes("900*(attempt+1)") && app.includes("mode:'same-origin'"), 'Chamadas GET da API devem usar a origem do serviço e tolerar falhas transitórias/cold start com tentativas progressivas.');

assert.ok(styles.includes('.layout.light{') && styles.includes('--bg:#e9eef4') && styles.includes('--panel:#f4f6f8') && styles.includes('LIGHT THEME — warm arena paper'), 'Tema claro deve usar paleta suave de arena, superfícies cinza-azuladas e contraste legível em vez de branco puro.');
assert.ok(styles.includes('.layout.light .shot-chart') && styles.includes('.layout.light .news-card') && styles.includes('.layout.light .franchise-scoreboard article') && styles.includes('.layout.light .auth-card'), 'Tema claro deve adaptar também componentes especiais, gráficos, notícias, comparador e autenticação.');

assert.ok(app.includes('homeRecord:home.length?') && app.includes("x.homeRecord||'Sem dados na amostra'") && app.includes("x.totalRecord||'Sem partidas finalizadas'"), 'Casa e fora não pode transformar ausência de jogos finalizados em campanha 0–0.');
assert.ok(app.includes("streak:streakKind?(streakCount<0?recent.length:streakCount):null"), 'Sequências sem jogos não podem ser exibidas como sequência numérica zero.');
assert.ok(app.includes("s?.min==null?'Não disponível':fmt(s.min)") && app.includes("s?.pts==null?'Não disponível':fmt(s.pts)"), 'Rotação não pode deixar células vazias quando a estatística individual não foi retornada.');
assert.ok(app.includes("const normalizeRosterPlayerName=") && app.includes("normalizeRosterPlayerName((x.player?.first_name+' '+x.player?.last_name))===normalizeRosterPlayerName(alphaName(p))") && app.includes("normalizeRosterPlayerName(x.player?.first_name+' '+x.player?.last_name)===normalizeRosterPlayerName(fullName)"), 'Rotação e análise dos times devem conciliar nomes ESPN/NBA mesmo com acentos, pontuação e sufixos Jr./III.');

assert.ok(app.includes("page==='playerprops'&&(()=>{const eligible=alphaAverages.filter(x=>x[propMetric]!=null&&x[propMetric]!==''&&Number.isFinite(Number(x[propMetric])))") && app.includes("referenceLine=Number.isFinite(v)?Math.round(v*2)/2:null") && app.includes("line=propLine===''?referenceLine:Number(propLine)") && app.includes('<input type="number" min="0" step="0.5" value={propLine}') && app.includes('A taxa abaixo é frequência histórica observada, não probabilidade futura') && app.includes('sample=logs.map(game=>game[propMetric])') && app.includes('Acima da linha'), 'Análise de props deve mostrar linha de referência derivada da média oficial e confrontar logs reais, sem fingir que é linha de casa de apostas.');
assert.ok(app.includes('<span>Média − linha</span>') && app.includes("v-line>0?'+':''") && app.includes("Média abaixo da linha"), 'Análise de props deve mostrar a diferença assinada entre média e linha e explicar se a média ficou acima ou abaixo.');
assert.ok(app.includes("supabase.from('user_settings').upsert({user_id:userId,language,theme:selectedTheme,updated_at:new Date().toISOString()})") && app.includes("const request=++settingsSaveRequestRef.current,userId=session.user.id,language=lang,selectedTheme=theme") && schema.includes('create table if not exists public.user_settings') && schema.includes('create policy "settings_select_own"') && schema.includes('create policy "settings_insert_own"') && schema.includes('create policy "settings_update_own"'), 'Configurações devem persistir idioma e tema por usuário com políticas RLS de leitura, inclusão e atualização.');
assert.ok(app.includes("Não foi possível carregar suas configurações: ") && app.includes("Não foi possível salvar suas configurações: ") && app.includes("Não foi possível salvar: a conexão com o Supabase não está configurada."), 'Configurações devem informar falhas de leitura e gravação em vez de falhar silenciosamente.');
assert.ok(server.includes("const number=value=>value==null||typeof value==='boolean'||String(value).trim()===''||!Number.isFinite(Number(value))?null:Number(value)"), 'Estatísticas de franquias devem rejeitar booleanos e strings vazias antes de converter números.');
assert.ok(server.includes("const numberOrNull=value=>value==null||typeof value==='boolean'||String(value).trim()===''||!Number.isFinite(Number(value))?null:Number(value);"), 'Biografia ESPN deve rejeitar booleanos e strings vazias antes de converter estatísticas.');
assert.ok(server.includes('const requestedTeam=Object.values(TEAM_META).some(meta=>meta[0]===requestedTeamCandidate)?requestedTeamCandidate:\'\';') && server.includes('let nameMatches=requestedName?roster.filter(item=>') && server.includes("if(!nameMatches.length&&requestedName&&requestedTeam)"), 'Perfil deve aceitar códigos de equipe válidos e consultar o diretório global quando o elenco não localizar o atleta.');
assert.ok(server.includes('const data = rows.filter(r => { const id=Number(r.PLAYER_ID),gp=numberOrNull(r.GP); return Number.isSafeInteger(id)&&id>0&&String(r.PLAYER_NAME||\'\').trim()&&gp!=null&&gp>0; }).map(r => ({') && server.includes('gamesPlayed: positive(r.GP)'), 'Médias da temporada devem rejeitar GP booleano, vazio ou inválido antes de incluir atletas.');
assert.ok(server.includes('O parâmetro :id vem da NBA Stats; ele não pertence ao espaço de IDs da ESPN.') && server.includes('let nameMatches=requestedName?roster.filter(item=>') && server.includes("(!requestedTeam||canonicalTeamAbbr(item.team?.abbreviation||'')===requestedTeam)") && server.includes('if(nameMatches.length>1)return res.status(409)'), 'Biografia deve resolver IDs NBA/ESPN por nome+franquia e rejeitar correspondências ambíguas.');
assert.ok(server.includes("const ratio = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>=0&&parsed<=1?parsed:null; };") && server.includes("const positive = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>0?parsed:null; };") && server.includes("Number.isSafeInteger(id)&&id>0&&String(r.PLAYER_NAME||'').trim()&&gp!=null&&gp>0"), 'Estatísticas avançadas devem validar IDs, jogos, razões percentuais e métricas estritamente positivas.');

assert.ok(app.includes("final?copy.noScore:copy.vs") && app.includes("final?'FINAL':rawStatus"), 'Partida finalizada sem placar deve ser identificada como resultado indisponível, não como aguardando.');
assert.ok(app.includes('const teamStatsRequestRef=useRef(0)') && app.includes('const request=++teamStatsRequestRef.current;setTeamStatsBusy(true)') && app.includes('if(request!==teamStatsRequestRef.current)return') && app.includes('if(request===teamStatsRequestRef.current)setTeamStatsError') && app.includes('if(request===teamStatsRequestRef.current)setTeamStatsBusy(false)'), 'Respostas antigas do comparador de franquias não podem sobrescrever dados nem encerrar o loading de uma consulta mais recente.');
assert.ok(recordsEndpoint.includes('Object.prototype.hasOwnProperty.call(row,category)') && recordsEndpoint.includes("'NBA Stats AllTimeLeadersGrids'"), 'Recordes históricos devem localizar cada categoria no conjunto correto e identificar a fonte oficial.');
assert.ok(app.includes("label:'Pontos por jogo',key:'pts'") && app.includes("label:'Rebotes por jogo',key:'reb'") && app.includes("label:'Tocos por jogo',key:'blk'") && app.includes('Estes rankings não representam vencedores de MVP'), 'Central de prêmios não pode apresentar líderes de pontos/tocos como vencedores de prêmios oficiais.');

assert.ok(app.includes('Array.from({length:81},(_,i)=>{const y=currentSeasonStartYear()-i;') && app.includes('seasonLabel(y)'), 'Arquivo histórico deve incluir todas as temporadas desde 1946-47 com ano-base dinâmico.');
assert.ok(server.includes('Number(match[1])<1946'), 'API histórica deve rejeitar temporadas anteriores à fundação da NBA.');

assert.ok(app.includes('const historicRequestRef=useRef(0)') && app.includes('const request=++historicRequestRef.current') && app.includes('if(request!==historicRequestRef.current)return') && app.includes('if(request===historicRequestRef.current)setHistoricBusy(false)'), 'Consultas históricas antigas não podem sobrescrever filtros recentes nem encerrar o carregamento da consulta atual.');
assert.ok(app.includes('const averagesRequestRef=useRef(0)') && app.includes('const request=++averagesRequestRef.current;setBusy(true)') && app.includes('if(request!==averagesRequestRef.current)return') && app.includes('if(request===averagesRequestRef.current)setBusy(false)') && app.includes('Array.isArray(r.data)?r.data:[]'), 'Trocas rápidas de período nas médias não podem exibir resposta antiga, encerrar o loading atual ou gravar resposta fora do formato esperado.');
assert.ok(app.includes('const quarterSummaryRequestRef=useRef(0)') && app.includes("const request=++quarterSummaryRequestRef.current;setQuarterGameId(String(id))") && app.includes('if(request!==quarterSummaryRequestRef.current)return;setQuarterSummary(r.data||null);') && app.includes('if(request===quarterSummaryRequestRef.current)setBusy(false)'), 'Trocas rápidas de partida nos parciais não podem exibir o resumo de outro jogo nem encerrar o carregamento atual.');
assert.ok(app.includes("if(page==='quarters'&&quarterGameId){const request=++quarterSummaryRequestRef.current") && app.includes('if(!active||request!==quarterSummaryRequestRef.current)return;setQuarterSummary(r.data||null);'), 'A atualização periódica dos parciais deve respeitar a seleção atual e não sobrescrever uma consulta mais recente.');
assert.ok(app.includes("if(updates.length)setGames(current=>{") && !app.includes("else setGames(current=>current.filter(game=>gameLocalDate(game)!==dateNow(0)))"), 'Feed ao vivo vazio não pode apagar a agenda diária já carregada.');
assert.ok(app.includes("if(page==='historicstats')loadHistoricStats()"), 'A página de estatísticas históricas deve consultar automaticamente a temporada selecionada ao ser aberta.');
assert.ok(app.includes('const currentSeasonStartYear=()=>') && app.includes("useState(()=>seasonLabel(currentSeasonStartYear()))") && app.includes('const y=currentSeasonStartYear()-i'), 'O arquivo histórico deve acompanhar a temporada NBA atual sem depender de um ano fixo no código.');
assert.ok(app.includes("if(request===historicRequestRef.current)setHistoricError(e.message||'Não foi possível carregar a temporada.')") && !app.includes("setHistoricRows([]);setHistoricMeta(null);setHistoricError(e.message||'Não foi possível carregar a temporada.')"), 'Falhas ao atualizar o arquivo histórico devem preservar a última consulta válida.');
assert.ok(app.includes('Atualizar classificação</button>') && app.includes('Atualizar métricas defensivas</button>'), 'Playoffs e análise defensiva devem permitir atualização manual das fontes oficiais.');
assert.ok(app.includes("Amostra: {p.gamesPlayed??'Não disponível'} jogos."), 'Análise de props deve informar o tamanho da amostra real usada na média.');

assert.ok(server.includes("score:['in','post'].includes(String(competition.status?.type?.state||event.status?.type?.state||'pre').toLowerCase())?finiteNumberOrNull(side.score):null"), 'Confrontos diretos não podem exibir placar ou saldo em partidas ainda não iniciadas, mesmo que a ESPN envie zero no calendário.');

assert.ok(server.includes("'/schedule?season=' + seasonYear + '&seasontype=2'"), 'Confrontos diretos devem solicitar explicitamente a temporada regular à ESPN, sem misturar pré-temporada ou playoffs.');
assert.ok(server.includes("Promise.allSettled([espnTeamSchedule(team,seasonYear),espnTeamSchedule(opponent,seasonYear)])") && server.includes("if(!hasPair(merged))") && server.includes("headtohead:'+team+':'+opponent+':'+season"), 'Confrontos diretos devem tolerar falha 502/503 da ESPN e consultar o calendário oficial NBA CDN antes de falhar.');
assert.ok(server.includes("if(hasPair(fromNba))return fromNba;") && server.includes("const hasPair=items=>") && server.includes("if(!hasPair(merged))throw new Error"), 'Confrontos diretos devem priorizar um único calendário oficial NBA CDN e usar ESPN somente como fallback.');
assert.ok(server.includes("const winPct=validPct(r.WIN_PCT)??validPct(fallback.win_pct)??validPct(scheduleFallback.win_pct)??(wins!=null&&losses!=null&&wins+losses>0?wins/(wins+losses):null);"), 'Playoffs devem calcular aproveitamento a partir de vitórias e derrotas oficiais validadas quando a fonte omitir WIN_PCT.');
assert.ok(server.includes("const staleWindow = ttl >= 60_000 ? 6 * 60 * 60 * 1000 : 0;") && server.includes("return stale.value;"), 'Falhas temporárias das fontes devem preservar o último cache válido de dados não voláteis para evitar páginas vazias.');


assert.ok(server.includes('const validCount=value=>{const n=finiteNumberOrNull(value);return n!=null&&Number.isSafeInteger(n)&&n>=0?n:null;}') && server.includes('const wins=validCount(r.WINS)??validCount(fallback.wins)??validCount(scheduleFallback.wins);') && server.includes('const losses=validCount(r.LOSSES)??validCount(fallback.losses)??validCount(scheduleFallback.losses);'), 'Classificação NBA/ESPN deve rejeitar campanhas vazias, booleanas ou inválidas em vez de exibir zeros falsos.');

assert.ok(server.includes('const wins=count(row.W)??(games.decided?games.wins:null)??count(standing.wins)') && server.includes('const losses=count(row.L)??(games.decided?games.losses:null)??count(standing.losses)') && server.includes('const winPct=percentage(row.W_PCT)??percentage(standing.win_pct)'), 'Comparador deve usar campanha ESPN validada quando NBA Stats e Game Finder não fornecerem vitórias, derrotas ou aproveitamento.');
assert.ok(server.includes("const count=value=>{const parsed=number(value);return parsed!=null&&Number.isSafeInteger(parsed)&&parsed>=0?parsed:null;}") && server.includes("const wins=count(row.W)??(games.decided?games.wins:null)"), 'Estatísticas de franquias devem aceitar GP, vitórias e derrotas somente como contagens inteiras não negativas.');

assert.ok(server.includes("const positive = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>0?parsed:null; }") && (server.match(/gamesPlayed: positive\(r\.GP\)/g)||[]).length>=2, 'Endpoints de médias básicas e avançadas precisam declarar seu validador positivo local antes de converter GP; chamadas sem helper causariam ReferenceError.');
const historicEndpoint=server.slice(server.indexOf("app.get('/api/historicstats'"),server.indexOf("app.get('/api/records'"));
assert.ok(historicEndpoint.includes("Number.isSafeInteger(number(row.GP))") && historicEndpoint.includes("const nonNegative=value=>{const parsed=number(value);return parsed!=null&&parsed>=0?parsed:null;}") && historicEndpoint.includes("const percentage=value=>{const parsed=number(value);return parsed!=null&&parsed>=0&&parsed<=1?parsed:null;}") && historicEndpoint.includes("fg_pct:percentage(row.FG_PCT)") && historicEndpoint.includes("fg3_pct:percentage(row.FG3_PCT)") && historicEndpoint.includes("ft_pct:percentage(row.FT_PCT)"), 'Estatísticas históricas devem rejeitar contagens fracionárias, valores negativos e percentuais fora de 0–1 sem transformar dados ausentes em zero.');
const historicalBoxscore=server.slice(server.indexOf('async function nbaHistoricalBoxscore'),server.indexOf('async function nbaGameIdFromEspn'));
assert.ok(historicalBoxscore.includes('boxscoretraditionalv3') && historicalBoxscore.includes('body?.boxScoreTraditional||body?.boxscoreTraditional') && historicalBoxscore.includes('^\\d{10}$') && historicalBoxscore.includes('player.statistics||{}') && !historicalBoxscore.includes("nba('boxscoretraditionalv2'"), 'Fallback histórico do box score deve usar o endpoint V3 e ler o objeto boxScoreTraditional, pois V2 não cobre temporadas recentes.');
assert.ok(historicalBoxscore.includes('Number.isSafeInteger(parsed)&&parsed>=0') && historicalBoxscore.includes('attemptPair(stats.fieldGoalsMade,stats.fieldGoalsAttempted)') && historicalBoxscore.includes('attemptPair(stats.threePointersMade,stats.threePointersAttempted)') && historicalBoxscore.includes('attemptPair(stats.freeThrowsMade,stats.freeThrowsAttempted)'), 'Box score V3 deve rejeitar contagens fracionárias e pares de arremessos impossíveis sem exibir estatísticas corrompidas.');

assert.ok(server.includes("res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'") && server.includes("'Surrogate-Control': 'no-store'"), 'Placar ao vivo deve impedir cache de navegador/proxy para não congelar placar, período ou relógio entre atualizações.');
assert.ok(styles.includes(':focus-visible') && styles.includes('overscroll-behavior-x:contain') && styles.includes('env(safe-area-inset-top)') && styles.includes('@media(max-width:380px)'), 'UI deve oferecer foco acessível, rolagem de tabelas controlada e ajustes para telas móveis estreitas.');

assert.ok(arena.includes('<svg') && arena.includes('viewBox="0 0 1800 1200"') && arena.includes('id="court"'), 'O fundo ilustrado original da arena deve existir como SVG válido e versionado no projeto.');
assert.ok(styles.includes("url('/courtside-arena.svg')") && styles.includes('@keyframes courtsideEnter') && styles.includes('@keyframes courtsideGlow'), 'O tema deve usar o fundo original e animações próprias de interface.');
assert.ok(app.includes('soundEnabled') && app.includes('AudioContextClass') && app.includes('aria-pressed={soundEnabled}') && app.includes('onClickCapture={e=>{const button=e.target?.closest?.(\'button\')'), 'Efeitos sonoros devem ser opcionais, sintetizados localmente e aplicados aos controles com acessibilidade.');

assert.ok(!app.includes('N/D'), 'Nenhuma página pode exibir o marcador opaco N/D; ausência deve ser explicada claramente.');
assert.ok(!server.includes("'N/D'") && server.includes("date:game.date?String(game.date).slice(0,10):null"), 'Datas ausentes no backend devem permanecer nulas, nunca virar texto fictício.');

assert.ok(server.includes("const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '').split(',')") && server.includes("app.use(cors({ origin(origin, callback)") && server.includes("ALLOWED_ORIGINS.includes(origin)"), 'CORS deve estar ativo e aceitar somente as origens explicitamente configuradas.');
assert.ok(server.includes("app.set('trust proxy', 1)") && server.indexOf("app.set('trust proxy', 1)") < server.indexOf("app.use('/api/', rateLimit"), 'Rate limit precisa identificar o IP real do cliente atrás do proxy do Render.');

assert.ok(worker.includes("courtside-shell-v7") && worker.includes("'/courtside-arena.svg'"), 'Service worker deve atualizar o cache e disponibilizar o fundo da arena também no modo offline.');
assert.ok(manifest.includes('"sizes": "192x192"') && manifest.includes('"sizes": "512x512"') && manifest.includes('"display": "standalone"'), 'PWA deve declarar ícones e modo de instalação em tela cheia.');
assert.ok(styles.includes('.install-guide') && styles.includes('.layout.light .panel') && styles.includes('@media(max-width:650px)'), 'Atualização visual deve preservar tema claro e estilos responsivos para instalação.');
assert.ok(manifest.includes('"display_override"') && manifest.includes('"prefer_related_applications": false') && manifest.includes('"purpose": "maskable"'), 'Manifest deve priorizar instalação standalone e declarar ícone maskable para dispositivos Android.');

assert.ok(app.includes("beforeinstallprompt") && app.includes("installPrompt.prompt()") && app.includes("appInstalled"), 'Cabeçalho deve oferecer instalação nativa do Courtside quando o navegador permitir.');
assert.ok(styles.includes("COURTSIDE ARENA V2") && styles.includes("prefers-reduced-motion:reduce") && styles.includes("backdrop-filter:none!important"), 'Visual da arena deve respeitar movimento reduzido e evitar filtros pesados.');

assert.ok(html.includes('rel="preconnect" href="https://fonts.googleapis.com"') && html.includes('og:title') && !styles.startsWith('@import url('), 'Fontes externas devem ter preconnect no documento e metadados de compartilhamento sem @import bloqueante no CSS.');
assert.ok(app.includes("meta.setAttribute('content',theme==='light'?'#e9eef4':'#081426')"), 'A cor da barra do navegador deve acompanhar o tema claro/escuro selecionado.');

assert.ok(app.includes("const loadRankings=async()=>{const request=++rankingsRequestRef.current") && app.includes("const loadMvp=async()=>{const request=++mvpRequestRef.current") && app.includes("const loadRecords=async()=>{const request=++recordsRequestRef.current") && app.includes("const loadAdvanced=async()=>{const request=++advancedRequestRef.current") && app.includes("const loadStandings=async()=>{const request=++standingsRequestRef.current"), 'Carregadores de rankings, MVP, recordes, avançadas e classificação devem ignorar respostas antigas.');
assert.ok(app.includes("if(!active||request!==rankingsRequestRef.current)return;setRanking") && app.includes("if(!active||request!==averagesRequestRef.current)return;setAverages") && app.includes("if(!active||request!==standingsRequestRef.current)return;setStandings") && app.includes("if(!active||request!==mvpRequestRef.current)return;setMvp") && app.includes("if(!active||request!==recordsRequestRef.current)return;setRecordLeaders") && app.includes("if(!active||request!==advancedRequestRef.current)return;setAdvanced"), 'Atualizações automáticas devem compartilhar os mesmos tokens e não sobrescrever consultas manuais recentes.');

assert.ok(app.includes("const loadNewsNew=")===false && app.includes("newsRequestRef") && app.includes("injuriesRequestRef") && app.includes("if(!active||request!==newsRequestRef.current)return;") && app.includes("if(!active||request!==injuriesRequestRef.current)return;"), 'Notícias e lesões devem ignorar respostas atrasadas após troca de página ou atualização concorrente.');
assert.ok(app.includes("translate.googleapis.com/translate_a/single") && app.includes("if(!featureNews.length){setTranslatedNews({});return;}") && !app.includes("if(lang==='pt'||!featureNews.length)"), 'Notícias NBA devem ser traduzidas automaticamente também para português.');
assert.ok(app.includes("[translatedInjuries,setTranslatedInjuries]=useState({})") && app.includes("if(!featureInjuries.length){setTranslatedInjuries({});return;}") && app.includes("translatedInjuries[lang]?.find"), 'Status e detalhes dos relatórios de lesões devem ser traduzidos automaticamente no idioma selecionado.');
assert.ok(app.includes("return()=>{active=false;if(page==='news')newsRequestRef.current++;if(page==='injuries')injuriesRequestRef.current++;};"), 'A saída das páginas de notícias/lesões deve invalidar requisições pendentes.');

assert.ok(!app.includes("onChange={e=>{setTeamA(e.target.value);loadTeamRoster(e.target.value);}}") && app.includes("if(['teamanalytics','lineups','rotation'].includes(page))loadTeamRoster(teamA);"), 'Trocar a franquia deve disparar apenas o carregamento centralizado do elenco, sem chamadas duplicadas no evento e no efeito.');

assert.ok(app.includes("const favoritesRequestRef=useRef(0)") && app.includes("request!==favoritesRequestRef.current||session?.user?.id!==userId") && app.includes("else{favoritesRequestRef.current++;setFavorites([]);}"), 'Favoritos devem ser isolados por sessão e respostas pendentes da conta anterior não podem reaparecer após logout ou troca de usuário.');

assert.ok(app.includes("favoriteMutationRef=useRef(new Map()),favoriteSessionEpochRef=useRef(0),favoriteSessionUserRef=useRef(null)") && app.includes("syncFavoriteSession(s?.user?.id||null)") && app.includes("favoriteMutationRef.current.clear()"), 'Mutação de favoritos deve invalidar travas quando a sessão autenticada muda ou é encerrada.');

assert.ok(app.includes("const loadCore=useCallback(async({force=false}={})=>{\n  const request=++coreRequestRef.current;") && app.includes("if(request!==coreRequestRef.current)return;") && app.includes("const signOut=async()=>{try{") && app.includes("coreRequestRef.current+=1"), 'Visão geral e calendário devem proteger resultados de consultas antigas e invalidar o carregamento ao sair da conta.');

assert.ok(server.includes("const forceRefresh = String(req.query.refresh || '') === '1'") && server.includes("forceRefresh ? await espnGames(start, end)") && server.includes("forceRefresh ? await nbaCdnGames(start, end)"), 'Atualização manual do calendário deve poder ignorar o cache do servidor nas fontes ESPN e NBA CDN.');
assert.ok(app.includes("setLiveRefreshTick(value=>value+1)") && app.includes("},[session,api,page,liveRefreshTick]);") && app.includes("force?'&refresh=1':''"), 'O botão Atualizar deve disparar também uma nova consulta do placar ao vivo, sem aguardar o intervalo automático.');

assert.ok(worker.includes("if(request.mode==='navigate')return caches.match('/')") && worker.includes('return Response.error()'), 'Service worker deve usar o HTML offline somente para navegação; recursos CSS/JS/imagens ausentes não podem receber HTML como resposta.');

assert.ok(app.includes('const TEAM_LOGO_IDS={ATL:1610612737') && app.includes("https://cdn.nba.com/logos/nba/'+teamId+'/global/L/logo.svg") && app.includes('className="game-team-logo"') && app.includes('loading="lazy"'), 'Cartões de jogos devem usar escudos oficiais NBA com carregamento tardio e fallback visual.');
assert.ok(styles.includes('.game-matchup-teams') && styles.includes('.game-team-logo') && styles.includes('@media(max-width:650px){.game-matchup-teams'), 'Escudos dos times devem manter alinhamento e tamanho responsivo em telas pequenas.');

assert.ok(app.includes("teamLogoId(team.abbreviation)?'https://cdn.nba.com/logos/nba/'+teamLogoId(team.abbreviation)") && app.includes("teamLogoId(teamA)?'https://cdn.nba.com/logos/nba/'+teamLogoId(teamA)"), 'Central dos times e análise da franquia devem usar o resolvedor de escudos oficiais NBA, incluindo o alias UTAH.');

assert.ok(styles.includes('@keyframes courtsideLivePulse') && styles.includes('.live i,.status-live:before') && styles.includes('@media(prefers-reduced-motion:reduce){.live i,.status-live:before'), 'Indicadores de partida ao vivo devem pulsar discretamente e respeitar movimento reduzido.');

const liveRouteBlock = server.slice(server.indexOf("app.get('/api/games/live'"), server.indexOf('async function nbaLivePeriodSummary'));
assert.ok(liveRouteBlock.includes("combined.display_clock = game.display_clock ?? existing.display_clock ?? null") && liveRouteBlock.includes("combined.period = game.period ?? existing.period ?? null") && liveRouteBlock.includes("combined.period_label = game.period_label || existing.period_label || ''"), 'Snapshot NBA Live sem relógio ou período não deve apagar o relógio oficial válido da ESPN durante jogo em andamento.');
assert.ok(liveRouteBlock.includes("else {\n        // Um jogo encerrado nunca pode herdar o relógio antigo da ESPN.\n        combined.display_clock = null;"), 'Partida finalizada não pode herdar relógio de jogo em andamento.');

assert.ok(liveRouteBlock.includes('  try {') && liveRouteBlock.includes('Falha ao consolidar o placar ao vivo:'), 'Erros inesperados ao combinar ESPN e NBA Live devem retornar JSON 503 controlado, sem rejeição não tratada no Express.');

const asyncRouteMatches = [...server.matchAll(/app\.(?:get|post|put|patch|delete)\(['"][^'"]+['"],\s*async/g)];
assert.ok(asyncRouteMatches.length >= 19, 'Cobertura de rotas assíncronas do servidor incompleta.');
for (let index = 0; index < asyncRouteMatches.length; index++) {
  const start = asyncRouteMatches[index].index;
  const end = index + 1 < asyncRouteMatches.length ? asyncRouteMatches[index + 1].index : server.indexOf('const limiter', start);
  const routeBlock = server.slice(start, end < 0 ? server.length : end);
  assert.ok(/\btry\s*\{/.test(routeBlock) && /\bcatch\s*\(/.test(routeBlock), 'Rota assíncrona sem tratamento de erro: ' + asyncRouteMatches[index][0]);
}

assert.ok(app.includes("const audioContextRef=useRef(null),toastTimerRef=useRef(null)") && app.includes("if(toastTimerRef.current)window.clearTimeout(toastTimerRef.current)") && app.includes("window.clearTimeout(toastTimerRef.current);toastTimerRef.current=null;"), 'Notificações sucessivas devem reiniciar o mesmo timer e limpar o timeout ao desmontar o app.');


const asyncApiRoutes = [...server.matchAll(/app\.(?:get|post|put|patch|delete)\(['"][^'"]+['"],\s*async/g)];
assert.equal(asyncApiRoutes.length, 20, 'Quantidade de rotas assíncronas mudou; revise a cobertura de tratamento de erros.');
for (let index = 0; index < asyncApiRoutes.length; index++) {
  const start = asyncApiRoutes[index].index;
  const end = index + 1 < asyncApiRoutes.length ? asyncApiRoutes[index + 1].index : server.length;
  const routeBlock = server.slice(start, end);
  assert.match(routeBlock, /\btry\s*\{/, 'Rota assíncrona sem bloco try: ' + asyncApiRoutes[index][0]);
  assert.match(routeBlock, /\bcatch\s*\(/, 'Rota assíncrona sem tratamento catch: ' + asyncApiRoutes[index][0]);
}
assert.ok(styles.includes('.layout.light:before') && styles.includes('.layout.light:after') && styles.includes('.layout.light .feature-hub'), 'Tema claro precisa de tratamento próprio para fundo e painel principal.');
assert.ok(arena.includes('<svg') && styles.includes("url('/courtside-arena.svg')"), 'A arte original da arena deve existir e estar referenciada pelo tema.');

assert.ok(styles.includes('.layout{isolation:isolate}') && styles.includes('.layout:before{') && styles.includes("url('/courtside-arena.svg')"), 'Camadas ilustradas da arena devem permanecer visíveis dentro do contexto de empilhamento do aplicativo.');

assert.ok(app.includes("lang==='en'?'YOUR NBA HUB'") && app.includes("lang==='es'?'TU CENTRO NBA'") && app.includes("{featureKeys.length}"), 'Cabeçalho do centro NBA deve ser localizado e refletir a quantidade real de ferramentas.');
assert.ok(app.includes("lang==='en'?'options':lang==='es'?'opciones':'opções'"), 'Contagem de opções por categoria deve respeitar o idioma selecionado.');

assert.ok(app.includes("onClickCapture={e=>{const button=e.target?.closest?.('button');if(button&&soundEnabled)playUiSound(button.classList.contains('feature-tile')||button.closest('.nav-group')?'navigate':'tap');}}"), 'Efeitos sonoros opcionais devem cobrir botões e navegação em todas as páginas.');
assert.ok(app.includes("if(enabling)playUiSound('success',true)") && app.includes("const [soundEnabled,setSoundEnabled]=useState(false)"), 'Som deve continuar desligado por padrão e confirmar a ativação apenas após ação do usuário.');

assert.ok(styles.includes('button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible'), 'Campos de texto devem ter foco de teclado visível para acessibilidade.');

const favoriteHandler = app.slice(app.indexOf('const toggleFavorite=async(p)=>{'), app.indexOf('const signOut=async()=>'));
assert.ok(favoriteHandler.includes('try{') && favoriteHandler.includes('catch(error)') && favoriteHandler.includes('Não foi possível atualizar este favorito:'), 'Falhas de rede no salvamento ou remoção de favoritos devem ser tratadas e mostradas sem rejeições não tratadas.');
assert.ok(favoriteHandler.includes("favoriteMutationRef.current.has(mutationKey)") && favoriteHandler.includes("favoriteMutationRef.current.set(mutationKey,mutationToken)") && favoriteHandler.includes("favoriteMutationRef.current.get(mutationKey)===mutationToken") && favoriteHandler.includes("sessionEpoch!==favoriteSessionEpochRef.current") && favoriteHandler.includes("favoritesRequestRef.current+=1") && !favoriteHandler.includes("request=++favoritesRequestRef.current") && !favoriteHandler.includes("request!==favoritesRequestRef.current"), 'Favoritos de jogadores diferentes devem poder concluir sem perder atualizações; cliques duplicados, leituras antigas e respostas de sessões anteriores devem ser bloqueados.');

const signOutHandler = app.slice(app.indexOf('const signOut=async()=>{'), app.indexOf('const favIds='));
assert.ok(signOutHandler.includes('try{') && signOutHandler.includes('catch(error)') && signOutHandler.includes('Não foi possível encerrar a sessão:'), 'Falhas de rede ao sair da conta devem ser capturadas e informadas ao usuário.');

const favoritesLoader = app.slice(app.indexOf('const loadFavorites=useCallback'), app.indexOf('const loadCore=useCallback'));
assert.ok(favoritesLoader.includes('try{') && favoritesLoader.includes('catch(error)') && favoritesLoader.includes('request===favoritesRequestRef.current&&session?.user?.id===userId'), 'Falhas ao carregar favoritos devem ser capturadas e nunca sobrescrever o estado de outra sessão.');
assert.ok(app.includes('if(session){loadSettings();loadFavorites();loadCore();}'), 'O carregamento de favoritos deve delegar o tratamento de erros ao próprio carregador protegido por sessão.');

assert.ok(app.includes('const API_RESPONSE_CACHE_TTL_MS = 120000;') && app.includes('Date.now()-cached.at<API_RESPONSE_CACHE_TTL_MS'), 'Navegação entre páginas deve reaproveitar respostas recentes por dois minutos para reduzir consultas repetidas.');
assert.ok(app.includes("[502,503,504].includes(r.status)&&attempt<attempts-1"), 'A API deve repetir automaticamente erros transitórios 502/503/504 do gateway antes de mostrar falha ao usuário.');

assert.ok(app.includes("api('/api/games/live',{cache:false})") && app.includes("{cache:false})"), 'O cache de navegação não pode substituir consultas explicitamente atualizadas de dados ao vivo.');
assert.ok(app.includes('if(apiInflight.has(key))return apiInflight.get(key);'), 'Chamadas GET simultâneas para o mesmo recurso devem compartilhar a mesma requisição em andamento.');

const packageManifest = JSON.parse(read('package.json'));
assert.ok(app.includes("apiResponseCache.delete(key);apiResponseCache.set(key,cached)") && app.includes("while(apiResponseCache.size>120)apiResponseCache.delete(apiResponseCache.keys().next().value)"), 'Cache do frontend deve usar LRU limitado para reutilizar consultas frequentes sem crescer indefinidamente.');
assert.ok(server.includes("cache.delete(key);\n    cache.set(key, hit);") && server.includes("while (cache.size > 500) cache.delete(cache.keys().next().value)"), 'Cache do backend deve atualizar a ordem LRU e remover entradas antigas sem ordenar o mapa inteiro.');
assert.ok(packageManifest.dependencies?.compression && server.includes("import compression from 'compression';") && server.includes("app.use(compression({ threshold: 1024 }))"), 'Respostas maiores da API devem usar compressão HTTP.');
assert.ok(server.includes("max-age=31536000, immutable") && server.includes("res.setHeader('Cache-Control', 'no-cache')") && server.includes("index: false"), 'Assets versionados podem ser armazenados por longo prazo, mas o HTML deve sempre verificar a versão atual.');

const franchiseMetricsLoader = app.slice(app.indexOf('const loadTeamStats=async'), app.indexOf('const loadTeamRoster=async'));
assert.ok(franchiseMetricsLoader.includes("api('/api/team-stats')") && !franchiseMetricsLoader.includes('cache:false'), 'Páginas que compartilham estatísticas de franquias devem reutilizar o cache recente ao abrir; a atualização periódica ao vivo permanece separada.');
assert.ok(app.includes("api('/api/team-stats')"), 'A atualização periódica das estatísticas de franquias deve reutilizar o cache recente para evitar consultas externas desnecessárias.');
assert.ok(app.includes("Servidor do Courtside temporariamente indisponível (HTTP '") && app.includes('verifique os logs do serviço no Render'), 'Erros de gateway 502/503/504 devem orientar o usuário a verificar a inicialização e os logs do Render.');
assert.ok(app.includes('Instale como aplicativo') && app.includes('Android · Chrome') && app.includes('iPhone · Safari') && app.includes('Google Play Store'), 'Configurações devem orientar a instalação PWA em Android, iPhone e computador e explicar a etapa adicional da Play Store.');
assert.ok(app.includes('Consultando calendário oficial…') && app.includes('calendário oficial NBA CDN, com ESPN como alternativa'), 'Confrontos diretos devem informar corretamente a fonte prioritária oficial.');



assert.ok(app.includes("const finalGames=useMemo(()=>sortedGames.filter") && app.includes("const teamRowsAlpha=useMemo(()=>alphaTeams.map") && app.includes("[alphaTeams,finalGames,sortedGames]"), 'Cálculos compartilhados de campanha, forma, sequência e calendário dos times devem ser memorizados para evitar recomputação em cada renderização.');


assert.ok(app.includes("const alphaTeamStats=useMemo(()=>teamStats.slice().sort") && app.includes("const selectedTeamStats=useMemo(()=>teamStats.find") , 'Listagem e seleção de métricas das franquias devem evitar ordenações e buscas repetidas a cada renderização.');

assert.ok(server.includes('// ESPN event IDs are not NBA game IDs. Resolve the exact fixture by date') && server.includes('try{return await nbaLiveBoxscore(nbaId);}') && server.includes('try{return await nbaHistoricalBoxscore(nbaId);}') && server.includes('try{return await espnBoxscore(id);}'), 'Box score deve preferir estatísticas oficiais NBA completas e manter ESPN como fallback.');
assert.ok(server.includes('net_rating:number(adv.NET_RATING)??number(estimated.E_NET_RATING)??number(estimated.NET_RATING)??(number(adv.OFF_RATING)!=null&&number(adv.DEF_RATING)!=null?'), 'NET RTG deve priorizar o valor oficial NBA e aceitar a métrica estimada oficial como fallback, preservando valores negativos legítimos.');
assert.ok(server.includes('needsOfficialScores') && server.includes('officialGames.filter') && server.includes('const candidates=officialGames.filter') && server.includes('rawDates.flatMap(value=>[-1,0,1]') && server.includes('home.score=finiteNumberOrNull(match.homeTeamScore)'), 'Confrontos diretos devem completar placares finais ausentes com o calendário oficial NBA, cruzando franquias e tolerando diferenças de fuso de até um dia.');
assert.ok(server.includes("advancedFields=['GP','PACE','OFF_RATING','DEF_RATING','NET_RATING']") && server.includes("advanced.length!==30||advanced.some(row=>advancedFields.some(field=>finiteNumberOrNull(row[field])==null))"), 'Comparador deve acionar o fallback oficial também quando métricas avançadas estiverem incompletas.');
assert.ok(app.includes("const formatProfileHeight=") && app.includes("const formatProfileWeight=") && app.includes("value:formatProfileHeight(playerBio.height)") && app.includes("value:formatProfileWeight(playerBio.weight)"), 'Biografia deve normalizar altura imperial para metros e peso para libras e quilogramas também na interface.');
assert.ok(app.includes("'net_rating','pts','reb','ast','stl','blk'"), 'Comparador deve identificar vantagem também nas métricas de produção por jogo.');
assert.ok(app.includes('{teamLogoId(teamA)&&<img src={"https://cdn.nba.com/logos/nba/"+teamLogoId(teamA)+"/global/L/logo.svg"') && app.includes('{teamA} vs {teamB}{teamLogoId(teamB)&&<img src={"https://cdn.nba.com/logos/nba/"+teamLogoId(teamB)+"/global/L/logo.svg"'), 'Confrontos diretos devem identificar visualmente as duas franquias com escudos oficiais usando o resolvedor canônico de IDs NBA.');
assert.ok(server.includes("statusTranslations={'out':'Fora'") && server.includes("status:statusTranslations[statusKey]||rawStatus"), 'Status comuns de lesões e desfalques devem ser traduzidos para português preservando o texto original.');
assert.ok(app.includes('},120000);') && app.includes('const timer=window.setInterval(refreshLive,15000)'), 'Dados da página ativa devem atualizar automaticamente e o placar ao vivo deve consultar em intervalo curto.');
assert.ok(app.includes('const totals=complete?roster.reduce(') && app.includes('Pontos médios do elenco') && app.includes('Rebotes médios'), 'Fantasy deve calcular automaticamente os totais de pontos, rebotes, assistências e pontuação do elenco quando os dados estão completos.');
assert.ok(app.includes('className="boxscore-team"') && app.includes('mini-team-logo') && app.includes('a.espncdn.com/i/headshots/nba/players/full/'), 'Box score, análise de times e Fantasy devem mostrar escudos e usar fallback de fotos ESPN nos elencos.');
assert.ok(app.includes("src={p.headshot||('https://a.espncdn.com/i/headshots/nba/players/full/'+(p.espn_id||p.id)+'.png')}") && app.includes('teamLogoId(c.abbreviation)&&<img src={"https://cdn.nba.com/logos/nba/"+teamLogoId(c.abbreviation)+"/global/L/logo.svg"'), 'Rotação e estatísticas por quarto devem mostrar fotos dos atletas e escudos oficiais das franquias pelo resolvedor canônico.');
assert.ok(server.includes(".replace(/left ankle/gi,'tornozelo esquerdo')") && server.includes(".replace(/hamstring/gi,'posterior da coxa')"), 'Detalhes comuns dos relatórios de lesão devem ser traduzidos para português.');

assert.ok(app.includes('Como ler: NET RTG = OFF RTG') && app.includes('Prioriza Net Rating oficial')===false, 'Power Ranking deve explicar o significado das métricas e o critério de ordenação.');

assert.ok(server.includes("app.get('/api/fantasy/gamelogs'") && server.includes("nba('playergamelog'") && server.includes('fantasy_points:complete?Number((pts+1.2*reb+1.5*ast+3*stl+3*blk-turnover).toFixed(2)):null'), 'Fantasy deve consultar logs oficiais por atleta e calcular pontos em cada partida sem transformar dados ausentes em zero.');
assert.ok(app.includes("api('/api/fantasy/gamelogs?players='+encodeURIComponent(fantasyIds.join(','))") && app.includes('Resultados reais por partida · elenco selecionado') && app.includes('game.fantasy_points'), 'Fantasy deve atualizar automaticamente e exibir resultados reais por partida para os jogadores escolhidos.');

assert.ok(server.includes("cached('espn:standings',espnStandings,5*60*1000)") && server.includes("scheduleRows.length?'NBA CDN official schedule fallback'"), 'Playoffs devem receber classificação e aproveitamento via fallback ESPN quando NBA Stats falhar ou omitir campos.');
assert.ok(app.includes('sample=logs.map(game=>game[propMetric])') && app.includes('Acima da linha') && app.includes('Frequência histórica')===false && app.includes('resultados oficiais partida a partida'), 'Análise de props deve comparar a linha com resultados reais de jogos anteriores, sem chamar frequência histórica de probabilidade futura.');

assert.ok(app.includes('Líder da categoria') && app.includes('Média dos jogadores retornados') && app.includes('Atletas na amostra'), 'Laboratório estatístico deve mostrar líder, média e tamanho da amostra para o período selecionado.');
