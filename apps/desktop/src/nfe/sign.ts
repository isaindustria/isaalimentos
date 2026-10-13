/** Assinatura XMLDSig exigida pela SEFAZ: RSA-SHA1, digest SHA1, transformações enveloped + C14N, certificado no KeyInfo. */
import { SignedXml } from 'xml-crypto';

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

/** Assina o elemento `tag` (infNFe ou infEvento) e coloca a <Signature> logo depois dele. */
export function assinar(xml: string, tag: 'infNFe' | 'infEvento', keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${tag}']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${tag}']`, action: 'after' } });
  return sig.getSignedXml();
}

/** Confere a assinatura (usado nos testes e antes de enviar). */
export function verificar(signedXml: string, certPem: string): boolean {
  const { DOMParser } = require('@xmldom/xmldom') as typeof import('@xmldom/xmldom');
  const doc = new DOMParser().parseFromString(signedXml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const v = new SignedXml({ publicCert: certPem });
  v.loadSignature(sigNode as unknown as Node);
  return v.checkSignature(signedXml);
}
