/**
 * Montagem do XML da NF-e modelo 55, layout 4.00 (MOC 7.0 / NT vigentes), sem espaços nem quebras de linha
 * (a SEFAZ rejeita). Os dados vêm prontos do sistema; aqui só se formata, calcula totais, chave e dígito.
 */
export type Ambiente = 1 | 2; // 1 produção, 2 homologação

export interface Endereco { xLgr: string; nro: string; xCpl?: string | null; xBairro: string; cMun: string; xMun: string; UF: string; CEP: string; fone?: string | null }
export interface Emitente {
  CNPJ: string; xNome: string; xFant?: string | null; IE: string; CRT: 1 | 2 | 3; ender: Endereco;
  /** responsável técnico (opcional; algumas UFs exigem) */
  respTec?: { CNPJ: string; xContato: string; email: string; fone: string } | null;
}
export interface Destinatario { CNPJ?: string | null; CPF?: string | null; xNome: string; ender: Endereco; indIEDest: 1 | 2 | 9; IE?: string | null; email?: string | null }
export interface Item {
  cProd: string; cEAN?: string | null; xProd: string; NCM: string; CEST?: string | null; CFOP: string; uCom: string;
  qCom: number; vUnCom: number; vDesc?: number;
  orig: number;
  /** Simples Nacional (CRT 1/2): CSOSN; regime normal (CRT 3): CST + alíquota */
  CSOSN?: string; CST?: string; pICMS?: number;
  /** % de redução da base de cálculo (CST 20), ex.: 61.11 */
  pRedBC?: number;
  PIS: { CST: string; pPIS?: number }; COFINS: { CST: string; pCOFINS?: number };
}
export interface NotaInput {
  ambiente: Ambiente; serie: number; nNF: number; natOp: string; dhEmi?: string;
  emit: Emitente; dest: Destinatario; itens: Item[];
  indFinal: 0 | 1; indPres: 0 | 1 | 2 | 3 | 4 | 5 | 9; modFrete: 0 | 1 | 2 | 3 | 4 | 9;
  pagamento: { tPag: string; vPag?: number }[]; infCpl?: string | null;
  /** volumes transportados (peso em kg) */
  vol?: { qVol?: number; esp?: string | null; pesoL?: number; pesoB?: number } | null;
  cNF?: string;
}

