# E-mails de autenticação (Supabase + Resend)

## 1. SMTP (Supabase → Authentication → SMTP Settings → Enable Custom SMTP)

| Campo | Valor |
|---|---|
| Sender email | `noreply@isaindalimentos.com.br` |
| Sender name | `ISA Alimentos` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | chave de API do Resend (`re_...`, permissão de envio no domínio `isaindalimentos.com.br`) |

Depois de salvar, em **Authentication → Rate Limits** aumente "Emails per hour" se necessário (padrão 30).

## 2. URLs (Supabase → Authentication → URL Configuration)

- Site URL: `https://app.isaindalimentos.com.br`
- Redirect URLs: `https://app.isaindalimentos.com.br/**`, `https://isaalimentos-web.vercel.app/**`, `http://localhost:5173/**`

## 3. Templates (Supabase → Authentication → Email Templates)

Cole o conteúdo de cada arquivo desta pasta no template correspondente:

| Template no Supabase | Arquivo | Assunto sugerido |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirme seu cadastro na ISA Alimentos |
| Reset password | `reset-password.html` | Redefina sua senha da ISA Alimentos |
| Magic link | `magic-link.html` | Seu link de acesso à ISA Alimentos |
| Invite user | `invite.html` | Você foi convidado para a ISA Alimentos |
| Change email address | `change-email.html` | Confirme seu novo e-mail na ISA Alimentos |

Todos usam as variáveis padrão do Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`).
