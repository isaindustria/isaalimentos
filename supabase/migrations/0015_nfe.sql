-- Migration 0015: NF-e (beta). O certificado A1 NÃO fica no banco: só no programa do Windows (criptografado pelo Windows).
-- Aqui ficam o emitente, a fila/histórico das notas, os dados públicos do certificado e os campos fiscais.

-- Campos fiscais
alter table public.products add column if not exists ncm text;
alter table public.products add column if not exists cest text;
alter table public.products add column if not exists gtin text;
alter table public.products add column if not exists origem int not null default 0 check (origem between 0 and 8);
alter table public.products add column if not exists cfop text;          -- opcional: sobrepõe o CFOP padrão
alter table public.customers add column if not exists ie text;
alter table public.customers add column if not exists ind_ie_dest int not null default 1 check (ind_ie_dest in (1, 2, 9));
alter table public.customers add column if not exists address_number text;
alter table public.customers add column if not exists address_complement text;
alter table public.customers add column if not exists city_ibge text;

-- Emitente e regras fiscais padrão (uma linha só)
create table if not exists public.nfe_emitente (
  id int primary key default 1 check (id = 1),
  cnpj text, razao_social text, nome_fantasia text, ie text,
  crt int not null default 1 check (crt in (1, 2, 3)),
  logradouro text, numero text, complemento text, bairro text, municipio text, municipio_ibge text, uf text default 'SP', cep text, fone text,
  ambiente int not null default 2 check (ambiente in (1, 2)),       -- 2 = homologação
  serie int not null default 1,
  proximo_numero_homologacao int not null default 1,
  proximo_numero_producao int not null default 1,
  nat_op text not null default 'Venda de produção do estabelecimento',
  cfop_dentro text not null default '5101', cfop_fora text not null default '6101',
  csosn text not null default '102', cst_icms text not null default '00', aliq_icms numeric not null default 18,
  pis_cst text not null default '99', pis_aliq numeric not null default 0,
  cofins_cst text not null default '99', cofins_aliq numeric not null default 0,
  mod_frete int not null default 9, t_pag text not null default '15', ind_pres int not null default 9,
  desconto_na_nota boolean not null default true,
  inf_cpl text,
  resp_tec_cnpj text, resp_tec_contato text, resp_tec_email text, resp_tec_fone text,
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
insert into public.nfe_emitente (id) values (1) on conflict do nothing;

-- Dados públicos do certificado (para mostrar no navegador/celular); o arquivo fica só no computador
create table if not exists public.nfe_certificado_info (
  id int primary key default 1 check (id = 1),
  cnpj text, titular text, emissor text, valido_ate timestamptz, computador text,
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);

-- Fila e histórico das notas
create table if not exists public.nfe_notas (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  ambiente int not null check (ambiente in (1, 2)),
  serie int, numero int, chave text,
  status text not null default 'fila' check (status in ('fila', 'processando', 'autorizada', 'rejeitada', 'erro', 'cancelada')),
  cstat text, motivo text, protocolo text, valor numeric,
  dest_nome text, dest_doc text,
  xml text, xml_cancelamento text, justificativa_cancelamento text,
  computador text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  processado_em timestamptz, cancelada_em timestamptz
);
create unique index if not exists nfe_notas_numero_idx on public.nfe_notas (ambiente, serie, numero) where numero is not null;
create index if not exists nfe_notas_order_idx on public.nfe_notas (order_id);
create index if not exists nfe_notas_status_idx on public.nfe_notas (status);

-- Número da nota: reservado no banco, sem repetição mesmo com dois computadores
create or replace function public.nfe_reservar_numero(p_ambiente int) returns table (serie int, numero int)
language plpgsql security definer set search_path = public as $$
declare s int; n int;
begin
  if not (public.is_adm() or public.can_write_area('compras')) then raise exception 'Sem permissão para emitir nota.'; end if;
  if p_ambiente = 1 then
    update public.nfe_emitente set proximo_numero_producao = proximo_numero_producao + 1 where id = 1 returning nfe_emitente.serie, proximo_numero_producao - 1 into s, n;
  else
    update public.nfe_emitente set proximo_numero_homologacao = proximo_numero_homologacao + 1 where id = 1 returning nfe_emitente.serie, proximo_numero_homologacao - 1 into s, n;
  end if;
  return query select s, n;
end $$;
revoke execute on function public.nfe_reservar_numero(int) from public, anon;
grant execute on function public.nfe_reservar_numero(int) to authenticated;

-- Acesso: emitente e certificado só o ADM altera; comercial/ADM leem; vendedor não vê nada de nota.
alter table public.nfe_emitente enable row level security;
alter table public.nfe_certificado_info enable row level security;
alter table public.nfe_notas enable row level security;
drop policy if exists nfe_emit_select on public.nfe_emitente;
drop policy if exists nfe_emit_update on public.nfe_emitente;
create policy nfe_emit_select on public.nfe_emitente for select to authenticated using (public.is_adm() or public.can_write_area('compras'));
create policy nfe_emit_update on public.nfe_emitente for update to authenticated using (public.is_adm()) with check (public.is_adm());
drop policy if exists nfe_cert_select on public.nfe_certificado_info;
drop policy if exists nfe_cert_write on public.nfe_certificado_info;
create policy nfe_cert_select on public.nfe_certificado_info for select to authenticated using (public.is_adm() or public.can_write_area('compras'));
create policy nfe_cert_write on public.nfe_certificado_info for all to authenticated using (public.is_adm()) with check (public.is_adm());
drop policy if exists nfe_notas_select on public.nfe_notas;
drop policy if exists nfe_notas_insert on public.nfe_notas;
drop policy if exists nfe_notas_update on public.nfe_notas;
create policy nfe_notas_select on public.nfe_notas for select to authenticated using (public.is_adm() or public.can_write_area('compras'));
create policy nfe_notas_insert on public.nfe_notas for insert to authenticated with check (public.is_adm() or public.can_write_area('compras'));
create policy nfe_notas_update on public.nfe_notas for update to authenticated using (public.is_adm() or public.can_write_area('compras')) with check (public.is_adm() or public.can_write_area('compras'));
-- nota não se apaga (histórico fiscal); erro/rejeição fica registrado

-- módulo desligado por padrão (beta)
update public.app_settings set value = value || '{"nfe": false}'::jsonb where key = 'modules' and not (value ? 'nfe');
