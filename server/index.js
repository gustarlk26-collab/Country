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
  return teams.flatMap(team => (team.players || []).filter(p => p.status !== 'INACTIVE').map(p => ({
    id: p.personId, player: { id: p.personId, first_name: p.name?.split(' ').slice(0,-1).join(' ') || p.name, last_name: p.name?.split(' ').slice(-1)[0] || '', position: p.position },
    team: { id: team.teamId, abbreviation: team.teamTricode, full_name: team.teamName },
    min: p.statistics?.minutes || '0', pts: p.statistics?.points ?? 0, reb: p.statistics?.reboundsTotal ?? 0,
    ast: p.statistics?.assists ?? 0, stl: p.statistics?.steals ?? 0, blk: p.statistics?.blocks ?? 0,
    fg_pct: p.statistics?.fieldGoalsAttempted ? p.statistics.fieldGoalsMade / p.statistics.fieldGoalsAttempted : 0,
    fg3_pct: p.statistics?.threePointersAttempted ? p.statistics.threePointersMade / p.statistics.threePointersAttempted : 0,
    turnover: p.statistics?.turnovers ?? 0
  })));
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
app.get('/api/health', (_req, res) => res.json({ ok: true, dataSource: 'NBA Stats + NBA Live CDN', supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY), familyAllowlistEnabled: FAMILY_EMAILS.length > 0 }));
app.use('/api', requireFamily);

app.get('/api/teams', async (_req, res) => {
  try {
    const rows = (await cached('teams', () => nba('leaguedashteamstats', {
      LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season', PerMode: 'PerGame',
      MeasureType: 'Base', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N'
    }), 6 * 60 * 60 * 1000))[0] || [];
    const data = rows.map(r => ({ id: r.TEAM_ID, full_name: r.TEAM_NAME, abbreviation: r.TEAM_ABBREVIATION, conference: r.CONFERENCE, division: r.DIVISION }));
    res.json({ data });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/players', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
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
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/games', async (req, res) => {
  try {
    const start = String(req.query.start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0,10));
    const end = String(req.query.end || new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return res.status(400).json({ error: 'Período de datas inválido.' });
    const span = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    if (span > 90) return res.status(400).json({ error: 'Consulte no máximo 90 dias por vez.' });
    const data = await cached(`games:${start}:${end}`, async () => {
      const days = Array.from({ length: span }, (_, i) => new Date(new Date(start + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0,10));
      const all = [];
      for (let i = 0; i < days.length; i += 4) {
        const batch = await Promise.all(days.slice(i, i + 4).map(async day => {
          const sets = await nba('scoreboardv2', { LeagueID: '00', GameDate: day, DayOffset: 0 });
          const headers = sets;
          const games = headers.find(rows => rows[0]?.GAME_ID)?.map(r => r) || [];
          const lines = (await nba('scoreboardv2', { LeagueID: '00', GameDate: day, DayOffset: 0 })).flat();
          return games.map(g => {
            const teams = lines.filter(x => x.TEAM_ID && String(x.GAME_ID) === String(g.GAME_ID));
            const home = teams.find(x => x.TEAM_ID === g.HOME_TEAM_ID), away = teams.find(x => x.TEAM_ID === g.VISITOR_TEAM_ID);
            const team = (row, id) => ({ id, abbreviation: row?.TEAM_ABBREVIATION || '—', full_name: row?.TEAM_NAME || row?.TEAM_ABBREVIATION || '—' });
            const status = Number(g.GAME_STATUS_ID) === 3 ? 'Final' : Number(g.GAME_STATUS_ID) === 2 ? 'Em andamento' : 'Agendado';
            return { id: g.GAME_ID, date: g.GAME_DATE_EST || day, datetime: g.GAME_DATE_EST || day, status, status_state: status === 'Final' ? 'final' : status === 'Em andamento' ? 'in_progress' : 'scheduled',
              home_team: team(home, g.HOME_TEAM_ID), visitor_team: team(away, g.VISITOR_TEAM_ID),
              home_team_score: home?.PTS ?? 0, visitor_team_score: away?.PTS ?? 0 };
          });
        }));
        all.push(...batch.flat());
      }
      return all.sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
    }, 2 * 60 * 1000);
    res.json({ data, updatedAt: new Date().toISOString() });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/games/:id/stats', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^\d{10}$/.test(id)) return res.status(400).json({ error: 'ID de partida inválido.' });
    const data = await cached(`boxscore:${id}`, () => nbaLiveBoxscore(id), 30 * 1000);
    res.json({ data, updatedAt: new Date().toISOString() });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.get('/api/rankings/recent', async (_req, res) => {
  try {
    const rows = (await cached(`last5:${seasonFor()}`, () => nba('leaguedashplayerstats', {
      LeagueID: '00', Season: seasonFor(), SeasonType: 'Regular Season', PerMode: 'PerGame',
      LastNGames: '5', MeasureType: 'Base', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 10 * 60 * 1000))[0] || [];
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
      LeagueID: '00', Season: season, SeasonType: 'Regular Season', PerMode: 'PerGame',
      MeasureType: 'Base', LastNGames: '0', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
      Month: '0', Period: '0', GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: ''
    }), 15 * 60 * 1000))[0] || [];
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
    }), 10 * 60 * 1000))[0] || [];
    const data = rows.map(r => ({
      team: { id: r.TeamID, full_name: r.TeamName, name: r.TeamName, abbreviation: r.TeamAbbreviation, conference: r.Conference },
      wins: r.WINS, losses: r.LOSSES, win_pct: r.WIN_PCT
    }));
    res.json({ data });
  } catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

const limiter = new Map();
app.use(express.static(distPath));
app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); res.sendFile(path.join(distPath, 'index.html')); });
app.listen(PORT, '0.0.0.0', () => console.log(`Courtside Family ativo na porta ${PORT}`));
