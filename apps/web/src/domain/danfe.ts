/**
 * DANFE (retrato, A4) gerado a partir do XML autorizado (nfeProc), no layout que a ISA já usa:
 * canhoto, emitente com logo, código de barras da chave, destinatário, cálculo do imposto, transporte, produtos,
 * ISSQN e dados adicionais. Em homologação sai a tarja "SEM VALOR FISCAL".
 */
import { jsPDF } from 'jspdf';

// Code 128: larguras (barra/espaço) de cada símbolo 0..106
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

/** Código de barras Code 128-C (só dígitos, quantidade par) desenhado em (x,y) com largura w e altura h. */
function code128c(doc: jsPDF, digits: string, x: number, y: number, w: number, h: number) {
  const codes = [105];
  for (let i = 0; i < digits.length; i += 2) codes.push(Number(digits.slice(i, i + 2)));
  let sum = 105; codes.slice(1).forEach((c, i) => { sum += c * (i + 1); });
  codes.push(sum % 103, 106);
  const pattern = codes.map((c) => C128[c]).join('');
  const modules = [...pattern].reduce((s, d) => s + Number(d), 0);
  const unit = w / modules;
  let cx = x;
  [...pattern].forEach((d, i) => { const bw = Number(d) * unit; if (i % 2 === 0) doc.rect(cx, y, bw, h, 'F'); cx += bw; });
}

const find = (el: Element | Document, name: string) => (el as Element).getElementsByTagNameNS?.('http://www.portalfiscal.inf.br/nfe', name)?.[0] ?? null;
const findAll = (el: Element | Document, name: string) => Array.from((el as Element).getElementsByTagNameNS?.('http://www.portalfiscal.inf.br/nfe', name) ?? []);
const t = (el: Element | null, name: string) => (el ? find(el, name)?.textContent?.trim() ?? '' : '');

