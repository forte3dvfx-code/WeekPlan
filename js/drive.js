/* drive.js — cópia de segurança no Google Drive.
 *
 * Igual ao SportsTrack e ao Caderno: o mesmo Client ID (é público, está
 * preso ao domínio forte3dvfx-code.github.io; não é um segredo) e o âmbito
 * drive.file, que só deixa a app ver os ficheiros que ela própria criou.
 * Um único ficheiro numa pasta "Cadência", substituído em cada cópia.
 *
 * Só funciona na versão publicada no GitHub Pages: em localhost a Google
 * recusa a origem.
 */

const Drive = (function () {
  const CLIENT_ID = '110359919647-5mtubvedf2omr1b325t0aqcnccdq4es4.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER = 'Cadência';
  const FILE = 'cadencia-backup.json';

  let accessToken = null;
  let tokenExpiry = 0;

  // A biblioteca da Google só carrega quando é precisa: a app abre sem rede.
  function loadGoogle() {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Sem ligação à Google.'));
      document.head.appendChild(s);
    });
  }

  async function token(interactive) {
    if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
    await loadGoogle();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) return reject(new Error(r.error));
          accessToken = r.access_token;
          tokenExpiry = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          resolve(accessToken);
        },
        error_callback: (e) => reject(new Error((e && e.type) || 'Autorização recusada.'))
      });
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  async function api(url, opts = {}) {
    const t = await token(false);
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error('O Drive respondeu ' + r.status + '.');
    return r;
  }

  async function procurar(q) {
    const r = await api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,modifiedTime)&spaces=drive');
    const j = await r.json();
    return j.files && j.files.length ? j.files[0] : null;
  }

  async function pasta() {
    const achada = await procurar("name='" + FOLDER + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    if (achada) return achada.id;
    const r = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
    });
    return (await r.json()).id;
  }

  const ficheiro = (folderId) => procurar("name='" + FILE + "' and '" + folderId + "' in parents and trashed=false");

  async function backup() {
    const body = JSON.stringify(await DB.exportAll(), null, 2);
    const folderId = await pasta();
    const atual = await ficheiro(folderId);
    if (atual) {
      await api('https://www.googleapis.com/upload/drive/v3/files/' + atual.id + '?uploadType=media', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
      });
    } else {
      const b = 'cad' + Date.now();
      const multipart =
        '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name: FILE, parents: [folderId], mimeType: 'application/json' }) + '\r\n' +
        '--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
      await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multipart
      });
    }
    return new Date().toISOString();
  }

  /* Traz a cópia e funde com o que está no telemóvel; nada é apagado. */
  async function restore() {
    const atual = await ficheiro(await pasta());
    if (!atual) throw new Error('Ainda não há cópia no Drive.');
    const r = await api('https://www.googleapis.com/drive/v3/files/' + atual.id + '?alt=media');
    return DB.importAll(await r.json(), false);
  }

  return { connect: () => token(true), backup, restore };
})();
