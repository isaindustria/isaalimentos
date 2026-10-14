-- Analise automatica de seguranca das solicitacoes aprovadas (feita pelo desenvolvimento antes de comecar):
-- ok = pode fazer; bloqueada = precisa do responsavel (motivo em triage_note); liberada = responsavel liberou mesmo assim.
alter table public.update_requests add column if not exists triage_status text check (triage_status in ('ok', 'bloqueada', 'liberada'));
alter table public.update_requests add column if not exists triage_note text;
alter table public.update_requests add column if not exists triage_at timestamptz;
