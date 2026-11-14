# Courtside Family — versão funcional

Aplicação React + Express + Supabase com autenticação, lista de jogadores, calendário, box score por partida, ranking calculado a partir dos últimos cinco jogos de cada atleta, favoritos, preferências de idioma e painel de líder estatístico da temporada.

## Fonte de dados e limites reais

A fonte integrada é a BALLDONTLIE NBA API. Consulte a tabela oficial de planos: https://docs.balldontlie.io/.

- **Grátis:** equipes, jogadores e jogos; limite publicado de 5 requisições/minuto.
- **ALL-STAR:** libera estatísticas individuais por jogo e jogadores ativos (preço publicado: US$ 9,99/mês).
- **GOAT:** libera médias da temporada e endpoints adicionais (preço publicado: US$ 39,99/mês).

Para ter box score de todos os atletas, ranking real dos últimos cinco jogos e o líder estatístico de temporada, a chave NBA precisa ter acesso aos endpoints correspondentes. O projeto não inventa números se a API negar acesso. O plano GOAT é necessário para a rota de médias da temporada usada pelo líder estatístico. O prêmio oficial NBA MVP só é decidido após a temporada; o painel apresenta o líder estatístico calculado, não afirma que a NBA já anunciou o vencedor.

## 1. Supabase

1. Abra o projeto Supabase.
2. Vá em **SQL Editor**.
3. Abra `supabase/schema.sql` deste pacote, copie tudo e execute.
4. Em **Authentication → URL Configuration**, configure a URL do Render como Site URL e Redirect URL.
5. Confirme os e-mails da família no Auth, conforme sua configuração de confirmação de e-mail.

As tabelas `favorites` e `user_settings` usam RLS e cada usuário só acessa os próprios registros.

## 2. Render — Environment

Mantenha o serviço atual e configure estas variáveis em **Render → courtside-nba-9pgo → Environment**:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://uwuiccwtzbtrnbsxryxu.supabase.co` |
| `SUPABASE_ANON_KEY` | sua chave pública/anon do Supabase |
| `VITE_SUPABASE_URL` | mesma URL acima |
| `VITE_SUPABASE_ANON_KEY` | mesma chave pública/anon acima |
| `BALLDONTLIE_API_KEY` | sua chave BALLDONTLIE (somente no Render, nunca no navegador) |
| `FAMILY_EMAILS` | e-mails permitidos separados por vírgula |
| `CORS_ORIGIN` | `https://courtside-nba-9pgo.onrender.com` |
| `API_CACHE_MS` | `60000` |

Não coloque a chave secreta BALLDONTLIE em variáveis que começam com `VITE_`. Não envie chaves pelo chat. Como a chave anteriormente compartilhada pode ter ficado exposta, gere outra no painel BALLDONTLIE e atualize somente no Render.

`FAMILY_EMAILS` é obrigatório: sem essa lista, o servidor bloqueia o acesso aos dados. Exemplo: `seuemail@exemplo.com,emaildopai@exemplo.com`.

## 3. Build e start no Render

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Runtime: Node 20 ou superior

Depois salve as variáveis e faça **Manual Deploy → Deploy latest commit**.

## 4. Primeiro acesso

Abra `https://courtside-nba-9pgo.onrender.com`, crie/valide as contas Supabase e entre com um e-mail incluído em `FAMILY_EMAILS`. O cadastro no Supabase pode exigir confirmação do e-mail. As rotas `/api/*` validam o token Supabase e a lista de e-mails autorizados.

## 5. Desenvolvimento local

Copie `.env.example` para `.env`, preencha as variáveis e rode:

```bash
npm install
npm run build
npm start
```

Para desenvolvimento com Vite, em outro terminal rode `npm run dev`; o proxy encaminha `/api` para `localhost:10000`.

## Recursos

- Login Supabase; o servidor valida o token em todas as rotas de dados.
- Lista de jogadores paginada e pesquisa.
- Calendário de jogos por intervalo de datas, com atualização automática a cada minuto enquanto o painel está aberto.
- Box score de todos os jogadores retornados pela API para uma partida.
- Ranking de médias dos últimos cinco jogos de cada jogador encontrado na janela consultada.
- Líder estatístico da temporada com médias da API; não é votação oficial do prêmio MVP.
- Times; tenta carregar classificação quando o plano permitir e, caso contrário, mostra as 30 franquias da fonte.
- Favoritos e idioma/tema salvos por usuário no Supabase.
- Português, inglês e espanhol.

## Segurança

- A chave BALLDONTLIE só existe no backend.
- Todas as rotas de dados exigem token Supabase válido.
- `FAMILY_EMAILS` limita acesso aos membros da família.
- RLS isola favoritos e preferências por `auth.uid()`.
- Defina `CORS_ORIGIN` com o domínio real do Render.

A privacidade do repositório GitHub não substitui a autenticação do aplicativo. Não compartilhe o arquivo `.env`.
