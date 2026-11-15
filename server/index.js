import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 10000;
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const FAMILY_EMAILS = (process.env.FAMILY_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const CACHE_MS = Number(process.env.API_CACHE_MS) || 90000;
const cache = new Map();
const pending = new Map();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');
const NBA_STATS = 'https://stats.nba.com/stats';
const ESPN_TEAM_IDS = {ATL:1,BOS:2,NOP:3,CHI:4,CLE:5,DAL:6,DEN:7,DET:8,GSW:9,HOU:10,IND:11,LAC:12,LAL:13,MIA:14,MIL:15,MIN:16,BKN:17,NYK:18,ORL:19,PHI:20,PHX:21,POR:22,SAC:23,SAS:24,OKC:25,UTA:26,WAS:27,TOR:28,MEM:29,CHA:30};
const TEAM_META = {
  1610612737:['ATL','Atlanta Hawks','East','Southeast'],1610612738:['BOS','Boston Celtics','East','Atlantic'],
  1610612751:['BKN','Brooklyn Nets','East','Atlantic'],1610612766:['CHA','Charlotte Hornets','East','Southeast'],
  1610612741:['CHI','Chicago Bulls','East','Central'],1610612739:['CLE','Cleveland Cavaliers','East','Central'],
  1610612742:['DAL','Dallas Mavericks','West','Southwest'],1610612743:['DEN','Denver Nuggets','West','Northwest'],
  1610612765:['DET','Detroit Pistons','East','Central'],1610612744:['GSW','Golden State Warriors','West','Pacific'],
  1610612745:['HOU','Houston Rockets','West','Southwest'],1610612754:['IND','Indiana Pacers','East','Central'],
  1610612746:['LAC','LA Clippers','West','Pacific'],1610612747:['LAL','Los Angeles Lakers','West','Pacific'],
  1610612763:['MEM','Memphis Grizzlies','West','Southwest'],1610612748:['MIA','Miami Heat','East','Southeast'],
  1610612749:['MIL','Milwaukee Bucks','East','Central'],1610612750:['MIN','Minnesota Timberwolves','West','Northwest'],
  1610612740:['NOP','New Orleans Pelicans','West','Southwest'],1610612752:['NYK','New York Knicks','East','Atlantic'],
  1610612760:['OKC','Oklahoma City Thunder','West','Northwest'],1610612753:['ORL','Orlando Magic','East','Southeast'],
  1610612755:['PHI','Philadelphia 76ers','East','Atlantic'],1610612756:['PHX','Phoenix Suns','West','Pacific'],
  1610612757:['POR','Portland Trail Blazers','West','Northwest'],1610612758:['SAC','Sacramento Kings','West','Pacific'],
  1610612759:['SAS','San Antonio Spurs','West','Southwest'],1610612761:['TOR','Toronto Raptors','East','Atlantic'],
  1610612762:['UTA','Utah Jazz','West','Northwest'],1610612764:['WAS','Washington Wizards','East','Southeast']
};

const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
};

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
// A API usa Bearer token (não cookies); refletir a origem permite o frontend no domínio principal e domínios de preview sem bloquear preflight. A autorização continua aplicada por requireFamily.\napp.use(cors({ origin: true, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Authorization','Content-Type'] }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

