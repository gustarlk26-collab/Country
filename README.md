# Courtside Family

Painel privado de NBA com React, Express e Supabase. O backend consulta **NBA Stats** e **NBA Live CDN**; não depende mais de uma chave paga da BALLDONTLIE.

## Recursos implementados

- Login Supabase e validação de sessão no backend.
- Lista pesquisável e paginada de jogadores.
- Calendário NBA por intervalo de datas (até 90 dias por consulta).
- Box score por partida a partir da NBA Live CDN.
- Ranking de médias dos últimos cinco jogos usando NBA Stats.
- Líderes estatísticos da temporada regular (ordenados por pontos por jogo; não é o prêmio oficial NBA MVP).
- Classificação das equipes.
- Favoritos e preferências de idioma/tema por usuário no Supabase.
- Interface em português, inglês e espanhol.

## Fonte de dados e limitações

O projeto usa endpoints públicos de NBA Stats (`stats.nba.com/stats`) e NBA Live CDN (`cdn.nba.com/static/json/liveData`). Não é necessária chave BALLDONTLIE ou outra chave NBA.

Esses endpoints não constituem uma API pública com SLA: a NBA pode aplicar bloqueios temporários, limites de frequência, mudanças de formato ou atrasos. O servidor usa cache e mensagens de erro; não inventa estatísticas quando a fonte não responde. Jogos futuros não possuem box score até que a NBA publique os dados.

- NBA Stats: https://www.nba.com/stats/
- NBA Live CDN scoreboard: https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json

## Supabase

1. No Supabase, abra **SQL Editor**.
2. Execute o esquema em `supabase/schema.sql` (se essa pasta estiver presente no repositório).
3. Em **Authentication → URL Configuration**, configure a URL do serviço Render como Site URL e Redirect URL.
4. Configure os usuários da família em Authentication.

As tabelas `favorites` e `user_settings` devem ter RLS habilitado e políticas limitadas a `auth.uid() = user_id`.

## Render — variáveis de ambiente

Configure no serviço Render:

| Variável | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase terminada em `.supabase.co` |
| `SUPABASE_ANON_KEY` | Chave pública/anon do Supabase |
| `VITE_SUPABASE_URL` | Mesma URL do projeto Supabase, usada pelo frontend |
| `VITE_SUPABASE_ANON_KEY` | Mesma chave pública/anon, usada pelo frontend |
| `FAMILY_EMAILS` | E-mails autorizados separados por vírgula |
| `CORS_ORIGIN` | Domínio do app no Render |
| `API_CACHE_MS` | Cache em milissegundos (opcional; padrão 90000) |

**Remova `BALLDONTLIE_API_KEY` do Render:** o backend não usa mais essa variável. Nunca coloque chaves secretas em variáveis `VITE_*` nem envie segredos pelo chat.

`FAMILY_EMAILS` é obrigatório para liberar as rotas de dados. Exemplo: `email1@exemplo.com,email2@exemplo.com`.

## Build e start

- Build Command: `npm install --no-audit --no-fund && npm run build && npm run test:qa && node --check server/index.js`
- Start Command: `npm start`
- Node: 20 ou superior

Após configurar as variáveis, faça **Manual Deploy → Deploy latest commit** no Render.

## Segurança

- As rotas `/api/*` exigem token Supabase válido.
- `FAMILY_EMAILS` restringe o acesso aos membros da família.
- Favoritos e preferências devem permanecer isolados por RLS.
- A chave pública Supabase é destinada ao cliente; a segurança depende das políticas RLS.
- O repositório público não deve conter arquivos `.env` nem credenciais.

## Desenvolvimento local

Copie `.env.example` para `.env`, configure as variáveis e execute:

```bash
npm install
npm run build
npm start
```

Para desenvolvimento com Vite, rode `npm run dev`; o proxy encaminha `/api` para `localhost:10000`.
