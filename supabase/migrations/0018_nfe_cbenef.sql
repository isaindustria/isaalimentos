-- Codigo de beneficio fiscal (cBenef) por produto: a SEFAZ-SP exige quando o CST tem beneficio (ex.: CST 20 com reducao de base).
alter table public.products add column if not exists c_benef text;
