import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock, ShieldCheck, Download, HardDrive, Paperclip, Play, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Tabs, Textarea } from '@/components/primitives';
import { ACCEPT, MAX_BYTES, SOLICITACAO_STATUS, apagarSolicitacao, baixarArquivo, decidir, enviarSolicitacao, listSolicitacoes, type Solicitacao } from '@/api/solicitacoes';
import { logActivity } from '@/api/activity';
import { downloadBlob, fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type Aba = 'fila' | 'nova' | 'adiada' | 'concluida' | 'recusada';
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Solicitações de atualização do sistema: quem usa envia o pedido com texto e arquivos (Word, PDF, texto, imagens, áudio);
 * o responsável aprova ou recusa; as aprovadas formam a fila na ordem da data e hora do pedido.
 */
export default function SolicitacoesPage() {
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const isResp = profile?.status === 'ativo' && !!profile?.is_superadmin;
  const list = useQuery({ queryKey: ['solicitacoes'], queryFn: listSolicitacoes, refetchInterval: 30000 });
  const [aba, setAba] = useState<Aba>('fila');
  const [novo, setNovo] = useState(false);
  const [acao, setAcao] = useState<{ s: Solicitacao; tipo: 'recusar' | 'concluir' } | null>(null);
  const [nota, setNota] = useState('');
  const [versao, setVersao] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['solicitacoes'] });

  const all = list.data ?? [];
  const fila = useMemo(() => all.filter((s) => s.status === 'aprovada' || s.status === 'em_andamento').sort((a, b) => (a.status === 'em_andamento' ? -1 : 0) - (b.status === 'em_andamento' ? -1 : 0) || a.created_at.localeCompare(b.created_at)), [all]);
  const grupos: Record<Aba, Solicitacao[]> = {
    fila,
    nova: all.filter((s) => s.status === 'nova'),
    adiada: all.filter((s) => s.status === 'adiada'),
    concluida: all.filter((s) => s.status === 'concluida').reverse(),
    recusada: all.filter((s) => s.status === 'recusada').reverse(),
  };

  const mudar = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof decidir>[1] }) => decidir(v.id, { ...v.patch, userId: session?.user.id }),
    onSuccess: (_d, v) => { toast.success(v.patch.status ? `Solicitação: ${SOLICITACAO_STATUS[v.patch.status].label.toLowerCase()}.` : 'Atualizada.'); setAcao(null); setNota(''); setVersao(''); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagar = useMutation({ mutationFn: apagarSolicitacao, onSuccess: () => { toast.success('Solicitação apagada.'); done(); }, onError: (e: Error) => toast.error(e.message) });

  async function baixar(fileId: string) {
    try { const f = await baixarArquivo(fileId); downloadBlob(f.blob, f.name); } catch (e) { toast.error((e as Error).message); }
  }

  const card = (s: Solicitacao, pos?: number) => (
    <Card key={s.id}>
      <div className="flex flex-wrap items-start gap-3">
        {pos != null && <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-bold text-brand" title="Posição na fila">{pos}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">#{s.numero}</span>
            <h3 className="font-display font-bold">{s.titulo}</h3>
            {s.prioridade === 'urgente' && <Badge tone="danger">urgente</Badge>}
            <Badge tone={SOLICITACAO_STATUS[s.status].tone} dot>{SOLICITACAO_STATUS[s.status].label}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">Pedido por {s.created_by_name ?? '—'} em {fmtDateTime(s.created_at)}{s.decided_at ? ` · decidido em ${fmtDateTime(s.decided_at)}` : ''}{s.done_at ? ` · concluído em ${fmtDateTime(s.done_at)}${s.done_version ? ` (versão ${s.done_version})` : ''}` : ''}</p>
          {s.descricao && <p className="mt-2 whitespace-pre-wrap text-sm">{s.descricao}</p>}
          {s.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {s.files.map((f) => f.removed_from_db_at
                ? <span key={f.id} title="O arquivo foi levado para o computador do responsável e saiu do banco; aqui fica só o registro." className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1 text-xs text-muted"><HardDrive className="size-3.5" />{f.file_name}<span>{kb(f.size_bytes)} · no computador do responsável</span></span>
                : <button key={f.id} type="button" onClick={() => baixar(f.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-surface-2"><Paperclip className="size-3.5" />{f.file_name}<span className="text-muted">{kb(f.size_bytes)}</span><Download className="size-3.5 text-muted" /></button>)}
            </div>
          )}
          {s.triage_status && s.status !== 'concluida' && (
            <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${s.triage_status === 'bloqueada' ? 'border border-warn/40 bg-warn/10' : 'bg-ok/5'}`}>
              <b>{s.triage_status === 'bloqueada' ? 'Análise de segurança: precisa de você' : s.triage_status === 'liberada' ? 'Análise de segurança: liberada pelo responsável' : 'Análise de segurança: ok'}</b>{s.triage_note ? ` · ${s.triage_note}` : ''}
            </p>
          )}
          {s.decision_note && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs"><b>Resposta:</b> {s.decision_note}</p>}
          {s.done_note && <p className="mt-2 rounded-lg bg-ok/5 px-3 py-2 text-xs"><b>O que foi feito:</b> {s.done_note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {isResp && s.status === 'nova' && <>
            <Button size="sm" icon={<Check className="size-4" />} loading={mudar.isPending} onClick={() => mudar.mutate({ id: s.id, patch: { status: 'aprovada' } })}>Aprovar</Button>
            <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setAcao({ s, tipo: 'recusar' })}>Recusar</Button>
          </>}
          {isResp && s.triage_status === 'bloqueada' && (s.status === 'aprovada' || s.status === 'em_andamento') && <Button size="sm" icon={<ShieldCheck className="size-4" />} onClick={() => mudar.mutate({ id: s.id, patch: { triage_status: 'liberada' } })}>Liberar</Button>}
          {isResp && s.status === 'aprovada' && <Button size="sm" variant="outline" icon={<Play className="size-4" />} onClick={() => mudar.mutate({ id: s.id, patch: { status: 'em_andamento' } })}>Começar</Button>}
          {isResp && (s.status === 'aprovada' || s.status === 'em_andamento') && <Button size="sm" variant="outline" icon={<Check className="size-4" />} onClick={() => setAcao({ s, tipo: 'concluir' })}>Concluir</Button>}
          {isResp && (s.status === 'nova' || s.status === 'aprovada') && <Button size="sm" variant="ghost" icon={<Clock className="size-4" />} onClick={() => mudar.mutate({ id: s.id, patch: { status: 'adiada' } })}>Para depois</Button>}
          {isResp && s.status === 'adiada' && <Button size="sm" variant="outline" icon={<Undo2 className="size-4" />} onClick={() => mudar.mutate({ id: s.id, patch: { status: 'aprovada' } })}>Voltar para a fila</Button>}
          {s.status === 'nova' && (isResp || s.created_by === session?.user.id) && <Button size="sm" variant="ghost" className="text-danger" aria-label={`Apagar solicitação ${s.numero}`} icon={<Trash2 className="size-4" />} onClick={() => apagar.mutate(s.id)} />}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title="Solicitações" description="Peça uma atualização do sistema com texto e arquivos (Word, PDF, texto, imagem ou áudio). Depois de aprovada, ela entra na fila na ordem da data e hora do pedido."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setNovo(true)}>Nova solicitação</Button>} />
      <div className="mb-4"><Tabs value={aba} onChange={setAba} items={[{ value: 'fila', label: 'Fila', count: grupos.fila.length }, { value: 'nova', label: 'Aguardando aprovação', count: grupos.nova.length }, { value: 'adiada', label: 'Para depois', count: grupos.adiada.length }, { value: 'concluida', label: 'Concluídas', count: grupos.concluida.length }, { value: 'recusada', label: 'Recusadas', count: grupos.recusada.length }]} /></div>
      {grupos[aba].length ? (
        <div className="space-y-3">{grupos[aba].map((s, i) => card(s, aba === 'fila' ? i + 1 : undefined))}</div>
      ) : (
        <Card><EmptyState title={aba === 'fila' ? 'Fila vazia' : 'Nada por aqui'} description={aba === 'fila' ? 'As solicitações aprovadas aparecem aqui, na ordem em que foram pedidas.' : 'Clique em Nova solicitação para pedir uma atualização.'} /></Card>
      )}

      {novo && <NovaSolicitacao onClose={() => setNovo(false)} onDone={(n) => { setNovo(false); setAba('nova'); done(); toast.success(`Solicitação #${n} enviada. Ela aparece em Aguardando aprovação.`); }} />}

      {acao && (
        <Dialog open onClose={() => setAcao(null)} title={acao.tipo === 'recusar' ? `Recusar #${acao.s.numero}?` : `Concluir #${acao.s.numero}`}
          footer={<><Button variant="outline" onClick={() => setAcao(null)}>Voltar</Button>
            <Button loading={mudar.isPending} disabled={acao.tipo === 'recusar' && nota.trim().length < 3} onClick={() => mudar.mutate({ id: acao.s.id, patch: acao.tipo === 'recusar' ? { status: 'recusada', decision_note: nota.trim() } : { status: 'concluida', done_version: versao.trim() || null, done_note: nota.trim() || null } })}>{acao.tipo === 'recusar' ? 'Recusar' : 'Marcar como concluída'}</Button></>}>
          {acao.tipo === 'concluir' && <Field label="Versão do sistema (ex.: 1.9.9)"><Input value={versao} onChange={(e) => setVersao(e.target.value)} /></Field>}
          <Field label={acao.tipo === 'recusar' ? 'Motivo (a pessoa que pediu vê)' : 'O que foi feito (opcional)'}><Textarea value={nota} onChange={(e) => setNota(e.target.value)} /></Field>
        </Dialog>
      )}
    </>
  );
}

function NovaSolicitacao({ onClose, onDone }: { onClose: () => void; onDone: (numero: number) => void }) {
  const { session, profile } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<'normal' | 'urgente'>('normal');
  const [files, setFiles] = useState<File[]>([]);
  const enviar = useMutation({
    mutationFn: () => enviarSolicitacao({ titulo, descricao, prioridade, files, userId: session!.user.id, userName: profile?.name ?? profile?.email ?? null }),
    onSuccess: async (r) => {
      await logActivity({ kind: 'sistema', title: `Nova solicitação #${r.numero}: ${titulo.trim()}`, body: `${profile?.name ?? ''}${files.length ? ` · ${files.length} arquivo(s)` : ''}`, link: '/solicitacoes', actor_id: session?.user.id, actor_name: profile?.name ?? null }).catch(() => {});
      onDone(r.numero);
    },
    onError: (e: Error) => toast.error(`Não foi possível enviar: ${e.message}`),
  });
  function add(list: FileList | null) {
    const novos = [...(list ?? [])];
    const grandes = novos.filter((f) => f.size > MAX_BYTES);
    if (grandes.length) toast.error(`Passa de 8 MB: ${grandes.map((f) => f.name).join(', ')}`);
    setFiles((fs) => [...fs, ...novos.filter((f) => f.size <= MAX_BYTES)]);
  }
  return (
    <Dialog open onClose={onClose} wide title="Nova solicitação" description="Descreva o que precisa mudar e anexe o documento, se tiver. A solicitação vai para aprovação."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button icon={<Send className="size-4" />} loading={enviar.isPending} disabled={titulo.trim().length < 3 || (!descricao.trim() && !files.length)} onClick={() => enviar.mutate()}>Enviar solicitação</Button></>}>
      <div className="space-y-3">
        <Field label="Título (ex.: Vendas parte 5)"><Input id="sol-titulo" maxLength={140} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
        <Field label="O que você precisa"><Textarea id="sol-desc" rows={6} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Explique a mudança, em que tela e por quê. Pode colar o texto aqui." /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prioridade"><Select id="sol-prio" value={prioridade} onChange={(e) => setPrioridade(e.target.value as 'normal' | 'urgente')}><option value="normal">Normal</option><option value="urgente">Urgente</option></Select></Field>
          <Field label="Arquivos (até 8 MB cada)">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-3 text-sm text-muted hover:bg-surface-2">
              <Paperclip className="size-4" />Anexar Word, PDF, texto, imagem ou áudio
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </label>
          </Field>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1">{files.map((f, i) => <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm"><Paperclip className="size-3.5 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{kb(f.size)}</span><button type="button" className="text-muted hover:text-danger" aria-label={`Tirar ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X className="size-4" /></button></li>)}</ul>
        )}
      </div>
    </Dialog>
  );
}