function cached(key, fn, ttl = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  if (pending.has(key)) return pending.get(key);
  const request = Promise.resolve().then(fn).then(value => {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a,b) => a[1].at - b[1].at).slice(0,100);
      oldest.forEach(([k]) => cache.delete(k));
    }
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
function canonicalTeamAbbr(value) { const code=String(value||'').toUpperCase(); return ({NY:'NYK',NO:'NOP',GS:'GSW',SA:'SAS',PHO:'PHX',WSH:'WAS'})[code]||code; }
function dedupeGamePlayers(rows) {
  const byId = new Map(), conflicts = new Set();
  for (const row of rows) {
    const id = String(row?.id ?? '');
    if (!id || conflicts.has(id)) continue;
    const team = String(row?.team?.id || row?.team?.abbreviation || '');
    const previous = byId.get(id);
    if (!previous) byId.set(id, { team, row });
    else if (previous.team !== team) { byId.delete(id); conflicts.add(id); }
  }
  return [...byId.values()].map(entry => entry.row);
}
function finiteNumberOrNull(value) { return value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value); }
function scoreboardScore(value, statusState) {
  if (statusState === 'scheduled' || value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score >= 0 ? score : null;
}
function validPeriod(value) {
  const period = Number(value);
  return Number.isSafeInteger(period) && period > 0 ? period : null;
}
function periodLabel(value) {
  const period = validPeriod(value);
  return period == null ? null : period <= 4 ? 'Q' + period : 'OT' + (period - 4);
}
function validGameClock(value, period) {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const maxMinutes = Number(period) > 4 ? 5 : 12;
  let minutes, seconds;
  const clock = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) { minutes = Number(clock[1]); seconds = Number(clock[2]); }
  else {
    const duration = raw.match(/^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
    if (!duration || (!duration[1] && !duration[2])) return null;
    const total = Number(duration[1] || 0) * 60 + Number(duration[2] || 0);
    if (!Number.isFinite(total) || total < 0 || total > maxMinutes * 60) return null;
    minutes = Math.floor(total / 60); seconds = Math.floor(total % 60);
  }
  return minutes < maxMinutes || (minutes === maxMinutes && seconds === 0) ? minutes + ':' + String(seconds).padStart(2, '0') : null;
}
function shootingPct(made, attempted) { const m=finiteNumberOrNull(made), a=finiteNumberOrNull(attempted); return m != null && a != null && Number.isInteger(m) && Number.isInteger(a) && m >= 0 && a > 0 && m <= a ? m / a : null; }
function seasonFor(date = new Date()) {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 9 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}
function playerDashFilters() {
  return {
    College: '', Conference: '', Country: '', DateFrom: '', DateTo: '', Division: '',
    DraftPick: '', DraftYear: '', GameScope: '', GameSegment: '', Height: '',
    Location: '', OpponentTeamID: 0, Outcome: '', PORound: 0, SeasonSegment: '',
    ShotClockRange: '', TeamID: 0, VsConference: '', VsDivision: '', Weight: ''
  };
}
async function nba(endpoint, params = {}) {
  const url = new URL(`${NBA_STATS}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: NBA_HEADERS, signal: AbortSignal.timeout(9000) });
  if (!response.ok) {
    const error = new Error(`NBA Stats indisponível (HTTP ${response.status}). Tente novamente em alguns instantes.`);
    error.status = response.status === 429 || response.status >= 500 ? 503 : response.status;
    throw error;
  }
  const body = await response.json();
  const sets = body.resultSets || (body.resultSet ? [body.resultSet] : []);
  return sets.map(set => {
    const headers = set.headers || [];
    return (set.rowSet || []).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  });
}
async function nbaLiveBoxscore(gameId) {
  const response = await fetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`, {
    headers: { ...NBA_HEADERS, 'Referer': 'https://www.nba.com/' }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Box score ainda não disponível (HTTP ${response.status}).`);
  const body = await response.json();
  const game = body?.game;
  if (!game) throw new Error('A NBA ainda não publicou o box score desta partida.');
  const teams = [game.homeTeam, game.awayTeam];
  const rows = teams.filter(team => team && Number.isSafeInteger(Number(team.teamId)) && Number(team.teamId) > 0 && /^[A-Z]{3}$/.test(String(team.teamTricode || ''))).flatMap(team => (Array.isArray(team.players) ? team.players : []).filter(p => p && Number.isSafeInteger(Number(p.personId)) && Number(p.personId) > 0 && String(p.name || '').trim() && (p.teamId == null || Number(p.teamId) === Number(team.teamId))).map(p => {
    const stats = p.statistics || {};
    const min = stats.minutes ?? null;
    const played = p.played === true || minutesAsNumber(min) > 0;
    if (!played) return null;
    const fgMade = stats.fieldGoalsMade, fgAtt = stats.fieldGoalsAttempted;
    const threeMade = stats.threePointersMade, threeAtt = stats.threePointersAttempted;
    const row = {
      id: p.personId, player: { id: p.personId, first_name: p.name?.split(' ').slice(0,-1).join(' ') || p.name, last_name: p.name?.split(' ').slice(-1)[0] || '', position: p.position },
      team: { id: team.teamId, abbreviation: team.teamTricode, full_name: team.teamName },
      min, pts: stats.points ?? null, reb: stats.reboundsTotal ?? null,
      ast: stats.assists ?? null, stl: stats.steals ?? null, blk: stats.blocks ?? null,
      fgm: fgMade ?? null, fga: fgAtt ?? null, ftm: stats.freeThrowsMade ?? null, fta: stats.freeThrowsAttempted ?? null,
      oreb: stats.reboundsOffensive ?? null, dreb: stats.reboundsDefensive ?? null, pf: stats.foulsPersonal ?? null,
      fg_pct: shootingPct(fgMade, fgAtt), fg3_pct: shootingPct(threeMade, threeAtt),
      turnover: stats.turnovers ?? null
    };
    row.game_score = gameScore(row);
    return row;
  })).filter(Boolean);
  const uniqueRows = dedupeGamePlayers(rows);
  if (!uniqueRows.length) throw new Error('A fonte não retornou atletas válidos com minutos jogados. O box score pode ainda não estar disponível.');
  return uniqueRows;
}
async function nbaHistoricalBoxscore(gameId) {
  const seasonCode = Number(String(gameId).slice(3, 5));
  const season = Number.isFinite(seasonCode) && seasonCode > 0
    ? `${2000 + seasonCode}-${String(2001 + seasonCode).slice(-2)}`
    : seasonFor();
  const gameType = String(gameId).slice(0, 3);
  const seasonType = gameType === '004' ? 'Playoffs' : gameType === '001' ? 'Pre Season' : gameType === '003' ? 'All Star' : 'Regular Season';
  const sets = await nba('boxscoretraditionalv2', {
    GameID: gameId, LeagueID: '00', Season: season, SeasonType: seasonType,
    StartPeriod: 0, EndPeriod: 10, StartRange: 0, EndRange: 0, RangeType: 0
  });
  const rows = sets[0] || [];
  if (!rows.length) throw new Error('A NBA não retornou estatísticas para esta partida.');
  const played = rows.filter(p => minutesAsNumber(p.MIN) > 0);
  const data = played.map(p => {
    const row = {
      id: p.PLAYER_ID,
      player: { id: p.PLAYER_ID, first_name: String(p.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(p.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { id: p.TEAM_ID, abbreviation: p.TEAM_ABBREVIATION, full_name: p.TEAM_NAME },
      min: p.MIN, pts: p.PTS ?? null, reb: p.REB ?? null, ast: p.AST ?? null, stl: p.STL ?? null, blk: p.BLK ?? null,
      fgm:p.FGM??null,fga:p.FGA??null,ftm:p.FTM??null,fta:p.FTA??null,oreb:p.OREB??null,dreb:p.DREB??null,pf:p.PF??null,
      fg_pct: shootingPct(p.FGM, p.FGA), fg3_pct: shootingPct(p.FG3M, p.FG3A), turnover: p.TOV ?? null
    };
    row.game_score = gameScore(row);
    return row;
  });
  const uniqueData = dedupeGamePlayers(data.filter(row => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 && String(row.player?.first_name || row.player?.last_name || '').trim()));
  if (!uniqueData.length) throw new Error('A NBA não retornou atletas válidos com minutos jogados para esta partida.');
  return uniqueData;
}
async function nbaGameIdFromEspn(eventId) {
  const body=await espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(eventId));
  const competition=body.header?.competitions?.[0];
  const competitors=competition?.competitors||[];
  const home=canonicalTeamAbbr(competitors.find(side=>side.homeAway==='home')?.team?.abbreviation);
  const away=canonicalTeamAbbr(competitors.find(side=>side.homeAway==='away')?.team?.abbreviation);
  const eventDate=saoPauloDate(body.header?.competitions?.[0]?.date||body.header?.season?.startDate||new Date().toISOString());
  if(!home||!away)throw new Error('Não foi possível identificar as equipes da partida.');
  const data=await cached('nba:season-schedule',async()=>{
    const schedule=await fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json',{headers:NBA_HEADERS,signal:AbortSignal.timeout(9000)});
    if(!schedule.ok)throw new Error('Calendário NBA CDN indisponível.');
    return schedule.json();
  },30*60*1000);
  const match=(data.leagueSchedule?.gameDates||[]).flatMap(day=>day.games||[]).find(game=>{
    const date=game.gameDateTimeUTC?saoPauloDate(game.gameDateTimeUTC):String(game.gameDateEst||game.gameDateTimeEst||game.gameDate||'').slice(0,10);
    const h=game.homeTeam?.teamTricode,a=game.awayTeam?.teamTricode;
    return date===eventDate&&h===home&&a===away;
  });
  if(!match?.gameId)throw new Error('ID NBA equivalente não encontrado no calendário.');
  return String(match.gameId);
}
async function getGameBoxscore(gameId) {
  const id=String(gameId);
  if (/^\d{10}$/.test(id)) {
    try { return await nbaLiveBoxscore(id); }
    catch (liveError) {
      try { return await nbaHistoricalBoxscore(id); }
      catch (statsError) {
        try { return await espnBoxscore(id); }
        catch (espnError) { throw new Error(`Box score indisponível. Live: ${liveError.message} Stats: ${statsError.message} ESPN: ${espnError.message}`); }
      }
    }
  }
  try { return await espnBoxscore(id); }
  catch (espnError) {
    try {
      const nbaId=await nbaGameIdFromEspn(id);
      try{return await nbaLiveBoxscore(nbaId);}
      catch(liveError){return await nbaHistoricalBoxscore(nbaId);}
    } catch(fallbackError) {
      throw new Error(`Box score indisponível. ESPN: ${espnError.message} NBA CDN: ${fallbackError.message}`);
    }
  }
}

async function espnJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': NBA_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`ESPN indisponível (HTTP ${response.status}).`);
  return response.json();
}
async function nbaCdnGames(start, end) {
  const schedulePromise = cached('nba:season-schedule', async () => {
    const response = await fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', {
      headers: NBA_HEADERS, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('NBA CDN schedule HTTP ' + response.status);
    return response.json();
  }, 30 * 60 * 1000);
  const today = saoPauloDate(new Date().toISOString());
  const [schedule, live] = await Promise.all([
    schedulePromise,
    start <= today && end >= today
      ? fetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', {
          headers: NBA_HEADERS, signal: AbortSignal.timeout(15000)
        }).then(async r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null)
  ]);
  const dates = schedule?.leagueSchedule?.gameDates || [];
  const games = dates.flatMap(d => d.games || []).map(g => {
    const datetime = g.gameDateTimeUTC || g.gameDateTimeEst || g.gameDateEst || g.gameDate || '';
    const localDate = g.gameDateTimeUTC ? saoPauloDate(g.gameDateTimeUTC) : String(g.gameDateEst || g.gameDate || datetime).slice(0, 10);
    return { game: g, datetime, localDate };
  }).filter(item => item.localDate >= start && item.localDate <= end).map(({ game: g, datetime, localDate }) => {
    const home = g.homeTeam || {}, away = g.awayTeam || {};
    const statusCode = Number(g.gameStatus);
    const rawStatus = String(g.gameStatusText || '').toLowerCase();
    const status = statusCode === 3 ? 'Final' : statusCode === 2 ? 'Em andamento' : rawStatus.includes('postpon') || rawStatus === 'ppd' ? 'Adiado' : rawStatus.includes('cancel') ? 'Cancelado' : 'Agendado';
    return {
      id: String(g.gameId), date: localDate, datetime: datetime || localDate,
      status, status_state: statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled',
      period: validPeriod(g.period), period_label: periodLabel(g.period),
      display_clock: validGameClock(g.gameClock, g.period),
      home_team: { id: home.teamId, abbreviation: home.teamTricode || '', full_name: [home.teamCity, home.teamName].filter(Boolean).join(' ') },
      visitor_team: { id: away.teamId, abbreviation: away.teamTricode || '', full_name: [away.teamCity, away.teamName].filter(Boolean).join(' ') },
      home_team_score: scoreboardScore(g.homeTeamScore, statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled'),
      visitor_team_score: scoreboardScore(g.awayTeamScore, statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled')
    };
  });
  const liveGames = live?.scoreboard?.games || [];
  for (const g of liveGames) {
    const datetime = g.gameTimeUTC || '';
    const localDate = saoPauloDate(datetime) || today;
    if (localDate < start || localDate > end) continue;
    const idx = games.findIndex(x => x.id === String(g.gameId));
    const home = g.homeTeam || {}, away = g.awayTeam || {};
    const statusCode = Number(g.gameStatus);
    const mapped = {
      id: String(g.gameId), date: localDate, datetime: datetime || localDate,
      status: g.gameStatusText || (statusCode === 3 ? 'Final' : statusCode === 2 ? 'Em andamento' : 'Agendado'),
      status_state: statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled',
      period: validPeriod(g.period), period_label: periodLabel(g.period),
      display_clock: validGameClock(g.gameClock, g.period),
      home_team: { id: home.teamId, abbreviation: home.teamTricode || '', full_name: home.teamName || home.teamCity || '' },
      visitor_team: { id: away.teamId, abbreviation: away.teamTricode || '', full_name: away.teamName || away.teamCity || '' },
      home_team_score: scoreboardScore(home.score, statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled'),
      visitor_team_score: scoreboardScore(away.score, statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled')
    };
    if (idx >= 0) games[idx] = mapped; else games.push(mapped);
  }
  return games.sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
}
function shiftIsoDate(value, days) {
  const date = new Date(String(value) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function saoPauloDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}
async function espnGames(start, end) {
  // O ESPN Site API deixou de aceitar intervalos dates=INICIO-FIM em 2026.
  // Consulta cada dia e combina os eventos por ID para não perder jogos futuros.
  const queryStart = shiftIsoDate(start, -1);
  const queryEnd = shiftIsoDate(end, 1);
  const dates = [];
  for (let day = queryStart; day <= queryEnd; day = shiftIsoDate(day, 1)) dates.push(day);
  const events = new Map();
  const failures = [];
  const results = new Array(dates.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, dates.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= dates.length) return;
      const day = dates[index];
      const ymd = day.replaceAll('-', '');
      try {
        const value = await cached('espn-scoreboard-day:' + ymd, async () => {
          const body = await espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=' + ymd + '&limit=1000');
          return body.events || [];
        }, 90 * 1000);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  results.forEach((result, index) => {
    if (result?.status === 'rejected') failures.push(dates[index] + ': ' + (result.reason?.message || 'falha ESPN'));
    else if (result?.status === 'fulfilled') result.value.forEach(event => { if (event?.id) events.set(String(event.id), event); });
  });
  if (failures.length) throw new Error('Calendário ESPN incompleto (' + failures.length + ' dia(s) sem resposta). ' + failures.slice(0, 3).join('; '));
  if (!events.size) throw new Error('ESPN não retornou partidas. Confira a temporada e o calendário.');
  return [...events.values()].flatMap(event => {
    const competition = event.competitions?.[0];
    if (!competition) return [];
    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away || !home.team?.abbreviation || !away.team?.abbreviation) return [];
    const datetime = event.date || competition.date || '';
    const localDate = saoPauloDate(datetime);
    if (!localDate || localDate < start || localDate > end) return [];
    const statusInfo = competition.status || event.status || {};
    const statusType = statusInfo.type || {};
    const state = statusType.state || 'pre';
    const status = statusType.shortDetail || statusType.description || 'Agendado';
    const period = validPeriod(statusInfo.period);
    return [{ id: String(event.id), date: localDate, datetime, status, status_state: state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled',
      period, period_label: periodLabel(period),
      display_clock: validGameClock(statusInfo.displayClock, period),
      home_team: { id: Number(home.team?.id), abbreviation: canonicalTeamAbbr(home.team?.abbreviation || ''), full_name: home.team?.displayName || home.team?.name || '' },
      visitor_team: { id: Number(away.team?.id), abbreviation: canonicalTeamAbbr(away.team?.abbreviation || ''), full_name: away.team?.displayName || away.team?.name || '' },
      home_team_score: scoreboardScore(home.score, state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled'),
      visitor_team_score: scoreboardScore(away.score, state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled') }];
  }).sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
}
function minutesAsNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const formatted = formatMinutes(value);
  const clock = String(formatted || '').match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const numeric = Number(formatted);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}
function gameScore(stats) {
  const keys = ['pts','fgm','fga','ftm','fta','oreb','dreb','stl','ast','blk','pf','turnover'];
  if (keys.some(key => stats[key] == null || !Number.isSafeInteger(Number(stats[key])) || Number(stats[key]) < 0)) return null;
  const s = Object.fromEntries(keys.map(key => [key, Number(stats[key])]));
  if (s.fgm > s.fga || s.ftm > s.fta) return null;
  return Number((s.pts + .4*s.fgm - .7*s.fga - .4*(s.fta-s.ftm) + .7*s.oreb + .3*s.dreb + s.stl + .7*s.ast + .7*s.blk - .4*s.pf - s.turnover).toFixed(2));
}
function formatMinutes(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '0:00';
  if (raw.startsWith('PT')) {
    const match = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
    if (match) {
      const seconds = Math.round((Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
  }
  return raw;
}
function madeAttempt(value) {
  const match = String(value || '').match(/(\d+)\s*[-/]\s*(\d+)/);
  if (!match) return { made: null, attempted: null };
  const made = Number(match[1]), attempted = Number(match[2]);
  return made <= attempted ? { made, attempted } : { made: null, attempted: null };
}
function validatedAttemptPair(made, attempted) {
  const madeValue = finiteNumberOrNull(made), attemptedValue = finiteNumberOrNull(attempted);
  if ((madeValue != null && (!Number.isInteger(madeValue) || madeValue < 0)) || (attemptedValue != null && (!Number.isInteger(attemptedValue) || attemptedValue < 0)) || (madeValue != null && attemptedValue != null && madeValue > attemptedValue)) return { made: null, attempted: null };
  return { made: madeValue, attempted: attemptedValue };
}
async function espnBoxscore(gameId) {
  const body = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`);
  const groups = body.boxscore?.players || [];
  const expectedTeamIds = new Set((body.header?.competitions?.[0]?.competitors || []).map(side => Number(side.team?.id)).filter(id => Number.isSafeInteger(id) && id > 0));
  const rows = groups.filter(group => group && expectedTeamIds.size === 2 && expectedTeamIds.has(Number(group.team?.id)) && Number.isSafeInteger(Number(group.team?.id)) && Number(group.team.id) > 0 && /^[A-Z]{3}$/.test(canonicalTeamAbbr(group.team?.abbreviation || ''))).flatMap(group => {
    const statBlock = (group.statistics || []).find(x => x.athletes) || group.statistics?.[0] || {};
    const rawKeys = (statBlock.keys?.length?statBlock.keys:null) || (statBlock.names?.length?statBlock.names:null) || (statBlock.labels?.length?statBlock.labels:null) || statBlock.displayNames || [];
    const keys = rawKeys.map(key => typeof key === 'string' ? key.toUpperCase() : String(key?.abbreviation||key?.name||key?.displayName||'').toUpperCase());
    return (statBlock.athletes || []).map(entry => {
      const rawStats = entry.stats ?? entry.statistics ?? [];
      let values = Array.isArray(rawStats)
        ? (rawStats.length && typeof rawStats[0] === 'object'
          ? Object.fromEntries(rawStats.map(item=>[String(item.abbreviation||item.name||item.displayName||'').toUpperCase(),item.displayValue??item.value??item.display??null]))
          : Object.fromEntries(keys.map((key,i) => [key, rawStats[i] ?? null])))
        : rawStats && typeof rawStats === 'object' ? Object.fromEntries(Object.entries(rawStats).map(([key,value])=>[key.toUpperCase(),value])) : {};
      const pick = (...names) => {
        for (const name of names) {
          const found = Object.keys(values).find(key=>key.replace(/[^A-Z0-9]/g,'')===name.replace(/[^A-Z0-9]/g,'').toUpperCase());
          if(found && values[found]!=null && values[found]!=='')return values[found];
        }
        return null;
      };
      const fgParsed = madeAttempt(pick('FG','FIELD GOALS','FGM-A','FGM/A')), threeParsed = madeAttempt(pick('3PT','3P','THREE POINTERS','3PM-A','3PM/A'));
      const fg = validatedAttemptPair(fgParsed.made ?? pick('FGM'), fgParsed.attempted ?? pick('FGA'));
      const three = validatedAttemptPair(threeParsed.made ?? pick('3PM','3PTM'), threeParsed.attempted ?? pick('3PA','3PTA'));
      const athlete = entry.athlete || {};
      const fullName = athlete.displayName || athlete.fullName || athlete.shortName || '';
      const parts = fullName.split(' ');
      const athleteId = Number(athlete.id);
      const min = formatMinutes(pick('MIN','MINUTES'));
      if (!Number.isSafeInteger(athleteId) || athleteId <= 0 || !fullName.trim() || minutesAsNumber(min) <= 0) return null;
      const numberOrNull = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
      const ftParsed = madeAttempt(pick('FT','FREE THROWS','FTM-A','FTM/A'));
      const ft = validatedAttemptPair(ftParsed.made ?? pick('FTM'), ftParsed.attempted ?? pick('FTA'));
      const row = {
        id: athleteId, player: { id: athleteId, first_name: parts.slice(0,-1).join(' '), last_name: parts.slice(-1)[0] || '', headshot: athlete.headshot?.href||athlete.headshot||null },
        team: { id: Number(group.team?.id), abbreviation: canonicalTeamAbbr(group.team?.abbreviation || ''), full_name: group.team?.displayName || group.team?.name || '' },
        min, pts: numberOrNull(pick('PTS','POINTS')), reb: numberOrNull(pick('REB','REBOUNDS')), ast: numberOrNull(pick('AST','ASSISTS')),
        stl: numberOrNull(pick('STL','STEALS')), blk: numberOrNull(pick('BLK','BLOCKS')), fgm:fg.made, fga:fg.attempted, ftm:ft.made, fta:ft.attempted,
        oreb:numberOrNull(pick('OREB','OFFENSIVE REBOUNDS')), dreb:numberOrNull(pick('DREB','DEFENSIVE REBOUNDS')), pf:numberOrNull(pick('PF','FOULS')),
        fg_pct: shootingPct(fg.made, fg.attempted),
        fg3_pct: shootingPct(three.made, three.attempted),
        turnover: numberOrNull(pick('TO','TOV','TURNOVERS'))
      };
      row.game_score = gameScore(row);
      return row;
    });
  }).filter(Boolean);
  const uniqueRows = dedupeGamePlayers(rows.filter(row => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 && String(row.player?.first_name || row.player?.last_name || '').trim()));
  if (!uniqueRows.length) throw new Error('ESPN não retornou atletas válidos com minutos jogados para esta partida.');
  return uniqueRows;
}

async function espnTeamRoster(abbreviation) {
  const meta = Object.values(TEAM_META).find(item => item[0] === abbreviation);
  const teamId = ESPN_TEAM_IDS[abbreviation];
  if (!meta || !teamId) throw new Error('Franquia NBA não encontrada: ' + abbreviation);
  return cached('espn:roster:' + abbreviation, async () => {
    const body = await espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/' + teamId + '/roster');
    const groups = body.athletes || [];
    const athletes = groups.flatMap(group => Array.isArray(group.items) ? group.items : [group]);
    const roster = athletes.filter(p => p && (p.id || p.uid)).map(p => {
      const fullName = String(p.fullName || p.displayName || '').trim();
      const parts = fullName.split(/\\s+/).filter(Boolean);
      const id = Number(p.id || String(p.uid).split(':').pop());
      return {
        id,
        first_name: String(p.firstName || (parts.length > 1 ? parts.slice(0,-1).join(' ') : fullName)).trim(),
        last_name: String(p.lastName || (parts.length > 1 ? parts[parts.length-1] : '')).trim(),
        position: p.position?.abbreviation || p.position?.name || '',
        team: { abbreviation, full_name: meta[1] || abbreviation },
        is_active: true, headshot: p.headshot?.href || p.headshot || null,
        espn_id:id,
        height:p.displayHeight||p.height||null,weight:p.displayWeight||p.weight||null,
        birth_date:p.dateOfBirth||null,age:p.age??null,birth_place:p.birthPlace||null,
        college:p.college?.name||p.college||null,experience:p.experience?.displayValue||p.experience?.years||null,
        jersey:p.jersey||null,family:p.relatives||p.family||null
      };
    }).filter(player => Number.isSafeInteger(player.id) && player.id > 0 && Boolean(player.first_name || player.last_name));
    const uniqueRoster = [...new Map(roster.map(player => [player.id, player])).values()];
    if (!uniqueRoster.length) throw new Error('ESPN retornou elenco vazio ou sem IDs válidos para ' + abbreviation);
    return uniqueRoster;
  }, 30 * 60 * 1000);
}
async function espnPlayers() {
  const teams = Object.values(TEAM_META).map(meta => meta[0]);
  const results = new Array(teams.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, teams.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= teams.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await espnTeamRoster(teams[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  const failedTeams = results.filter(result => result.status === 'rejected').length;
  if (failedTeams) throw new Error('ESPN retornou elencos incompletos (' + failedTeams + ' franquias sem resposta).');
  const unique = new Map(), conflicts = new Set();
  results.forEach(result => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach(player => {
      const id = String(player.id || '');
      if (!id || conflicts.has(id)) return;
      const previous = unique.get(id);
      if (!previous) unique.set(id, player);
      else if (canonicalTeamAbbr(previous.team?.abbreviation || '') !== canonicalTeamAbbr(player.team?.abbreviation || '')) {
        unique.delete(id);
        conflicts.add(id);
      }
    });
  });
  if (!unique.size) throw new Error('ESPN não retornou elencos consistentes; a fonte externa está indisponível.');
  return [...unique.values()].sort((a,b) => a.last_name.localeCompare(b.last_name));
}

async function espnStandings() {
  const body = await espnJson('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
  const groups = body.children || body.standings?.children || [];
  const entries = groups.flatMap(group => (group.standings?.entries || []).map(entry => {
    const team = entry.team || {};
    const stats = Object.fromEntries((entry.stats || []).map(x => [x.name, x.value]));
    const meta = Object.values(TEAM_META).find(x => x[0] === team.abbreviation);
    const rawWinPct = stats.winPercent ?? stats.win_pct ?? null;
    const winPct = rawWinPct == null || rawWinPct === '' ? null : Number(rawWinPct);
    return {
      team: { id: Number(team.id), full_name: team.displayName || team.name || '', name: team.displayName || team.name || '',
        abbreviation: canonicalTeamAbbr(team.abbreviation || ''), conference: group.name || group.abbreviation || meta?.[2] || '' },
      wins: stats.wins ?? null, losses: stats.losses ?? null,
      win_pct: Number.isFinite(winPct) && winPct >= 0 && winPct <= 1 ? winPct : null
    };
  }));
  return entries.sort((a,b) => {
    if (a.win_pct == null && b.win_pct != null) return 1;
    if (b.win_pct == null && a.win_pct != null) return -1;
    const percentageOrder = (Number(b.win_pct) || 0) - (Number(a.win_pct) || 0);
    return percentageOrder || a.team.full_name.localeCompare(b.team.full_name, 'en');
  });
}

async function requireFamily(req, res, next) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ error: 'Configure SUPABASE_URL e SUPABASE_ANON_KEY no Render.' });
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
    const user = await response.json();
    const email = (user.email || '').toLowerCase();
    if (!FAMILY_EMAILS.length) return res.status(503).json({ error: 'Configure FAMILY_EMAILS no Render com os e-mails da família antes de liberar o acesso.' });
    if (!FAMILY_EMAILS.includes(email)) return res.status(403).json({ error: 'Este e-mail não está autorizado para o Courtside Family.' });
    req.user = { id: user.id, email };
    next();
  } catch { res.status(401).json({ error: 'Não foi possível validar sua sessão.' }); }
}
app.get('/api/health', (_req, res) => res.json({ ok: true, dataSource: 'ESPN + NBA Stats + NBA Live CDN', supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY), familyAllowlistEnabled: FAMILY_EMAILS.length > 0 }));
app.use('/api', requireFamily);

