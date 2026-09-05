export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

/** Histórico de versões do sistema (web e desktop compartilham o mesmo número de versão). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.3',
    date: '2026-09-03',
    items: [
      'Botões "Baixar" da landing page já iniciam o download do instalador, sem passar pela página do GitHub.',
      'Landing page corrigida no celular: dicas feitas para computador não ficam mais soltas por cima dos produtos.',
      'Telas do sistema não cortam mais no celular (Configurações, formulários, abas que agora quebram linha).',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-09-03',
    items: [
      'Mensagem de boas-vindas por notificação assim que o usuário ativa os avisos no aparelho.',
      'Pedido de permissão de notificação aparece ao entrar no app (web/PWA), com instrução de instalação no iPhone.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-09-03',
    items: [
      'Web e PWA atualizam sozinhos ao detectar uma versão nova (antes precisava clicar em "Atualizar agora").',
      'Versão instalada no Windows passa a baixar a atualização sozinha em segundo plano.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-03',
    items: [
      'Painel novo com KPIs: faturamento dos últimos 30 dias e variação, ticket médio, taxa de atendimento, clientes ativos, gráfico semanal, maiores necessidades de produção, top clientes e tamanho do banco.',
      'Tabela de preços por cliente, rede/grupo ou geral.',
      'Insumos e compras: ficha técnica por produto e cálculo automático do que comprar a partir de uma ordem de produção.',
      'Curva ABC de produtos e sugestão automática de estoque mínimo.',
      'Lote e validade no controle de estoque.',
      'Notificações push no celular (pedidos de acesso, itens pendentes, estoque baixo, produção concluída).',
      'Rotas de entrega e romaneio.',
      'Portal público de consulta de pedido por CNPJ.',
      'Relatórios e auditoria com opção de desfazer uma alteração.',
      'Verificação em duas etapas (2FA).',
      'Backup diário automático do banco, com opção de gerar na hora e baixar.',
      'Indicador de uso do banco de dados (GB) e módulos que podem ser ligados/desligados sem apagar nada.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-03',
    items: [
      'Botões de importação de planilha para clientes e produtos, com modelo pronto para baixar.',
      'Segurança reforçada: cabeçalhos HTTP (CSP/HSTS), permissões do banco revisadas, funções protegidas, acesso anônimo bloqueado, Electron com CSP.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-02',
    items: [
      'Superadmin fixo e fluxo de aprovação de novos cadastros.',
      'Níveis de acesso (administrador, editor, visualizador).',
      'Usuário pode trocar o próprio e-mail e senha em Configurações.',
      'Avisos mais claros de limite de envio de e-mail.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-02',
    items: [
      'Interface refeita com shadcn/ui e Tailwind v4 em todo o sistema.',
      'Presença em tempo real: você vê quem mais está no sistema e o que está editando.',
      'Animação de abertura no desktop e no PWA.',
      'Revisão geral de responsividade.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-02',
    items: [
      'Lançamento manual de estoque (entrada e baixa) sem precisar de planilha.',
      'Cadastro manual de pedido, além da importação por PDF.',
      'Feed de atividades da equipe em tempo real.',
      'Instalação como PWA no celular.',
      'Papéis por área de trabalho.',
      'Lógica just-in-time com estoque mínimo por produto.',
      'Tema claro como padrão.',
      'E-mails de autenticação (confirmação, recuperação de senha) via Resend.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-02',
    items: [
      'Primeira versão do sistema ISA Alimentos: estoque, importação de pedidos por PDF, cálculo de necessidade de produção e CRM de clientes.',
      'Disponível como app web e como programa para Windows, com o mesmo banco de dados.',
    ],
  },
];
