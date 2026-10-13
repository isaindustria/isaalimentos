const { app } = require('electron');
const path = require('node:path'); const os = require('node:os'); const fs = require('node:fs');
const forge = require('node-forge');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'isa-nfe-')));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
app.whenReady().then(async () => {
  const { saveCert, certInfo, loadCert, removeCert } = require('../dist/nfe/certStore');
  const keys = forge.pki.rsa.generateKeyPair(2048); const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '02'; cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 200 * 864e5);
  const at = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:55747709000147' }]; cert.setSubject(at); cert.setIssuer(at); cert.sign(keys.privateKey, forge.md.sha256.create());
  const pfx = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'S3nh@', { algorithm: '3des' })).getBytes(), 'binary');
  const info = saveCert(pfx, 'S3nh@');
  ok(info.cnpj === '55747709000147', 'certificado guardado');
  const raw = fs.readFileSync(path.join(app.getPath('userData'), 'nfe', 'certificado.bin'), 'utf8');
  ok(!raw.includes('S3nh@') && !raw.includes(pfx.toString('base64').slice(0, 40)), 'arquivo gravado não contém senha nem certificado legíveis');
  ok(certInfo()?.diasParaVencer > 190, 'info pública lida sem abrir o certificado');
  const c = loadCert(); ok(c.keyPem.includes('PRIVATE KEY'), 'certificado aberto na memória com a senha guardada');
  const { soap, pega } = require('../dist/nfe/sefaz');
  try { const r = await soap(2, 'status', '<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><cUF>35</cUF><xServ>STATUS</xServ></consStatServ>', c, 30000); console.log('resposta', pega(r, 'cStat'), pega(r, 'xMotivo')); ok(false, 'SEFAZ deveria recusar certificado de teste'); }
  catch (e) { ok(/recusou o certificado|403/.test(e.message), 'conexão chega na SEFAZ-SP homologação e o certificado de teste é recusado: ' + e.message); }
  removeCert(); ok(certInfo() === null, 'remover apaga o certificado');
  app.quit();
});
