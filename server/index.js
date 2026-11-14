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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');
const NBA_STATS = 'https://stats.nba.com/stats';
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
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

function cached(key, fn, ttl = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return fn().then(value => {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a,b) => a[1].at - b[1].at).slice(0,100);
      oldest.forEach(([k]) => cache.delete(k));
    }
    return value;
  });
}
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
  const response = await fetch(url, { headers: NBA_HEADERS, signal: AbortSignal.timeout(25000) });
  if (!response.ok) {
    const error = new Error(`NBA Stats indisponível (HTTP ${response.status}). Tente novamente em alguns instantes.`);
    error.status = response.status === 429 ? 503 : response.status;
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
  return teams.flatMap(team => (team.players || []).map(p => ({
    id: p.personId, player: { id: p.personId, first_name: p.name?.split(' ').slice(0,-1).join(' ') || p.name, last_name: p.name?.split(' ').slice(-1)[0] || '', position: p.position },
    team: { id: team.teamId, abbreviation: team.teamTricode, full_name: team.teamName },
    min: p.statistics?.minutes || '0', pts: p.statistics?.points ?? 0, reb: p.statistics?.reboundsTotal ?? 0,
    ast: p.statistics?.assists ?? 0, stl: p.statistics?.steals ?? 0, blk: p.statistics?.blocks ?? 0,
    fg_pct: p.statistics?.fieldGoalsAttempted ? p.statistics.fieldGoalsMade / p.statistics.fieldGoalsAttempted : 0,
    fg3_pct: p.statistics?.threePointersAttempted ? p.statistics.threePointersMade / p.statistics.threePointersAttempted : 0,
    turnover: p.statistics?.turnovers ?? 0
  })));
}
async function nbaHistoricalBoxscore(gameId) {
  const seasonCode = Number(String(gameId).slice(3, 5));
  const season = Number.isFinite(seasonCode) && seasonCode > 0
    ? `${2000 + seasonCode}-${String(2001 + seasonCode).slice(-2)}`
    : seasonFor();
  const sets = await nba('boxscoretraditionalv2', {
    GameID: gameId, LeagueID: '00', Season: season, SeasonType: 'Regular Season',
    StartPeriod: 0, EndPeriod: 10, StartRange: 0, EndRange: 0, RangeType: 0
  });
  const rows = sets[0] || [];
  if (!rows.length) throw new Error('A NBA não retornou estatísticas para esta partida.');
  return rows.map(p => ({
    id: p.PLAYER_ID,
    player: { id: p.PLAYER_ID, first_name: String(p.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(p.PLAYER_NAME || '').split(' ').slice(-1)[0] },
    team: { id: p.TEAM_ID, abbreviation: p.TEAM_ABBREVIATION, full_name: p.TEAM_NAME },
    min: p.MIN || '0', pts: p.PTS ?? 0, reb: p.REB ?? 0, ast: p.AST ?? 0, stl: p.STL ?? 0, blk: p.BLK ?? 0,
    fg_pct: p.FGA ? p.FGM / p.FGA : 0, fg3_pct: p.FG3A ? p.FG3M / p.FG3A : 0, turnover: p.TOV ?? 0
  }));
}
async function getGameBoxscore(gameId) {
  if (!/^\d{10}$/.test(String(gameId))) return espnBoxscore(gameId);
  try { return await nbaLiveBoxscore(gameId); }
  catch (liveError) {
    try { return await nbaHistoricalBoxscore(gameId); }
    catch (statsError) {
      try { return await espnBoxscore(gameId); }
      catch (espnError) { throw new Error(`Box score indisponível. Live: ${liveError.message} Stats: ${statsError.message} ESPN: ${espnError.message}`); }
    }
  }
}

async function espnJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': NBA_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`ESPN indisponível (HTTP ${response.status}).`);
  return response.json();
}
async function nbaCdnGames(start, end) {
  const schedulePromise = fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', {
    headers: NBA_HEADERS, signal: AbortSignal.timeout(20000)
  }).then(async r => { if (!r.ok) throw new Error(`NBA CDN schedule HTTP ${r.status}`); return r.json(); });
  const today = new Date().toISOString().slice(0,10);
  const [schedule, live] = await Promise.all([
    schedulePromise,
    start <= today && end >= today
      ? fetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', {
          headers: NBA_HEADERS, signal: AbortSignal.timeout(15000)
        }).then(async r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null)
  ]);
  const dates = schedule?.leagueSchedule?.gameDates || [];
  const games = dates.flatMap(d => d.games || []).filter(g => {
    const date = String(g.gameDateEst || g.gameDateTimeEst || g.gameDate || '').slice(0, 10);
    return date >= start && date <= end;
  }).map(g => {
    const home = g.homeTeam || {}, away = g.awayTeam || {};
    const statusCode = Number(g.gameStatus);
    const status = statusCode === 3 ? 'Final' : statusCode === 2 ? 'Em andamento' : 'Agendado';
    const date = String(g.gameDateEst || g.gameDateTimeEst || g.gameDate || '').slice(0, 10);
    return {
      id: String(g.gameId), date, datetime: g.gameDateTimeUTC || g.gameDateTimeEst || date,
      status, status_state: statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled',
      home_team: { id: home.teamId, abbreviation: home.teamTricode || '', full_name: [home.teamCity, home.teamName].filter(Boolean).join(' ') },
      visitor_team: { id: away.teamId, abbreviation: away.teamTricode || '', full_name: [away.teamCity, away.teamName].filter(Boolean).join(' ') },
      home_team_score: statusCode === 1 ? null : (g.homeTeamScore ?? null),
      visitor_team_score: statusCode === 1 ? null : (g.awayTeamScore ?? null)
    };
  });
  const liveGames = live?.scoreboard?.games || [];
  for (const g of liveGames) {
    const idx = games.findIndex(x => x.id === String(g.gameId));
    const home = g.homeTeam || {}, away = g.awayTeam || {};
    const statusCode = Number(g.gameStatus);
    const mapped = {
      id: String(g.gameId), date: String(g.gameTimeUTC || today).slice(0,10),
      datetime: g.gameTimeUTC || today,
      status: g.gameStatusText || (statusCode === 3 ? 'Final' : statusCode === 2 ? 'Em andamento' : 'Agendado'),
      status_state: statusCode === 3 ? 'final' : statusCode === 2 ? 'in_progress' : 'scheduled',
      home_team: { id: home.teamId, abbreviation: home.teamTricode || '', full_name: home.teamName || home.teamCity || '' },
      visitor_team: { id: away.teamId, abbreviation: away.teamTricode || '', full_name: away.teamName || away.teamCity || '' },
      home_team_score: home.score === '' || home.score == null ? null : Number(home.score),
      visitor_team_score: away.score === '' || away.score == null ? null : Number(away.score)
    };
    if (idx >= 0) games[idx] = mapped; else games.push(mapped);
  }
  return games.sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
}
async function espnGames(start, end) {
  const dates = `${start.replaceAll('-','')}-${end.replaceAll('-','')}`;
  const body = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dates}`);
  return (body.events || []).flatMap(event => {
    const competition = event.competitions?.[0];
    if (!competition) return [];
    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) return [];
    const state = competition.status?.type?.state || event.status?.type?.state || 'pre';
    const status = competition.status?.type?.shortDetail || competition.status?.type?.description || event.status?.type?.shortDetail || 'Agendado';
    return [{
      id: String(event.id), date: String(event.date || '').slice(0,10), datetime: event.date || '',
      status, status_state: state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled',
      home_team: { id: Number(home.team?.id), abbreviation: home.team?.abbreviation || '', full_name: home.team?.displayName || home.team?.name || '' },
      visitor_team: { id: Number(away.team?.id), abbreviation: away.team?.abbreviation || '', full_name: away.team?.displayName || away.team?.name || '' },
      home_team_score: home.score == null || home.score === '' ? null : Number(home.score),
      visitor_team_score: away.score == null || away.score === '' ? null : Number(away.score)
    }];
  });
}
function madeAttempt(value) {
  const match = String(value || '').match(/(\d+)\s*[-/]\s*(\d+)/);
  return match ? { made: Number(match[1]), attempted: Number(match[2]) } : { made: 0, attempted: 0 };
}
async function espnBoxscore(gameId) {
  const body = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`);
  const groups = body.boxscore?.players || [];
  const rows = groups.flatMap(group => {
    const statBlock = (group.statistics || []).find(x => x.athletes) || group.statistics?.[0] || {};
    const keys = statBlock.keys || [];
    return (statBlock.athletes || []).map(entry => {
      const values = Object.fromEntries(keys.map((key,i) => [String(key).toUpperCase(), entry.stats?.[i]]));
      const fg = madeAttempt(values.FG), three = madeAttempt(values['3PT'] || values['3P']);
      const athlete = entry.athlete || {};
      const fullName = athlete.displayName || athlete.fullName || athlete.shortName || '';
      const parts = fullName.split(' ');
      return {
        id: Number(athlete.id), player: { id: Number(athlete.id), first_name: parts.slice(0,-1).join(' '), last_name: parts.slice(-1)[0] || '', headshot: athlete.headshot || null },
        team: { id: Number(group.team?.id), abbreviation: group.team?.abbreviation || '', full_name: group.team?.displayName || group.team?.name || '' },
        min: values.MIN || '0', pts: Number(values.PTS) || 0, reb: Number(values.REB) || 0,
        ast: Number(values.AST) || 0, stl: Number(values.STL) || 0, blk: Number(values.BLK) || 0,
        fg_pct: fg.attempted ? fg.made / fg.attempted : 0,
        fg3_pct: three.attempted ? three.made / three.attempted : 0,
        turnover: Number(values.TO) || 0
      };
    });
  });
  if (!rows.length) throw new Error('ESPN ainda não publicou o box score desta partida.');
  return rows;
}
async function espnPlayers() {
  const abbreviations = Object.values(TEAM_META).map(meta => meta[0]);
  const rosters = await Promise.all(abbreviations.map(async abbreviation => {
    const body = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${abbreviation.toLowerCase()}/roster`);
    const groups = body.athletes || [];
    const athletes = groups.flatMap(group => Array.isArray(group.items) ? group.items : [group]);
    return athletes.filter(p => p && (p.id || p.uid)).map(p => ({
      id: Number(p.id || String(p.uid).split(':').pop()),
      first_name: p.firstName || String(p.fullName || p.displayName || '').split(' ').slice(0,-1).join(' '),
      last_name: p.lastName || String(p.fullName || p.displayName || '').split(' ').slice(-1)[0],
      position: p.position?.abbreviation || p.position?.name || '',
      team: { abbreviation, full_name: TEAM_META[Object.keys(TEAM_META).find(id => TEAM_META[id][0] === abbreviation)]?.[1] || abbreviation },
      is_active: true, headshot: p.headshot?.href || null
    }));
  }));
  const unique = new Map();
  rosters.flat().forEach(p => { if (p.id) unique.set(p.id, p); });
  return [...unique.values()].sort((a,b) => a.last_name.localeCompare(b.last_name));
}
async function espnStandings() {
  const body = await espnJson('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
  const groups = body.children || body.standings?.children || [];
  const entries = groups.flatMap(group => (group.standings?.entries || []).map(entry => {
    const team = entry.team || {};
    const stats = Object.fromEntries((entry.stats || []).map(x => [x.name, x.value]));
    const meta = Object.values(TEAM_META).find(x => x[0] === team.abbreviation);
    return {
      team: { id: Number(team.id), full_name: team.displayName || team.name || '', name: team.displayName || team.name || '',
        abbreviation: team.abbreviation || '', conference: group.name || group.abbreviation || meta?.[2] || '' },
      wins: stats.wins ?? null, losses: stats.losses ?? null,
      win_pct: stats.winPercent ?? stats.win_pct ?? null
    };
  }));
  return entries.sort((a,b) => (b.win_pct ?? 0) - (a.win_pct ?? 0));
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
app.get('/api/health', (_req, res) => res.json({ ok: true, dataSource: 'NBA Stats + NBA CDN + ESPN fallback', supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY), familyAllowlistEnabled: FAMILY_EMAILS.length > 0 }));
app.use('/api', requireFamily);

app.get('/api/teams', (_req, res) => {
  const data = Object.entries(TEAM_META).map(([id, meta]) => ({
    id: Number(id), abbreviation: meta[0], full_name: meta[1], conference: meta[2], division: meta[3]
  }));
  res.json({ data, source: 'NBA team directory' });
});

app.get('/api/players', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page || req.query.cursor) || 1);
    const rows = (await cached(`players:${seasonFor()}`, () => nba('commonallplayers', {
      LeagueID: '00', Season: seasonFor(), IsOnlyCurrentSeason: '0'
    }), 12 * 60 * 60 * 1000))[0] || [];
    const filtered = rows.filter(p => !search || String(p.DISPLAY_FIRST_LAST || p.DISPLAY_LAST_COMMA_FIRST || '').toLowerCase().includes(search));
    const data = filtered.slice((page - 1) * 100, page * 100).map(p => ({
      id: p.PERSON_ID, first_name: String(p.DISPLAY_FIRST_LAST || '').split(' ').slice(0,-1).join(' '),
      last_name: String(p.DISPLAY_FIRST_LAST || '').split(' ').slice(-1)[0], position: p.ROSTERSTATUS === 1 ? 'Ativo' : '—',
      team: { abbreviation: p.TEAM_ABBREVIATION || '—' }, is_active: p.ROSTERSTATUS === 1
    }));
    res.json({ data, meta: { next_cursor: (page * 100 < filtered.length) ? String(page + 1) : null, total_count: filtered.length } });
  } catch (e) {
    try {
      const all = await cached('espn:active-players', espnPlayers, 30 * 60 * 1000);
      const filtered = all.filter(p => !search || `${p.first_name} ${p.last_name}`.toLowerCase().includes(search));
      res.json({ data: filtered.slice((page - 1) * 100, page * 100), meta: { next_cursor: page * 100 < filtered.length ? String(page + 1) : null, total_count: filtered.length }, source: 'ESPN rosters' });
    } catch (fallbackError) { res.status(503).json({ error: `Elenco indisponível. NBA Stats: ${e.message} ESPN: ${fallbackError.message}` }); }
  }
});

app.get('/api/games', async (req, res) => {
  const start = String(req.query.start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0,10));
  const end = String(req.query.end || new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10));
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return res.status(400).json({ error: 'Período de datas inválido.' });
    const span = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    if (span > 90) return res.status(400).json({ error: 'Consulte no máximo 90 dias por vez.' });
    let data = await cached(`games:${start}:${end}`, async () => {
      const days = Array.from({ length: span }, (_, i) => new Date(new Date(start + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0,10));
      const all = [];
      for (let i = 0; i < days.length; i += 4) {
        const batch = await Promise.all(days.slice(i, i + 4).map(async day => {
          const sets = await nba('scoreboardv2', { LeagueID: '00', GameDate: day, DayOffset: 0 });
          const games = sets.find(rows => rows[0]?.GAME_ID) || [];
          const lines = sets.flat();
          return games.map(g => {
            const teams = lines.filter(x => x.TEAM_ID && String(x.GAME_ID) === String(g.GAME_ID));
            const home = teams.find(x => x.TEAM_ID === g.HOME_TEAM_ID), away = teams.find(x => x.TEAM_ID === g.VISITOR_TEAM_ID);
            const team = (row, id) => ({ id, abbreviation: row?.TEAM_ABBREVIATION || '—', full_name: row?.TEAM_NAME || row?.TEAM_ABBREVIATION || '—' });
            const status = Number(g.GAME_STATUS_ID) === 3 ? 'Final' : Number(g.GAME_STATUS_ID) === 2 ? 'Em andamento' : 'Agendado';
            return { id: g.GAME_ID, date: g.GAME_DATE_EST || day, datetime: g.GAME_DATE_EST || day, status, status_state: status === 'Final' ? 'final' : status === 'Em andamento' ? 'in_progress' : 'scheduled',
              home_team: team(home, g.HOME_TEAM_ID), visitor_team: team(away, g.VISITOR_TEAM_ID),
              home_team_score: Number(g.GAME_STATUS_ID) === 1 ? null : (home?.PTS ?? null), visitor_team_score: Number(g.GAME_STATUS_ID) === 1 ? null : (away?.PTS ?? null) };
          });
        }));
        all.push(...batch.flat());
      }
      return all.sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
    }, 15 * 1000);
    const today = new Date().toISOString().slice(0,10);
    if (start <= today && end >= today) {
      try {
        const liveToday = await cached(`live-scoreboard:${today}`, () => espnGames(today, today), 15 * 1000);
        const byId = new Map(data.map(g => [String(g.id), g]));
        liveToday.forEach(g => byId.set(String(g.id), g));
        data = [...byId.values()].sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
      } catch { /* O placar principal continua disponível se o feed ao vivo falhar. */ }
    }
    res.json({ data, updatedAt: new Date().toISOString(), liveUpdatedAt: new Date().toISOString() });
  } catch (e) {
    try {
      const data = await cached(`cdn-games:${start}:${end}`, () => nbaCdnGames(start, end), 15 * 1000);
      res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA CDN schedule', fallback: true });
    } catch (fallbackError) {
      try { const data = await cached(`espn-games:${start}:${end}`, () => espnGames(start, end), 15 * 1000); res.json({ data, updatedAt: new Date().toISOString(), source: 'ESPN scoreboard', fallback: true }); }
      catch (espnError) { res.status(503).json({ error: `Calendário indisponível. NBA Stats: ${e.message} NBA CDN: ${fallbackError.message} ESPN: ${espnError.message}` }); }
    }
  }
});

app.get('/api/games/:id/stats', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^\d{8,12}$/.test(id)) return res.status(400).json({ error: 'ID de partida inválido.' });
    const data = await cached(`boxscore:${id}`, () => getGameBoxscore(id), 30 * 1000);
    res.json({ data, updatedAt: new Date().toISOString() });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/rankings/recent', async (_req, res) => {
  try {
    const rows = (await cached(`last5:${seasonFor()}`, () => nba('leaguedashplayerstats', {
      ...playerDashFilters(), LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season', PerMode: 'PerGame',
      LastNGames: '5', MeasureType: 'Base', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 2 * 60 * 1000))[0] || [];
    const data = rows.map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { abbreviation: r.TEAM_ABBREVIATION },
      gamesPlayed: r.GP, pts: r.PTS, reb: r.REB, ast: r.AST, stl: r.STL, blk: r.BLK,
      fg_pct: r.FG_PCT, fg3_pct: r.FG3_PCT
    })).sort((a,b) => Number(b.pts || 0) - Number(a.pts || 0));
    res.json({ data, updatedAt: new Date().toISOString(), source: 'NBA Stats', period: 'Last 5 games' });
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
    const data = rows.map(r => ({
      player: { id: r.PLAYER_ID, first_name: String(r.PLAYER_NAME || '').split(' ').slice(0,-1).join(' '), last_name: String(r.PLAYER_NAME || '').split(' ').slice(-1)[0] },
      team: { abbreviation: r.TEAM_ABBREVIATION },
      gp: r.GP, pts: r.PTS, reb: r.REB, ast: r.AST, stl: r.STL, blk: r.BLK, fg_pct: r.FG_PCT, fg3_pct: r.FG3_PCT
    })).filter(r => Number(r.gp) >= 1).sort((a,b) => Number(b.pts || 0) - Number(a.pts || 0));
    res.json({ data: data.slice(0,100), leader: data[0] || null, season, method: 'Líderes estatísticos da temporada regular NBA por pontos por jogo; não representa votação oficial do prêmio NBA MVP.' });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/standings', async (_req, res) => {
  try {
    const rows = (await cached(`standings:${seasonFor()}`, () => nba('leaguestandings', {
      LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season'
    }), 2 * 60 * 1000))[0] || [];
    const data = rows.map(r => ({
      team: { id: r.TeamID, full_name: r.TeamName, name: r.TeamName, abbreviation: TEAM_META[Number(r.TeamID)]?.[0] || r.TeamAbbreviation, conference: r.Conference || TEAM_META[Number(r.TeamID)]?.[2] },
      wins: r.WINS, losses: r.LOSSES, win_pct: r.WIN_PCT
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
