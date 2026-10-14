-- Solicitacoes: situacao "adiada" (fica guardada para o futuro, fora da fila) e anexos que saem do banco
-- depois de baixados para a pasta do responsavel (o registro com nome e tamanho continua).
alter table public.update_requests drop constraint if exists update_requests_status_check;
alter table public.update_requests add constraint update_requests_status_check
  check (status in ('nova', 'aprovada', 'em_andamento', 'concluida', 'recusada', 'adiada'));
alter table public.update_request_files alter column content_b64 drop not null;
alter table public.update_request_files add column if not exists local_path text;
alter table public.update_request_files add column if not exists removed_from_db_at timestamptz;
