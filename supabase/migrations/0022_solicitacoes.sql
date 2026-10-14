-- Solicitacoes de atualizacao do sistema (pedido do responsavel em 13/10/2026):
-- quem usa o sistema envia o pedido (texto + arquivos .docx/.pdf/.txt/imagens); o responsavel (superadmin) aprova ou recusa;
-- as aprovadas entram numa fila pela data e hora do pedido e o desenvolvimento atende nessa ordem.
create or replace function public.is_superadmin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'ativo' and p.is_superadmin)
$$;
grant execute on function public.is_superadmin() to authenticated;

create table if not exists public.update_requests (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  titulo text not null check (length(trim(titulo)) between 3 and 140),
  descricao text not null default '',
  prioridade text not null default 'normal' check (prioridade in ('normal', 'urgente')),
  status text not null default 'nova' check (status in ('nova', 'aprovada', 'em_andamento', 'concluida', 'recusada')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  started_at timestamptz,
  done_at timestamptz,
  done_version text,
  done_note text
);
create index if not exists update_requests_fila_idx on public.update_requests (status, created_at);

create table if not exists public.update_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.update_requests(id) on delete cascade,
  file_name text not null,
  mime text,
  size_bytes int not null check (size_bytes <= 8 * 1024 * 1024),
  content_b64 text not null,
  created_at timestamptz not null default now()
);
create index if not exists update_request_files_req_idx on public.update_request_files (request_id);

alter table public.update_requests enable row level security;
alter table public.update_request_files enable row level security;

-- ver: o ADM ve todas; cada pessoa ve as que enviou
drop policy if exists ur_select on public.update_requests;
create policy ur_select on public.update_requests for select to authenticated using (public.is_adm() or created_by = auth.uid());
-- enviar: qualquer usuario ativo, sempre como "nova"
drop policy if exists ur_insert on public.update_requests;
create policy ur_insert on public.update_requests for insert to authenticated with check (public.is_active() and created_by = auth.uid() and status = 'nova');
-- aprovar, recusar e marcar andamento: so o responsavel (superadmin)
drop policy if exists ur_update on public.update_requests;
create policy ur_update on public.update_requests for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
-- apagar: quem enviou enquanto ainda e "nova", ou o responsavel
drop policy if exists ur_delete on public.update_requests;
create policy ur_delete on public.update_requests for delete to authenticated using (public.is_superadmin() or (created_by = auth.uid() and status = 'nova'));

drop policy if exists urf_select on public.update_request_files;
create policy urf_select on public.update_request_files for select to authenticated
  using (exists (select 1 from public.update_requests r where r.id = request_id and (public.is_adm() or r.created_by = auth.uid())));
drop policy if exists urf_insert on public.update_request_files;
create policy urf_insert on public.update_request_files for insert to authenticated
  with check (exists (select 1 from public.update_requests r where r.id = request_id and r.created_by = auth.uid() and r.status = 'nova'));
drop policy if exists urf_delete on public.update_request_files;
create policy urf_delete on public.update_request_files for delete to authenticated
  using (exists (select 1 from public.update_requests r where r.id = request_id and (public.is_superadmin() or (r.created_by = auth.uid() and r.status = 'nova'))));
