-- Migration 0004: realtime nas tabelas operacionais + bloqueio suave de edicao (multiusuario)
do $$
declare t text;
begin
  foreach t in array array['orders','order_items','stock_movements','stock_imports','stock_balances','production_runs','production_run_items','customers','products','product_aliases','order_imports','customer_interactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

create table if not exists public.edit_locks (
  resource text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);
alter table public.edit_locks enable row level security;
drop policy if exists "auth_all" on public.edit_locks;
create policy "auth_all" on public.edit_locks for all to authenticated using (true) with check (true);
grant all on public.edit_locks to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'edit_locks') then
    alter publication supabase_realtime add table public.edit_locks;
  end if;
end $$;
