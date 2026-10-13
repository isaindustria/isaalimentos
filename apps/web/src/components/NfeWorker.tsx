import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { desktop } from '@/lib/desktop';
import { useAuth } from '@/hooks/useAuth';
import { processarNota } from '@/api/nfe';
import type { NfeNota } from '@/domain/nfe';

/**
 * Só no programa do Windows com certificado A1 carregado: pega as notas da fila e emite, uma por vez.
 * Assim quem está no navegador ou no celular também emite, enquanto este computador estiver com o sistema aberto.
 */
export function NfeWorker() {
  const qc = useQueryClient();
  const { isAdmin, canWriteArea } = useAuth();
  const busy = useRef(false);
  const allowed = !!desktop?.nfe && (isAdmin || canWriteArea('compras'));

  useEffect(() => {
    if (!allowed) return;
    let stop = false;
    const tick = async () => {
      if (busy.current || stop) return;
      const cert = await desktop!.nfe!.certInfo();
      if (!cert.ok || !cert.data) return;
      busy.current = true;
      try {
        const { data } = await supabase.from('nfe_notas').select('*').eq('status', 'fila').order('created_at').limit(5);
        for (const n of (data ?? []) as NfeNota[]) {
          if (stop) break;
          const r = await processarNota(n);
          if (r) {
            qc.invalidateQueries({ queryKey: ['nfe-notas'] });
            if (r.status === 'autorizada') toast.success(`NF-e ${r.numero} autorizada${r.ambiente === 2 ? ' (homologação)' : ''}.`);
            else toast.error(`NF-e ${r.numero ?? ''} ${r.status === 'rejeitada' ? 'rejeitada' : 'com erro'}: ${r.motivo ?? ''}`, { duration: 12000 });
          }
        }
      } finally { busy.current = false; }
    };
    tick();
    const id = window.setInterval(tick, 15000);
    const ch = supabase.channel('nfe-fila').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfe_notas' }, () => setTimeout(tick, 500)).subscribe();
    return () => { stop = true; window.clearInterval(id); supabase.removeChannel(ch); };
  }, [allowed, qc]);
  return null;
}
