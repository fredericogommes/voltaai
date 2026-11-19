'use strict';
(() => {
  // Login e marca vêm de brand.json (servido em /brand.js como window.BRAND).
  // Abas: Entrar (e-mail/senha) e Criar conta (e-mail/senha), as duas com "Continuar com Google".
  // Criar conta NÃO dá acesso aos dados: o painel só abre depois que a conta é vinculada a uma loja (voltaai_pdv.stores).
  const B = window.BRAND || { produto: { nome: 'CRM', nomeCompleto: 'CRM' }, pdv: { nome: 'PDV' }, auth: {} };
  const ESTATICO = !!B.estatico;   // versão de demonstração (GitHub Pages): só login, sem servidor
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const URL = B.auth.supabaseUrl, KEY = B.auth.supabaseKey;
  const sb = URL && KEY ? window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;
  const root = document.getElementById('auth-root');
  const app = document.querySelector('.app');
  const voltar = () => location.origin + location.pathname;   // volta para esta mesma página depois do Google ou do e-mail
  let started = false; let resolveReady; let aba = 'entrar';
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const $ = id => document.getElementById(id);

  function message(error) {
    const text = String(error?.message || error || 'Não foi possível entrar.');
    if (/invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos. Se você criou a conta pelo Google, use o botão Entrar com Google.';
    if (/email not confirmed/i.test(text)) return 'Confirme seu e-mail antes de entrar. O link chegou na sua caixa de entrada.';
    if (/already registered|already been registered/i.test(text)) return 'Este e-mail já tem conta. Use a aba Entrar.';
    if (/password should be at least/i.test(text)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/provider is not enabled|unsupported provider/i.test(text)) return 'O login com Google ainda não foi ligado no Supabase.';
    if (/rate limit/i.test(text)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    return text;
  }
  const iconeGoogle = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>';

  // O Supabase devolve uma página de erro crua se o provedor estiver desligado: pergunta antes de redirecionar
  let googleCache = null;
  function googleLigado() {
    if (!googleCache) googleCache = fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } })
      .then(r => r.json()).then(j => !!j?.external?.google).catch(() => true);
    return googleCache;
  }

  function cabecalho(sub) {
    return `<img src="${esc(B.produto.icone)}" alt="${esc(B.produto.nome)}" class="auth-logo">
      <div><p class="auth-kicker">${esc(B.produto.tagline || 'ADMINISTRAÇÃO')}</p><h1 id="auth-title">${esc(B.produto.nomeCompleto)}</h1><p class="auth-sub">${sub}</p></div>`;
  }

  function showLogin(error = '', aviso = '') {
    app.hidden = true;
    const criar = aba === 'criar';
    root.innerHTML = `<main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        ${cabecalho(criar ? 'Crie sua conta para acessar o CRM.' : 'Entre na sua conta.')}
        <div class="auth-abas" role="tablist" aria-label="Entrar ou criar conta">
          <button type="button" role="tab" id="aba-entrar" aria-selected="${!criar}" class="${criar ? '' : 'on'}">Entrar</button>
          <button type="button" role="tab" id="aba-criar" aria-selected="${criar}" class="${criar ? 'on' : ''}">Criar conta</button>
        </div>
        <button type="button" class="btn auth-google" id="auth-google">${iconeGoogle}<span>${criar ? 'Criar conta com Google' : 'Entrar com Google'}</span></button>
        <div class="auth-ou"><span>ou com e-mail</span></div>
        <form id="auth-form">
          ${criar ? '<label>Seu nome<input class="campo" id="auth-nome" autocomplete="name" required></label>' : ''}
          <label>E-mail<input class="campo" id="auth-email" type="email" autocomplete="${criar ? 'email' : 'username'}" required></label>
          <label>Senha<input class="campo" id="auth-password" type="password" minlength="${criar ? 8 : 1}" autocomplete="${criar ? 'new-password' : 'current-password'}" required>${criar ? '<small class="auth-dica">Pelo menos 8 caracteres.</small>' : ''}</label>
          ${criar ? '<label>Confirme a senha<input class="campo" id="auth-password2" type="password" minlength="8" autocomplete="new-password" required></label>' : ''}
          <p class="auth-error" id="auth-error" role="alert">${esc(error)}</p>
          <p class="auth-ok" id="auth-ok" role="status">${esc(aviso)}</p>
          <button class="btn primario" id="auth-submit">${criar ? 'Criar conta' : 'Entrar'}</button>
        </form>
      </section></main>`;
    $('aba-entrar').onclick = () => { aba = 'entrar'; showLogin(); };
    $('aba-criar').onclick = () => { aba = 'criar'; showLogin(); };
    $('auth-google').onclick = async () => {
      if (!sb) return;
      $('auth-error').textContent = '';
      if (!(await googleLigado())) { $('auth-error').textContent = 'O login com Google ainda não foi ativado. Por enquanto, use e-mail e senha.'; return; }
      const { error: e } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: voltar() } });
      if (e) $('auth-error').textContent = message(e);
    };
    $('auth-form').onsubmit = async event => {
      event.preventDefault(); if (!sb) return;
      const button = $('auth-submit'), erro = $('auth-error'), ok = $('auth-ok');
      erro.textContent = ''; ok.textContent = '';
      const email = $('auth-email').value.trim(), password = $('auth-password').value;
      if (criar) {
        if (password !== $('auth-password2').value) { erro.textContent = 'As duas senhas não são iguais.'; return; }
        button.disabled = true; button.textContent = 'Criando…';
        const { data, error: e } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: voltar(), data: { full_name: $('auth-nome').value.trim() } } });
        button.disabled = false; button.textContent = 'Criar conta';
        if (e) { erro.textContent = message(e); return; }
        // e-mail já cadastrado (ex.: pelo Google): o Supabase responde "ok" sem criar nada e sem identidades
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
          aba = 'entrar'; showLogin('Este e-mail já tem conta. Se você entrou antes pelo Google, use o botão Entrar com Google.'); return;
        }
        if (!data.session) { aba = 'entrar'; showLogin('', `Conta criada! Enviamos um link de confirmação para ${email}. Confirme e depois entre.`); }
        return;   // com sessão, onAuthStateChange abre o app
      }
      button.disabled = true; button.textContent = 'Entrando…';
      const { error: e } = await sb.auth.signInWithPassword({ email, password });
      if (e) { erro.textContent = message(e); button.disabled = false; button.textContent = 'Entrar'; }
    };
  }

  // Conta existe, mas ainda não está ligada a uma loja (ou é a versão de demonstração, sem servidor)
  function showConta(session, motivo) {
    app.hidden = true;
    const u = session.user || {}, nome = u.user_metadata?.full_name || u.user_metadata?.name || '';
    const via = (u.app_metadata?.provider || 'email') === 'google' ? 'Google' : 'e-mail e senha';
    root.innerHTML = `<main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        ${cabecalho(nome ? `Olá, ${esc(nome)}!` : 'Você está conectado.')}
        <div class="auth-conta">
          <p><b>${esc(u.email || '')}</b><br><span class="auth-dica">Conta criada com ${via}.</span></p>
          <p>${esc(motivo)}</p>
        </div>
        ${ESTATICO && B.produto.appUrl ? `<a class="btn primario" id="auth-abrir" href="${esc(B.produto.appUrl)}">Abrir o sistema</a>` : ''}
        <button class="btn" id="auth-sair">Sair</button>
      </section></main>`;
    $('auth-sair').onclick = logout;
  }

  function showApp(session) {
    if (!session) return showLogin();
    if (ESTATICO) return showConta(session, B.produto.appUrl ? 'Login funcionando. O painel com os dados da loja abre no servidor do CRM: clique em Abrir o sistema e entre de novo com o Google.' : 'Login funcionando. O painel com os dados da loja roda no servidor do CRM.');
    root.innerHTML = ''; app.hidden = false;
    if (!started) { started = true; resolveReady(session); }
  }
  async function logout() { if (sb) await sb.auth.signOut(); location.href = voltar(); }
  async function expired() { await sb.auth.signOut(); showLogin('Sua sessão expirou. Entre novamente.'); }
  async function semLoja() {   // chamado pelo app quando o servidor responde 403
    const { data } = await sb.auth.getSession();
    if (data.session) showConta(data.session, 'Sua conta foi criada, mas ainda não está ligada a uma loja. Peça ao administrador para liberar o seu acesso.');
  }
  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token || ''; }

  window.CrmAuth = { ready, token, logout, expired, semLoja, client: sb };
  if (!sb) { showLogin('Login não configurado: preencha auth em brand.json ou AUTH_SUPABASE_URL e AUTH_SUPABASE_KEY no .env.'); return; }
  const erroUrl = new URLSearchParams(location.hash.slice(1) || location.search).get('error_description');
  sb.auth.onAuthStateChange((_event, session) => showApp(session));
  sb.auth.getSession().then(({ data }) => (data.session ? showApp(data.session) : showLogin(erroUrl ? message(erroUrl) : ''))).catch(() => showLogin());
})();
