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
const BDL_KEY = process.env.BALLDONTLIE_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const FAMILY_EMAILS = (process.env.FAMILY_EMAILS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const CACHE_MS = Number(process.env.API_CACHE_MS) || 60000;
const cache = new Map();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s=>s.trim()) : false, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.value);
  return fn().then(value => { cache.set(key, {at:Date.now(), value}); return value; });
}
async function bdl(endpoint) {
  if (!BDL_KEY) { const e = new Error('BALLDONTLIE_API_KEY não configurada no Render.'); e.status=503; throw e; }
  const response = await fetch(`https://api.balldontlie.io/v1${endpoint}`, {headers:{Authorization:BDL_KEY}, signal:AbortSignal.timeout(20000)});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const e = new Error(body?.error || body?.errors?.[0]?.error || `BALLDONTLIE ${response.status}`);
    e.status=response.status;
    if (response.status===401) e.message='BALLDONTLIE 401: chave inválida ou seu plano não libera este endpoint. Verifique o plano NBA.';
    if (response.status===429) e.message='Limite de requisições da BALLDONTLIE atingido. Aguarde um minuto.';
    throw e;
  }
  return body;
}
async function allPages(endpoint, maxPages=30) {
  let cursor, out=[];
  for(let i=0;i<maxPages;i++) {
    const join = endpoint.includes('?') ? '&' : '?';
    const data = await bdl(`${endpoint}${join}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    out.push(...(data.data || []));
    cursor=data.meta?.next_cursor;
    if (!cursor) break;
  }
  return out;
}
async function requireFamily(req,res,next) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({error:'Configure SUPABASE_URL e SUPABASE_ANON_KEY no Render.'});
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({error:'Faça login para continuar.'});
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {headers:{apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(10000)});
    if (!response.ok) return res.status(401).json({error:'Sessão inválida ou expirada. Entre novamente.'});
    const user = await response.json();
    const email = (user.email || '').toLowerCase();
    if (!FAMILY_EMAILS.length) return res.status(503).json({error:'Configure FAMILY_EMAILS no Render com os e-mails da família antes de liberar o acesso.'});
    if (!FAMILY_EMAILS.includes(email)) return res.status(403).json({error:'Este e-mail não está autorizado para o Courtside Family.'});
    req.user={id:user.id,email};
    next();
  } catch (e) { res.status(401).json({error:'Não foi possível validar sua sessão.'}); }
}
app.get('/api/health', (_req,res)=>res.json({ok:true, nbaKeyConfigured:Boolean(BDL_KEY), supabaseConfigured:Boolean(SUPABASE_URL&&SUPABASE_KEY), familyAllowlistEnabled:FAMILY_EMAILS.length>0}));
app.use('/api', requireFamily);

app.get('/api/teams', async (_req,res)=>{try{res.json({data:await cached('teams',()=>bdl('/teams').then(x=>x.data||[]))});}catch(e){res.status(e.status||502).json({error:e.message});}});
app.get('/api/players', async (req,res)=>{try{
  const params=new URLSearchParams({per_page:'100'}); if(req.query.cursor)params.set('cursor',String(req.query.cursor)); if(req.query.search)params.set('search',String(req.query.search).slice(0,80));
  if(req.query.team_id)params.append('team_ids[]',String(req.query.team_id));
  const result=await cached(`players:${params}`,()=>bdl(`/players?${params}`)); res.json(result);
}catch(e){res.status(e.status||502).json({error:e.message});}});
app.get('/api/games', async (req,res)=>{try{
  const start=String(req.query.start||new Date(Date.now()-7*86400000).toISOString().slice(0,10));
  const end=String(req.query.end||new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end))return res.status(400).json({error:'Datas inválidas.'});
  const data=await cached(`games:${start}:${end}`,()=>allPages(`/games?start_date=${start}&end_date=${end}`,20));
  res.json({data:data.sort((a,b)=>new Date(a.datetime||a.date)-new Date(b.datetime||b.date)),updatedAt:new Date().toISOString()});
}catch(e){res.status(e.status||502).json({error:e.message});}});
app.get('/api/games/:id/stats', async (req,res)=>{try{
  const id=Number(req.params.id); if(!Number.isInteger(id))return res.status(400).json({error:'ID de jogo inválido.'});
  const data=await cached(`game-stats:${id}`,()=>allPages(`/stats?game_ids[]=${id}`,10));
  res.json({data,updatedAt:new Date().toISOString()});
}catch(e){res.status(e.status||502).json({error:e.message,requiredPlan:'ALL-STAR ou superior para Game Player Stats'});}});
app.get('/api/rankings/recent', async (req,res)=>{try{
  const days=Math.min(60,Math.max(15,Number(req.query.days)||45));
  const end=new Date(); const start=new Date(Date.now()-days*86400000);
  const from=start.toISOString().slice(0,10), to=end.toISOString().slice(0,10);
  const games=await allPages(`/games?start_date=${from}&end_date=${to}`,20);
  const finished=games.filter(g=>g.status_state==='final'||String(g.status||'').toLowerCase()==='final').sort((a,b)=>new Date(b.datetime||b.date)-new Date(a.datetime||a.date));
  const gameIds=finished.slice(0,100).map(g=>g.id);
  if(!gameIds.length)return res.json({data:[],gamesScanned:0,updatedAt:new Date().toISOString()});
  let stats=[];
  for(let i=0;i<gameIds.length;i+=10){ const ids=gameIds.slice(i,i+10).map(id=>`game_ids[]=${id}`).join('&'); stats.push(...await allPages(`/stats?${ids}`,20)); }
  const byPlayer=new Map();
  for(const row of stats){const pid=row.player?.id;if(!pid)continue;const arr=byPlayer.get(pid)||[];arr.push(row);byPlayer.set(pid,arr);}
  const result=[];
  for(const rows of byPlayer.values()){
    rows.sort((a,b)=>new Date(b.game?.datetime||b.game?.date)-new Date(a.game?.datetime||a.game?.date));
    const last=rows.slice(0,5); if(!last.length)continue;
    const avg=k=>last.reduce((s,r)=>s+(Number(r[k])||0),0)/last.length;
    const sum=k=>last.reduce((s,r)=>s+(Number(r[k])||0),0);
    const fgm=sum('fgm'),fga=sum('fga'),fg3m=sum('fg3m'),fg3a=sum('fg3a');
    result.push({player:last[0].player,team:last[0].team,gamesPlayed:last.length,pts:avg('pts'),reb:avg('reb'),ast:avg('ast'),stl:avg('stl'),blk:avg('blk'),fg_pct:fga?fgm/fga:0,fg3_pct:fg3a?fg3m/fg3a:0,min:last.map(r=>r.min).join(', '),lastGames:last.map(r=>({date:r.game?.date,gameId:r.game?.id,pts:r.pts,reb:r.reb,ast:r.ast,stl:r.stl,blk:r.blk}))});
  }
  res.json({data:result,gamesScanned:gameIds.length,updatedAt:new Date().toISOString(),windowDays:days});
}catch(e){res.status(e.status||502).json({error:e.message,requiredPlan:'ALL-STAR ou superior para Game Player Stats'});}});
app.get('/api/mvp', async (req,res)=>{try{
  const season=Number(req.query.season)||new Date().getUTCFullYear()-(new Date().getUTCMonth()<9?1:0);
  const result=await cached(`mvp:${season}`,()=>allPages(`/season_averages/general?season=${season}&season_type=regular&type=base`,20));
  const rows=(result||[]).map(x=>({player:x.player,season:x.season,...x.stats})).filter(x=>Number(x.gp)>=10);
  rows.sort((a,b)=>Number(b.pts||0)+Number(b.reb||0)*0.7+Number(b.ast||0)*1.1+Number(b.stl||0)*1.5+Number(b.blk||0)*1.5-(Number(a.pts||0)+Number(a.reb||0)*0.7+Number(a.ast||0)*1.1+Number(a.stl||0)*1.5+Number(a.blk||0)*1.5));
  res.json({data:rows.slice(0,100),leader:rows[0]||null,season,method:'Líder estatístico calculado a partir das médias oficiais da fonte; não representa votação oficial do prêmio NBA MVP.'});
}catch(e){res.status(e.status||502).json({error:e.message,requiredPlan:'GOAT necessário para Season Averages; ALL-STAR não libera esse endpoint.'});}});
app.get('/api/standings', async (_req,res)=>{try{const data=await cached('standings',()=>bdl('/team_standings').then(x=>x.data||[]));res.json({data});}catch(e){res.status(e.status||502).json({error:e.message,requiredPlan:'GOAT necessário para Team Standings'});}});
app.get('/api/injuries', async (_req,res)=>{try{const data=await cached('injuries',()=>allPages('/player_injuries',10));res.json({data});}catch(e){res.status(e.status||502).json({error:e.message});}});

const limiter=new Map();
app.use(express.static(distPath));
app.get('*',(req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(path.join(distPath,'index.html'));});
app.listen(PORT,'0.0.0.0',()=>console.log(`Courtside Family ativo na porta ${PORT}`));
