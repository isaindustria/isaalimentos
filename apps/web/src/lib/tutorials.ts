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
  /** passo a passo em texto, mostrado na página Tutoriais junto do vídeo */
  steps: Array<{ title: string; items: string[] }>;
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
    steps: [
      { title: 'Cadastrar clientes (só o ADM)', items: [
        'Vá em Pedidos → cartão Clientes → Importar cadastro de clientes e clique em Baixar modelo.',
        'Preencha Vendedor, CNPJ, Nome do cliente/loja e Desconto financeiro. Sem desconto, escreva "nenhum"; mais de um, separe com ponto e vírgula (ex.: 3%;1%).',
        'O nome do vendedor precisa ser igual ao nome ou ao e-mail da conta dele no sistema.',
        'Solte a planilha: a prévia mostra o que é novo, o que já existe, o que está repetido e cada erro com a linha e o motivo.',
        'Para atualizar clientes que já existem, marque a confirmação. Quem não estiver na planilha continua cadastrado.',
        'Em Ver clientes você troca o vendedor e ajusta os descontos; toda troca de vendedor fica registrada.',
      ] },
      { title: 'Cadastrar produtos', items: [
        'Cartão Produtos → Importar produtos, com as colunas Referência, Código e Nome do produto.',
        'O código identifica o produto e os zeros à esquerda são mantidos. Preços e conversões não são criados pela importação.',
      ] },
      { title: 'Lançar o pedido', items: [
        'Clique em Novo pedido e digite parte do nome ou do CNPJ (com ou sem pontuação). Escolha o cliente na lista: o outro campo e o vendedor são preenchidos sozinhos.',
        'Escolha o desconto financeiro na lista; ela mostra os descontos cadastrados para esse cliente.',
        'Em cada item, escolha a referência (opcional, filtra a lista) e o produto pelo código ou pelo nome.',
        'A unidade de venda vem da referência: Ander e ISA em kg (até 3 casas decimais); pote temp., pote frut. e revenda em unidade (só números inteiros).',
        'Digite a quantidade e o valor unitário. Valor total = quantidade × valor unitário. O pedido mostra subtotal, desconto e total.',
        'Se o mesmo produto for incluído duas vezes, o sistema pergunta se junta as quantidades ou mantém as linhas separadas.',
        'Salvar: o pedido guarda os dados daquele momento. Itens em kg entram na produção em kg, sem conversão.',
      ] },
      { title: 'Vendedor', items: [
        'O vendedor cria a conta e o ADM aprova em Configurações → Usuários com a área Vendedor.',
        'Ele vê só a aba Pedidos (e Tutoriais), os clientes ligados a ele e os pedidos que ele mesmo lançou.',
        'Se o cliente mudar de vendedor, os pedidos antigos continuam com quem os digitou.',
      ] },
    ],
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
    steps: [
      { title: 'Por onde começar', items: [
        'Painel: resumo do dia (faturamento, pedidos abertos, quanto produzir e itens para conferir).',
        'Estoque: Importar planilha soma os locais 1 e 5; a importação nova substitui a anterior.',
        'Pedidos: Importar PDF lê os pedidos das lojas; dúvidas vão para a Conferência, onde você escolhe o produto uma vez e o sistema aprende.',
      ] },
      { title: 'Produção', items: [
        'Importar cadastro, Importar estoque atual e Importar pedido (sempre perguntando Incluir ou Substituir).',
        'Cartão Produzir: necessidade = total pedido − estoque disponível, em unidades e em quilos. Exportar produzir baixa em Excel; Imprimir manda para a impressora.',
      ] },
      { title: 'Outros módulos', items: [
        'Insumos e compras: consumo médio por mês e aviso de quando comprar.',
        'Rotas, Relatórios e Auditoria (quem alterou o quê, com opção de desfazer).',
        'Configurações: usuários e permissões, notificações no celular e backup diário.',
      ] },
    ],
  },
];

/**
 * Endereço completo no site, igual no navegador, no celular e no programa do Windows
 * (o programa não leva os vídeos no instalador). No navegador, o próprio domínio do app também serve os vídeos.
 */
const ORIGIN = !isDesktop && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://www.isaindalimentos.com.br';
const BASE = `${ORIGIN}/site/video/`;
export const videoUrl = (file: string) => `${BASE}${file}?v=3`;

/** Tutorial mais novo lançado entre duas versões (exclui `after`, inclui `upTo`). */
export function tutorialBetween(after: string | null, upTo: string): Tutorial | undefined {
  return [...TUTORIALS]
    .filter((t) => compareVersions(t.version, upTo) <= 0 && (!after || compareVersions(t.version, after) > 0))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}

export const prefersMobileVideo = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