const HOMOLOG_NOME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
const UF_CODE: Record<string, string> = { RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53' };
export const ufCode = (uf: string) => UF_CODE[uf.toUpperCase()] ?? (() => { throw new Error(`UF inválida: ${uf}`); })();

const d = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const f = (n: number, dec: number) => n.toFixed(dec);
/** texto para XML: sem acento problemático de controle, espaços únicos, & < > escapados, até `max` caracteres */
export function txt(s: string | null | undefined, max = 60): string {
  const clean = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const tag = (name: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '' : `<${name}>${value}</${name}>`);

/** Dígito verificador da chave (módulo 11, pesos 2..9). */
export function dvChave(chave43: string): string {
  let soma = 0, peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) { soma += Number(chave43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

export function montarChave(n: { cUF: string; aamm: string; cnpj: string; mod: string; serie: number; nNF: number; tpEmis: string; cNF: string }) {
  const c43 = `${n.cUF}${n.aamm}${n.cnpj.padStart(14, '0')}${n.mod}${String(n.serie).padStart(3, '0')}${String(n.nNF).padStart(9, '0')}${n.tpEmis}${n.cNF}`;
  if (c43.length !== 43) throw new Error('Chave com tamanho inválido: confira CNPJ, série e número.');
  return c43 + dvChave(c43);
}

/** Data/hora com fuso de Brasília (formato AAAA-MM-DDThh:mm:ss-03:00). */
export function dataHoraBR(date = new Date()) {
  const z = new Date(date.getTime() - 3 * 3600000).toISOString().slice(0, 19);
  return `${z}-03:00`;
}

function endereco(prefix: 'enderEmit' | 'enderDest', e: Endereco) {
  return `<${prefix}>${tag('xLgr', txt(e.xLgr))}${tag('nro', txt(e.nro, 60))}${tag('xCpl', txt(e.xCpl))}${tag('xBairro', txt(e.xBairro))}${tag('cMun', d(e.cMun))}${tag('xMun', txt(e.xMun))}${tag('UF', e.UF.toUpperCase())}${tag('CEP', d(e.CEP))}<cPais>1058</cPais><xPais>BRASIL</xPais>${tag('fone', d(e.fone))}</${prefix}>`;
}

export interface NotaMontada { xml: string; chave: string; cNF: string; vNF: number; dhEmi: string }

export function montarNFe(n: NotaInput): NotaMontada {
  if (!n.itens.length) throw new Error('A nota precisa de pelo menos um item.');
  const homolog = n.ambiente === 2;
  const cUF = ufCode(n.emit.ender.UF);
  const dhEmi = n.dhEmi ?? dataHoraBR();
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
  const cNF = (n.cNF ?? String(Math.floor(Math.random() * 1e8)).padStart(8, '0')).slice(0, 8);
  const chave = montarChave({ cUF, aamm, cnpj: d(n.emit.CNPJ), mod: '55', serie: n.serie, nNF: n.nNF, tpEmis: '1', cNF });
  const idDest = n.dest.ender.UF.toUpperCase() === n.emit.ender.UF.toUpperCase() ? 1 : 2;
  const simples = n.emit.CRT !== 3;

  const ide = `<ide><cUF>${cUF}</cUF><cNF>${cNF}</cNF>${tag('natOp', txt(n.natOp))}<mod>55</mod><serie>${n.serie}</serie><nNF>${n.nNF}</nNF><dhEmi>${dhEmi}</dhEmi><dhSaiEnt>${dhEmi}</dhSaiEnt><tpNF>1</tpNF><idDest>${idDest}</idDest><cMunFG>${d(n.emit.ender.cMun)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${n.ambiente}</tpAmb><finNFe>1</finNFe><indFinal>${n.indFinal}</indFinal><indPres>${n.indPres}</indPres>${[2, 3, 4, 9].includes(n.indPres) ? '<indIntermed>0</indIntermed>' : ''}<procEmi>0</procEmi><verProc>ISA Gestao</verProc></ide>`;
  const emit = `<emit><CNPJ>${d(n.emit.CNPJ)}</CNPJ>${tag('xNome', txt(n.emit.xNome))}${tag('xFant', txt(n.emit.xFant))}${endereco('enderEmit', n.emit.ender)}<IE>${d(n.emit.IE)}</IE><CRT>${n.emit.CRT}</CRT></emit>`;
  const docDest = n.dest.CNPJ ? `<CNPJ>${d(n.dest.CNPJ)}</CNPJ>` : `<CPF>${d(n.dest.CPF)}</CPF>`;
  const dest = `<dest>${docDest}${tag('xNome', homolog ? HOMOLOG_NOME : txt(n.dest.xNome))}${endereco('enderDest', n.dest.ender)}<indIEDest>${n.dest.indIEDest}</indIEDest>${n.dest.indIEDest === 1 ? tag('IE', d(n.dest.IE)) : ''}${tag('email', txt(n.dest.email, 60))}</dest>`;

  let vProdT = 0, vDescT = 0, vBCT = 0, vICMST = 0, vPIST = 0, vCOFT = 0;
  const det = n.itens.map((it, i) => {
    const vProd = r2(it.qCom * it.vUnCom), vDesc = r2(it.vDesc ?? 0), base = r2(vProd - vDesc);
    vProdT += vProd; vDescT += vDesc;
    let icms: string;
    if (simples) {
      const csosn = it.CSOSN ?? '102';
      icms = `<ICMS><ICMSSN${['101'].includes(csosn) ? '101' : ['102', '103', '300', '400'].includes(csosn) ? '102' : csosn}><orig>${it.orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN${['101'].includes(csosn) ? '101' : ['102', '103', '300', '400'].includes(csosn) ? '102' : csosn}></ICMS>`;
    } else {
      const cst = it.CST ?? '00', p = it.pICMS ?? 0;
      if (cst === '00') { const v = r2((base * p) / 100); vBCT += base; vICMST += v; icms = `<ICMS><ICMS00><orig>${it.orig}</orig><CST>00</CST><modBC>3</modBC><vBC>${f(base, 2)}</vBC><pICMS>${f(p, 4)}</pICMS><vICMS>${f(v, 2)}</vICMS></ICMS00></ICMS>`; }
      else if (cst === '20') { const red = it.pRedBC ?? 0; const bc = r2(base * (1 - red / 100)); const v = r2((bc * p) / 100); vBCT += bc; vICMST += v; icms = `<ICMS><ICMS20><orig>${it.orig}</orig><CST>20</CST><modBC>3</modBC><pRedBC>${f(red, 4)}</pRedBC><vBC>${f(bc, 2)}</vBC><pICMS>${f(p, 4)}</pICMS><vICMS>${f(v, 2)}</vICMS></ICMS20></ICMS>`; }
      else if (['40', '41', '50'].includes(cst)) icms = `<ICMS><ICMS40><orig>${it.orig}</orig><CST>${cst}</CST></ICMS40></ICMS>`;
      else throw new Error(`CST de ICMS ${cst} ainda não suportado pelo emissor (use 00, 20, 40, 41 ou 50).`);
    }
    const pis = it.PIS.pPIS ? (() => { const v = r2((base * it.PIS.pPIS!) / 100); vPIST += v; return `<PIS><PISAliq><CST>${it.PIS.CST}</CST><vBC>${f(base, 2)}</vBC><pPIS>${f(it.PIS.pPIS!, 4)}</pPIS><vPIS>${f(v, 2)}</vPIS></PISAliq></PIS>`; })()
      : ['04', '05', '06', '07', '08', '09'].includes(it.PIS.CST) ? `<PIS><PISNT><CST>${it.PIS.CST}</CST></PISNT></PIS>`
      : `<PIS><PISOutr><CST>${it.PIS.CST}</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>`;
    const cof = it.COFINS.pCOFINS ? (() => { const v = r2((base * it.COFINS.pCOFINS!) / 100); vCOFT += v; return `<COFINS><COFINSAliq><CST>${it.COFINS.CST}</CST><vBC>${f(base, 2)}</vBC><pCOFINS>${f(it.COFINS.pCOFINS!, 4)}</pCOFINS><vCOFINS>${f(v, 2)}</vCOFINS></COFINSAliq></COFINS>`; })()
      : ['04', '05', '06', '07', '08', '09'].includes(it.COFINS.CST) ? `<COFINS><COFINSNT><CST>${it.COFINS.CST}</CST></COFINSNT></COFINS>`
      : `<COFINS><COFINSOutr><CST>${it.COFINS.CST}</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>`;
    const ean = d(it.cEAN) || 'SEM GTIN';
    const xProd = homolog && i === 0 ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : txt(it.xProd, 120);
    const prod = `<prod><cProd>${txt(it.cProd, 60)}</cProd><cEAN>${ean}</cEAN><xProd>${xProd}</xProd><NCM>${d(it.NCM)}</NCM>${tag('CEST', d(it.CEST))}<CFOP>${d(it.CFOP)}</CFOP><uCom>${txt(it.uCom, 6)}</uCom><qCom>${f(it.qCom, 4)}</qCom><vUnCom>${f(it.vUnCom, 10)}</vUnCom><vProd>${f(vProd, 2)}</vProd><cEANTrib>${ean}</cEANTrib><uTrib>${txt(it.uCom, 6)}</uTrib><qTrib>${f(it.qCom, 4)}</qTrib><vUnTrib>${f(it.vUnCom, 10)}</vUnTrib>${vDesc ? `<vDesc>${f(vDesc, 2)}</vDesc>` : ''}<indTot>1</indTot></prod>`;
    return `<det nItem="${i + 1}">${prod}<imposto>${icms}${pis}${cof}</imposto></det>`;
  }).join('');

  vProdT = r2(vProdT); vDescT = r2(vDescT);
  const vNF = r2(vProdT - vDescT);
  const total = `<total><ICMSTot><vBC>${f(vBCT, 2)}</vBC><vICMS>${f(r2(vICMST), 2)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${f(vProdT, 2)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${f(vDescT, 2)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>${f(r2(vPIST), 2)}</vPIS><vCOFINS>${f(r2(vCOFT), 2)}</vCOFINS><vOutro>0.00</vOutro><vNF>${f(vNF, 2)}</vNF></ICMSTot></total>`;
  const v = n.vol;
  const vol = v && (v.qVol || v.pesoL || v.pesoB) ? `<vol>${v.qVol ? `<qVol>${Math.round(v.qVol)}</qVol>` : ''}${tag('esp', txt(v.esp))}${v.pesoL ? `<pesoL>${f(v.pesoL, 3)}</pesoL>` : ''}${v.pesoB ? `<pesoB>${f(v.pesoB, 3)}</pesoB>` : ''}</vol>` : '';
  const transp = `<transp><modFrete>${n.modFrete}</modFrete>${vol}</transp>`;
  const pag = `<pag>${n.pagamento.map((p) => `<detPag><tPag>${p.tPag}</tPag><vPag>${f(p.tPag === '90' ? 0 : r2(p.vPag ?? vNF), 2)}</vPag></detPag>`).join('')}</pag>`;
  const inf = n.infCpl ? `<infAdic><infCpl>${txt(n.infCpl, 5000)}</infCpl></infAdic>` : '';
  const rt = n.emit.respTec ? `<infRespTec><CNPJ>${d(n.emit.respTec.CNPJ)}</CNPJ>${tag('xContato', txt(n.emit.respTec.xContato))}${tag('email', txt(n.emit.respTec.email))}${tag('fone', d(n.emit.respTec.fone))}</infRespTec>` : '';
  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${chave}">${ide}${emit}${dest}${det}${total}${transp}${pag}${inf}${rt}</infNFe></NFe>`;
  return { xml, chave, cNF, vNF, dhEmi };
}

/** Evento de cancelamento (110111). */
export function montarCancelamento(e: { ambiente: Ambiente; cnpj: string; chave: string; protocolo: string; justificativa: string; seq?: number; dhEvento?: string }) {
  const seq = e.seq ?? 1;
  if (e.justificativa.trim().length < 15) throw new Error('A justificativa do cancelamento precisa ter pelo menos 15 caracteres.');
  const id = `ID110111${e.chave}${String(seq).padStart(2, '0')}`;
  const inf = `<infEvento Id="${id}"><cOrgao>${e.chave.slice(0, 2)}</cOrgao><tpAmb>${e.ambiente}</tpAmb><CNPJ>${d(e.cnpj)}</CNPJ><chNFe>${e.chave}</chNFe><dhEvento>${e.dhEvento ?? dataHoraBR()}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${e.protocolo}</nProt><xJust>${txt(e.justificativa, 255)}</xJust></detEvento></infEvento>`;
  return { xml: `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${inf}</evento>`, id };
}
