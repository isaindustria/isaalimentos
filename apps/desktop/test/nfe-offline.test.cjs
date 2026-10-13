// Teste offline do emissor: certificado de teste, monta, assina, confere assinatura e grava o XML para validar no XSD.
const forge = require('node-forge');
const fs = require('node:fs');
const path = require('node:path');
const { montarNFe, montarCancelamento, dvChave } = require('../dist/nfe/xml');
const { assinar, verificar } = require('../dist/nfe/sign');
const { parsePfx } = require('../dist/nfe/certStore');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// certificado e-CNPJ de teste (autoassinado) em .pfx com senha
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate(); cert.publicKey = keys.publicKey; cert.serialNumber = '01';
cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
const attrs = [{ name: 'commonName', value: 'ISA IND DE ALIMENTOS E TEMPEROS LTDA:55747709000147' }, { name: 'countryName', value: 'BR' }];
cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
const pfx = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'senha-teste', { algorithm: '3des' })).getBytes(), 'binary');
let erro = null; try { parsePfx(pfx, 'errada'); } catch (e) { erro = e.message; }
ok(/Senha incorreta/.test(erro || ''), 'senha errada é recusada com mensagem clara');
const c = parsePfx(pfx, 'senha-teste');
ok(c.info.cnpj === '55747709000147' && c.info.diasParaVencer > 300, 'lê CNPJ e validade do certificado: ' + c.info.cnpj);

ok(dvChave('3526105574770900014755001000000123100000001'.slice(0, 43)) === dvChave('3526105574770900014755001000000123100000001'.slice(0, 43)), 'dv determinístico');
// exemplo conhecido do Manual (chave 3518...): soma módulo 11
ok(dvChave('5206043300991100250655012000000780026730161') === '5', 'dígito verificador confere com exemplo do manual');

const ender = { xLgr: 'Rua dos Minerais', nro: '57', xBairro: 'Parque Sao Pedro', cMun: '3523107', xMun: 'Itaquaquecetuba', UF: 'SP', CEP: '08595-000', fone: '1151982994' };
const input = {
  ambiente: 2, serie: 1, nNF: 123, natOp: 'Venda de producao do estabelecimento', cNF: '00000001', dhEmi: '2026-10-13T10:00:00-03:00',
  emit: { CNPJ: '55.747.709/0001-47', xNome: 'ISA IND DE ALIMENTOS E TEMPEROS LTDA', xFant: 'ISA Alimentos', IE: '123456789110', CRT: 1, ender },
  dest: { CNPJ: '11.979.388/0001-81', xNome: 'Supermercado Exemplo', indIEDest: 1, IE: '111222333444', email: 'compras@exemplo.com', ender: { ...ender, xLgr: 'Av. Exemplo & Cia', nro: '100', cMun: '3518800', xMun: 'Guarulhos' } },
  itens: [
    { cProd: '000900', xProd: 'TEMPERO ISA GRANEL', NCM: '21039021', CFOP: '5101', uCom: 'KG', qCom: 10, vUnCom: 6.6, vDesc: 1.98, orig: 0, CSOSN: '102', PIS: { CST: '99' }, COFINS: { CST: '99' } },
    { cProd: '000901', xProd: 'AMEIXA SECA POTE 200G', NCM: '08132000', CFOP: '5102', uCom: 'UN', qCom: 120, vUnCom: 12.4, vDesc: 44.64, orig: 0, CSOSN: '102', PIS: { CST: '99' }, COFINS: { CST: '99' } },
  ],
  indFinal: 0, indPres: 9, modFrete: 9, pagamento: [{ tPag: '15' }], infCpl: 'Pedido 4580 - Vendedor Paula',
};
const m = montarNFe(input);
ok(m.chave.length === 44 && m.chave.startsWith('3526105574770900014755001000000123'), 'chave de acesso 44 dígitos: ' + m.chave);
ok(m.vNF === 1507.38, 'total da nota com desconto: ' + m.vNF);
ok(!/\n|>\s+</.test(m.xml), 'XML sem quebras de linha nem espaços entre tags');
ok(m.xml.includes('NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO') && m.xml.includes('NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO'), 'homologação usa textos obrigatórios');
ok(m.xml.includes('Av. Exemplo &amp; Cia'), 'caracteres especiais escapados');
const signed = assinar(m.xml, 'infNFe', c.keyPem, c.certPem);
ok(verificar(signed, c.certPem), 'assinatura confere');
ok(/<Reference URI="#NFe\d{44}">/.test(signed) && signed.includes('rsa-sha1') && signed.includes('<X509Certificate>'), 'assinatura no padrão SEFAZ (URI, rsa-sha1, X509)');
const adulterado = signed.replace('<vNF>1507.38</vNF>', '<vNF>1.00</vNF>');
ok(!verificar(adulterado, c.certPem), 'nota alterada depois de assinada é detectada');
const lote = `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>${signed.replace(/^<\?xml[^>]*>/, '')}</enviNFe>`;
const ev = montarCancelamento({ ambiente: 2, cnpj: '55747709000147', chave: m.chave, protocolo: '135260000000001', justificativa: 'Pedido cancelado pelo cliente antes da entrega' });
const evSigned = assinar(ev.xml, 'infEvento', c.keyPem, c.certPem);
ok(verificar(evSigned, c.certPem), 'evento de cancelamento assinado confere');
const out = process.argv[2] || '.';
fs.writeFileSync(path.join(out, 'enviNFe.xml'), lote);
fs.writeFileSync(path.join(out, 'envEvento.xml'), `<envEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote>${evSigned}</envEvento>`);

