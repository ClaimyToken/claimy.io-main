(function () {
  'use strict';

  const LS_URL = 'claimy_demo_supabase_url';
  const LS_ANON = 'claimy_demo_anon_key';
  const LS_WALLET = 'claimy_demo_wallet';

  const $ = (id) => document.getElementById(id);

  function normalizeBaseUrl(raw) {
    const t = (raw || '').trim().replace(/\/+$/, '');
    return t;
  }

  function edgeHeaders(anon) {
    const headers = { 'Content-Type': 'application/json' };
    const a = (anon || '').trim();
    if (a) {
      headers['apikey'] = a;
      headers['Authorization'] = 'Bearer ' + a;
    }
    return headers;
  }

  function functionsUrl(base, slug) {
    return normalizeBaseUrl(base) + '/functions/v1/' + slug;
  }

  function setOut(text, isError) {
    const el = $('out');
    el.textContent = text;
    el.classList.toggle('demo-out--error', !!isError);
  }

  async function postCredits(base, anon, body) {
    const res = await fetch(functionsUrl(base, 'claimy-credits'), {
      method: 'POST',
      headers: edgeHeaders(anon),
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text, _httpStatus: res.status };
    }
    return { res, data };
  }

  function readConfig() {
    const base = normalizeBaseUrl($('supabaseUrl').value);
    const anon = $('anonKey').value.trim();
    const wallet = $('wallet').value.trim();
    return { base, anon, wallet };
  }

  function persist() {
    const { base, anon, wallet } = readConfig();
    try {
      localStorage.setItem(LS_URL, base);
      localStorage.setItem(LS_ANON, anon);
      localStorage.setItem(LS_WALLET, wallet);
    } catch {
      /* ignore */
    }
  }

  function loadPersisted() {
    try {
      const u = localStorage.getItem(LS_URL);
      const a = localStorage.getItem(LS_ANON);
      const w = localStorage.getItem(LS_WALLET);
      if (u) $('supabaseUrl').value = u;
      if (a) $('anonKey').value = a;
      if (w) $('wallet').value = w;
    } catch {
      /* ignore */
    }
  }

  async function doGetBalance() {
    const { base, anon, wallet } = readConfig();
    if (!base || !anon) {
      setOut('Set Supabase URL and anon key first.', true);
      return;
    }
    if (!wallet) {
      setOut('Set wallet address (or Connect Phantom).', true);
      return;
    }
    persist();
    setOut('Loading…', false);
    try {
      const { res, data } = await postCredits(base, anon, { action: 'get', walletAddress: wallet });
      const err = !res.ok || (data && data.ok === false);
      setOut(JSON.stringify({ httpStatus: res.status, ...data }, null, 2), err);
    } catch (e) {
      setOut(String(e && e.message ? e.message : e), true);
    }
  }

  async function doListLedger() {
    const { base, anon, wallet } = readConfig();
    const direction = $('ledgerDir').value;
    const limit = Math.min(200, Math.max(1, parseInt($('ledgerLimit').value, 10) || 20));
    if (!base || !anon) {
      setOut('Set Supabase URL and anon key first.', true);
      return;
    }
    if (!wallet) {
      setOut('Set wallet address (or Connect Phantom).', true);
      return;
    }
    persist();
    setOut('Loading…', false);
    try {
      const { res, data } = await postCredits(base, anon, {
        action: 'list_ledger',
        walletAddress: wallet,
        direction,
        limit
      });
      const err = !res.ok || (data && data.ok === false);
      setOut(JSON.stringify({ httpStatus: res.status, ...data }, null, 2), err);
    } catch (e) {
      setOut(String(e && e.message ? e.message : e), true);
    }
  }

  async function doSyncChain() {
    const { base, anon, wallet } = readConfig();
    if (!base || !anon) {
      setOut('Set Supabase URL and anon key first.', true);
      return;
    }
    if (!wallet) {
      setOut('Set wallet address (or Connect Phantom).', true);
      return;
    }
    persist();
    setOut('Syncing (this updates credits server-side)…', false);
    try {
      const { res, data } = await postCredits(base, anon, { action: 'sync_from_chain', walletAddress: wallet });
      const err = !res.ok || (data && data.ok === false);
      setOut(JSON.stringify({ httpStatus: res.status, ...data }, null, 2), err);
    } catch (e) {
      setOut(String(e && e.message ? e.message : e), true);
    }
  }

  async function doBankroll() {
    const { base, anon } = readConfig();
    if (!base || !anon) {
      setOut('Set Supabase URL and anon key first.', true);
      return;
    }
    persist();
    setOut('Loading…', false);
    try {
      const res = await fetch(functionsUrl(base, 'bankroll-info'), {
        method: 'GET',
        headers: edgeHeaders(anon)
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
      const err = !res.ok || (data && data.ok === false);
      setOut(JSON.stringify({ httpStatus: res.status, ...data }, null, 2), err);
    } catch (e) {
      setOut(String(e && e.message ? e.message : e), true);
    }
  }

  async function connectPhantom() {
    const w = window;
    const phantom = w.phantom && w.phantom.solana;
    if (!phantom) {
      setOut('Phantom not found. Install https://phantom.app and use localhost or https.', true);
      return;
    }
    try {
      const conn = await phantom.connect();
      const pk = conn && conn.publicKey && conn.publicKey.toString ? conn.publicKey.toString() : '';
      if (pk) {
        $('wallet').value = pk;
        persist();
        setOut('Connected: ' + pk, false);
      }
    } catch (e) {
      setOut('Phantom: ' + (e && e.message ? e.message : String(e)), true);
    }
  }

  function init() {
    loadPersisted();
    $('btnBalance').addEventListener('click', () => void doGetBalance());
    $('btnLedger').addEventListener('click', () => void doListLedger());
    $('btnSync').addEventListener('click', () => void doSyncChain());
    $('btnBankroll').addEventListener('click', () => void doBankroll());
    $('btnPhantom').addEventListener('click', () => void connectPhantom());
    ['supabaseUrl', 'anonKey', 'wallet'].forEach((id) => {
      $(id).addEventListener('change', persist);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
