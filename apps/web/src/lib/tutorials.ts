import { isDesktop } from '@/lib/desktop';
import { compareVersions } from '@/lib/utils';

/**
 * Tutoriais em vídeo: um por atualização que muda o uso do sistema.
 * Regra da casa: toda versão nova que altera uma tela ganha aqui o seu tutorial (versão computador e celular).
 */
export interface Tutorial {
  id: string;
  version: string;
  date: string;
  title: string;
  summary: string;
  /** arquivos em apps/web/public/site/video/ */
  web: string;
  mobile: string;
  poster?: string;
  /** só aparece na janela de novidades para estes perfis; vazio = todos */
  roles?: string[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'pedido-de-venda',
    version: '1.7.0',
    date: '2026-10-10',
    title: 'Pedido de venda',
    summary: 'Cliente por nome ou CNPJ, vendedor, desconto financeiro, produtos em kg ou unidade e importação de clientes e produtos.',
    web: 'pedido-venda-web.mp4',
    mobile: 'pedido-venda-mobile.mp4',
    poster: 'pedido-venda-web.jpg',
  },
  {
    id: 'sistema-completo',
    version: '1.6.4',
    date: '2026-10-01',
    title: 'Como usar o sistema completo',
    summary: 'Acesso, painel, estoque, pedidos, produção, cadastros, insumos, rotas, relatórios e configurações.',
    web: 'isa-tutorial.mp4',
    mobile: 'isa-tutorial.mp4',
    poster: 'isa-tutorial.jpg',
  },
];

/**
 * Endereço completo no site, igual no navegador, no celular e no programa do Windows
 * (o programa não leva os vídeos no instalador). No navegador, o próprio domínio do app também serve os vídeos.
 */
const ORIGIN = !isDesktop && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://www.isaindalimentos.com.br';
const BASE = `${ORIGIN}/site/video/`;
export const videoUrl = (file: string) => `${BASE}${file}?v=2`;

/** Tutorial mais novo lançado entre duas versões (exclui `after`, inclui `upTo`). */
export function tutorialBetween(after: string | null, upTo: string): Tutorial | undefined {
  return [...TUTORIALS]
    .filter((t) => compareVersions(t.version, upTo) <= 0 && (!after || compareVersions(t.version, after) > 0))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}

export const prefersMobileVideo = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
