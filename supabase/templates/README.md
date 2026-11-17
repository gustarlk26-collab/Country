# E-mails do Courtside Family

Os modelos HTML desta pasta precisam ser aplicados no painel do Supabase; o deploy do Render/GitHub não altera automaticamente os templates de Auth.

## Aplicar os modelos

1. Abra o projeto no Supabase.
2. Vá para **Authentication → Email Templates**.
3. Em **Confirm signup**, defina o assunto como `Confirme seu acesso ao Courtside Family` e cole o conteúdo de `confirm-signup.html` no campo Body.
4. Em **Reset Password**, defina o assunto como `Redefina sua senha do Courtside Family` e cole o conteúdo de `reset-password.html` no campo Body.
5. Salve e use o botão de envio de teste, se disponível, antes de enviar para usuários.

Os links usam a variável oficial `{{ .ConfirmationURL }}` do Supabase. Não substitua por links fixos nem remova o token de confirmação.

## Para melhorar a entrega

Em **Project Settings → Auth → SMTP Settings**, configure um provedor SMTP com domínio próprio verificado. Ajuste também o nome do remetente para **Courtside Family** e use um endereço do seu domínio. Isso melhora a identidade e a entregabilidade; não é necessário colocar senha SMTP no frontend ou no repositório.

O HTML é responsivo e usa estilos inline para compatibilidade com clientes de e-mail. Sempre teste em Gmail e Outlook antes de considerar o visual final.
