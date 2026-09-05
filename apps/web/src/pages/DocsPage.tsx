import { useState } from 'react';
import { BookOpen, Rocket, ChevronDown } from 'lucide-react';
import { Badge, Card, PageHeader, Tabs } from '@/components/primitives';
import { CHANGELOG } from '@/lib/changelog';
import { useUpdates } from '@/hooks/useUpdates';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Guide {
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    title: 'Importar estoque e pedidos',
    steps: [
      'Vá em Estoque → Importar planilha e escolha o arquivo de estoque atual. Uma nova importação substitui a anterior.',
      'Vá em Pedidos → Importar e escolha o(s) PDF(s) de pedido das lojas. O sistema reconhece cada produto pela descrição.',
      'Itens com dúvida (confiança baixa ou dois candidatos parecidos) vão para Pedidos → Conferência: escolha o produto certo manualmente.',
      'Depois de importado, o pedido aparece em Pedidos com a loja, os itens e as quantidades em unidades e caixas de 48.',
    ],
  },
  {
    title: 'Calcular o que produzir',
    steps: [
      'Vá em Produção. O sistema soma todos os pedidos em aberto e subtrai o estoque atual (locais 1 e 5 somados).',
      'Ligue "Repor estoque mínimo" se quiser que a meta também cubra o mínimo cadastrado de cada produto (lógica just-in-time).',
      'Confira "Produtos a produzir": mostra quanto falta em unidades e em caixas de 48.',
      'Exporte para Excel ou imprima a ordem para levar para a linha de produção.',
      'Ao concluir a ordem, o produzido entra automaticamente no estoque — não precisa lançar de novo.',
    ],
  },
  {
    title: 'Cadastrar cliente, produto ou insumo na mão',
    steps: [
      'Você não precisa importar planilha toda vez: em Clientes, Produtos e Insumos e compras existe o botão "Novo" para cadastrar direto no sistema.',
      'O CNPJ é o identificador do cliente — evita duplicar quando o nome vier escrito diferente.',
      'Em Produtos, o campo peso aceita gramas ou quilos; a caixa padrão é de 48 unidades.',
    ],
  },
  {
    title: 'Preços por cliente ou por rede',
    steps: [
      'Vá em Preços → Novo preço.',
      'Cadastre um preço geral (vale para todo mundo), por rede/grupo, ou específico para um cliente.',
      'Na hora de gerar um pedido, o sistema usa sempre o preço mais específico disponível: cliente > rede > geral.',
    ],
  },
  {
    title: 'Insumos, ficha técnica e compras',
    steps: [
      'Cadastre os insumos (matéria-prima, embalagem, tampa, pote, etiqueta) em Insumos e compras.',
      'Na aba Ficha técnica, informe quanto de cada insumo um produto consome por unidade.',
      'Escolha uma ordem de produção salva e clique em Calcular: o sistema mostra quanto insumo falta comprar.',
      'Gere o pedido de compra direto da tela e acompanhe o status até "Recebido" — o estoque do insumo é atualizado sozinho.',
    ],
  },
  {
    title: 'Notificações no celular',
    steps: [
      'Instale o app: no navegador do celular, use "Adicionar à tela de início" (iPhone) ou o aviso de instalar (Android/Chrome).',
      'Abra o app pelo ícone instalado e toque em "Ativar" quando aparecer o cartão de notificações.',
      'Você recebe aviso de pedido de acesso, item para conferir, estoque abaixo do mínimo, produção concluída e backup — mesmo com o app fechado.',
      'Para desativar, vá em Configurações → Notificações neste aparelho.',
    ],
  },
  {
    title: 'Usuários e permissões',
    steps: [
      'Quem cria conta pela primeira vez fica pendente até um administrador aprovar em Configurações → Pedidos de acesso.',
      'Cada pessoa tem uma área (onde trabalha) e um nível de acesso (o que pode fazer): visualizador só vê, editor lança e importa, administrador também gerencia usuários e configurações.',
      'O superadmin não pode ser rebaixado nem removido por ninguém.',
      'Cada usuário pode trocar o próprio e-mail e senha em Configurações → Minha conta.',
    ],
  },
  {
    title: 'Backup e tamanho do banco',
    steps: [
      'Todo dia às 3h da manhã o sistema salva uma cópia de tudo automaticamente.',
      'Em Configurações → Backups do banco você pode gerar um backup na hora e baixar qualquer um dos últimos 10 dias.',
      'A barra de "Banco de dados" mostra quanto do plano gratuito (500 MB) já foi usado — fique de olho quando passar de 60%.',
    ],
  },
];

export default function DocsPage() {
  const [tab, setTab] = useState<'novidades' | 'guia'>('novidades');
  const [open, setOpen] = useState<number | null>(0);
  const { currentVersion } = useUpdates();

  return (
    <>
      <PageHeader
        title="Documentação"
        description="O que mudou em cada versão e como usar o sistema, passo a passo."
        actions={<Badge tone="brand">Versão instalada: {currentVersion}</Badge>}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'novidades', label: 'Novidades', count: CHANGELOG.length },
          { value: 'guia', label: 'Como usar', count: GUIDES.length },
        ]}
      />

      {tab === 'novidades' && (
        <div className="mt-4 flex flex-col gap-4">
          {CHANGELOG.map((entry, i) => (
            <Card
              key={entry.version}
              title={
                <span className="inline-flex items-center gap-2 font-display text-sm font-bold">
                  <Rocket className="size-4 text-brand" /> Versão {entry.version}
                </span>
              }
              action={
                <span className="flex items-center gap-2">
                  {i === 0 && <Badge tone="ok">atual</Badge>}
                  <span className="text-xs text-muted">{fmtDate(entry.date)}</span>
                </span>
              }
            >
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted marker:text-brand">
                {entry.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tab === 'guia' && (
        <div className="mt-4 flex flex-col gap-3">
          {GUIDES.map((g, i) => (
            <Card key={g.title} padded={false}>
              <button
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="inline-flex items-center gap-2 font-display text-sm font-bold">
                  <BookOpen className="size-4 text-brand" /> {g.title}
                </span>
                <ChevronDown className={cn('size-4 text-muted transition-transform', open === i && 'rotate-180')} />
              </button>
              {open === i && (
                <ol className="list-decimal space-y-2 px-5 pb-5 pl-9 text-sm text-muted marker:font-semibold marker:text-brand">
                  {g.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