const brl = (v: string | number, dec = 2) => (v === '' || v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fmtCnpj = (s: string) => (s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s.length === 11 ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s);
const fmtCep = (s: string) => (s.length === 8 ? `${s.slice(0, 2)}.${s.slice(2, 5)}-${s.slice(5)}` : s);
const fmtData = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fmtHora = (iso: string) => (iso ? iso.slice(11, 19) : '');
const chaveFmt = (c: string) => c.replace(/(\d{4})(?=\d)/g, '$1 ');

export async function gerarDanfe(xml: string, logoUrl?: string, extra: { inscricaoMunicipal?: string | null } = {}): Promise<Blob> {
  const docXml = new DOMParser().parseFromString(xml, 'text/xml');
  const inf = find(docXml, 'infNFe');
  if (!inf) throw new Error('XML sem infNFe.');
  const ide = find(inf, 'ide'), emit = find(inf, 'emit'), dest = find(inf, 'dest'), tot = find(inf, 'ICMSTot'), transp = find(inf, 'transp'), infAdic = find(inf, 'infAdic');
  const enderE = find(emit!, 'enderEmit'), enderD = dest ? find(dest, 'enderDest') : null, prot = find(docXml, 'infProt');
  const chave = (inf.getAttribute('Id') ?? '').replace(/^NFe/, '');
  const homolog = t(ide, 'tpAmb') === '2';
  const nNF = t(ide, 'nNF').padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1.');
  const serie = t(ide, 'serie').padStart(3, '0');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 8, R = 202, W = R - L;
  let logo: string | null = null;
  if (logoUrl) { try { const b = await (await fetch(logoUrl)).blob(); logo = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.readAsDataURL(b); }); } catch { logo = null; } }

  doc.setLineWidth(0.2);
  const box = (x: number, y: number, w: number, h: number, label: string, value = '', o: { align?: 'left' | 'right' | 'center'; size?: number; bold?: boolean } = {}) => {
    doc.rect(x, y, w, h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.text(label.toUpperCase(), x + 0.8, y + 2.2);
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size ?? 8);
    const tx = o.align === 'right' ? x + w - 1 : o.align === 'center' ? x + w / 2 : x + 1;
    doc.text(String(value ?? ''), tx, y + h - 1.4, { align: o.align ?? 'left', maxWidth: w - 2 });
  };
  const title = (y: number, txt: string) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(txt, L, y); };

  const desenharCabecalho = (y0: number, folha: string) => {
    // emitente
    doc.rect(L, y0, 82, 38);
    if (logo) doc.addImage(logo, 'PNG', L + 2, y0 + 12, 22, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(t(emit, 'xNome'), 76), L + 41, y0 + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    const end = [`${t(enderE, 'xLgr')} ${t(enderE, 'nro')} ${t(enderE, 'xCpl')}`.trim() + `  ${t(enderE, 'xBairro')},`, `${t(enderE, 'xMun')} ${fmtCep(t(enderE, 'CEP'))}`, `${t(enderE, 'UF')} BRASIL`, t(enderE, 'fone') ? `Telefone: ${t(enderE, 'fone')}` : ''].filter(Boolean);
    doc.text(end, L + 54, y0 + 18, { align: 'center', maxWidth: 52 });
    // DANFE
    doc.rect(L + 82, y0, 40, 38);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('DANFE', L + 102, y0 + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text(['Documento Auxiliar da', 'Nota Fiscal Eletrônica'], L + 102, y0 + 8.5, { align: 'center' });
    doc.setFontSize(7.5); doc.text(['0 - ENTRADA', '1 - SAÍDA'], L + 84, y0 + 16);
    doc.rect(L + 110, y0 + 13.5, 7, 6); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t(ide, 'tpNF'), L + 113.5, y0 + 18, { align: 'center' });
    doc.setFontSize(9); doc.text([`Nº ${nNF}`, `Série ${serie}`, folha], L + 102, y0 + 25, { align: 'center' });
    // código de barras e chave
    doc.rect(L + 122, y0, W - 122, 38);
    doc.setFillColor(0, 0, 0); code128c(doc, chave, L + 125, y0 + 2, W - 128, 11);
    doc.rect(L + 122, y0 + 14.5, W - 122, 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.text('CHAVE DE ACESSO', L + 123, y0 + 16.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.text(chaveFmt(chave), L + 122 + (W - 122) / 2, y0 + 21.3, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(['Consulta de Autenticidade no portal nacional da NF-e', 'www.nfe.fazenda.gov.br/portal ou no site da SEFAZ', 'autorizadora.'], L + 122 + (W - 122) / 2, y0 + 27, { align: 'center' });
    let y = y0 + 38;
    box(L, y, 122, 7, 'Natureza da operação', t(ide, 'natOp'));
    box(L + 122, y, W - 122, 7, 'Protocolo de autorização de uso', prot ? `${t(prot, 'nProt')}   ${fmtData(t(prot, 'dhRecbto'))}  ${fmtHora(t(prot, 'dhRecbto'))}` : 'SEM PROTOCOLO', { align: 'center' });
    y += 7;
    box(L, y, 64, 7, 'Inscrição estadual', t(emit, 'IE'));
    box(L + 64, y, 74, 7, 'Inscrição estadual do substituto tributário', t(emit, 'IEST'));
    box(L + 138, y, W - 138, 7, 'CNPJ / CPF', fmtCnpj(t(emit, 'CNPJ') || t(emit, 'CPF')), { align: 'center' });
    return y + 7;
  };

  // ---- canhoto ----
  doc.rect(L, 6, W - 30, 17); doc.rect(R - 30, 6, 30, 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text(doc.splitTextToSize(`Recebemos de ${t(emit, 'xNome')} os produtos e/ou serviços constantes da Nota Fiscal Eletrônica indicada abaixo.`, W - 33), L + 1, 9);
  doc.setFont('helvetica', 'normal'); doc.text(`${t(dest, 'xNome')}`.slice(0, 80), L + 1, 15.5);
  doc.line(L, 17, R - 30, 17); doc.line(L + 40, 17, L + 40, 23);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.text('DATA DO RECEBIMENTO', L + 1, 19); doc.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', L + 41, 19);
  doc.setFontSize(10); doc.text(['NF-e', `Nº ${nNF}`, `Série ${Number(serie)}`], R - 15, 11, { align: 'center' });
  doc.setLineDashPattern([1.2, 1], 0); doc.line(L, 26, R, 26); doc.setLineDashPattern([], 0);

  let y = desenharCabecalho(29, 'Folha 1/1');
  // ---- destinatário ----
  y += 3.5; title(y, 'DESTINATÁRIO / REMETENTE'); y += 1;
  const dhEmi = t(ide, 'dhEmi'), dhSai = t(ide, 'dhSaiEnt');
  box(L, y, 118, 7, 'Nome / razão social', t(dest, 'xNome'));
  box(L + 118, y, 46, 7, 'CNPJ / CPF', fmtCnpj(t(dest, 'CNPJ') || t(dest, 'CPF')), { align: 'center' });
  box(L + 164, y, W - 164, 7, 'Data da emissão', fmtData(dhEmi), { align: 'right' }); y += 7;
  box(L, y, 92, 7, 'Endereço', `${t(enderD, 'xLgr')} ${t(enderD, 'nro')} ${t(enderD, 'xCpl')}`.trim());
  box(L + 92, y, 44, 7, 'Bairro / distrito', t(enderD, 'xBairro'));
  box(L + 136, y, 28, 7, 'CEP', fmtCep(t(enderD, 'CEP')), { align: 'center' });
  box(L + 164, y, W - 164, 7, 'Data da saída', fmtData(dhSai), { align: 'right' }); y += 7;
  box(L, y, 82, 7, 'Município', t(enderD, 'xMun'));
  box(L + 82, y, 10, 7, 'UF', t(enderD, 'UF'), { align: 'center' });
  box(L + 92, y, 34, 7, 'Telefone / fax', t(enderD, 'fone'));
  box(L + 126, y, 38, 7, 'Inscrição estadual', t(dest, 'IE'));
  box(L + 164, y, W - 164, 7, 'Hora da saída', fmtHora(dhSai), { align: 'right' }); y += 7;
  // ---- cálculo do imposto ----
  y += 3.5; title(y, 'CÁLCULO DO IMPOSTO'); y += 1;
  const cw = W / 6;
  [['Base de cálculo do ICMS', 'vBC'], ['Valor do ICMS', 'vICMS'], ['Base calc. ICMS subst.', 'vBCST'], ['Valor do ICMS subst.', 'vST'], ['V. aprox. tributos', 'vTotTrib'], ['Valor total dos produtos', 'vProd']].forEach(([l, k], i) => box(L + i * cw, y, cw, 7, l, brl(t(tot, k) || 0), { align: 'right' })); y += 7;
  [['Valor do frete', 'vFrete'], ['Valor do seguro', 'vSeg'], ['Desconto', 'vDesc'], ['Outras despesas acessórias', 'vOutro'], ['Valor do IPI', 'vIPI'], ['Valor total da nota', 'vNF']].forEach(([l, k], i) => box(L + i * cw, y, cw, 7, l, brl(t(tot, k) || 0), { align: 'right', bold: k === 'vNF' })); y += 7;
  // ---- transporte ----
  y += 3.5; title(y, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS'); y += 1;
  const transporta = transp ? find(transp, 'transporta') : null, veic = transp ? find(transp, 'veicTransp') : null, vol = transp ? find(transp, 'vol') : null;
  const mf = t(transp, 'modFrete');
  const MF: Record<string, string> = { '0': '0 - Por conta do Emitente', '1': '1 - Por conta do Destinatário', '2': '2 - Por conta de Terceiros', '3': '3 - Próprio Remetente', '4': '4 - Próprio Destinatário', '9': '9 - Sem Frete' };
  box(L, y, 74, 7, 'Nome / razão social', t(transporta, 'xNome'));
  box(L + 74, y, 32, 7, 'Frete por conta', MF[mf] ?? mf);
  box(L + 106, y, 24, 7, 'Código ANTT', t(veic, 'RNTC'));
  box(L + 130, y, 22, 7, 'Placa do veículo', t(veic, 'placa'));
  box(L + 152, y, 8, 7, 'UF', t(veic, 'UF'));
  box(L + 160, y, W - 160, 7, 'CNPJ / CPF', fmtCnpj(t(transporta, 'CNPJ') || t(transporta, 'CPF'))); y += 7;
  box(L, y, 106, 7, 'Endereço', t(transporta, 'xEnder'));
  box(L + 106, y, 46, 7, 'Município', t(transporta, 'xMun'));
  box(L + 152, y, 8, 7, 'UF', t(transporta, 'UF'));
  box(L + 160, y, W - 160, 7, 'Inscrição estadual', t(transporta, 'IE')); y += 7;
  box(L, y, 22, 7, 'Quantidade', t(vol, 'qVol') || '0', { align: 'right' });
  box(L + 22, y, 36, 7, 'Espécie', t(vol, 'esp'));
  box(L + 58, y, 36, 7, 'Marca', t(vol, 'marca'));
  box(L + 94, y, 36, 7, 'Numeração', t(vol, 'nVol'));
  box(L + 130, y, 30, 7, 'Peso bruto', t(vol, 'pesoB') ? `${brl(t(vol, 'pesoB'), 3)} kg` : '', { align: 'right' });
  box(L + 160, y, W - 160, 7, 'Peso líquido', t(vol, 'pesoL') ? `${brl(t(vol, 'pesoL'), 3)} kg` : '', { align: 'right' }); y += 7;

  // ---- produtos ----
  y += 3.5; title(y, 'DADOS DO PRODUTO/SERVIÇO'); y += 1;
  const cols: Array<[string, number, 'left' | 'right' | 'center']> = [['CÓDIGO PRODUTO', 14, 'center'], ['DESCRIÇÃO DO PRODUTO / SERVIÇO', 53, 'left'], ['NCM/SH', 13, 'center'], ['CST', 7, 'center'], ['CFOP', 8, 'center'], ['UNID.', 8, 'center'], ['QTDE.', 14, 'right'], ['VALOR UNITÁRIO', 15, 'right'], ['DESCONTO', 11, 'right'], ['LÍQUIDO', 14, 'right'], ['BASE DE CÁLC. ICMS', 13, 'right'], ['VALOR ICMS', 11, 'right'], ['VALOR IPI', 9, 'right'], ['ALÍQ. ICMS', 7, 'right'], ['ALÍQ. IPI', 7, 'right']];
  const totalW = cols.reduce((s, c) => s + c[1], 0), scale = W / totalW;
  const header = (yy: number) => {
    let x = L; doc.setFont('helvetica', 'bold'); doc.setFontSize(4.8);
    for (const [label, w] of cols) { const ww = w * scale; doc.rect(x, yy, ww, 6); doc.text(doc.splitTextToSize(label, ww - 1), x + ww / 2, yy + 2.3, { align: 'center' }); x += ww; }
    return yy + 6;
  };
  y = header(y);
  const fimProdutos = 250;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6);
  const dets = findAll(inf, 'det');
  let pagina = 1;
  for (const d of dets) {
    const prod = find(d, 'prod')!, icmsEl = (Array.from(find(d, 'ICMS')?.childNodes ?? []).find((c) => c.nodeType === 1) as Element | undefined) ?? null, ipi = find(d, 'IPI');
    const vProd = Number(t(prod, 'vProd')), vDesc = Number(t(prod, 'vDesc') || 0);
    const cst = icmsEl ? `${t(icmsEl, 'orig')}${t(icmsEl, 'CST') || t(icmsEl, 'CSOSN')}` : '';
    const descr = doc.splitTextToSize(t(prod, 'xProd'), cols[1][1] * scale - 1.5) as string[];
    const rowH = Math.max(4, descr.length * 2.8 + 1.2);
    if (y + rowH > fimProdutos) { doc.addPage(); pagina++; y = header(desenharCabecalho(8, `Folha ${pagina}`) + 4); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); }
    const vals = [t(prod, 'cProd'), descr, t(prod, 'NCM'), cst, t(prod, 'CFOP'), t(prod, 'uCom'), brl(t(prod, 'qCom'), 3), brl(t(prod, 'vUnCom'), 6), brl(vDesc), brl(vProd - vDesc), brl(t(icmsEl, 'vBC') || 0), brl(t(icmsEl, 'vICMS') || 0), brl(t(ipi, 'vIPI') || 0), brl(t(icmsEl, 'pICMS') || 0, 0), brl(t(ipi, 'pIPI') || 0, 0)];
    let x = L;
    cols.forEach(([, w, al], i) => { const ww = w * scale; const tx = al === 'right' ? x + ww - 0.8 : al === 'center' ? x + ww / 2 : x + 0.8; doc.text(vals[i] as string | string[], tx, y + 2.9, { align: al }); x += ww; });
    y += rowH;
  }
  const issY = 252;
  // ---- ISSQN ----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('CÁLCULO DO ISSQN', L, issY - 0.8);
  box(L, issY, 49, 7, 'Inscrição municipal', t(emit, 'IM') || extra.inscricaoMunicipal || '');
  box(L + 49, issY, 49, 7, 'Valor total dos serviços', '0,00', { align: 'right' });
  box(L + 98, issY, 49, 7, 'Base de cálculo do ISSQN', '0,00', { align: 'right' });
  box(L + 147, issY, W - 147, 7, 'Valor total do ISSQN', '0,00', { align: 'right' });
  // ---- dados adicionais ----
  const daY = issY + 11;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('DADOS ADICIONAIS', L, daY - 0.8);
  doc.rect(L, daY, 125, 289 - daY - 4); doc.rect(L + 125, daY, W - 125, 289 - daY - 4);
  doc.setFontSize(5.2); doc.text('INFORMAÇÕES COMPLEMENTARES', L + 0.8, daY + 2.2); doc.text('RESERVADO AO FISCO', L + 126, daY + 2.2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
  const infCpl = (t(infAdic, 'infCpl') || '').split(' - ');
  doc.text(doc.splitTextToSize(infCpl.join('\n'), 122), L + 1, daY + 5);
  if (homolog) {
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p); doc.setTextColor(200, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
      doc.text('SEM VALOR FISCAL', 105, 205, { align: 'center', angle: 25 }); doc.setFontSize(11); doc.text('NF-e emitida em ambiente de homologação', 105, 215, { align: 'center', angle: 25 }); doc.setTextColor(0, 0, 0);
    }
  }
  return doc.output('blob');
}
