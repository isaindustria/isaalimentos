-- Migration 0009 (v1.3 do gestor): insumos com codigo/referencia importaveis e historico de consumo mensal.
alter table public.supplies
  add column if not exists code text,
  add column if not exists reference text not null default 'insumo'
    check (reference in ('materia_prima', 'insumo', 'embalagem', 'tampa', 'pote', 'etiqueta'));

create unique index if not exists supplies_code_key on public.supplies (lower(code)) where code is not null;

create table if not exists public.supply_consumption (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supplies (id) on delete cascade,
  period date not null,
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (supply_id, period)
);

alter table public.supply_consumption enable row level security;
create policy auth_select on public.supply_consumption for select using (is_active());
create policy auth_insert on public.supply_consumption for insert with check (can_write());
create policy auth_update on public.supply_consumption for update using (can_write()) with check (can_write());
create policy auth_delete on public.supply_consumption for delete using (can_write());

create trigger audit_supply_consumption after insert or update or delete on public.supply_consumption
  for each row execute function audit_row();

alter publication supabase_realtime add table public.supply_consumption;
