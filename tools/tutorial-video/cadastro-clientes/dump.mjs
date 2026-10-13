import { makeDb } from '../fixtures.mjs';
import { prepare } from './setup.mjs';
const { D } = makeDb(); prepare(D);
console.log(JSON.stringify(D.customers.map((c) => ({ code: c.code, name: c.name, trade_name: c.trade_name, cnpj: c.cnpj, city: c.city, state: c.state, seller: c.seller_name, disc: c.financial_discounts }))));
