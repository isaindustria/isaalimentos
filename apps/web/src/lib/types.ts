import type { MatchStatus, Candidate } from '@/domain/matching';

export type Role = 'admin' | 'operador';

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
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
