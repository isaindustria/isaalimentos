import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ReceiptText } from 'lucide-react';
import { Badge, Button, Dialog } from '@/components/primitives';
import { enfileirarNota, notasDoPedido } from '@/api/nfe';
import { getModules } from '@/api/v14';
import { NFE_STATUS_LABEL } from '@/domain/nfe';
import { useAuth } from '@/hooks/useAuth';

/** Botão "Emitir NF-e" do pedido: confere o cadastro e põe na fila; mostra a situação da nota. */
export function EmitirNfeButton({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { isAdmin, canWriteArea } = useAuth();
  const mods = useQuery({ queryKey: ['modules'], queryFn: getModules });
  const notas = useQuery({ queryKey: ['nfe-notas', orderId], queryFn: () => notasDoPedido(orderId), refetchInterval: 15000, enabled: !!mods.data?.nfe });
  const [pend, setPend] = useState<string[] | null>(null);
  const go = useMutation({
    mutationFn: () => enfileirarNota(orderId),
    onSuccess: (r) => {
      if (r.pendencias.length) return setPend(r.pendencias);
      toast.success('Nota na fila. O programa do Windows com o certificado emite em instantes.');
      qc.invalidateQueries({ queryKey: ['nfe-notas'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!mods.data?.nfe || !(isAdmin || canWriteArea('compras'))) return null;
  const atual = notas.data?.[0];
  return (
    <>
      {atual && atual.status !== 'erro' && atual.status !== 'rejeitada' ? (
        <Link to="/notas-fiscais"><Badge tone={NFE_STATUS_LABEL[atual.status].tone} dot>NF-e {atual.numero ?? ''} · {NFE_STATUS_LABEL[atual.status].label}</Badge></Link>
      ) : (
        <Button variant="outline" icon={<ReceiptText className="h-4 w-4" />} loading={go.isPending} onClick={() => go.mutate()}>Emitir NF-e</Button>
      )}
      {pend && (
        <Dialog open onClose={() => setPend(null)} title="Falta completar o cadastro" description="Corrija em Notas fiscais → Dados fiscais / Emitente e tente de novo." footer={<><Link to="/notas-fiscais"><Button variant="outline">Abrir Notas fiscais</Button></Link><Button onClick={() => setPend(null)}>Entendi</Button></>}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{pend.map((p) => <li key={p}>{p}</li>)}</ul>
        </Dialog>
      )}
    </>
  );
}
