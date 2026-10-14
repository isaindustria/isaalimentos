import { supabase, unwrap } from '@/lib/supabase';

export type SolicitacaoStatus = 'nova' | 'aprovada' | 'em_andamento' | 'concluida' | 'recusada';
export interface Solicitacao {
  id: string; numero: number; titulo: string; descricao: string; prioridade: 'normal' | 'urgente'; status: SolicitacaoStatus;
  created_by: string | null; created_by_name: string | null; created_at: string;
  decided_at: string | null; decision_note: string | null; started_at: string | null; done_at: string | null; done_version: string | null; done_note: string | null;
  files: Array<{ id: string; file_name: string; mime: string | null; size_bytes: number }>;
}

export const SOLICITACAO_STATUS: Record<SolicitacaoStatus, { label: string; tone: 'info' | 'warn' | 'ok' | 'danger' | 'neutral' | 'brand' }> = {
  nova: { label: 'Aguardando aprovação', tone: 'warn' },
  aprovada: { label: 'Aprovada · na fila', tone: 'info' },
  em_andamento: { label: 'Em andamento', tone: 'brand' },
  concluida: { label: 'Concluída', tone: 'ok' },
  recusada: { label: 'Recusada', tone: 'neutral' },
};

/** Tipos aceitos: documentos, planilhas, imagens e áudios (até 8 MB cada). */
export const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.ogg,.opus,.wav';
export const MAX_BYTES = 8 * 1024 * 1024;

export async function listSolicitacoes(): Promise<Solicitacao[]> {
  return unwrap(await supabase.from('update_requests').select('*, files:update_request_files(id, file_name, mime, size_bytes)').order('created_at', { ascending: true })) as Solicitacao[];
}

const toB64 = (f: File) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => fail(new Error(`Não foi possível ler ${f.name}.`));
  r.readAsDataURL(f);
});

export async function enviarSolicitacao(input: { titulo: string; descricao: string; prioridade: 'normal' | 'urgente'; files: File[]; userId: string; userName: string | null }) {
  for (const f of input.files) if (f.size > MAX_BYTES) throw new Error(`${f.name} passa de 8 MB.`);
  const row = unwrap(await supabase.from('update_requests').insert({ titulo: input.titulo.trim(), descricao: input.descricao.trim(), prioridade: input.prioridade, created_by: input.userId, created_by_name: input.userName }).select('id, numero').single()) as { id: string; numero: number };
  try {
    for (const f of input.files) {
      unwrap(await supabase.from('update_request_files').insert({ request_id: row.id, file_name: f.name, mime: f.type || null, size_bytes: f.size, content_b64: await toB64(f) }));
    }
  } catch (e) {
    await supabase.from('update_requests').delete().eq('id', row.id); // não deixa pedido pela metade
    throw e;
  }
  return row;
}

export async function baixarArquivo(fileId: string): Promise<{ blob: Blob; name: string }> {
  const r = unwrap(await supabase.from('update_request_files').select('file_name, mime, content_b64').eq('id', fileId).single()) as { file_name: string; mime: string | null; content_b64: string };
  const bin = atob(r.content_b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: r.mime || 'application/octet-stream' }), name: r.file_name };
}

/** Só o responsável (superadmin): aprovar, recusar, marcar em andamento ou concluída. */
export async function decidir(id: string, patch: Partial<Pick<Solicitacao, 'status' | 'decision_note' | 'done_version' | 'done_note'>> & { userId?: string }) {
  const now = new Date().toISOString();
  const { userId, ...p } = patch;
  const extra: Record<string, unknown> = {};
  if (p.status === 'aprovada' || p.status === 'recusada') { extra.decided_at = now; extra.decided_by = userId ?? null; }
  if (p.status === 'em_andamento') extra.started_at = now;
  if (p.status === 'concluida') extra.done_at = now;
  const rows = unwrap(await supabase.from('update_requests').update({ ...p, ...extra }).eq('id', id).select('id')) as Array<{ id: string }>;
  if (!rows.length) throw new Error('Só o responsável pelo sistema pode mudar a situação da solicitação.');
}

export async function apagarSolicitacao(id: string) {
  const rows = unwrap(await supabase.from('update_requests').delete().eq('id', id).select('id')) as Array<{ id: string }>;
  if (!rows.length) throw new Error('Só dá para apagar enquanto aguarda aprovação.');
}
