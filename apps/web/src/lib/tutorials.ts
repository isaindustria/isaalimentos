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
  /** Vendas parte 5: o vendedor vê só os tutoriais marcados para ele (cliente e pedido) */
  forSeller?: boolean;
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'vendedor-pedidos',
    forSeller: true,
    version: '1.9.8',
    date: '2026-10-13',
    title: 'Vendedor: clientes e pedidos',
    summary: 'Para o vendedor: veja os seus clientes e há quantos dias cada um não pede, exporte a lista, lance o pedido com o desconto autorizado, responda a pergunta das outras embalagens e consulte os seus pedidos.',
    web: 'vendedor-web.mp4',
    mobile: 'vendedor-mobile.mp4',
    poster: 'vendedor-web.jpg',
    steps: [
      { title: 'O que o vendedor faz no sistema', items: [
        'Na aba Pedidos ficam o cartão Meus clientes, o cartão Produtos e a lista com todos os seus pedidos (do PDF e manuais).',
        'No alto da tela: Como usar abre os tutoriais e Novo pedido começa um pedido.',
      ] },
      { title: 'Meus clientes', items: [
        'No cartão Meus clientes, clique em Ver clientes. Aparecem só os clientes cadastrados no seu nome, só para consulta.',
        'Último ped. mostra há quantos dias o cliente não pede. Quem está há mais tempo sem pedir vem primeiro; quem nunca pediu fica no grupo Sem pedido, no fim.',
        'Os descontos financeiros de cada cliente são definidos pelo ADM.',
        'Exportar cadastro baixa a lista em Excel, com a coluna de dias desde o último pedido, para conferir quem precisa de visita.',
      ] },
      { title: 'Pedido novo', items: [
        'Clique em Novo pedido e escolha o cliente pelo nome ou pelo CNPJ. O vendedor vem preenchido.',
        'Se o cliente já tem pedido em aberto, aparece "Você já tem pedido para esse cliente. Continuar?". Não apaga tudo e a tela volta em branco; Sim, continuar segue com o pedido.',
        'Em Desc. Fin., escolha só entre os descontos autorizados para o cliente.',
        'Nos itens, procure o produto pela referência, pelo código ou pelo nome. Informe a quantidade (em kg ou em unidade, conforme o produto) e o valor unitário; o total é calculado sozinho.',
        'Em Perguntas do pedido, responda Sim ou Não: pode enviar em outras embalagens de medida a quantidade solicitada? A resposta é obrigatória.',
        'Clique em Salvar pedido.',
      ] },
      { title: 'Consultar pedidos', items: [
        'O pedido salvo abre na hora, com Voltar, Editar, Imprimir e Novo pedido na mesma linha, e a resposta sobre as outras embalagens registrada.',
        'Em Pedidos, a lista mostra todos os seus pedidos, do PDF e manuais, com o total no rodapé.',
        'Use os filtros de status e de cliente; clique no pedido para abrir, imprimir ou editar.',
      ] },
    ],
  },
  {
    id: 'cadastro-clientes',
    version: '1.9.6',
    date: '2026-10-13',
    title: 'Cadastro de clientes',
    summary: 'Importe a planilha de clientes do seu sistema sem modelo, confira antes de gravar, veja os dias sem pedido, exporte, exclua ou inative e consulte os produtos.',
    web: 'cadastro-clientes-web.mp4',
    mobile: 'cadastro-clientes-mobile.mp4',
    poster: 'cadastro-clientes-web.jpg',
    steps: [
      { title: 'Importar a planilha (só o ADM)', items: [
        'Em Pedidos, no cartão Clientes, clique em Importar cadastro de clientes.',
        'Não precisa de modelo: exporte a lista de clientes do seu sistema, do jeito que ela sai, e solte o arquivo (Excel ou CSV).',
      ] },
      { title: 'Conferir as colunas', items: [
        'O ISA reconhece as colunas pelo título (código, razão social, fantasia, CPF/CNPJ, cidade, UF, vendedor e outras).',
        'Coluna marcada como "sem campo": escolha em Campo no ISA o campo certo (por exemplo, Desconto financeiro) ou deixe em Ignorar para não importar.',
        'É obrigatório ter o nome do cliente e o código ou o CNPJ. Depois clique em Conferir clientes.',
      ] },
      { title: 'Conferência antes de gravar', items: [
        'Os filtros separam as linhas: Novas, Já existem, Duplicidades e erros e Fora da importação.',
        'Em Já existem aparece o que vai mudar em cada cliente (por exemplo, desconto ou nome fantasia).',
        'Em Duplicidades e erros aparece o motivo. Corrija código, nome ou CNPJ direto na linha (a conferência é refeita na hora) ou clique em Tirar; Voltar desfaz.',
        'Para atualizar os clientes que já existem, marque a confirmação. Sem marcar, só os novos entram. Nada é apagado e campo vazio na planilha não apaga o cadastro.',
        'Clique em Importar: o aviso mostra quantos foram incluídos e atualizados.',
      ] },
      { title: 'Lista de clientes', items: [
        'Em Ver clientes, o código vem na primeira coluna, igual ao do seu sistema, com os zeros à esquerda.',
        'Último ped. mostra os dias desde o último pedido. A lista começa por quem está há mais tempo sem pedir; quem nunca pediu fica no grupo Sem pedido, no fim.',
        'Exportar cadastro baixa a lista inteira em Excel.',
      ] },
      { title: 'Excluir ou inativar', items: [
        'Clique na lixeira do cliente. Sem pedidos: Excluir definitivamente (não dá para desfazer).',
        'Com pedidos, não dá para excluir: use Inativar cliente. Ele sai das listas e dos pedidos novos, e o histórico continua.',
        'Para reativar, marque Mostrar inativos e clique no botão de reativar da linha.',
      ] },
      { title: 'Ver produtos', items: [
        'No cartão Produtos, Ver produtos mostra referência, código e nome dos produtos ativos, só para consulta.',
        'O vendedor também vê essa lista. Ele vê só os clientes dele e escolhe entre os descontos liberados pelo ADM.',
      ] },
    ],
  },
  {
    id: 'pedido-de-venda',
    forSeller: true,
    version: '1.7.0',
    date: '2026-10-10',
    title: 'Pedido de venda',
    summary: 'Cliente por nome ou CNPJ, vendedor, desconto financeiro, produtos em kg ou unidade e importação de clientes e produtos.',
    web: 'pedido-venda-web.mp4',
    mobile: 'pedido-venda-mobile.mp4',
    poster: 'pedido-venda-web.jpg',
    steps: [
      { title: 'Cadastrar clientes (só o ADM)', items: [
        'Vá em Pedidos → cartão Clientes → Importar cadastro de clientes e solte a planilha do jeito que ela sai do seu sistema (não precisa de modelo).',
        'O ISA reconhece as colunas (código, razão social, CPF/CNPJ, endereço, vendedor, desconto). Confira e, nas que ficaram sem campo, escolha o campo certo ou deixe em Ignorar.',
        'Na conferência aparecem os novos, os que já existem com as mudanças, as duplicidades e as divergências. Corrija código, nome ou CNPJ na própria linha ou clique em Tirar.',
        'O código do cliente fica exatamente como no Excel, com os zeros à esquerda. Para atualizar quem já existe, marque a confirmação. Nada é apagado.',
        'O nome do vendedor precisa ser igual ao nome ou ao e-mail da conta dele no sistema. Desconto: mais de um, separe com ponto e vírgula (ex.: 3%;1%).',
        'Em Ver clientes você troca o vendedor e ajusta os descontos; toda troca de vendedor fica registrada.',
        'A coluna Último ped. mostra os dias desde o último pedido (volta a 0 a cada pedido novo). A lista começa por quem está há mais tempo sem pedir; quem nunca pediu fica em Sem pedido.',
        'Exportar cadastro baixa tudo em Excel. Na lixeira: cliente sem pedidos é excluído; com pedidos, o sistema oferece Inativar (dá para reativar em Mostrar inativos).',
      ] },
      { title: 'Cadastrar produtos', items: [
        'Cartão Produtos → Importar produtos, com as colunas Referência, Código e Nome do produto.',
        'O código identifica o produto e os zeros à esquerda são mantidos. Preços e conversões não são criados pela importação.',
      ] },
      { title: 'Lançar o pedido', items: [
        'Clique em Novo pedido e digite parte do nome ou do CNPJ (com ou sem pontuação). Escolha o cliente na lista: o outro campo e o vendedor são preenchidos sozinhos.',
        'O vendedor aparece sozinho no topo. Escolha o desconto financeiro em Desc. Fin.; a lista mostra os descontos cadastrados para esse cliente.',
        'Em cada item, escolha a referência (opcional, filtra a lista) e o produto pelo código ou pelo nome.',
        'Qtd Kg/Un: Ander e ISA em quilo (até 3 casas decimais); pote temp., pote frut. e revenda em unidade (só números inteiros). O sistema confere pela referência.',
        'Digite a Qtd e o Vlr Un. O Vlr Ttl. é calculado sozinho (Qtd × Vlr Un.). Embaixo dos dados do pedido aparecem subtotal, desconto financeiro e total.',
        'Se o mesmo produto for incluído duas vezes, o sistema pergunta se junta as quantidades ou mantém as linhas separadas.',
        'Salvar: o pedido nasce Aberto e guarda os dados daquele momento. Itens em kg entram na produção em kg, sem conversão.',
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
export const videoUrl = (file: string) => `${BASE}${file}?v=4`;

/** Tutorial mais novo lançado entre duas versões (exclui `after`, inclui `upTo`). */
/** Tutoriais que o perfil vê: o vendedor só os marcados para ele. */
export const tutorialsFor = (isSeller: boolean) => TUTORIALS.filter((t) => !isSeller || t.forSeller);

export function tutorialBetween(after: string | null, upTo: string, isSeller = false): Tutorial | undefined {
  return tutorialsFor(isSeller)
    .filter((t) => compareVersions(t.version, upTo) <= 0 && (!after || compareVersions(t.version, after) > 0))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}

export const prefersMobileVideo = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
