/** Emissor de NF-e do programa do Windows: canais IPC usados pela tela do sistema. */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import log from 'electron-log';
import { certInfo, loadCert, removeCert, saveCert } from './certStore';
import { assinar, verificar } from './sign';
import { bloco, pega, soap } from './sefaz';
import { montarCancelamento, montarNFe, ufCode, type Ambiente, type NotaInput } from './xml';

const NS = 'http://www.portalfiscal.inf.br/nfe';
export interface EmissaoResultado { ok: boolean; chave: string; cStat: string | null; motivo: string | null; protocolo: string | null; dhRecbto: string | null; xml: string; vNF: number }

async function status(ambiente: Ambiente, uf = 'SP') {
  const c = loadCert();
  const resp = await soap(ambiente, 'status', `<consStatServ versao="4.00" xmlns="${NS}"><tpAmb>${ambiente}</tpAmb><cUF>${ufCode(uf)}</cUF><xServ>STATUS</xServ></consStatServ>`, c, 30000);
  return { cStat: pega(resp, 'cStat'), motivo: pega(resp, 'xMotivo'), dhRecbto: pega(resp, 'dhRecbto'), tMed: pega(resp, 'tMed') };
}

async function emitir(input: NotaInput): Promise<EmissaoResultado> {
  const c = loadCert();
  if (c.info.cnpj && c.info.cnpj !== input.emit.CNPJ.replace(/\D/g, '').slice(0, 14) && c.info.cnpj.slice(0, 8) !== input.emit.CNPJ.replace(/\D/g, '').slice(0, 8)) {
    throw new Error(`O certificado é do CNPJ ${c.info.cnpj}, mas o emitente cadastrado é ${input.emit.CNPJ}.`);
  }
  const m = montarNFe(input);
  const signed = assinar(m.xml, 'infNFe', c.keyPem, c.certPem);
  if (!verificar(signed, c.certPem)) throw new Error('A assinatura gerada não conferiu. Nada foi enviado.');
  const nfe = signed.replace(/^<\?xml[^>]*>/, '');
  const lote = `<enviNFe versao="4.00" xmlns="${NS}"><idLote>${Date.now().toString().slice(-15)}</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;
  log.info('[nfe] enviando', m.chave, 'ambiente', input.ambiente);
  let resp = await soap(input.ambiente, 'autorizacao', lote, c);
  let cStatLote = pega(resp, 'cStat');
  // Lote recebido para processamento assíncrono: consulta o recibo
  if (cStatLote === '103') {
    const nRec = pega(resp, 'nRec');
    for (let i = 0; i < 6 && cStatLote !== '104'; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      resp = await soap(input.ambiente, 'retAutorizacao', `<consReciNFe versao="4.00" xmlns="${NS}"><tpAmb>${input.ambiente}</tpAmb><nRec>${nRec}</nRec></consReciNFe>`, c);
      cStatLote = pega(resp, 'cStat');
      if (cStatLote === '105') continue; // ainda em processamento
    }
  }
  const prot = bloco(resp, 'protNFe');
  const cStat = prot ? pega(prot, 'cStat') : cStatLote;
  const motivo = prot ? pega(prot, 'xMotivo') : pega(resp, 'xMotivo');
  const ok = cStat === '100' || cStat === '150';
  const protocolo = prot ? pega(prot, 'nProt') : null;
  const xml = ok && prot
    ? `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="${NS}">${nfe}${prot.replace(/^<(\w+:)?protNFe/, '<protNFe').replace(/<\/(\w+:)?protNFe>$/, '</protNFe>')}</nfeProc>`
    : nfe;
  log.info('[nfe] retorno', m.chave, cStat, motivo);
  return { ok, chave: m.chave, cStat, motivo, protocolo, dhRecbto: prot ? pega(prot, 'dhRecbto') : null, xml, vNF: m.vNF };
}

async function consultar(ambiente: Ambiente, chave: string) {
  const c = loadCert();
  const resp = await soap(ambiente, 'consulta', `<consSitNFe versao="4.00" xmlns="${NS}"><tpAmb>${ambiente}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`, c, 30000);
  const prot = bloco(resp, 'protNFe');
  return { cStat: pega(resp, 'cStat'), motivo: pega(resp, 'xMotivo'), protocolo: prot ? pega(prot, 'nProt') : null };
}

async function cancelar(p: { ambiente: Ambiente; cnpj: string; chave: string; protocolo: string; justificativa: string }) {
  const c = loadCert();
  const ev = montarCancelamento(p);
  const signed = assinar(ev.xml, 'infEvento', c.keyPem, c.certPem);
  const corpo = `<envEvento versao="1.00" xmlns="${NS}"><idLote>${Date.now().toString().slice(-15)}</idLote>${signed.replace(/^<\?xml[^>]*>/, '')}</envEvento>`;
  const resp = await soap(p.ambiente, 'evento', corpo, c);
  const ret = bloco(resp, 'retEvento') ?? resp;
  const cStat = pega(ret, 'cStat');
  return { ok: cStat === '135' || cStat === '155', cStat, motivo: pega(ret, 'xMotivo'), protocolo: pega(ret, 'nProt'), xml: resp };
}

/** Envolve cada canal: erros voltam como mensagem (nunca com dados do certificado). */
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (err) { log.warn('[nfe]', channel, (err as Error).message); return { ok: false, error: (err as Error).message }; }
  });
}

export function registerNfe(getWin: () => BrowserWindow | null) {
  handle('nfe:cert-info', () => certInfo());
  // O arquivo é escolhido aqui, no programa: o conteúdo do .pfx nunca vai para a tela nem para a internet.
  handle('nfe:cert-import', async (senha: string) => {
    if (typeof senha !== 'string' || !senha) throw new Error('Informe a senha do certificado.');
    const w = getWin();
    const res = await (w ? dialog.showOpenDialog(w, { title: 'Escolha o certificado A1 da empresa', filters: [{ name: 'Certificado A1', extensions: ['pfx', 'p12'] }], properties: ['openFile'] }) : dialog.showOpenDialog({ properties: ['openFile'] }));
    if (res.canceled || !res.filePaths[0]) return null;
    const buf = fs.readFileSync(res.filePaths[0]);
    if (buf.length > 64 * 1024) throw new Error('Arquivo grande demais para um certificado A1.');
    return saveCert(buf, senha);
  });
  handle('nfe:cert-remove', () => { removeCert(); return true; });
  handle('nfe:status', (ambiente: Ambiente) => status(ambiente === 1 ? 1 : 2));
  handle('nfe:emitir', (input: NotaInput) => emitir(input));
  handle('nfe:consultar', (ambiente: Ambiente, chave: string) => consultar(ambiente === 1 ? 1 : 2, String(chave).replace(/\D/g, '')));
  handle('nfe:cancelar', (p: Parameters<typeof cancelar>[0]) => cancelar(p));
}
