import type { MatchStatus, Candidate } from '@/domain/matching';

export type Role = 'admin' | 'gestor' | 'comercial' | 'estoque' | 'producao' | 'operador';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  comercial: 'Comercial / Compras',
  estoque: 'Estoque',
  producao: 'Produção',
  operador: 'Operador',
};

/** Areas de escrita (item 6 do v1.3): cada papel so altera as telas da propria area; gestor e admin alteram tudo. */
export type Area = 'compras' | 'estoque' | 'producao';
export const AREA_LABEL: Record<Area, string> = { compras: 'Comercial / Compras (insumos, pedidos, clientes, preços, rotas)', estoque: 'Estoque (estoque e produtos)', producao: 'Produção (ordens de produção)' };
export const ROLE_AREAS: Record<Role, Area[]> = { admin: ['compras', 'estoque', 'producao'], gestor: ['compras', 'estoque', 'producao'], comercial: ['compras'], estoque: ['estoque'], producao: ['producao'], operador: [] };

export type ProfileStatus = 'pendente' | 'ativo' | 'bloqueado';
export type Access = 'admin' | 'editor' | 'visualizador';

export const ACCESS_LABEL: Record<Access, string> = {
  admin: 'Administrador (tudo, inclusive usuários)',
  editor: 'Editor (cria e altera na própria área)',
  visualizador: 'Visualizador (só consulta)',
};
export const STATUS_LABEL_PROFILE: Record<ProfileStatus, string> = { pendente: 'Aguardando aprovação', ativo: 'Ativo', bloqueado: 'Bloqueado' };

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  access: Access;
  status: ProfileStatus;
  is_superadmin: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface Product {
  code: string;
  description: string;
  reference: string | null;
  units_per_box: number;
  weight_g: number | null;
  unit: string;
  category: string | null;
  min_stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductAlias {
  id: string;
  product_code: string;
  client_code: string | null;
  description: string | null;
  normalized: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockImport {
  id: string;
  file_name: string | null;
  imported_at: string;
  imported_by: string | null;
  locations: number[];
  rows_total: number;
  products_count: number;
  total_units: number;
  is_current: boolean;
}

export interface StockBalance {
  id: string;
  import_id: string;
  product_code: string;
  location: number;
  quantity: number;
}

export interface CurrentStock {
  code: string;
  description: string;
  units_per_box: number;
  min_stock: number;
  location_1: number;
  location_5: number;
  total: number;
  imported_at: string | null;
}

export interface Customer {
  id: string;
  cnpj: string | null;
  name: string;
  trade_name: string | null;
  group_name: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  cep: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type InteractionKind = 'ligacao' | 'visita' | 'email' | 'whatsapp' | 'reuniao' | 'observacao';

export interface CustomerInteraction {
  id: string;
  customer_id: string;
  kind: InteractionKind;
  content: string;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export interface OrderImport {
  id: string;
  file_name: string | null;
  imported_at: string;
  imported_by: string | null;
  orders_count: number;
  items_count: number;
  pending_count: number;
}

export type OrderStatus = 'aberto' | 'em_producao' | 'faturado' | 'entregue' | 'cancelado';

export interface Order {
  id: string;
  import_id: string | null;
  customer_id: string | null;
  order_number: string | null;
  order_date: string | null;
  delivery_date: string | null;
  buyer: string | null;
  payment_terms: string | null;
  total_value: number;
  total_weight: number | null;
  status: OrderStatus;
  source: string;
  notes: string | null;
  stock_posted?: boolean;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, 'id' | 'name' | 'cnpj' | 'city' | 'state' | 'group_name'> | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  seq: number | null;
  client_code: string | null;
  raw_description: string;
  packaging: string | null;
  product_code: string | null;
  quantity_boxes: number;
  units_per_box: number;
  quantity_units: number;
  unit_price: number | null;
  total_price: number | null;
  weight_kg: number | null;
  match_status: MatchStatus;
  match_score: number | null;
  candidates: Candidate[];
  product?: Pick<Product, 'code' | 'description'> | null;
  order?: Pick<Order, 'id' | 'order_number' | 'order_date' | 'customer_id'> & { customer?: Pick<Customer, 'name'> | null };
}

export type RunStatus = 'planejado' | 'em_andamento' | 'concluido';

export interface ProductionRun {
  id: string;
  name: string;
  stock_import_id: string | null;
  order_ids: string[];
  status: RunStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at?: string | null;
  stock_posted?: boolean;
}

export interface ProductionRunItem {
  id: string;
  run_id: string;
  product_code: string;
  description: string;
  stock_available: number;
  ordered_units: number;
  production_need: number;
  remaining: number;
  produced_units: number;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

export type MovementKind = 'entrada' | 'saida' | 'ajuste' | 'producao' | 'venda' | 'perda' | 'inventario';

export interface StockMovement {
  id: string;
  import_id: string | null;
  product_code: string;
  location: number;
  quantity: number;
  kind: MovementKind;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
  product?: Pick<Product, 'code' | 'description'> | null;
  author?: Pick<Profile, 'name'> | null;
}

export type ActivityKind = 'estoque' | 'pedido' | 'producao' | 'cliente' | 'sistema' | 'mensagem';

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  body: string | null;
  link: string | null;
  actor_id: string | null;
  actor_name: string | null;
  audience: string[];
  created_at: string;
}

/* ---- v1.4 ---- */
export interface PriceList { id: string; product_code: string; customer_id: string | null; group_name: string | null; price_box: number; valid_from: string; notes: string | null; created_at: string; product?: Pick<Product, 'code' | 'description'> | null; customer?: Pick<Customer, 'id' | 'name'> | null }
export type SupplyReference = 'materia_prima' | 'insumo' | 'embalagem' | 'tampa' | 'pote' | 'etiqueta';
export const SUPPLY_REFERENCE_LABEL: Record<SupplyReference, string> = { materia_prima: 'Matéria-prima', insumo: 'Insumo', embalagem: 'Embalagem', tampa: 'Tampa', pote: 'Pote', etiqueta: 'Etiqueta' };
export interface Supply { id: string; code: string | null; reference: SupplyReference; name: string; unit: string; stock: number; min_stock: number; cost: number | null; supplier: string | null; active: boolean; created_at: string; updated_at: string }
/** Consumo de um insumo em um mes (period = primeiro dia do mes). */
export interface SupplyConsumption { id: string; supply_id: string; period: string; qty: number; created_at: string }
export interface ProductBom { id: string; product_code: string; supply_id: string; qty_per_unit: number; supply?: Supply | null }
export type PurchaseStatus = 'rascunho' | 'enviado' | 'recebido' | 'cancelado';
export interface PurchaseOrder { id: string; supplier: string | null; status: PurchaseStatus; notes: string | null; production_run_id: string | null; created_by: string | null; created_at: string; received_at: string | null; items?: PurchaseOrderItem[] }
export interface PurchaseOrderItem { id: string; purchase_order_id: string; supply_id: string; qty: number; unit_cost: number | null; supply?: Supply | null }
export type RouteStatus = 'planejada' | 'em_rota' | 'concluida';
export interface DeliveryRoute { id: string; name: string; route_date: string; driver: string | null; vehicle: string | null; status: RouteStatus; order_ids: string[]; notes: string | null; created_at: string }
export interface AuditEntry { id: string; table_name: string; row_id: string; action: 'INSERT' | 'UPDATE' | 'DELETE'; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; changed_by: string | null; changed_by_name: string | null; changed_at: string }
export interface ProductStats { code: string; description: string; min_stock: number; weekly_avg_units: number; total_units_all: number; revenue_all: number }
export interface DbStats { db_bytes: number; tables: Array<{ name: string; bytes: number; rows: number }>; audit_rows: number; activities_rows: number }
export interface Modules { precos: boolean; compras: boolean; rotas: boolean; relatorios: boolean; auditoria: boolean; portal: boolean; push: boolean }
