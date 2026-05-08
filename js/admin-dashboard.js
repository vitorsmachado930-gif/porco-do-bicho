const ADMIN_DASH_SESSION_KEY = "admin_dashboard_password";
const ADMIN_DASH_ORIGIN_FALLBACK = "https://porcodobicho.com";
const ADMIN_DASH_ORIGIN = (() => {
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local");
  return isLocal ? ADMIN_DASH_ORIGIN_FALLBACK : "";
})();
const ADMIN_DASH_API_URL = `${ADMIN_DASH_ORIGIN}/backend/admin_dashboard_api.php`;

let adminDashPassword = "";
let moduloAtual = "visao_geral";
let usuariosCacheById = new Map();
let usuarioSelecionadoEdicao = null;

function $(id) {
  return document.getElementById(id);
}

function hojeISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  const n = Number(valor || 0);
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badgeStatus(status) {
  const s = String(status || "").toLowerCase();
  return `<span class="badge-status ${escapeHtml(s)}">${escapeHtml(status || "--")}</span>`;
}

function setStatus(msg, isErro = false) {
  const el = $("statusAdminAcao");
  if (!el) return;
  el.style.color = isErro ? "#ff9a9a" : "#9fffcf";
  el.textContent = msg;
}

async function adminFetch(module, query = {}) {
  const params = new URLSearchParams(query);
  params.set("module", module);

  const resp = await fetch(`${ADMIN_DASH_API_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "X-Admin-Password": adminDashPassword,
    },
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `Erro HTTP ${resp.status}`);
  }

  return data;
}

async function adminPost(action, payload = {}) {
  const resp = await fetch(ADMIN_DASH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": adminDashPassword,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `Erro HTTP ${resp.status}`);
  }

  return data;
}

function obterFiltrosPeriodo() {
  const modo = String($("filtroPeriodoModo")?.value || "hoje");
  const inicio = String($("filtroPeriodoInicio")?.value || "");
  const fim = String($("filtroPeriodoFim")?.value || "");
  return { modo, inicio, fim };
}

function atualizarInfoPeriodo() {
  const { modo, inicio, fim } = obterFiltrosPeriodo();
  const info = $("dashPeriodoInfo");
  if (!info) return;

  if (modo !== "intervalo") {
    info.textContent = "Período atual: hoje.";
    return;
  }

  info.textContent = `Período atual: ${inicio || "--"} até ${fim || "--"}.`;
}

function gerarTabela(headers, rowsHtml) {
  if (!rowsHtml.length) {
    return '<div style="padding:12px;color:#9fb6ca;">Nenhum registro encontrado.</div>';
  }

  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${rowsHtml.join("")}</tbody></table>`;
}

async function carregarVisaoGeral() {
  const filtros = obterFiltrosPeriodo();
  const data = await adminFetch("overview", filtros);
  const g = data.visao_geral || {};

  const cards = [
    ["Saldo total da banca", formatarMoeda(g.saldo_total_banca)],
    ["Total depositado", formatarMoeda(g.total_depositado)],
    ["Total sacado", formatarMoeda(g.total_sacado)],
    ["Total apostado", formatarMoeda(g.total_apostado)],
    ["Total pago em prêmios", formatarMoeda(g.total_pago_premios)],
    ["Lucro/Prejuízo", formatarMoeda(g.lucro_prejuizo)],
    ["Usuários ativos", g.usuarios_ativos ?? 0],
    ["Promotores", g.promotores ?? 0],
    ["Apostas do período", g.apostas_periodo ?? 0],
    ["Comissões pendentes", formatarMoeda(g.comissoes_pendentes)],
    ["Comissões pagas", formatarMoeda(g.comissoes_pagas)],
    ["Depósitos pendentes", g.depositos_pendentes ?? 0],
  ];

  const html = cards
    .map(([label, value]) => `<div class="card-resumo"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  $("cardsVisaoGeral").innerHTML = html;
}

async function carregarUsuarios() {
  const filtros = {
    ...obterFiltrosPeriodo(),
    nome: $("filtroUsuarioNome")?.value || "",
    cpf: $("filtroUsuarioCpf")?.value || "",
    whatsapp: $("filtroUsuarioWhatsapp")?.value || "",
    status: $("filtroUsuarioStatus")?.value || "",
  };

  const data = await adminFetch("usuarios", filtros);
  usuariosCacheById = new Map();
  const linhas = (data.usuarios || []).map((u) => {
    const uid = Number(u.id || 0);
    if (uid > 0) {
      usuariosCacheById.set(uid, u);
    }
    const status = Number(u.bloqueado || 0) === 1 || String(u.status || "").toUpperCase() === "BLOQUEADO" ? "bloqueado" : "ativo";
    return `
      <tr class="linha-usuario-clicavel" data-usuario-id="${uid}">
        <td>${u.id ?? ""}</td>
        <td>${escapeHtml(u.nome || "")}</td>
        <td>${escapeHtml(u.login || "")}</td>
        <td>${escapeHtml(u.cpf_cnpj || "")}</td>
        <td>${escapeHtml(u.whatsapp || "")}</td>
        <td>${escapeHtml(u.perfil || "apostador")}</td>
        <td>${formatarMoeda(u.saldo || 0)}</td>
        <td>${badgeStatus(status)}</td>
        <td>${escapeHtml(u.promotor_nome || "Base Admin")}</td>
        <td>${escapeHtml(u.indicador_nome || "--")}</td>
      </tr>
    `;
  });

  $("tabelaUsuarios").innerHTML = gerarTabela(
    ["ID", "Nome", "Login", "CPF", "WhatsApp", "Perfil", "Saldo", "Status", "Base", "Indicador"],
    linhas
  );

  vincularCliqueLinhasUsuarios();
}

function preencherFormularioEdicaoUsuario(usuario) {
  if (!usuario || typeof usuario !== "object") return;
  const uid = Number(usuario.id || 0);
  if (!uid) return;

  usuarioSelecionadoEdicao = usuario;

  $("editarUsuarioId").value = String(uid);
  $("acaoUsuarioId").value = String(uid);
  $("excluirUsuarioId").value = String(uid);
  $("transferirApostadorId").value = String(uid);

  $("editarUsuarioNome").value = String(usuario.nome || "");
  $("editarUsuarioCpf").value = String(usuario.cpf_cnpj || "");
  $("editarUsuarioWhatsapp").value = String(usuario.whatsapp || "");
  $("editarUsuarioPerfil").value = String(usuario.perfil || "apostador").toLowerCase();
  $("editarUsuarioPromotorBaseId").value = Number(usuario.promotor_id || 0) > 0 ? String(Number(usuario.promotor_id)) : "0";
  $("editarUsuarioIndicadorId").value = Number(usuario.indicador_id || 0) > 0 ? String(Number(usuario.indicador_id)) : "0";
  $("editarUsuarioComissao").value = Number(usuario.comissao_percentual || 0).toFixed(2);
  $("editarUsuarioChavePix").value = String(usuario.chave_pix || "");

  setStatus(`Usuário selecionado para edição: ID ${uid} - ${usuario.nome || usuario.login || "sem nome"}.`);
}

function vincularCliqueLinhasUsuarios() {
  const raiz = $("tabelaUsuarios");
  if (!raiz || raiz.dataset.bindLinhasUsuarios === "1") return;
  raiz.dataset.bindLinhasUsuarios = "1";

  raiz.addEventListener("click", (event) => {
    const alvo = event.target;
    if (!(alvo instanceof HTMLElement)) return;
    const linha = alvo.closest("tr.linha-usuario-clicavel");
    if (!linha) return;
    const uid = Number(linha.getAttribute("data-usuario-id") || 0);
    if (!uid) return;
    const usuario = usuariosCacheById.get(uid);
    if (!usuario) return;
    preencherFormularioEdicaoUsuario(usuario);
  });
}

async function carregarPromotores() {
  const data = await adminFetch("promotores", obterFiltrosPeriodo());
  const linhas = (data.promotores || []).map((p) => `
    <tr>
      <td>${p.id ?? ""}</td>
      <td>${escapeHtml(p.nome || "")}</td>
      <td>${escapeHtml(p.login || "")}</td>
      <td>${escapeHtml(p.cpf_cnpj || "")}</td>
      <td>${formatarMoeda(p.saldo || 0)}</td>
      <td>${Number(p.comissao_percentual || 0).toFixed(2)}%</td>
      <td>${p.base_apostadores ?? 0}</td>
      <td>${formatarMoeda(p.total_apostado_base || 0)}</td>
      <td>${formatarMoeda(p.total_comissao_gerada || 0)}</td>
      <td>${formatarMoeda(p.total_comissao_paga || 0)}</td>
      <td>${badgeStatus(Number(p.bloqueado || 0) === 1 ? "bloqueado" : "ativo")}</td>
    </tr>
  `);

  $("tabelaPromotores").innerHTML = gerarTabela(
    ["ID", "Nome", "Login", "CPF", "Saldo", "% Comissão", "Base", "Total Base", "Comissão Gerada", "Comissão Paga", "Status"],
    linhas
  );
}

async function carregarIndicacoes() {
  const data = await adminFetch("indicacoes", obterFiltrosPeriodo());
  const linhas = (data.indicacoes || []).map((i) => `
    <tr>
      <td>${i.id ?? ""}</td>
      <td>${escapeHtml(i.indicador_nome || i.indicador_login || "")}</td>
      <td>${escapeHtml(i.indicado_nome || i.indicado_login || "")}</td>
      <td>${escapeHtml(i.origem || "link")}</td>
      <td>${formatarMoeda(i.total_comissao || 0)}</td>
      <td>${escapeHtml(i.criado_em || "")}</td>
    </tr>
  `);

  $("tabelaIndicacoes").innerHTML = gerarTabela(["ID", "Indicador", "Indicado", "Origem", "Comissão Gerada", "Criado em"], linhas);
}

async function carregarApostas() {
  const filtros = {
    ...obterFiltrosPeriodo(),
    usuario: $("filtroApostaUsuario")?.value || "",
    tipo: $("filtroApostaTipo")?.value || "",
    loteria: $("filtroApostaLoteria")?.value || "",
    status: $("filtroApostaStatus")?.value || "",
  };

  const data = await adminFetch("apostas", filtros);
  const linhas = (data.apostas || []).map((a) => `
    <tr>
      <td>${escapeHtml(a.id || "")}</td>
      <td>${escapeHtml(a.data || "")}</td>
      <td>${escapeHtml(a.usuario || "")}</td>
      <td>${escapeHtml(a.loteria || "")}</td>
      <td>${escapeHtml(a.tipo || "")}</td>
      <td>${formatarMoeda(a.valor || 0)}</td>
      <td>${formatarMoeda(a.possivel_premio || 0)}</td>
      <td>${formatarMoeda(a.premio || 0)}</td>
      <td>${badgeStatus(a.status || "aberta")}</td>
      <td>${escapeHtml(typeof a.palpite === "string" ? a.palpite : JSON.stringify(a.palpite || ""))}</td>
      <td>${escapeHtml(a.horario || "")}</td>
    </tr>
  `);

  $("tabelaApostas").innerHTML = gerarTabela(
    ["ID", "Data", "Usuário", "Loteria", "Tipo", "Valor", "Possível Prêmio", "Prêmio", "Status", "Palpite", "Horário"],
    linhas
  );
}

async function carregarResultados() {
  const data = await adminFetch("resultados", obterFiltrosPeriodo());
  const linhas = (data.resultados || []).map((r) => `
    <tr>
      <td>${escapeHtml(r.data || "")}</td>
      <td>${escapeHtml(r.praca || "")}</td>
      <td>${escapeHtml(r.loteria || "")}</td>
      <td><pre>${escapeHtml(JSON.stringify(r.resultado || [], null, 2))}</pre></td>
    </tr>
  `);

  $("tabelaResultados").innerHTML = gerarTabela(["Data", "Praça", "Loteria", "1º ao 5º"], linhas);
}

async function carregarPremiacoes() {
  const data = await adminFetch("premios", obterFiltrosPeriodo());
  const linhasApostas = (data.premiadas_apostas || []).map((p) => `
    <tr>
      <td>${escapeHtml(p.id || "")}</td>
      <td>${escapeHtml(p.data || "")}</td>
      <td>${escapeHtml(p.usuario || "")}</td>
      <td>${escapeHtml(p.loteria || "")}</td>
      <td>${escapeHtml(p.tipo || "")}</td>
      <td>${formatarMoeda(p.valor_apostado || 0)}</td>
      <td>${formatarMoeda(p.valor_premio || 0)}</td>
      <td>${escapeHtml(p.palpite_premiado || "")}</td>
      <td>${badgeStatus(p.status || "apurado")}</td>
    </tr>
  `);

  const linhasReg = (data.premios_registrados || []).map((p) => `
    <tr>
      <td>${p.id ?? ""}</td>
      <td>${p.usuario_id ?? ""}</td>
      <td>${escapeHtml(p.aposta_referencia || "")}</td>
      <td>${escapeHtml(p.loteria || "")}</td>
      <td>${formatarMoeda(p.valor_premio || 0)}</td>
      <td>${badgeStatus(p.status || "apurado")}</td>
      <td>${escapeHtml(p.pago_em || "")}</td>
    </tr>
  `);

  $("tabelaPremiacoes").innerHTML = `
    <div style="padding:10px;color:#9fb6ca;">Apostas premiadas: ${(data.totais || {}).apostas_premiadas || 0} | Valor total: ${formatarMoeda((data.totais || {}).valor_apostas_premiadas || 0)}</div>
    ${gerarTabela(["ID aposta", "Data", "Usuário", "Loteria", "Tipo", "Aposta", "Prêmio", "Palpite premiado", "Status"], linhasApostas)}
    <div style="height:10px"></div>
    ${gerarTabela(["ID prêmio", "Usuário ID", "Ref aposta", "Loteria", "Valor", "Status", "Pago em"], linhasReg)}
  `;
}

async function carregarFinanceiro() {
  const data = await adminFetch("financeiro", obterFiltrosPeriodo());
  const linhasMov = (data.movimentacoes || []).map((m) => `
    <tr>
      <td>${m.id ?? ""}</td>
      <td>${escapeHtml(m.criado_em || "")}</td>
      <td>${escapeHtml(m.usuario_nome || m.usuario_login || `#${m.usuario_id || ""}`)}</td>
      <td>${escapeHtml(m.tipo || "")}</td>
      <td>${formatarMoeda(m.valor || 0)}</td>
      <td>${formatarMoeda(m.saldo_antes || 0)}</td>
      <td>${formatarMoeda(m.saldo_depois || 0)}</td>
      <td>${escapeHtml(m.referencia_tipo || "")}</td>
      <td>${escapeHtml(m.referencia_id || "")}</td>
      <td>${escapeHtml(m.motivo || "")}</td>
    </tr>
  `);

  const linhasSaldo = (data.saldos || []).map((s) => `
    <tr>
      <td>${s.id ?? ""}</td>
      <td>${escapeHtml(s.nome || "")}</td>
      <td>${escapeHtml(s.login || "")}</td>
      <td>${formatarMoeda(s.saldo || 0)}</td>
    </tr>
  `);

  $("tabelaFinanceiro").innerHTML = `
    ${gerarTabela(["Mov ID", "Data/Hora", "Usuário", "Tipo", "Valor", "Saldo Antes", "Saldo Depois", "Ref Tipo", "Ref ID", "Motivo"], linhasMov)}
    <div style="height:10px"></div>
    ${gerarTabela(["Usuário ID", "Nome", "Login", "Saldo"], linhasSaldo)}
  `;
}

async function carregarDepositos() {
  const data = await adminFetch("depositos", obterFiltrosPeriodo());
  const linhas = (data.depositos || []).map((d) => `
    <tr>
      <td>${d.id ?? ""}</td>
      <td>${escapeHtml(d.usuario_nome || d.usuario_login || `#${d.usuario_id || ""}`)}</td>
      <td>${escapeHtml(d.asaas_payment_id || "")}</td>
      <td>${escapeHtml(d.external_reference || "")}</td>
      <td>${formatarMoeda(d.valor || 0)}</td>
      <td>${badgeStatus((d.status || "").toLowerCase())}</td>
      <td>${escapeHtml(d.criado_em || "")}</td>
      <td>${escapeHtml(d.pago_em || "")}</td>
      <td>${Number(d.status || "").toUpperCase() === "PAGO" ? "Sim" : "Não"}</td>
    </tr>
  `);

  $("tabelaDepositos").innerHTML = gerarTabela(
    ["ID", "Usuário", "Asaas Payment ID", "External Ref", "Valor", "Status", "Criado em", "Pago em", "Saldo creditado"],
    linhas
  );
}

async function carregarSaques() {
  const data = await adminFetch("saques", obterFiltrosPeriodo());
  const linhas = (data.saques || []).map((s) => `
    <tr>
      <td>${s.id ?? ""}</td>
      <td>${escapeHtml(s.usuario_nome || s.usuario_login || `#${s.usuario_id || ""}`)}</td>
      <td>${formatarMoeda(s.valor || 0)}</td>
      <td>${escapeHtml(s.chave_pix || "")}</td>
      <td>${badgeStatus(s.status || "pendente")}</td>
      <td>${escapeHtml(s.criado_em || "")}</td>
      <td>${escapeHtml(s.pago_em || "")}</td>
      <td>${escapeHtml(s.observacao || "")}</td>
    </tr>
  `);

  $("tabelaSaques").innerHTML = gerarTabela(["ID", "Usuário", "Valor", "Chave Pix", "Status", "Criado em", "Pago em", "Observação"], linhas);
}

async function carregarComissoesRelatorio() {
  const data = await adminFetch("comissoes", obterFiltrosPeriodo());
  const linhas = (data.comissoes || []).map((c) => `
    <tr>
      <td>${c.id ?? ""}</td>
      <td>${escapeHtml(c.promotor_nome || c.promotor_login || "")}</td>
      <td>${escapeHtml(c.apostador_nome || c.apostador_login || "")}</td>
      <td>${formatarMoeda(c.base_valor || 0)}</td>
      <td>${Number(c.percentual || 0).toFixed(2)}%</td>
      <td>${formatarMoeda(c.valor_comissao || 0)}</td>
      <td>${badgeStatus(c.status || "pendente")}</td>
      <td>${escapeHtml(c.criado_em || "")}</td>
    </tr>
  `);

  $("tabelaRelatorios").innerHTML = gerarTabela(["ID", "Promotor", "Apostador", "Base", "%", "Comissão", "Status", "Criado em"], linhas);
}

async function carregarAuditoria() {
  const data = await adminFetch("auditoria", obterFiltrosPeriodo());
  const linhas = (data.auditoria || []).map((a) => `
    <tr>
      <td>${a.id ?? ""}</td>
      <td>${escapeHtml(a.criado_em || "")}</td>
      <td>${escapeHtml(a.admin_login || "admin")}</td>
      <td>${escapeHtml(a.acao || "")}</td>
      <td>${escapeHtml(a.entidade || "")}</td>
      <td>${escapeHtml(a.entidade_id || "")}</td>
      <td>${escapeHtml(a.justificativa || "")}</td>
      <td><pre>${escapeHtml(a.valor_antigo || "")}</pre></td>
      <td><pre>${escapeHtml(a.valor_novo || "")}</pre></td>
    </tr>
  `);

  $("tabelaAuditoria").innerHTML = gerarTabela(["ID", "Data", "Admin", "Ação", "Entidade", "Entidade ID", "Justificativa", "Valor antigo", "Valor novo"], linhas);
}

async function carregarModuloAtual() {
  atualizarInfoPeriodo();

  try {
    if (moduloAtual === "visao_geral") await carregarVisaoGeral();
    if (moduloAtual === "usuarios") await carregarUsuarios();
    if (moduloAtual === "promotores") await carregarPromotores();
    if (moduloAtual === "indicacoes") await carregarIndicacoes();
    if (moduloAtual === "apostas") await carregarApostas();
    if (moduloAtual === "resultados") await carregarResultados();
    if (moduloAtual === "premiacoes") await carregarPremiacoes();
    if (moduloAtual === "financeiro") await carregarFinanceiro();
    if (moduloAtual === "depositos") await carregarDepositos();
    if (moduloAtual === "saques") await carregarSaques();
    if (moduloAtual === "relatorios") await carregarComissoesRelatorio();
    if (moduloAtual === "auditoria") await carregarAuditoria();

    setStatus("Módulo atualizado com sucesso.");
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

function selecionarModulo(modulo) {
  moduloAtual = modulo;

  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.modulo === modulo);
  });

  document.querySelectorAll(".modulo-admin").forEach((sec) => {
    sec.classList.toggle("ativo", sec.dataset.modulo === modulo);
  });

  carregarModuloAtual();
}

function configurarAutoFecharCalendarios() {
  const bind = (input) => {
    if (!input || input.dataset.autoCloseDateBound === "1") return;
    input.dataset.autoCloseDateBound = "1";
    input.addEventListener("change", () => {
      setTimeout(() => {
        try {
          input.blur();
        } catch (_err) {
          // Ignora.
        }
      }, 0);
    });
  };

  document.querySelectorAll('input[type="date"]').forEach(bind);
}

async function acaoAjustarSaldo() {
  const usuarioId = Number($("acaoUsuarioId")?.value || 0);
  const valor = Number($("acaoUsuarioValor")?.value || 0);
  const tipo = String($("acaoUsuarioTipoSaldo")?.value || "credito");
  const motivo = String($("acaoUsuarioJustificativa")?.value || "").trim();

  if (!usuarioId || !valor || !motivo) {
    setStatus("Preencha ID, valor e justificativa para ajuste de saldo.", true);
    return;
  }

  try {
    await adminPost("saldo_ajuste", {
      usuario_id: usuarioId,
      valor,
      tipo,
      motivo,
      justificativa: motivo,
    });
    setStatus("Saldo ajustado com sucesso.");
    await carregarUsuarios();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoBloqueioUsuario(bloquear) {
  const usuarioId = Number($("acaoUsuarioId")?.value || 0);
  const justificativa = String($("acaoUsuarioJustificativa")?.value || "").trim();

  if (!usuarioId) {
    setStatus("Informe o ID do usuário.", true);
    return;
  }

  try {
    await adminPost("user_block_toggle", {
      usuario_id: usuarioId,
      bloquear: bloquear ? 1 : 0,
      justificativa: justificativa || (bloquear ? "Bloqueio manual." : "Desbloqueio manual."),
    });
    setStatus(bloquear ? "Usuário bloqueado." : "Usuário desbloqueado.");
    await carregarUsuarios();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoSalvarEdicaoUsuario() {
  const usuarioId = Number($("editarUsuarioId")?.value || 0);
  const nome = String($("editarUsuarioNome")?.value || "").trim();
  const cpf = String($("editarUsuarioCpf")?.value || "").trim();
  const whatsapp = String($("editarUsuarioWhatsapp")?.value || "").trim();
  const perfil = String($("editarUsuarioPerfil")?.value || "apostador").trim().toLowerCase();
  const promotorBaseRaw = Number($("editarUsuarioPromotorBaseId")?.value || 0);
  const indicadorRaw = Number($("editarUsuarioIndicadorId")?.value || 0);
  const comissao = Number($("editarUsuarioComissao")?.value || 0);
  const chavePix = String($("editarUsuarioChavePix")?.value || "").trim();
  const justificativa = String($("editarUsuarioJustificativa")?.value || "").trim();

  if (!usuarioId) {
    setStatus("Informe o ID do usuário para editar.", true);
    return;
  }

  const original = usuariosCacheById.get(usuarioId) || usuarioSelecionadoEdicao;
  if (!original) {
    setStatus("Selecione um usuário na lista antes de editar.", true);
    return;
  }

  const payload = {
    usuario_id: usuarioId,
    justificativa: justificativa || "Edição de cadastro/informações no dashboard.",
  };

  const nomeFinal = nome || String(original.nome || "");
  const cpfFinal = cpf || String(original.cpf_cnpj || "");
  const whatsappFinal = whatsapp || String(original.whatsapp || "");
  const perfilFinal = perfil || String(original.perfil || "apostador").toLowerCase();
  const promotorIdFinal = Number.isFinite(promotorBaseRaw) && promotorBaseRaw > 0
    ? promotorBaseRaw
    : (Number(original.promotor_id || 0) > 0 ? Number(original.promotor_id) : null);
  const indicadorIdFinal = Number.isFinite(indicadorRaw) && indicadorRaw > 0
    ? indicadorRaw
    : (Number(original.indicador_id || 0) > 0 ? Number(original.indicador_id) : null);
  const comissaoFinal = Number.isFinite(comissao)
    ? comissao
    : Number(original.comissao_percentual || 0);
  const chavePixFinal = chavePix || String(original.chave_pix || "");

  payload.nome = nomeFinal;
  payload.cpf_cnpj = cpfFinal;
  payload.whatsapp = whatsappFinal;
  payload.perfil = perfilFinal;
  payload.promotor_id = promotorIdFinal;
  payload.indicador_id = indicadorIdFinal;
  payload.comissao_percentual = comissaoFinal;
  payload.chave_pix = chavePixFinal;

  try {
    const resp = await adminPost("user_update", payload);
    const canceladas = Number(resp?.comissoes_pendentes_canceladas || 0);
    setStatus(canceladas > 0
      ? `Usuário atualizado. ${canceladas} comissão(ões) pendente(s) cancelada(s) por troca de base.`
      : "Usuário atualizado com sucesso.");
    await carregarUsuarios();
    await carregarPromotores();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoTransferirBaseApostador() {
  const apostadorId = Number($("transferirApostadorId")?.value || 0);
  const destinoRaw = Number($("transferirDestinoPromotorId")?.value || 0);
  const justificativa = String($("transferirJustificativa")?.value || "").trim();

  if (!apostadorId) {
    setStatus("Informe o ID do apostador.", true);
    return;
  }

  try {
    const resp = await adminPost("apostador_transferir_base", {
      apostador_id: apostadorId,
      destino_promotor_id: destinoRaw > 0 ? destinoRaw : null,
      justificativa: justificativa || "Transferência de base do apostador.",
    });
    const canceladas = Number(resp?.comissoes_pendentes_canceladas || 0);
    setStatus(`${resp?.message || "Base atualizada."} Comissões pendentes canceladas: ${canceladas}.`);
    await carregarUsuarios();
    await carregarPromotores();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoExcluirUsuarioPromotor() {
  const usuarioId = Number($("excluirUsuarioId")?.value || 0);
  const destinoRaw = Number($("excluirDestinoBasePromotorId")?.value || 0);
  const justificativa = String($("excluirJustificativa")?.value || "").trim();

  if (!usuarioId) {
    setStatus("Informe o ID para excluir.", true);
    return;
  }

  const confirmado = window.confirm(
    "Confirma excluir este usuário/promotor? Esta ação remove cadastro e histórico financeiro desse ID."
  );
  if (!confirmado) return;

  try {
    const resp = await adminPost("usuario_promotor_excluir", {
      usuario_id: usuarioId,
      destino_promotor_id: destinoRaw > 0 ? destinoRaw : null,
      justificativa: justificativa || "Exclusão administrativa no dashboard.",
    });
    setStatus(
      `${resp?.message || "Excluído."} Base movida: ${resp?.base_movida || 0}. Comissões pendentes canceladas: ${resp?.comissoes_pendentes_canceladas || 0}.`
    );
    await carregarUsuarios();
    await carregarPromotores();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoCriarPromotor() {
  const usuarioId = Number($("promotorUsuarioId")?.value || 0);
  const comissao = Number($("promotorComissaoPercentual")?.value || 0);
  const justificativa = String($("promotorJustificativa")?.value || "").trim();

  if (!usuarioId) {
    setStatus("Informe o ID do usuário para criar promotor.", true);
    return;
  }

  try {
    await adminPost("promotor_criar", {
      usuario_id: usuarioId,
      comissao_percentual: comissao,
      justificativa,
    });
    setStatus("Promotor criado/atualizado.");
    await carregarPromotores();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoSalvarComissaoPromotor() {
  const promotorId = Number($("promotorUsuarioId")?.value || 0);
  const comissao = Number($("promotorComissaoPercentual")?.value || 0);
  const justificativa = String($("promotorJustificativa")?.value || "").trim();

  if (!promotorId) {
    setStatus("Informe o ID do promotor.", true);
    return;
  }

  try {
    await adminPost("promotor_comissao_salvar", {
      promotor_usuario_id: promotorId,
      comissao_percentual: comissao,
      justificativa,
    });
    setStatus("Comissão do promotor atualizada.");
    await carregarPromotores();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoMarcarPremioPago() {
  const premioId = Number($("premioIdPagar")?.value || 0);
  const justificativa = String($("premioJustificativa")?.value || "").trim();
  if (!premioId) {
    setStatus("Informe o ID do prêmio.", true);
    return;
  }

  try {
    await adminPost("premio_marcar_pago", {
      premio_id: premioId,
      justificativa,
    });
    setStatus("Prêmio marcado como pago.");
    await carregarPremiacoes();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoVerificarDepositoAgora() {
  const depositoId = Number($("depositoIdVerificar")?.value || 0);
  if (!depositoId) {
    setStatus("Informe o ID do depósito.", true);
    return;
  }

  try {
    const data = await adminPost("deposito_verificar_agora", {
      deposito_id: depositoId,
      justificativa: "Verificação manual solicitada no dashboard.",
    });
    setStatus(`Depósito ${depositoId} verificado. Status: ${data?.resultado?.status_local || "--"}.`);
    await carregarDepositos();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoSincronizarDepositosPendentes() {
  try {
    const data = await adminPost("depositos_sincronizar_pendentes", {
      justificativa: "Sincronização manual em lote no dashboard.",
    });
    setStatus(`Sincronização concluída. ${data.total || 0} depósito(s) processado(s).`);
    await carregarDepositos();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoCriarSaque() {
  const usuarioId = Number($("saqueUsuarioId")?.value || 0);
  const valor = Number($("saqueValor")?.value || 0);
  const chavePix = String($("saqueChavePix")?.value || "").trim();
  const observacao = String($("saqueObs")?.value || "").trim();

  if (!usuarioId || !valor) {
    setStatus("Informe usuário e valor do saque.", true);
    return;
  }

  try {
    await adminPost("saque_criar", {
      usuario_id: usuarioId,
      valor,
      chave_pix: chavePix,
      observacao,
    });
    setStatus("Solicitação de saque criada.");
    await carregarSaques();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

async function acaoAtualizarStatusSaque() {
  const saqueId = Number($("saqueIdStatus")?.value || 0);
  const status = String($("saqueNovoStatus")?.value || "pendente");
  const observacao = String($("saqueObsStatus")?.value || "").trim();

  if (!saqueId) {
    setStatus("Informe o ID do saque.", true);
    return;
  }

  try {
    await adminPost("saque_atualizar_status", {
      saque_id: saqueId,
      status,
      observacao,
    });
    setStatus("Status do saque atualizado.");
    await carregarSaques();
    await carregarVisaoGeral();
  } catch (err) {
    setStatus(String(err?.message || err), true);
  }
}

function exportarCsv(tipo) {
  const filtros = obterFiltrosPeriodo();
  const params = new URLSearchParams({
    module: "export_csv",
    tipo,
    modo: filtros.modo,
    inicio: filtros.inicio,
    fim: filtros.fim,
    admin_password: adminDashPassword,
  });
  window.open(`${ADMIN_DASH_API_URL}?${params.toString()}`, "_blank");
}

function configurarEventos() {
  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.addEventListener("click", () => selecionarModulo(btn.dataset.modulo || "visao_geral"));
  });

  $("btnAtualizarModulo")?.addEventListener("click", carregarModuloAtual);
  $("btnFiltrarUsuarios")?.addEventListener("click", carregarUsuarios);
  $("btnFiltrarApostas")?.addEventListener("click", carregarApostas);

  $("btnAjustarSaldoUsuario")?.addEventListener("click", acaoAjustarSaldo);
  $("btnBloquearUsuario")?.addEventListener("click", () => acaoBloqueioUsuario(true));
  $("btnDesbloquearUsuario")?.addEventListener("click", () => acaoBloqueioUsuario(false));
  $("btnSalvarEdicaoUsuario")?.addEventListener("click", acaoSalvarEdicaoUsuario);
  $("btnTransferirBaseApostador")?.addEventListener("click", acaoTransferirBaseApostador);
  $("btnExcluirUsuarioPromotor")?.addEventListener("click", acaoExcluirUsuarioPromotor);

  $("btnCriarPromotor")?.addEventListener("click", acaoCriarPromotor);
  $("btnSalvarComissaoPromotor")?.addEventListener("click", acaoSalvarComissaoPromotor);

  $("btnMarcarPremioPago")?.addEventListener("click", acaoMarcarPremioPago);

  $("btnVerificarDepositoAgora")?.addEventListener("click", acaoVerificarDepositoAgora);
  $("btnSincronizarDepositosPendentes")?.addEventListener("click", acaoSincronizarDepositosPendentes);

  $("btnCriarSaque")?.addEventListener("click", acaoCriarSaque);
  $("btnAtualizarStatusSaque")?.addEventListener("click", acaoAtualizarStatusSaque);

  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => exportarCsv(btn.dataset.export || "overview"));
  });

  $("filtroPeriodoModo")?.addEventListener("change", () => {
    atualizarInfoPeriodo();
    carregarModuloAtual();
  });
  $("filtroPeriodoInicio")?.addEventListener("change", () => {
    atualizarInfoPeriodo();
    carregarModuloAtual();
  });
  $("filtroPeriodoFim")?.addEventListener("change", () => {
    atualizarInfoPeriodo();
    carregarModuloAtual();
  });

  $("btnEntrarAdminDash")?.addEventListener("click", async () => {
    const senha = String($("adminSenhaInput")?.value || "").trim();
    if (!senha) {
      const status = $("adminLoginStatus");
      if (status) {
        status.style.color = "#ff9a9a";
        status.textContent = "Informe a senha do admin.";
      }
      return;
    }

    adminDashPassword = senha;
    try {
      await adminFetch("overview", obterFiltrosPeriodo());
      localStorage.setItem(ADMIN_DASH_SESSION_KEY, adminDashPassword);
      $("adminLoginCard").style.display = "none";
      $("adminConteudo").style.display = "block";
      await carregarModuloAtual();
    } catch (err) {
      const status = $("adminLoginStatus");
      if (status) {
        status.style.color = "#ff9a9a";
        status.textContent = `Falha no login admin: ${String(err?.message || err)}`;
      }
      adminDashPassword = "";
      localStorage.removeItem(ADMIN_DASH_SESSION_KEY);
    }
  });

  $("btnLogoutAdminDash")?.addEventListener("click", () => {
    adminDashPassword = "";
    localStorage.removeItem(ADMIN_DASH_SESSION_KEY);
    $("adminConteudo").style.display = "none";
    $("adminLoginCard").style.display = "block";
    setStatus("Sessão administrativa encerrada.");
  });
}

async function initAdminDashboard() {
  const hoje = hojeISO();
  $("filtroPeriodoInicio").value = hoje;
  $("filtroPeriodoFim").value = hoje;
  atualizarInfoPeriodo();
  configurarAutoFecharCalendarios();
  configurarEventos();

  const sessao = String(localStorage.getItem(ADMIN_DASH_SESSION_KEY) || "").trim();
  if (!sessao) {
    $("adminLoginCard").style.display = "block";
    $("adminConteudo").style.display = "none";
    return;
  }

  adminDashPassword = sessao;
  try {
    await adminFetch("overview", obterFiltrosPeriodo());
    $("adminLoginCard").style.display = "none";
    $("adminConteudo").style.display = "block";
    await carregarModuloAtual();
  } catch (_err) {
    adminDashPassword = "";
    localStorage.removeItem(ADMIN_DASH_SESSION_KEY);
    $("adminLoginCard").style.display = "block";
    $("adminConteudo").style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", initAdminDashboard);
