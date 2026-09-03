// Web Push: envia notificacao para as assinaturas cadastradas quando um evento importante acontece.
// Chamada por Database Webhook (insert em activities) ou manualmente. Segredo: PUSH_WEBHOOK_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
webpush.setVapidDetails('mailto:noreply@isaindalimentos.com.br', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const IMPORTANT = /acesso|pendente|abaixo do m|conclu|baixa|importad|Backup/i;

Deno.serve(async (req) => {
  if (secret && req.headers.get('x-webhook-secret') !== secret) return new Response('unauthorized', { status: 401 });
  const payload = await req.json().catch(() => ({}));
  const record = payload.record ?? payload;
  const title: string = record.title ?? 'ISA Alimentos';
  const body: string = record.body ?? '';
  const link: string = record.link ?? '/';
  const audience: string[] = record.audience ?? [];
  // Boas-vindas: disparado pelo trigger em push_subscriptions, vai so para o aparelho recem-cadastrado.
  const onlySub: string | undefined = payload.subscription_id;
  if (!onlySub && payload.type === 'INSERT' && !IMPORTANT.test(title) && record.kind !== 'mensagem') return new Response(JSON.stringify({ skipped: true }), { headers: { 'Content-Type': 'application/json' } });

  const admin = createClient(url, serviceKey);
  let q = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id, profiles!inner(role, access, status)');
  if (onlySub) q = q.eq('id', onlySub);
  const { data: subs } = await q;
  const targets = onlySub ? (subs ?? []) : (subs ?? []).filter((s: any) => s.profiles?.status === 'ativo' && (!audience.length || audience.includes(s.profiles.role) || (audience.includes('admin') && s.profiles.access === 'admin')) && s.user_id !== record.actor_id);
  let sent = 0;
  const dead: string[] = [];
  for (const s of targets) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, link, icon: '/icon-192.png', badge: '/icon-192.png' }), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return new Response(JSON.stringify({ sent, removed: dead.length }), { headers: { 'Content-Type': 'application/json' } });
});
