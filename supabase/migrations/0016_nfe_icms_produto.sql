-- Migration 0016: ICMS por produto (CST, alíquota e redução de base) e dados do emitente a partir do DANFE modelo da ISA.
alter table public.products add column if not exists icms_cst text;          -- ex.: 20 (sobrepõe o CST padrão do emitente)
alter table public.products add column if not exists icms_aliq numeric;      -- ex.: 18
alter table public.products add column if not exists icms_red_bc numeric;    -- % de redução da base, ex.: 61.11
alter table public.products add column if not exists inf_fiscal text;        -- texto legal que vai para as informações complementares
alter table public.nfe_emitente add column if not exists inscricao_municipal text;
alter table public.nfe_emitente add column if not exists peso_bruto_fator numeric not null default 1;  -- peso bruto = líquido × fator

-- Emitente conforme o DANFE nº 958 enviado pelo comercial (regime normal, Itaquaquecetuba-SP).
update public.nfe_emitente set
  cnpj = coalesce(cnpj, '55747709000147'),
  razao_social = coalesce(razao_social, 'ISA INDUSTRIA DE ALIMENTOS E TEMPEROS LTDA'),
  ie = coalesce(ie, '379646137119'),
  inscricao_municipal = coalesce(inscricao_municipal, '58931'),
  crt = 3,
  logradouro = coalesce(logradouro, 'R CURIO'), numero = coalesce(numero, '45'), bairro = coalesce(bairro, 'PARQUE SAO PEDRO'),
  municipio = coalesce(municipio, 'ITAQUAQUECETUBA'), municipio_ibge = coalesce(municipio_ibge, '3523107'), uf = 'SP',
  cep = coalesce(cep, '08586100'), fone = coalesce(fone, '1151982994'),
  cst_icms = '00', aliq_icms = 18
where id = 1;