app.get('/api/teams/:abbr/roster', async (req,res)=>{
  try{
    const abbreviation=String(req.params.abbr||'').toUpperCase();
    const meta=Object.values(TEAM_META).find(item=>item[0]===abbreviation);
    if(!meta)return res.status(404).json({error:'Franquia NBA não encontrada.'});
    const data=await espnTeamRoster(abbreviation);
    res.json({data,team:{abbreviation,name:meta[1],conference:meta[2],division:meta[3]},source:'ESPN team roster',updatedAt:new Date().toISOString()});
  }catch(e){res.status(503).json({error:'Elenco indisponível: '+e.message});}
});
app.get('/api/players/:id/bio',async(req,res)=>{
  try{
    const id=String(req.params.id);
    if(!/^\d{1,12}$/.test(id))return res.status(400).json({error:'ID de jogador inválido.'});
    const requestedName=String(req.query.name||'').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const requestedTeam=canonicalTeamAbbr(String(req.query.team||'').trim());
    let roster=[];
    if(requestedTeam&&Object.values(TEAM_META).some(meta=>meta[0]===requestedTeam)){
      try{roster=await espnTeamRoster(requestedTeam);}catch(teamError){console.warn('ESPN roster lookup failed for '+requestedTeam+': '+teamError.message);}
    }
    if(!roster.length)roster=await cached('espn:active-players',espnPlayers,30*60*1000);
    const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    let player=roster.find(item=>String(item.espn_id||item.id)===id);
    if(!player&&requestedName)player=roster.find(item=>normalizeName(item.first_name+' '+item.last_name)===requestedName);
    if(!player)return res.status(404).json({error:'Biografia não encontrada no elenco consultado.'});
    let detail={},overview={},statsPayload={};
    const [detailResult,overviewResult,statsResult]=await Promise.allSettled([
      cached('espn-athlete:'+player.espn_id,()=>espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/'+player.espn_id),24*60*60*1000),
      cached('espn-athlete-overview:'+player.espn_id,()=>espnJson('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/'+player.espn_id+'/overview'),10*60*1000),
      cached('espn-athlete-stats:'+player.espn_id,()=>espnJson('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/'+player.espn_id+'/stats'),10*60*1000)
    ]);
    if(detailResult.status==='fulfilled')detail=detailResult.value;
    if(overviewResult.status==='fulfilled')overview=overviewResult.value;
    if(statsResult.status==='fulfilled')statsPayload=statsResult.value;
    const athlete=detail.athlete||detail;
    const statsBlock=overview.statistics||overview.stats?.statistics||{};
    const statLabels=statsBlock.labels||statsBlock.displayNames||[];
    const statNames=statsBlock.names||[];
    const statValues=statsBlock.values||statsBlock.displayValues||[];
    const numberOrNull=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
    const overviewStat=(...keys)=>{
      const index=statLabels.findIndex((label,i)=>keys.includes(String(label).toUpperCase())||keys.includes(String(statNames[i]||'')));
      return index<0?null:numberOrNull(statValues[index]);
    };
    const detailedStats={};
    const rawCategories=statsPayload.categories||statsPayload.statCategories||[];
    const statCategories=Array.isArray(rawCategories)?rawCategories:Object.values(rawCategories);
    for(const category of statCategories){
      const labels=Array.isArray(category.labels)?category.labels:[];
      const values=Array.isArray(category.totals)?category.totals:Array.isArray(category.values)?category.values:[];
      labels.forEach((label,index)=>{
        const key=String(label||'').toUpperCase().replace(/[^A-Z0-9%/]/g,'');
        const value=numberOrNull(values[index]);
        if(key&&value!=null&&detailedStats[key]==null)detailedStats[key]=value;
      });
    }
    const stat=(...keys)=>{
      for(const key of keys){
        const normalized=String(key).toUpperCase().replace(/[^A-Z0-9%/]/g,'');
        if(detailedStats[normalized]!=null)return detailedStats[normalized];
      }
      return overviewStat(...keys);
    };
    const playerStats={
      gamesPlayed:stat('GP','gamesPlayed'),min:stat('MIN','minutes','avgMinutes'),
      pts:stat('PTS','avgPoints'),reb:stat('REB','avgRebounds'),ast:stat('AST','avgAssists'),
      stl:stat('STL','avgSteals'),blk:stat('BLK','avgBlocks'),turnover:stat('TO','TOV','avgTurnovers'),
      fg_pct:stat('FG%','fieldGoalPct'),fg3_pct:stat('3P%','threePointFieldGoalPct'),
      ft_pct:stat('FT%','freeThrowPct'),fgm:stat('FGM'),fga:stat('FGA'),fg3m:stat('3PM','3PTM'),
      fg3a:stat('3PA','3PTA'),ftm:stat('FTM'),fta:stat('FTA'),oreb:stat('OREB'),dreb:stat('DREB'),pf:stat('PF'),
      pie:stat('PIE'),ts_pct:stat('TS%'),usg_pct:stat('USG%'),off_rating:stat('OFF RTG','ORTG'),
      def_rating:stat('DEF RTG','DRTG'),net_rating:stat('NET RTG','NETRTG'),ast_pct:stat('AST%'),
      tov_pct:stat('TOV%'),efg_pct:stat('EFG%'),ast_to:stat('AST/TO'),ast_ratio:stat('AST RATIO'),pace:stat('PACE')
    };
    const data={
      id:player.espn_id,name:athlete.displayName||athlete.fullName||[player.first_name,player.last_name].join(' '),
      height:athlete.displayHeight||player.height||null,weight:athlete.displayWeight||player.weight||null,
      birth_date:athlete.dateOfBirth||player.birth_date||null,age:athlete.age??player.age??null,
      birth_place:athlete.birthPlace?.displayText||athlete.birthPlace?.city||player.birth_place||null,
      college:athlete.college?.name||player.college||null,experience:athlete.experience?.displayValue||player.experience||null,
      jersey:athlete.jersey||player.jersey||null,position:athlete.position?.displayName||player.position||null,
      team:player.team,headshot:athlete.headshot?.href||player.headshot||null,
      family:Array.isArray(athlete.relatives)?athlete.relatives:Array.isArray(athlete.family)?athlete.family:Array.isArray(player.family)?player.family:null,
      biography:athlete.biography||athlete.description||null,
      stats:Object.values(playerStats).some(value=>value!=null)?playerStats:null,
      source:Object.keys(detailedStats).length?'ESPN athlete profile + season statistics':overview.statistics?'ESPN athlete profile + season overview':'ESPN athlete profile'
    };
    res.json({data,updatedAt:new Date().toISOString()});
  }catch(e){res.status(503).json({error:'Ficha biográfica indisponível: '+e.message});}
});
app.get('/api/teams', (_req, res) => {
  const data = Object.entries(TEAM_META).map(([id, meta]) => ({
    id: Number(id), abbreviation: meta[0], full_name: meta[1], conference: meta[2], division: meta[3]
  }));
  res.json({ data, source: 'NBA team directory' });
});

app.get('/api/players', async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || req.query.cursor) || 1);
  try {
    // A lista ESPN é carregada uma vez e mantida em cache por 30 minutos.
    const all = await cached('espn:active-players', espnPlayers, 30 * 60 * 1000);
    const filtered = all.filter(p => !search || `${p.first_name} ${p.last_name}`.toLowerCase().includes(search));
    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      data: filtered.slice((page - 1) * 100, page * 100),
      meta: { next_cursor: page * 100 < filtered.length ? String(page + 1) : null, total_count: filtered.length },
      source: 'ESPN rosters'
    });
  } catch (espnError) {
    try {
      const rows = (await cached(`players:${seasonFor()}`, () => nba('commonallplayers', {
        LeagueID: '00', Season: seasonFor(), IsOnlyCurrentSeason: '1'
      }), 12 * 60 * 60 * 1000))[0] || [];
      const filtered = rows.filter(p => Number(p.ROSTERSTATUS) === 1 && (!search || String(p.DISPLAY_FIRST_LAST || '').toLowerCase().includes(search)));
      const data = filtered.slice((page - 1) * 100, page * 100).map(p => ({
        id: p.PERSON_ID, first_name: String(p.DISPLAY_FIRST_LAST || '').split(' ').slice(0,-1).join(' '),
        last_name: String(p.DISPLAY_FIRST_LAST || '').split(' ').slice(-1)[0],
        position: p.ROSTERSTATUS === 1 ? 'Ativo' : '', team: { abbreviation: p.TEAM_ABBREVIATION || '' },
        is_active: p.ROSTERSTATUS === 1
      }));
      res.json({ data, meta: { next_cursor: page * 100 < filtered.length ? String(page + 1) : null, total_count: filtered.length }, source: 'NBA Stats fallback' });
    } catch (nbaError) {
      res.status(503).json({ error: `Elenco temporariamente indisponível. ESPN: ${espnError.message} NBA Stats: ${nbaError.message}` });
    }
  }
});
app.get('/api/games', async (req, res) => {
  const parseDate = value => {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? text : null;
  };
  const saoToday = saoPauloDate(new Date().toISOString());
  const defaultStart = shiftIsoDate(saoToday, -1);
  const defaultEnd = shiftIsoDate(saoToday, 30);
  const start = parseDate(req.query.start || defaultStart);
  const end = parseDate(req.query.end || defaultEnd);
  try {
    if (!start || !end || start > end) return res.status(400).json({ error: 'Período inválido. Escolha datas válidas e confira se “De” não é posterior a “Até”.' });
    const span = Math.floor((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
    if (span > 90) return res.status(400).json({ error: 'Consulte no máximo 90 dias por vez.' });
    try {
      const data = await cached(`espn-games:${start}:${end}`, () => espnGames(start, end), 20 * 1000);
      res.set('Cache-Control', 'private, max-age=60');
      return res.json({ data, updatedAt: new Date().toISOString(), source: 'ESPN scoreboard' });
    } catch (espnError) {
      try {
        const data = await cached(`cdn-games:${start}:${end}`, () => nbaCdnGames(start, end), 30 * 1000);
        res.set('Cache-Control', 'private, max-age=60');
        return res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA CDN schedule', fallback: true });
      } catch (cdnError) {
        return res.status(503).json({ error: `Calendário temporariamente indisponível. ESPN: ${espnError.message} NBA CDN: ${cdnError.message}` });
      }
    }
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Não foi possível carregar os jogos.' });
  }
});

async function espnLiveGames() {
  const today = saoPauloDate(new Date().toISOString());
  const queryDates = [shiftIsoDate(today, -1), today, shiftIsoDate(today, 1)];
  const results = await Promise.allSettled(queryDates.map(day => cached(
    'espn-live-day:' + day,
    async () => {
      const body = await espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=' + day.replaceAll('-', '') + '&limit=1000');
      return body.events || [];
    },
    8000
  )));
  const events = new Map();
  let succeeded = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    succeeded++;
    for (const event of result.value) if (event?.id) events.set(String(event.id), event);
  }
  if (!succeeded) throw new Error('ESPN não respondeu ao placar diário.');
  return [...events.values()].flatMap(event => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const home = competitors.find(team => team.homeAway === 'home');
    const away = competitors.find(team => team.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) return [];
    const datetime = event.date || competition.date || '';
    const date = saoPauloDate(datetime);
    const statusInfo = competition.status || event.status || {};
    const statusType = statusInfo.type || {};
    const state = statusType.state || 'pre';
    if (date !== today && state !== 'in') return [];
    const period = validPeriod(statusInfo.period);
    return [{
      id: String(event.id), date, datetime,
      status: statusType.shortDetail || statusType.description || 'Agendado',
      status_state: state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled',
      period, period_label: periodLabel(period),
      display_clock: validGameClock(statusInfo.displayClock, period),
      home_team: { id: Number(home.team.id), abbreviation: canonicalTeamAbbr(home.team.abbreviation), full_name: home.team.displayName || home.team.name || '' },
      visitor_team: { id: Number(away.team.id), abbreviation: canonicalTeamAbbr(away.team.abbreviation), full_name: away.team.displayName || away.team.name || '' },
      home_team_score: finiteNumberOrNull(home.score),
      visitor_team_score: finiteNumberOrNull(away.score)
    }];
  }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

app.get('/api/games/live', async (_req, res) => {
  const today = saoPauloDate(new Date().toISOString());
  try {
    const data = await cached('espn-live-games:' + today, espnLiveGames, 8000);
    if (data.length) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.json({ data, updatedAt: new Date().toISOString(), source: 'ESPN daily scoreboard' });
    }
    throw new Error('ESPN não retornou partidas para a data local; consultando a fonte alternativa.');
  } catch (espnError) {
    try {
      const response = await fetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', {
        headers: NBA_HEADERS, signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('NBA Live CDN HTTP ' + response.status);
      const body = await response.json();
      const data = (body?.scoreboard?.games || []).map(game => {
        const home = game.homeTeam || {}, away = game.awayTeam || {};
        const state = Number(game.gameStatus);
        const period = validPeriod(game.period);
        const datetime = game.gameTimeUTC || '';
        const localDate = saoPauloDate(datetime) || today;
        if (localDate !== today && state !== 2) return null;
        if (!/^\d{10}$/.test(String(game.gameId || '')) || !home.teamTricode || !away.teamTricode) return null;
        return {
          id: String(game.gameId), date: localDate, datetime,
          status: game.gameStatusText || (state === 3 ? 'Final' : state === 2 ? 'Em andamento' : 'Agendado'),
          status_state: state === 3 ? 'final' : state === 2 ? 'in_progress' : 'scheduled',
          period, period_label: periodLabel(period),
          display_clock: validGameClock(game.gameClock, period),
          home_team: { id: home.teamId, abbreviation: home.teamTricode || '', full_name: home.teamName || home.teamCity || '' },
          visitor_team: { id: away.teamId, abbreviation: away.teamTricode || '', full_name: away.teamName || away.teamCity || '' },
          home_team_score: finiteNumberOrNull(home.score),
          visitor_team_score: finiteNumberOrNull(away.score)
        };
      }).filter(Boolean);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA Live CDN scoreboard', fallback: true });
    } catch (cdnError) {
      return res.status(503).json({ error: 'Placar ao vivo indisponível. ESPN: ' + espnError.message + ' NBA CDN: ' + cdnError.message });
    }
  }
});

async function nbaLivePeriodSummary(gameId) {
  if (!/^00\d{8}$/.test(gameId)) throw new Error('ID não pertence ao formato de partida NBA Live.');
  const body = await cached('nba-live-periods:' + gameId, async () => {
    const response = await fetch('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_' + gameId + '.json', {
      headers: NBA_HEADERS, signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('NBA Live boxscore HTTP ' + response.status);
    return response.json();
  }, 15 * 1000);
  const game = body.game || {};
  const teams = [game.homeTeam || {}, game.awayTeam || {}];
  const summaryStatus = game.gameStatus === 1 ? 'scheduled' : 'in_progress';
  const competitors = teams.map(team => ({
    name: [team.teamCity, team.teamName].filter(Boolean).join(' ') || team.teamTricode || 'Time',
    abbreviation: team.teamTricode || '',
    score: scoreboardScore(team.score, summaryStatus),
    linescores: (Array.isArray(team.periods) ? team.periods : []).map(period => scoreboardScore(period?.score, summaryStatus))
  }));
  const periods = competitors.reduce((max, team) => Math.max(max, team.linescores.length), 0);
  if (!competitors.some(team => team.abbreviation) || !periods) throw new Error('NBA Live não publicou parciais por período para este jogo.');
  return { competitors, periods: Array.from({length: periods}, (_, index) => index + 1) };
}

app.get('/api/games/:id/summary', async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{5,12}$/.test(id)) return res.status(400).json({error:'ID de partida inválido.'});
  let espnError;
  try {
    const body = await cached('espn-summary:' + id, () => espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=' + encodeURIComponent(id)), 60 * 1000);
    const competition = body.header?.competitions?.[0] || {};
    const summaryStatus = competition.status?.type?.state === 'pre' ? 'scheduled' : 'in_progress';
    const competitors = (competition.competitors || []).map(team => ({
      name: team.team?.displayName || team.team?.name || team.team?.abbreviation || 'Time',
      abbreviation: team.team?.abbreviation || team.abbreviation || '',
      score: scoreboardScore(team.score, summaryStatus),
      linescores: (team.linescores || []).map(line => scoreboardScore(line.displayValue ?? line.value, summaryStatus))
    }));
    const periods = competitors.reduce((max, team) => Math.max(max, team.linescores.length), 0);
    if (!competitors.length || !periods) throw new Error('ESPN não publicou parciais por período para este jogo.');
    return res.json({data:{competitors,periods:Array.from({length:periods},(_,index)=>index+1)},source:'ESPN game summary'});
  } catch (error) {
    espnError = error;
  }
  try {
    const data = await nbaLivePeriodSummary(id);
    return res.json({data,source:'NBA Live CDN boxscore',fallback:true});
  } catch (cdnError) {
    return res.status(503).json({error:'Parciais indisponíveis. ESPN: ' + espnError.message + ' NBA Live: ' + cdnError.message});
  }
});

app.get('/api/games/:id/stats', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^\d{8,12}$/.test(id)) return res.status(400).json({ error: 'ID de partida inválido.' });
    const data = await cached(`boxscore:${id}`, () => getGameBoxscore(id), 12 * 1000);
    res.json({ data:data.slice().sort((a,b)=>(b.game_score??-Infinity)-(a.game_score??-Infinity)), updatedAt: new Date().toISOString() });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/rankings/recent', async (_req, res) => {
  try {
    const rows = (await cached(`last5:${seasonFor()}`, () => nba('leaguedashplayerstats', {
      ...playerDashFilters(), LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season', PerMode: 'PerGame',
      LastNGames: '5', MeasureType: 'Base', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 2 * 60 * 1000))[0] || [];
    const numberOrNull = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const data = rows.filter(r => numberOrNull(r.GP) > 0).map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { abbreviation: r.TEAM_ABBREVIATION },
      gamesPlayed: numberOrNull(r.GP), pts: numberOrNull(r.PTS), reb: numberOrNull(r.REB), ast: numberOrNull(r.AST),
      stl: numberOrNull(r.STL), blk: numberOrNull(r.BLK),
      fg_pct: numberOrNull(r.FG_PCT), fg3_pct: numberOrNull(r.FG3_PCT)
    })).sort((a,b) => {
      if (a.pts == null && b.pts != null) return 1;
      if (b.pts == null && a.pts != null) return -1;
      const pointsOrder = (b.pts ?? 0) - (a.pts ?? 0);
      if (pointsOrder) return pointsOrder;
      const nameA = `${a.player.first_name} ${a.player.last_name}`.trim();
      const nameB = `${b.player.first_name} ${b.player.last_name}`.trim();
      return nameA.localeCompare(nameB, 'en');
    });
    res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA Stats', period: 'Last 5 games' });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/averages', async (req, res) => {
  try {
    const requested = Number(req.query.last ?? 5);
    const allowed = [5, 10, 15, 20, 0];
    if (!allowed.includes(requested)) return res.status(400).json({ error: 'Período inválido. Use 5, 10, 15, 20 ou 0 para a temporada.' });
    const season = seasonFor();
    const rows = (await cached(`averages:${season}:${requested}`, () => nba('leaguedashplayerstats', {
      ...playerDashFilters(), LeagueID: '00', Season: season, SeasonType: 'Regular Season', PerMode: 'PerGame',
      LastNGames: String(requested), MeasureType: 'Base', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 3 * 60 * 1000))[0] || [];
    const numberOrNull = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const nonNegative = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>=0?parsed:null; };
    const percentage = value => { const parsed=numberOrNull(value); return parsed!=null&&parsed>=0&&parsed<=1?parsed:null; };
    const attempts = (made, attempted) => { const m=nonNegative(made), a=nonNegative(attempted); return m!=null&&a!=null&&m>a?{made:null,attempted:null}:{made:m,attempted:a}; };
    const data = rows.filter(r => Number.isSafeInteger(Number(r.PLAYER_ID)) && Number(r.PLAYER_ID) > 0 && String(r.PLAYER_NAME || '').trim() && Number.isFinite(Number(r.GP)) && Number(r.GP) > 0).map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { id: r.TEAM_ID, abbreviation: r.TEAM_ABBREVIATION },
      gamesPlayed: nonNegative(r.GP), pts: nonNegative(r.PTS), reb: nonNegative(r.REB), ast: nonNegative(r.AST),
      stl: nonNegative(r.STL), blk: nonNegative(r.BLK), turnover: nonNegative(r.TOV),
      ...(()=>{const pair=attempts(r.FGM,r.FGA);return {fgm:pair.made,fga:pair.attempted};})(),
      ...(()=>{const pair=attempts(r.FG3M,r.FG3A);return {fg3m:pair.made,fg3a:pair.attempted};})(),
      ...(()=>{const pair=attempts(r.FTM,r.FTA);return {ftm:pair.made,fta:pair.attempted};})(),
      ft_pct: percentage(r.FT_PCT), oreb: nonNegative(r.OREB),
      dreb: nonNegative(r.DREB), pf: nonNegative(r.PF),
      plus_minus: numberOrNull(r.PLUS_MINUS),
      fg_pct: percentage(r.FG_PCT), fg3_pct: percentage(r.FG3_PCT),
      min: nonNegative(r.MIN)
    })).sort((a,b) => {
      if (a.pts == null && b.pts != null) return 1;
      if (b.pts == null && a.pts != null) return -1;
      const pointsOrder = (b.pts ?? 0) - (a.pts ?? 0);
      if (pointsOrder) return pointsOrder;
      const nameA = `${a.player.first_name} ${a.player.last_name}`.trim();
      const nameB = `${b.player.first_name} ${b.player.last_name}`.trim();
      return nameA.localeCompare(nameB, 'en');
    });
    res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA Stats', season, lastGames: requested, period: requested ? `Últimos ${requested} jogos` : 'Temporada completa', totalPlayers: data.length });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});
async function espnTeamSchedule(abbreviation, seasonYear) {
  const teamId = ESPN_TEAM_IDS[abbreviation];
  if (!teamId) throw new Error('ID ESPN da franquia não encontrado.');
  try {
    const body = await espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/' + teamId + '/schedule?season=' + seasonYear);
    const events = body.events || body.schedule?.events || [];
    const parsed = events.flatMap(event => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      if (competitors.length < 2) return [];
      const sides = competitors.map(side => ({
        abbreviation:canonicalTeamAbbr(side.team?.abbreviation||side.team?.shortDisplayName||''),
        name:side.team?.displayName||side.team?.name||'',
        score:finiteNumberOrNull(side.score),
        homeAway:side.homeAway
      }));
      return [{id:String(event.id||competition.id||''),date:event.date||competition.date||'',
        status:competition.status?.type?.description||event.status?.type?.description||'',
        state:competition.status?.type?.state||event.status?.type?.state||'pre',
        sides,venue:competition.venue?.fullName||null}];
    });
    if (parsed.length) return parsed;
    throw new Error('ESPN não retornou partidas para esta franquia.');
  } catch (espnError) {
    const schedule = await cached('nba:season-schedule', async () => {
      const response = await fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', {
        headers: NBA_HEADERS, signal: AbortSignal.timeout(9000)
      });
      if (!response.ok) throw new Error('Calendário NBA CDN HTTP ' + response.status);
      return response.json();
    }, 30 * 60 * 1000);
    const games = (schedule?.leagueSchedule?.gameDates || []).flatMap(day => day.games || []);
    const parsed = games.filter(game => Number(game.gameType) === 2 &&
      (canonicalTeamAbbr(game.homeTeam?.teamTricode) === abbreviation || canonicalTeamAbbr(game.awayTeam?.teamTricode) === abbreviation)
    ).map(game => {
      const home = game.homeTeam || {}, away = game.awayTeam || {};
      const stateCode = Number(game.gameStatus);
      const datetime = game.gameDateTimeUTC || '';
      return {
        id:String(game.gameId),
        date:datetime?saoPauloDate(datetime):String(game.gameDateEst||game.gameDate||'').slice(0,10),
        status:game.gameStatusText||(stateCode===3?'Final':stateCode===2?'Em andamento':'Agendado'),
        state:stateCode===3?'post':stateCode===2?'in':'pre',
        sides:[
          {abbreviation:canonicalTeamAbbr(home.teamTricode||''),name:[home.teamCity,home.teamName].filter(Boolean).join(' '),score:(stateCode===2||stateCode===3)?finiteNumberOrNull(game.homeTeamScore):null,homeAway:'home'},
          {abbreviation:canonicalTeamAbbr(away.teamTricode||''),name:[away.teamCity,away.teamName].filter(Boolean).join(' '),score:(stateCode===2||stateCode===3)?finiteNumberOrNull(game.awayTeamScore):null,homeAway:'away'}
        ],
        venue:game.arenaName||null
      };
    });
    if (!parsed.length) throw new Error('ESPN: '+espnError.message+' NBA CDN: nenhum jogo regular encontrado para '+abbreviation+'.');
    return parsed;
  }
}
app.get('/api/headtohead', async (req, res) => {
  try {
    const team = String(req.query.team||'').toUpperCase();
    const opponent = String(req.query.opponent||'').toUpperCase();
    if (!TEAM_META[Object.keys(TEAM_META).find(id=>TEAM_META[id][0]===team)] ||
        !TEAM_META[Object.keys(TEAM_META).find(id=>TEAM_META[id][0]===opponent)] || team===opponent) {
      return res.status(400).json({error:'Escolha duas franquias diferentes.'});
    }
    const season = seasonFor();
    const seasonYear = Number(season.slice(0,4)) + 1;
    const schedules = await cached('espn-headtohead:'+team+':'+opponent+':'+season,async()=>{
      const [a,b] = await Promise.all([espnTeamSchedule(team,seasonYear),espnTeamSchedule(opponent,seasonYear)]);
      const byId = new Map(a.map(game=>[game.id,game]));
      b.forEach(game=>{if(!byId.has(game.id))byId.set(game.id,game);});
      return [...byId.values()];
    },5*60*1000);
    const data = schedules.filter(game=>game.sides.some(side=>side.abbreviation===team)&&game.sides.some(side=>side.abbreviation===opponent))
      .map(game=>{
        const a=game.sides.find(side=>side.abbreviation===team),b=game.sides.find(side=>side.abbreviation===opponent);
        const final=game.state==='post'||/\bfinal\b/i.test(String(game.status||''));
        const winner=final?(a.score>b.score?team:a.score<b.score?opponent:'Tie'):null;
        return {game_id:game.id,date:game.date?String(game.date).slice(0,10):'N/D',
          matchup:team+' vs '+opponent,winner,points:a.score,opponent_points:b.score,
          plus_minus:a.score!=null&&b.score!=null?a.score-b.score:null,status:game.status,state:game.state,venue:game.venue};
      }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    res.json({data,season,source:'ESPN team schedules + NBA CDN fallback',updatedAt:new Date().toISOString()});
  } catch(e) { res.status(503).json({error:'Confronto direto temporariamente indisponível: '+e.message}); }
});
async function nbaLivePlayByPlay(gameId) {
  const response = await fetch('https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_' + encodeURIComponent(gameId) + '.json', {
    headers: NBA_HEADERS, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('NBA Live CDN play-by-play HTTP ' + response.status);
  const body = await response.json();
  const actions = body?.game?.actions;
  if (!Array.isArray(actions)) throw new Error('Feed de jogadas da NBA não retornou ações.');
  return actions;
}

app.get('/api/players/:id/shots', async (req, res) => {
  try {
    const playerId = String(req.params.id);
    let team = canonicalTeamAbbr(req.query.team || '');
    const playerName = String(req.query.name || '').trim();
    if (!/^\d{1,12}$/.test(playerId)) return res.status(400).json({ error: 'ID de jogador inválido. Selecione um atleta da lista oficial.' });
    // A lista de médias pode vir sem franquia em cache antigo. Reconciliamos pelo nome
    // com os elencos atuais da ESPN, sem depender do NBA Stats nem confundir IDs ESPN/NBA.
    if (!team && playerName) {
      try {
        const normalizePlayerName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetName = normalizePlayerName(playerName);
        const roster = await cached('espn:active-players', espnPlayers, 30 * 60 * 1000);
        const match = roster.find(player => normalizePlayerName([player.first_name, player.last_name].filter(Boolean).join(' ')) === targetName);
        team = canonicalTeamAbbr(match?.team?.abbreviation || '');
      } catch {
        // O feed alternativo ainda pode usar a franquia enviada pelo frontend.
      }
    }
    const season = seasonFor();
    try {
      const rows = (await cached('shot-chart:'+season+':'+playerId, () => nba('shotchartdetail', {
        LeagueID:'00', Season:season, SeasonType:'Regular Season', PlayerID:playerId,
        TeamID:0, ContextMeasure:'FGA', DateFrom:'', DateTo:'', GameID:'',
        Outcome:'', Location:'', Month:0, SeasonSegment:'', VsConference:'',
        VsDivision:'', Position:'', RookieYear:'', GameSegment:'', Period:0,
        LastNGames:0, ClutchTime:'', AheadBehind:'', PointDiff:'', RangeType:0,
        StartPeriod:0, EndPeriod:0
      }), 3 * 60 * 1000))[0] || [];
      const data = rows.filter(r => r.LOC_X != null && r.LOC_X !== '' && r.LOC_Y != null && r.LOC_Y !== '' && r.SHOT_MADE_FLAG != null && (Number(r.SHOT_MADE_FLAG) === 0 || Number(r.SHOT_MADE_FLAG) === 1) && Number.isFinite(Number(r.LOC_X)) && Number.isFinite(Number(r.LOC_Y))).map(r => ({
        x:Number(r.LOC_X), y:Number(r.LOC_Y), made:Number(r.SHOT_MADE_FLAG)===1,
        action:r.ACTION_TYPE||r.EVENT_TYPE||'Arremesso',
        distance:r.SHOT_DISTANCE==null?null:Number(r.SHOT_DISTANCE)
      }));
      if (data.length) return res.json({data,season,source:'NBA Stats shotchartdetail',updatedAt:new Date().toISOString()});
    } catch (statsError) {
      // Fallback abaixo usa jogadas oficiais da NBA Live CDN, sem depender do NBA Stats.
    }

    if (!team) return res.status(503).json({error: playerName ? 'Não foi possível localizar este atleta nos elencos atuais da ESPN para identificar a franquia e consultar o feed alternativo.' : 'Informe o nome do atleta ou a franquia para consultar o feed alternativo.'});
    const today = saoPauloDate(new Date().toISOString());
    const seasonStart = season.slice(0,4) + '-07-01';
    const games = await cached('shot-cdn-games:'+season+':'+team, () => nbaCdnGames(seasonStart, today), 5 * 60 * 1000);
    const teamGames = games.filter(g => g.status_state === 'final' && (
      canonicalTeamAbbr(g.home_team?.abbreviation) === team || canonicalTeamAbbr(g.visitor_team?.abbreviation) === team
    )).sort((a,b) => new Date(b.datetime || b.date) - new Date(a.datetime || a.date)).slice(0,20);
    if (!teamGames.length) return res.status(503).json({error:'NBA Stats está indisponível e ainda não há partidas finalizadas do time para consultar o feed alternativo.'});

    const collected = [];
    const failures = [];
    for (let i = 0; i < teamGames.length; i += 4) {
      const batch = teamGames.slice(i, i + 4);
      const results = await Promise.allSettled(batch.map(async game => ({game, actions:await nbaLivePlayByPlay(game.id)})));
      for (const result of results) {
        if (result.status === 'rejected') { failures.push(result.reason?.message || 'Falha no play-by-play'); continue; }
        const {game,actions} = result.value;
        for (const action of actions) {
          if (String(action.personId) !== playerId) continue;
          const type = String(action.actionType || '').toLowerCase();
          if (!(Number(action.isFieldGoal) === 1 || type === '2pt' || type === '3pt')) continue;
          const rawX = action.xLegacy ?? action.x;
          const rawY = action.yLegacy ?? action.y;
          if (rawX == null || rawX === '' || rawY == null || rawY === '') continue;
          const x = Number(rawX), y = Number(rawY);
          if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) continue;
          const resultText = String(action.shotResult || '').toLowerCase();
          const made = resultText.includes('made'), missed = resultText.includes('miss');
          if (!made && !missed) continue;
          collected.push({
            x, y,
            made,
            action: action.description || action.subType || action.actionType || 'Arremesso',
            distance: Number.isFinite(Number(action.shotDistance)) && Number(action.shotDistance) > 0 ? Number(action.shotDistance) : null,
            gameId: game.id, date: game.date
          });
        }
      }
    }
    if (!collected.length) {
      const suffix = failures.length ? ' Algumas partidas não puderam ser consultadas.' : '';
      return res.status(503).json({error:'NBA Stats está indisponível e o feed alternativo não retornou coordenadas de arremessos para este atleta nos últimos 20 jogos do time.'+suffix});
    }
    res.json({data:collected,season,source:'NBA Live CDN play-by-play',sampleGames:teamGames.length,updatedAt:new Date().toISOString()});
  } catch(e) {
    res.status(e.status||503).json({error:'Mapa de arremessos indisponível: '+e.message});
  }
});

app.get('/api/advanced', async (req, res) => {
  try {
    const requested = Number(req.query.last ?? 0);
    if (![5, 10, 15, 20, 0].includes(requested)) return res.status(400).json({ error: 'Período inválido.' });
    const season = seasonFor();
    const rows = (await cached(`advanced:${season}:${requested}`, () => nba('leaguedashplayerstats', {
      ...playerDashFilters(), LeagueID: '00', Season: season, SeasonType: 'Regular Season', PerMode: 'PerGame',
      LastNGames: String(requested), MeasureType: 'Advanced', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 3 * 60 * 1000))[0] || [];
    const numberOrNull = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const data = rows.filter(r => Number(r.GP) > 0).map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { id: r.TEAM_ID, abbreviation: r.TEAM_ABBREVIATION }, gamesPlayed: Number(r.GP),
      min: numberOrNull(r.MIN),
      pie: numberOrNull(r.PIE), ts_pct: numberOrNull(r.TS_PCT), usg_pct: numberOrNull(r.USG_PCT),
      off_rating: numberOrNull(r.OFF_RATING), def_rating: numberOrNull(r.DEF_RATING), net_rating: numberOrNull(r.NET_RATING),
      ast_pct: numberOrNull(r.AST_PCT), tov_pct: numberOrNull(r.TOV_PCT), efg_pct: numberOrNull(r.EFG_PCT),
      ast_to: numberOrNull(r.AST_TO), ast_ratio: numberOrNull(r.AST_RATIO), pace: numberOrNull(r.PACE),
      oreb_pct: numberOrNull(r.OREB_PCT), dreb_pct: numberOrNull(r.DREB_PCT), reb_pct: numberOrNull(r.REB_PCT),
      poss: numberOrNull(r.POSS)
    })).sort((a,b) => {
      if (a.pie == null && b.pie != null) return 1;
      if (b.pie == null && a.pie != null) return -1;
      const pieOrder = (b.pie ?? 0) - (a.pie ?? 0);
      if (pieOrder) return pieOrder;
      const nameA = `${a.player.first_name} ${a.player.last_name}`.trim();
      const nameB = `${b.player.first_name} ${b.player.last_name}`.trim();
      return nameA.localeCompare(nameB, 'en');
    });
    res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA Stats Advanced', season, period: requested ? `Últimos ${requested} jogos` : 'Temporada completa' });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/mvp', async (_req, res) => {
  try {
    const season = seasonFor();
    const rows = (await cached(`season-leaders:${season}`, () => nba('leaguedashplayerstats', {
      ...playerDashFilters(), LeagueID: '00', Season: season, SeasonType: 'Regular Season', PerMode: 'PerGame',
      MeasureType: 'Base', LastNGames: '0', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 5 * 60 * 1000))[0] || [];
    const numberOrNull = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const data = rows.map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { abbreviation: r.TEAM_ABBREVIATION },
      gp: numberOrNull(r.GP), pts: numberOrNull(r.PTS), reb: numberOrNull(r.REB), ast: numberOrNull(r.AST),
      stl: numberOrNull(r.STL), blk: numberOrNull(r.BLK), fg_pct: numberOrNull(r.FG_PCT), fg3_pct: numberOrNull(r.FG3_PCT)
    })).filter(r => r.gp != null && r.gp >= 1 && r.pts != null).sort((a,b) => {
      const pointsOrder = b.pts - a.pts;
      if (pointsOrder) return pointsOrder;
      const nameA = `${a.player.first_name} ${a.player.last_name}`.trim();
      const nameB = `${b.player.first_name} ${b.player.last_name}`.trim();
      return nameA.localeCompare(nameB, 'en');
    });
    res.json({ data: data.slice(0,100), leader: data[0] || null, season, method: 'Líderes estatísticos da temporada regular NBA por pontos por jogo; não representa votação oficial do prêmio NBA MVP.' });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});


app.get('/api/records', async (_req, res) => {
  try {
    const categories = [
      ['PTS','Pontos'],['REB','Rebotes'],['AST','Assistências'],['STL','Roubos'],['BLK','Tocos']
    ];
    const data = await cached('nba-all-time-record-leaders', async () => Promise.all(categories.map(async ([category,label]) => {
      const sets = await nba('leagueleaders', {
        LeagueID:'00', PerMode:'Totals', Scope:'S', Season:'All Time',
        SeasonType:'Regular Season', StatCategory:category
      });
      const rows = sets[0] || [];
      const leaders = rows.map(row => {
        const rawValue = row[category] ?? row.VALUE;
        const value = rawValue == null || typeof rawValue === 'boolean' || String(rawValue).trim() === '' || !Number.isFinite(Number(rawValue)) ? null : Number(rawValue);
        return { player_id: row.PLAYER_ID, player_name: row.PLAYER || row.PLAYER_NAME || null, value, team: row.TEAM };
      }).filter(row => row.value != null && row.player_name).slice(0, 10);
      return { category, label, leaders };
    })), 12 * 60 * 60 * 1000);
    res.json({ data, source:'NBA Stats all-time league leaders', updatedAt:new Date().toISOString() });
  } catch (e) { res.status(e.status || 503).json({ error:'Recordes históricos temporariamente indisponíveis: '+e.message }); }
});

app.get('/api/news', async (_req, res) => {
  try {
    const body = await cached('espn:news', () => espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'), 5 * 60 * 1000);
    const data = (body.articles || []).slice(0,30).map(item => ({
      id: item.id || item.dataSourceIdentifier || item.headline,
      title: item.headline || item.title || 'Notícia NBA',
      description: item.description || item.summary || '',
      image: item.images?.[0]?.url || item.images?.[0]?.href || null,
      published: item.published || item.lastModified || '',
      url: item.links?.web?.href || item.links?.api?.news?.href || 'https://www.espn.com/nba/'
    }));
    res.json({ data, source: 'ESPN NBA News', updatedAt: new Date().toISOString() });
  } catch (e) { res.status(503).json({ error: 'Notícias indisponíveis no momento: ' + e.message }); }
});
app.get('/api/injuries', async (_req, res) => {
  try {
    const body = await cached('espn:injuries', () => espnJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'), 2 * 60 * 1000);
    const groups = Array.isArray(body.injuries) ? body.injuries : Array.isArray(body.teams) ? body.teams : [];
    const entries = groups.flatMap(group => {
      const items = Array.isArray(group.injuries) ? group.injuries
        : Array.isArray(group.items) ? group.items
        : (group.athlete || group.name) ? [group] : [];
      return items.map(item => {
        const status = item.status;
        const detail = item.shortComment || item.longComment || item.details?.detail || item.details?.description || '';
        return {
          name: item.athlete?.displayName || item.athlete?.fullName || item.name || null,
          team: group.team?.displayName || group.team?.abbreviation || group.displayName || item.team?.displayName || item.team?.abbreviation || '',
          status: (typeof status === 'string' ? status : status?.type?.description || status?.description || status?.name)
            || item.type?.description || item.details?.type || 'Status não informado',
          detail: typeof detail === 'string' ? detail : ''
        };
      }).filter(item => item.name);
    });
    const unique = new Map();
    entries.forEach(item => unique.set(item.team + '|' + item.name, item));
    const data = [...unique.values()].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ data, source: 'ESPN injuries', updatedAt: new Date().toISOString() });
  } catch (e) { res.status(503).json({ error: 'Relatórios de lesões indisponíveis: ' + e.message }); }
});

app.get('/api/team-stats',async(_req,res)=>{
  try{
    const season=seasonFor();
    const [baseResult,advancedResult,standingResult,gameFinderResult]=await Promise.allSettled([
      cached('team-stats-base:'+season,()=>nba('leaguedashteamstats',{LeagueID:'00',Season:season,SeasonType:'Regular Season',PerMode:'PerGame',MeasureType:'Base',PaceAdjust:'N',PlusMinus:'N',Rank:'N',Month:0,Period:0,OpponentTeamID:0,Location:'',Outcome:'',SeasonSegment:'',VsConference:'',VsDivision:''}),3*60*1000),
      cached('team-stats-advanced:'+season,()=>nba('leaguedashteamstats',{LeagueID:'00',Season:season,SeasonType:'Regular Season',PerMode:'PerGame',MeasureType:'Advanced',PaceAdjust:'N',PlusMinus:'N',Rank:'N',Month:0,Period:0,OpponentTeamID:0,Location:'',Outcome:'',SeasonSegment:'',VsConference:'',VsDivision:''}),3*60*1000),
      cached('espn:standings',espnStandings,5*60*1000),
      cached('team-stats-gamefinder:'+season,()=>nba('leaguegamefinder',{PlayerOrTeam:'T',LeagueID:'00',Season:season,SeasonType:'Regular Season',TeamID:0,VsTeamID:0,DateFrom:'',DateTo:'',Outcome:'',Location:'',SeasonSegment:''}),3*60*1000)
    ]);
    const base=baseResult.status==='fulfilled'?(baseResult.value[0]||[]):[];
    const advanced=advancedResult.status==='fulfilled'?(advancedResult.value[0]||[]):[];
    const fallback=standingResult.status==='fulfilled'?standingResult.value:[];
    const gameRows=gameFinderResult.status==='fulfilled'?(gameFinderResult.value[0]||[]):[];
    const gameFallback=new Map();
    for(const game of gameRows){
      const id=String(game.TEAM_ID||game.Team_ID||'');
      if(!TEAM_META[Number(id)])continue;
      const item=gameFallback.get(id)||{gp:0,decided:0,wins:0,losses:0,pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0,fg3m:0,fg3a:0,counts:{pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0,fg3m:0,fg3a:0}};
      item.gp++;
      const outcome=String(game.WL||'').toUpperCase();
      if(outcome==='W'){item.wins++;item.decided++;}
      if(outcome==='L'){item.losses++;item.decided++;}
      for(const [key,field] of [['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['fgm','FGM'],['fga','FGA'],['fg3m','FG3M'],['fg3a','FG3A']]){
        const raw=game[field];
        if(raw==null||typeof raw==='boolean'||String(raw).trim()==='')continue;
        const value=Number(raw);
        if(Number.isFinite(value)&&value>=0){item[key]+=value;item.counts[key]++;}
      }
      gameFallback.set(id,item);
    }
    const advById=new Map(advanced.map(row=>[String(row.TEAM_ID),row]));
    const baseById=new Map(base.map(row=>[String(row.TEAM_ID),row]));
    const standingsByAbbr=new Map(fallback.map(row=>[row.team?.abbreviation,row]));
    if(!base.length&&!advanced.length&&!fallback.length&&!gameRows.length)throw new Error('Nenhuma fonte retornou estatísticas de franquias.');
    // The comparison is always exactly the 30 NBA franchises. ESPN abbreviations must never be
    // added as extra IDs: doing so duplicated every team when the standings fallback was present.
    const ids=new Set([...Object.keys(TEAM_META),...baseById.keys(),...advById.keys()]);
    const data=[...ids].map(id=>{
      const teamId=Number(id),meta=TEAM_META[teamId],row=baseById.get(id)||{},adv=advById.get(id)||{},games=gameFallback.get(id)||{};
      const abbreviation=row.TEAM_ABBREVIATION||adv.TEAM_ABBREVIATION||meta?.[0]||'';
      const standing=standingsByAbbr.get(abbreviation)||{};
      const number=value=>value==null||typeof value==='boolean'||String(value).trim()===''||!Number.isFinite(Number(value))?null:Number(value);
      const nonNegative=value=>{const parsed=number(value);return parsed!=null&&parsed>=0?parsed:null;};
      const positive=value=>{const parsed=number(value);return parsed!=null&&parsed>0?parsed:null;};
      const percentage=value=>{const parsed=number(value);return parsed!=null&&parsed>=0&&parsed<=1?parsed:null;};
      const average=(total,count)=>count>0?total/count:null;
      const gp=nonNegative(row.GP)??(games.gp||null);
      const wins=nonNegative(row.W)??(games.decided?games.wins:null);
      const losses=nonNegative(row.L)??(games.decided?games.losses:null);
      const winPct=percentage(row.W_PCT??standing.win_pct)??(games.decided>0&&wins!=null&&losses!=null?wins/(wins+losses):null);
      const stat=(official,field)=>nonNegative(official)??average(games[field],games.counts?.[field]||0);
      const fgPct=percentage(row.FG_PCT)??(games.counts?.fga>0?games.fgm/games.fga:null);
      const fg3Pct=percentage(row.FG3_PCT)??(games.counts?.fg3a>0?games.fg3m/games.fg3a:null);
      return {team:{id:teamId,abbreviation,full_name:row.TEAM_NAME||standing.team?.full_name||meta?.[1]||abbreviation,
        conference:standing.team?.conference||meta?.[2],division:meta?.[3]},
        wins,losses,win_pct:winPct,gp,pts:stat(row.PTS,'pts'),reb:stat(row.REB,'reb'),ast:stat(row.AST,'ast'),stl:stat(row.STL,'stl'),blk:stat(row.BLK,'blk'),
        fg_pct:fgPct,fg3_pct:fg3Pct,pace:positive(adv.PACE),off_rating:positive(adv.OFF_RATING),def_rating:positive(adv.DEF_RATING),net_rating:number(adv.NET_RATING)};
    });
    if(data.length!==30||data.some(item=>!item.team?.abbreviation))throw new Error(`Base de franquias inconsistente: esperadas 30 equipes, recebidas ${data.length}.`);
    const sources=[];
    if(base.length)sources.push('NBA Stats base');
    if(advanced.length)sources.push('NBA Stats advanced');
    if(gameRows.length)sources.push('NBA Stats game finder (médias calculadas dos jogos oficiais)');
    if(fallback.length)sources.push('ESPN standings');
    res.json({data:data.sort((a,b)=>{if(a.net_rating==null&&b.net_rating!=null)return 1;if(b.net_rating==null&&a.net_rating!=null)return -1;if(a.net_rating!=null&&b.net_rating!=null&&a.net_rating!==b.net_rating)return b.net_rating-a.net_rating;return (b.win_pct??-Infinity)-(a.win_pct??-Infinity);}),season,
      source:sources.join(' + ')||'No verified source',updatedAt:new Date().toISOString()});
  }catch(e){res.status(503).json({error:'Estatísticas dos times indisponíveis: '+e.message});}
});
app.get('/api/standings', async (_req, res) => {
  try {
    const rows = (await cached(`standings:${seasonFor()}`, () => nba('leaguestandings', {
      LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season'
    }), 2 * 60 * 1000))[0] || [];
    if (!rows.length) throw new Error('NBA Stats não retornou dados da classificação.');
    const data = rows.map(r => ({
      team: { id: r.TeamID, full_name: r.TeamName, name: r.TeamName, abbreviation: TEAM_META[Number(r.TeamID)]?.[0] || r.TeamAbbreviation, conference: r.Conference || TEAM_META[Number(r.TeamID)]?.[2] },
      wins: r.WINS, losses: r.LOSSES,
      win_pct: r.WIN_PCT == null || r.WIN_PCT === '' || !Number.isFinite(Number(r.WIN_PCT)) || Number(r.WIN_PCT) < 0 || Number(r.WIN_PCT) > 1 ? null : Number(r.WIN_PCT)
    }));
    res.json({ data });
  } catch (e) {
    try { const data = await cached('espn:standings', espnStandings, 5 * 60 * 1000); res.json({ data, source: 'ESPN standings', fallback: true }); }
    catch (fallbackError) { res.status(503).json({ error: `Classificação indisponível. NBA Stats: ${e.message} ESPN: ${fallbackError.message}` }); }
  }
});

const limiter = new Map();
app.use(express.static(distPath));
app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); res.sendFile(path.join(distPath, 'index.html')); });
app.listen(PORT, '0.0.0.0', () => console.log(`Courtside Family ativo na porta ${PORT}`));
