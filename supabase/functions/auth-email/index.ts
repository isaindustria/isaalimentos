// Supabase Auth "Send Email" hook -> Resend, with ISA branded templates.
// Enable in: Authentication -> Hooks -> Send Email -> this function.
// Secrets: RESEND_API_KEY, SEND_EMAIL_HOOK_SECRET (value shown by Supabase when enabling the hook).
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const HOOK_SECRET = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
const FROM = Deno.env.get('AUTH_EMAIL_FROM') ?? 'ISA Alimentos <noreply@isaindalimentos.com.br>';
const SITE = Deno.env.get('AUTH_SITE_URL') ?? 'https://app.isaindalimentos.com.br';

type Kind = 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | 'email_change_new' | 'reauthentication';

const COPY: Record<string, { subject: string; title: string; body: (d: Record<string, string>) => string; cta: string; foot: string }> = {
  signup: {
    subject: 'Confirme seu cadastro na ISA Alimentos',
    title: 'Confirme seu cadastro',
    body: (d) => `Olá! Falta um passo para usar o sistema da ISA Alimentos com o e-mail <b>${d.email}</b>. Confirme que este endereço é seu.`,
    cta: 'Confirmar cadastro',
    foot: 'Se você não criou esta conta, pode ignorar esta mensagem.',
  },
  recovery: {
    subject: 'Redefina sua senha da ISA Alimentos',
    title: 'Redefina sua senha',
    body: (d) => `Recebemos um pedido para trocar a senha da conta <b>${d.email}</b>. Clique abaixo para escolher uma senha nova.`,
    cta: 'Criar nova senha',
    foot: 'O link vale por pouco tempo. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.',
  },
  magiclink: {
    subject: 'Seu link de acesso à ISA Alimentos',
    title: 'Seu link de acesso',
    body: () => 'Use o botão abaixo para entrar no sistema da ISA Alimentos sem digitar senha.',
    cta: 'Entrar no sistema',
    foot: 'O link é de uso único e expira em breve. Se não foi você quem pediu, ignore esta mensagem.',
  },
  invite: {
    subject: 'Você foi convidado para a ISA Alimentos',
    title: 'Você foi convidado',
    body: () => 'Você recebeu acesso ao sistema de gestão da ISA Alimentos: estoque, pedidos das lojas e ordem de produção em um só lugar. Aceite o convite para criar sua senha.',
    cta: 'Aceitar convite',
    foot: 'Se você não esperava este convite, pode ignorar esta mensagem.',
  },
  email_change: {
    subject: 'Confirme seu novo e-mail na ISA Alimentos',
    title: 'Confirme seu novo e-mail',
    body: (d) => `Você pediu para trocar o e-mail da sua conta para <b>${d.newEmail || d.email}</b>. Confirme para concluir a alteração.`,
    cta: 'Confirmar novo e-mail',
    foot: 'Se você não pediu essa alteração, ignore este e-mail e sua conta continuará como está.',
  },
  reauthentication: {
    subject: 'Seu código de confirmação · ISA Alimentos',
    title: 'Código de confirmação',
    body: (d) => `Use o código <b style="font-size:22px;letter-spacing:.2em">${d.token}</b> para confirmar a ação no sistema.`,
    cta: 'Abrir o sistema',
    foot: 'O código expira em poucos minutos.',
  },
};

function html(k: string, d: Record<string, string>) {
  const c = COPY[k] ?? COPY.magiclink;
  const url = d.url || SITE;
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f1ee;font-family:Rubik,Inter,Arial,sans-serif;color:#241b1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;">
<tr><td style="height:8px;background:linear-gradient(90deg,#e21420 0 55%,#3fa33f 55% 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 36px 8px;"><img src="https://isaindalimentos.com.br/brand/logo-512.png" width="64" height="56" alt="ISA Alimentos" style="display:block;border:0;"></td></tr>
<tr><td style="padding:8px 36px 0;"><h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:800;">${c.title}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:#6f625e;">${c.body(d)}</p></td></tr>
<tr><td style="padding:26px 36px 8px;"><a href="${url}" style="display:inline-block;background:#e21420;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:999px;">${c.cta}</a></td></tr>
<tr><td style="padding:8px 36px 30px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#9a8d88;">Se o botão não abrir, copie este endereço no navegador:<br><a href="${url}" style="color:#e21420;word-break:break-all;">${url}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#9a8d88;">${c.foot}</p></td></tr>
</table>
<p style="margin:18px 0 0;font-size:12px;color:#9a8d88;">ISA Indústria de Alimentos e Temperos · Itaquaquecetuba, SP<br><a href="https://isaindalimentos.com.br" style="color:#9a8d88;">isaindalimentos.com.br</a></p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  try {
    if (!HOOK_SECRET) throw new Error('SEND_EMAIL_HOOK_SECRET não configurado');
    const wh = new Webhook(HOOK_SECRET);
    const data = wh.verify(payload, headers) as {
      user: { email: string; user_metadata?: Record<string, string> };
      email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: Kind; site_url: string; token_new?: string; token_hash_new?: string; new_email?: string };
    };
    const { user, email_data: e } = data;
    const kind = e.email_action_type;
    const siteUrl = (e.site_url || SITE).replace(/\/$/, '');
    const redirect = e.redirect_to || SITE;
    const type = kind === 'signup' ? 'signup' : kind === 'recovery' ? 'recovery' : kind === 'invite' ? 'invite' : kind === 'email_change' ? 'email_change' : 'magiclink';
    const url = `${siteUrl}/auth/v1/verify?token=${encodeURIComponent(e.token_hash)}&type=${type}&redirect_to=${encodeURIComponent(redirect)}`;
    const to = kind === 'email_change' && e.new_email ? e.new_email : user.email;
    const body = html(kind, { email: user.email, newEmail: e.new_email ?? '', url, token: e.token });
    const subject = (COPY[kind] ?? COPY.magiclink).subject;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: body }),
    });
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: { http_code: 500, message: `Resend: ${t}` } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: { http_code: 401, message: (err as Error).message } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
});
