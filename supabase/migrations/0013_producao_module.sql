-- Migration 0013: modulo Producao independente (cadastro, estoque, pedido/necessidade proprios).
create table if not exists public.prod_products (
  code text primary key,
  reference text,
  name text not null,
  description text not null,
  brand text,
  weight_g numeric,
  use_g numeric,
  units_per_box int not null default 48,
  no_margin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.prod_stock (
  code text primary key references public.prod_products(code) on delete cascade,
  stock1 numeric not null default 0,
  stock5 numeric not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.prod_aliases (
  id uuid primary key default gen_random_uuid(),
  raw text not null unique,
  client_code text,
  code text not null references public.prod_products(code) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.prod_demand (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.prod_products(code) on delete cascade,
  raw_description text,
  store text,
  boxes numeric not null default 0,
  units numeric not null default 0,
  source text,
  imported_at timestamptz not null default now()
);
create table if not exists public.prod_pending (
  id uuid primary key default gen_random_uuid(),
  raw_description text not null,
  client_code text,
  store text,
  boxes numeric not null default 0,
  units numeric not null default 0,
  candidates jsonb not null default '[]'::jsonb,
  source text,
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['prod_products','prod_stock','prod_aliases','prod_demand','prod_pending'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists auth_select on public.%I', t);
    execute format('drop policy if exists auth_insert on public.%I', t);
    execute format('drop policy if exists auth_update on public.%I', t);
    execute format('drop policy if exists auth_delete on public.%I', t);
    execute format('create policy auth_select on public.%I for select to authenticated using (is_active())', t);
    execute format('create policy auth_insert on public.%I for insert to authenticated with check (can_write_area(''producao''))', t);
    execute format('create policy auth_update on public.%I for update to authenticated using (can_write_area(''producao'')) with check (can_write_area(''producao''))', t);
    execute format('create policy auth_delete on public.%I for delete to authenticated using (can_write_area(''producao''))', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;
