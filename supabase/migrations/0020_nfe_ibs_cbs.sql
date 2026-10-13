-- Reforma tributaria (NT 2025.002): grupo IBS/CBS na NF-e. Em 2026 as aliquotas sao de teste (CBS 0,9%, IBS UF 0,1%, IBS municipio 0%).
-- Padrao no emitente; o produto pode ter CST e cClassTrib proprios. Tudo editavel na tela Notas fiscais.
alter table public.nfe_emitente add column if not exists ibscbs_ativo boolean not null default true;
alter table public.nfe_emitente add column if not exists ibscbs_cst text not null default '000';
alter table public.nfe_emitente add column if not exists ibscbs_cclasstrib text not null default '000001';
alter table public.nfe_emitente add column if not exists p_ibs_uf numeric not null default 0.1;
alter table public.nfe_emitente add column if not exists p_ibs_mun numeric not null default 0;
alter table public.nfe_emitente add column if not exists p_cbs numeric not null default 0.9;
alter table public.products add column if not exists ibscbs_cst text;
alter table public.products add column if not exists ibscbs_cclasstrib text;
