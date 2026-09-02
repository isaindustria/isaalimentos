-- Migration 0003: operacao manual (movimentacoes de estoque, pedidos manuais),
-- papeis por area, feed de atividades e realtime.

-- ---------------------------------------------------------------------------
-- Papeis por area (gestor, comercial, estoque, producao) alem de admin/operador
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'estoque', 'producao', 'operador'));

-- ---------------------------------------------------------------------------
-- Movimentacoes de estoque (lancamento direto, sem planilha)
-- Cada movimento pertence a importacao vigente; nova importacao "zera" a base.
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.stock_imports(id) on delete cascade,
  product_code text not null references public.products(code) on delete cascade,
  location integer not null default 1,
  quantity numeric not null,            -- positivo entra, negativo sai
  kind text not null default 'ajuste'
    check (kind in ('entrada', 'saida', 'ajuste', 'producao', 'venda', 'perda', 'inventario')),
  reason text,
  reference_type text,                  -- 'order' | 'production_run' | null
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_import_idx on public.stock_movements (import_id, product_code);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);

-- Movimento sempre amarrado a importacao vigente (cria uma base vazia se nao houver)
create or replace function public.attach_current_import()
returns trigger language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  if new.import_id is null then
    select id into cur from public.stock_imports where is_current limit 1;
    if cur is null then
      insert into public.stock_imports (file_name, locations, is_current, imported_by)
      values ('Base manual', '{1,5}', true, new.created_by) returning id into cur;
    end if;
    new.import_id = cur;
  end if;
  return new;
end $$;
drop trigger if exists stock_movements_attach on public.stock_movements;
create trigger stock_movements_attach before insert on public.stock_movements
  for each row execute function public.attach_current_import();

-- Estoque atual = saldos importados + movimentos da importacao vigente
create or replace view public.current_stock as
  with cur as (select id, imported_at from public.stock_imports where is_current limit 1),
  bal as (
    select b.product_code, b.location, sum(b.quantity) as qty
    from public.stock_balances b join cur on cur.id = b.import_id
    group by b.product_code, b.location
    union all
    select m.product_code, m.location, sum(m.quantity)
    from public.stock_movements m join cur on cur.id = m.import_id
    group by m.product_code, m.location
  )
  select
    p.code,
    p.description,
    p.units_per_box,
    p.min_stock,
    coalesce(sum(bal.qty) filter (where bal.location = 1), 0) as location_1,
    coalesce(sum(bal.qty) filter (where bal.location = 5), 0) as location_5,
    coalesce(sum(bal.qty), 0) as total,
    (select imported_at from cur) as imported_at
  from public.products p
  left join bal on bal.product_code = p.code
  where p.active
  group by p.code, p.description, p.units_per_box, p.min_stock;

grant select on public.current_stock to authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos manuais: nada muda no schema; source = 'manual', itens match_status = 'manual'.
-- Ordem de producao: registra quantidade produzida por item e data de conclusao.
-- ---------------------------------------------------------------------------
alter table public.production_runs add column if not exists completed_at timestamptz;
alter table public.production_runs add column if not exists stock_posted boolean not null default false;
alter table public.orders add column if not exists stock_posted boolean not null default false;

-- ---------------------------------------------------------------------------
-- Feed de atividades (comunicacao entre gestores, compras, estoque, producao)
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                   -- 'estoque' | 'pedido' | 'producao' | 'cliente' | 'sistema' | 'mensagem'
  title text not null,
  body text,
  link text,                            -- rota interna (#/pedidos/xxx)
  actor_id uuid references public.profiles(id),
  actor_name text,
  audience text[] not null default '{}', -- vazio = todos; senao papeis alvo
  created_at timestamptz not null default now()
);
create index if not exists activities_created_idx on public.activities (created_at desc);

create table if not exists public.activity_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id)
);

-- RLS para as novas tabelas
do $$
declare t text;
begin
  foreach t in array array['stock_movements', 'activities', 'activity_reads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth_select" on public.%I', t);
    execute format('drop policy if exists "auth_insert" on public.%I', t);
    execute format('drop policy if exists "auth_update" on public.%I', t);
    execute format('drop policy if exists "auth_delete" on public.%I', t);
    execute format('create policy "auth_select" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "auth_insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "auth_update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth_delete" on public.%I for delete to authenticated using (true)', t);
  end loop;
end $$;
grant all on public.stock_movements, public.activities, public.activity_reads to authenticated;

-- Realtime no feed
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activities') then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;

-- Configuracao JIT: considerar estoque minimo como meta de producao
insert into public.app_settings (key, value) values ('jit_include_min_stock', 'true')
on conflict (key) do nothing;