// Nota igual ao modelo da ISA (regime normal, CST 20 com redução de base, transferência)
const modelo = montarNFe({ ...input, nNF: 958, cNF: '00677507', natOp: 'TRANSFERENCIA',
  emit: { ...input.emit, CRT: 3, IE: '379646137119', ender: { xLgr: 'R CURIO', nro: '45', xBairro: 'PARQUE SAO PEDRO', cMun: '3523107', xMun: 'ITAQUAQUECETUBA', UF: 'SP', CEP: '08586100', fone: '1151982994' } },
  itens: [{ cProd: '881', xProd: 'ALHO FRESCO NACIONAL N6 CX 10KG', NCM: '07032090', CFOP: '5152', uCom: 'CX', qCom: 250, vUnCom: 134, orig: 0, CST: '20', pICMS: 18, pRedBC: 61.11, cBenef: 'SP020030', IBSCBS: { CST: '000', cClassTrib: '000001', pIBSUF: 0.1, pIBSMun: 0, pCBS: 0.9 }, PIS: { CST: '49' }, COFINS: { CST: '49' } }],
  vol: { qVol: 0, pesoL: 2500, pesoB: 2650 }, infCpl: 'Reducao da base de calculo nos termos do art. 3, inciso VI, do Anexo II do RICMS/SP - Vendedor: BRUNO' });
ok(modelo.vNF === 33500, 'modelo: total 33.500,00');
ok(modelo.xml.includes('<vBC>13028.15</vBC>') && modelo.xml.includes('<vICMS>2345.07</vICMS>') && modelo.xml.includes('<pRedBC>61.1100</pRedBC>'), 'modelo: base reduzida 13.028,15 e ICMS 2.345,07 (igual ao DANFE da ISA)');
const modeloSig = assinar(modelo.xml, 'infNFe', c.keyPem, c.certPem);
ok(verificar(modeloSig, c.certPem), 'modelo: assinatura confere');
fs.writeFileSync(path.join(out, 'enviNFe_modelo.xml'), `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>2</idLote><indSinc>1</indSinc>${modeloSig}</enviNFe>`);
// nfeProc de exemplo (protocolo fictício) para testar o DANFE
fs.writeFileSync(path.join(out, 'nfeProc_modelo.xml'), `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${modeloSig}<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SP_NFE_PL009_V4</verAplic><chNFe>${modelo.chave}</chNFe><dhRecbto>2026-10-13T10:00:05-03:00</dhRecbto><nProt>135263641214858</nProt><digVal>x</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`);
