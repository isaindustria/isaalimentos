-- Migration 0008: mensagem de boas-vindas ao ativar notificacoes (trigger em push_subscriptions).
create or replace function public.push_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
declare sec text; nome text;
begin
  select value into sec from private_secrets where key = 'push_webhook';
  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into nome from profiles where id = new.user_id;
  perform net.http_post(
    url := 'https://exbhhwrutvzpwcjxqikp.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', sec),
    body := jsonb_build_object(
      'subscription_id', new.id,
      'record', jsonb_build_object(
        'title', 'Notificações ativadas',
        'body', 'Olá, ' || coalesce(nome, '') || '! Este aparelho vai receber avisos de pedidos, estoque e produção da ISA.',
        'link', '/'))
  );
  return new;
end $$;
revoke execute on function public.push_welcome() from public, anon, authenticated;
drop trigger if exists push_subscriptions_welcome on public.push_subscriptions;
create trigger push_subscriptions_welcome after insert on public.push_subscriptions
  for each row execute function public.push_welcome();
