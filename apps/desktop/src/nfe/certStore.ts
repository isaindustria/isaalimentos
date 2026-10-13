/**
 * Cofre do certificado A1 (.pfx) neste computador.
 *
 * - O arquivo é escolhido por uma janela do Windows aberta pelo próprio programa: o conteúdo nunca passa pela tela
 *   do sistema (renderer), pela internet nem pelo banco de dados.
 * - Arquivo e senha são gravados criptografados com o safeStorage do Electron (DPAPI do Windows, preso ao usuário
 *   do Windows). Copiar o arquivo para outra máquina ou outro usuário não permite abrir.
 * - Só os dados públicos (CNPJ, titular, validade) são devolvidos para a tela.
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';

export interface CertInfo { cnpj: string | null; titular: string; validoDe: string; validoAte: string; emissor: string; diasParaVencer: number }
export interface LoadedCert { keyPem: string; certPem: string; certB64: string; info: CertInfo }

const dir = () => path.join(app.getPath('userData'), 'nfe');
const file = () => path.join(dir(), 'certificado.bin');

/** Abre o .pfx com a senha; erro em português se a senha estiver errada ou o arquivo não for um A1. */
export function parsePfx(pfx: Buffer, senha: string): LoadedCert {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha);
  } catch {
    throw new Error('Senha incorreta ou arquivo que não é um certificado A1 (.pfx/.p12).');
  }
  const keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0]
    ?? (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!keyBag?.key || !certBags.length) throw new Error('O arquivo não tem chave privada e certificado. Exporte o A1 com a chave privada.');
  // certificado do titular = o que tem a mesma chave pública da chave privada
  const key = keyBag.key as forge.pki.rsa.PrivateKey;
  const own = certBags.map((b) => b.cert!).find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(key.n)) ?? certBags[0].cert!;
  const certPem = forge.pki.certificateToPem(own);
  const certB64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(own)).getBytes());
  const cn = String(own.subject.getField('CN')?.value ?? '');
  const cnpj = cnpjDoCertificado(own) ?? (cn.match(/(\d{14})\s*$/)?.[1] ?? null);
  const validoAte = own.validity.notAfter;
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem,
    certB64,
    info: {
      cnpj,
      titular: cn.replace(/:\d{14}$/, ''),
      validoDe: own.validity.notBefore.toISOString(),
      validoAte: validoAte.toISOString(),
      emissor: String(own.issuer.getField('CN')?.value ?? ''),
      diasParaVencer: Math.floor((validoAte.getTime() - Date.now()) / 86400000),
    },
  };
}

/** CNPJ do titular no campo otherName 2.16.76.1.3.3 (padrão ICP-Brasil para e-CNPJ). */
function cnpjDoCertificado(cert: forge.pki.Certificate): string | null {
  const ext = cert.getExtension('subjectAltName') as { altNames?: Array<{ type: number; value: unknown }> } | null;
  for (const n of ext?.altNames ?? []) {
    const raw = typeof n.value === 'string' ? n.value : '';
    if (raw.includes('2.16.76.1.3.3') || n.type === 0) {
      const digits = raw.replace(/\D/g, '');
      const m = digits.match(/(\d{14})$/);
      if (m) return m[1];
    }
  }
  return null;
}

export function saveCert(pfx: Buffer, senha: string): CertInfo {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('A criptografia do Windows não está disponível neste computador.');
  const parsed = parsePfx(pfx, senha);
  if (parsed.info.diasParaVencer < 0) throw new Error(`Este certificado venceu em ${new Date(parsed.info.validoAte).toLocaleDateString('pt-BR')}.`);
  fs.mkdirSync(dir(), { recursive: true });
  const blob = {
    v: 1,
    pfx: safeStorage.encryptString(pfx.toString('base64')).toString('base64'),
    senha: safeStorage.encryptString(senha).toString('base64'),
    info: parsed.info,
  };
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(blob), { mode: 0o600 });
  fs.renameSync(tmp, file());
  return parsed.info;
}

export function certInfo(): CertInfo | null {
  try {
    const blob = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const ate = new Date(blob.info.validoAte);
    return { ...blob.info, diasParaVencer: Math.floor((ate.getTime() - Date.now()) / 86400000) };
  } catch {
    return null;
  }
}

/** Abre o certificado só na memória, na hora de assinar/enviar. */
export function loadCert(): LoadedCert {
  let blob: { pfx: string; senha: string };
  try { blob = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { throw new Error('Nenhum certificado A1 carregado neste computador.'); }
  const pfx = Buffer.from(safeStorage.decryptString(Buffer.from(blob.pfx, 'base64')), 'base64');
  const senha = safeStorage.decryptString(Buffer.from(blob.senha, 'base64'));
  return parsePfx(pfx, senha);
}

export function removeCert() {
  try { fs.rmSync(file(), { force: true }); } catch { /* já não existe */ }
}
