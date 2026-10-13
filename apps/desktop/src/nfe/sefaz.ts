/**
 * Comunicação com a SEFAZ-SP (SOAP 1.2) usando o certificado A1 na conexão (TLS 1.2 com renegociação, que a SEFAZ-SP usa
 * para pedir o certificado). Roda no processo principal do programa do Windows (Node/OpenSSL).
 */
import https from 'node:https';
import tls from 'node:tls';
import { ICP_BRASIL_ROOTS } from './icp';
import type { Ambiente } from './xml';

const HOST: Record<Ambiente, string> = { 1: 'https://nfe.fazenda.sp.gov.br/ws', 2: 'https://homologacao.nfe.fazenda.sp.gov.br/ws' };
const SERV = {
  status: { path: 'nfestatusservico4.asmx', ns: 'NFeStatusServico4', action: 'nfeStatusServicoNF' },
  autorizacao: { path: 'nfeautorizacao4.asmx', ns: 'NFeAutorizacao4', action: 'nfeAutorizacaoLote' },
  retAutorizacao: { path: 'nferetautorizacao4.asmx', ns: 'NFeRetAutorizacao4', action: 'nfeRetAutorizacaoLote' },
  consulta: { path: 'nfeconsultaprotocolo4.asmx', ns: 'NFeConsultaProtocolo4', action: 'nfeConsultaNF' },
  evento: { path: 'nferecepcaoevento4.asmx', ns: 'NFeRecepcaoEvento4', action: 'nfeRecepcaoEvento' },
} as const;
export type Servico = keyof typeof SERV;

const CA = [...tls.rootCertificates, ...ICP_BRASIL_ROOTS];

export async function soap(ambiente: Ambiente, servico: Servico, corpo: string, cert: { keyPem: string; certPem: string }, timeoutMs = 60000): Promise<string> {
  const s = SERV[servico];
  const url = `${HOST[ambiente]}/${s.path}`;
  const wsdl = `http://www.portalfiscal.inf.br/nfe/wsdl/${s.ns}`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${wsdl}">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      key: cert.keyPem,
      cert: cert.certPem,
      ca: CA,
      maxVersion: 'TLSv1.2',
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${wsdl}/${s.action}"`, 'Content-Length': Buffer.byteLength(envelope) },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 403) return reject(new Error('A SEFAZ recusou o certificado (403). Confira se é o A1 da empresa e se está válido.'));
        if ((res.statusCode ?? 500) >= 400 && !body.includes('<')) return reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}.`));
        resolve(body);
      });
    });
    req.on('timeout', () => req.destroy(new Error('A SEFAZ demorou demais para responder. Tente de novo em alguns minutos.')));
    req.on('error', (e) => reject(new Error(`Falha de conexão com a SEFAZ: ${e.message}`)));
    req.end(envelope);
  });
}

/** Lê o primeiro valor de uma tag (respostas da SEFAZ são simples o bastante para isso). */
export const pega = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`))?.[1] ?? null;
export const bloco = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}[\\s>][\\s\\S]*?</(?:\\w+:)?${tag}>`))?.[0] ?? null;
