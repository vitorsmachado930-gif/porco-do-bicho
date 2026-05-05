const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAPEL_USUARIO_APOSTADOR = "apostador";
const PAPEL_USUARIO_PROMOTOR = "promotor";

const API_ORIGIN_FALLBACK = "https://porcodobicho.com";
const API_ORIGIN_ATIVO = (() => {
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local");
  return isLocal ? API_ORIGIN_FALLBACK : "";
})();

const API_WALLET_UPSERT_URL = `${API_ORIGIN_ATIVO}/api/carteira_usuario_upsert.php`;
const API_WALLET_SALDO_URL = `${API_ORIGIN_ATIVO}/api/carteira_saldo_usuario.php`;
const API_WALLET_CRIAR_DEPOSITO_URL = `${API_ORIGIN_ATIVO}/api/carteira_deposito_criar.php`;
const API_WALLET_STATUS_DEPOSITO_URL = `${API_ORIGIN_ATIVO}/api/carteira_deposito_status.php`;

let usuarios = [];
let usuarioAtual = null;
let depositoRefAtual = "";
let timerStatusDeposito = null;

function lerJSONStorage(chave, fallback) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return fallback;
    const parsed = JSON.parse(bruto);
    return parsed ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

function normalizarLoginUsuario(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizarValorNaoNegativo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(2));
}

function normalizarIdPositivo(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const id = Number(valor);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

function formatarMoedaBR(valor) {
  const numero = Number(valor || 0);
  const final = Number.isFinite(numero) ? numero : 0;
  return `R$ ${final.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatarCentavosComoMoedaBR(centavos) {
  const c = Number(centavos || 0);
  const final = Number.isFinite(c) && c > 0 ? Math.floor(c) : 0;
  return formatarMoedaBR(final / 100);
}

function extrairDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarCpfCnpjUsuario(valor) {
  const digitos = extrairDigitos(valor);
  if (!digitos) return "";
  return digitos.slice(0, 14);
}

function sanitizarUsuarios(arr) {
  const base = Array.isArray(arr) ? arr : [];
  const sane = base
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const id = Number(raw.id);
      const nome = String(raw.nome || "").trim();
      const login = normalizarLoginUsuario(raw.login);
      const senha = String(raw.senha || "");
      const saldo = Number(raw.saldo);
      const role =
        String(raw.role || "").trim().toLowerCase() === PAPEL_USUARIO_PROMOTOR
          ? PAPEL_USUARIO_PROMOTOR
          : PAPEL_USUARIO_APOSTADOR;
      if (!Number.isFinite(id)) return null;
      if (nome.length < 2) return null;
      if (!login) return null;
      if (senha.length < 4) return null;
      return {
        id,
        nome,
        login,
        saldo: Number.isFinite(saldo) && saldo >= 0 ? Number(saldo.toFixed(2)) : 0,
        role,
        email: String(raw.email || "").trim(),
        telefone: String(raw.telefone || "").trim(),
        cpfCnpj: normalizarCpfCnpjUsuario(raw.cpfCnpj || raw.cpf_cnpj),
      };
    })
    .filter(Boolean);

  return sane;
}

function carregarEstado() {
  usuarios = sanitizarUsuarios(lerJSONStorage(USUARIOS_KEY, []));
  const sessaoId = Number(localStorage.getItem(USUARIO_SESSAO_KEY));
  if (!Number.isFinite(sessaoId)) {
    usuarioAtual = null;
    return;
  }
  usuarioAtual = usuarios.find((u) => u.id === sessaoId) || null;
}

function atualizarStatusDeposito(texto, erro) {
  const el = document.getElementById("depositoStatus");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function mostrarPixBox(info) {
  const box = document.getElementById("depositoPixBox");
  const resumo = document.getElementById("depositoPixResumo");
  const img = document.getElementById("depositoPixQrImage");
  const copia = document.getElementById("depositoPixCopiaCola");

  if (!box || !resumo || !img || !copia) return;

  const valorFmt = formatarMoedaBR(info.valor || 0);
  resumo.innerText = `Depósito ${info.referenceId || "-"} | Valor: ${valorFmt} | Status: ${info.status || "PENDENTE"}`;

  const qrBase64 = String(info.qrCodeBase64 || "").trim();
  if (qrBase64) {
    img.src = `data:image/png;base64,${qrBase64}`;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }

  copia.value = String(info.pixCopiaCola || "");
  box.style.display = "block";
}

function ocultarPixBox() {
  const box = document.getElementById("depositoPixBox");
  if (box) box.style.display = "none";
}

function atualizarResumoUsuario() {
  const resumoEl = document.getElementById("depositoResumoUsuario");
  const saldoEl = document.getElementById("depositoSaldoAtual");
  const inputEl = document.getElementById("valorDepositoNovo");
  const btnEl = document.getElementById("btnDepositarSaldo");

  if (!resumoEl || !saldoEl || !inputEl || !btnEl) return;

  if (usuarioAtual) {
    saldoEl.innerText = formatarMoedaBR(usuarioAtual.saldo);
    resumoEl.innerText = `Usuário logado: ${usuarioAtual.nome} (@${usuarioAtual.login}).`;
    inputEl.disabled = false;
    btnEl.disabled = false;
  } else {
    saldoEl.innerText = "R$ 0,00";
    resumoEl.innerText = "Faça login antes de gerar depósito.";
    inputEl.disabled = true;
    btnEl.disabled = true;
  }
}

function configurarMascaraValorDeposito() {
  const input = document.getElementById("valorDepositoNovo");
  if (!input) return;

  const aplicar = () => {
    const digitos = extrairDigitos(input.value);
    input.value = formatarCentavosComoMoedaBR(digitos);
  };

  input.addEventListener("input", aplicar);
  input.addEventListener("blur", aplicar);
  input.value = formatarCentavosComoMoedaBR(input.value);
}

function valorInputDeposito() {
  const input = document.getElementById("valorDepositoNovo");
  if (!input) return 0;
  const digitos = extrairDigitos(input.value);
  const centavos = Number(digitos || 0);
  if (!Number.isFinite(centavos) || centavos <= 0) return 0;
  return normalizarValorNaoNegativo(centavos / 100);
}

async function requestJson(url, options) {
  const resp = await fetch(url, {
    ...(options || {}),
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-App-Client": "porcodobicho-web",
      ...((options && options.headers) || {})
    },
    cache: "no-store"
  });

  let body = null;
  try {
    body = await resp.json();
  } catch (_err) {
    body = null;
  }

  if (!resp.ok) {
    const msg = body && body.error ? body.error : `Falha HTTP ${resp.status}`;
    throw new Error(msg);
  }

  return body || {};
}

async function sincronizarUsuarioCarteira() {
  if (!usuarioAtual) return;
  const senha = String(usuarioAtual.senha || "");
  if (!senha) {
    throw new Error("Sessão inválida para sincronizar carteira.");
  }

  await requestJson(API_WALLET_UPSERT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: usuarioAtual.login,
      senha,
      nome: usuarioAtual.nome,
      email: usuarioAtual.email || "",
      telefone: usuarioAtual.telefone || "",
      cpfCnpj: normalizarCpfCnpjUsuario(usuarioAtual.cpfCnpj || usuarioAtual.cpf_cnpj || "")
    })
  });
}

async function atualizarSaldoCarteira() {
  if (!usuarioAtual) return;
  const senha = String(usuarioAtual.senha || "");
  if (!senha) {
    throw new Error("Sessão inválida para consultar saldo.");
  }

  const payload = await requestJson(
    API_WALLET_SALDO_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: usuarioAtual.login,
        senha
      })
    }
  );

  const saldoRemoto = normalizarValorNaoNegativo(payload?.usuario?.saldo || 0);
  usuarioAtual.saldo = saldoRemoto;
  const saldoEl = document.getElementById("depositoSaldoAtual");
  if (saldoEl) saldoEl.innerText = formatarMoedaBR(saldoRemoto);
}

function pararPollingStatusDeposito() {
  if (timerStatusDeposito) {
    clearInterval(timerStatusDeposito);
    timerStatusDeposito = null;
  }
}

async function consultarStatusDepositoAtual() {
  if (!depositoRefAtual) return;

  try {
    const payload = await requestJson(
      `${API_WALLET_STATUS_DEPOSITO_URL}?ref=${encodeURIComponent(depositoRefAtual)}`,
      { method: "GET" }
    );

    const dep = payload?.deposito || {};
    const status = String(dep.status || "").toUpperCase();

    mostrarPixBox({
      referenceId: dep.referenceId || depositoRefAtual,
      valor: dep.valor || 0,
      status,
      qrCodeBase64: "",
      pixCopiaCola: (document.getElementById("depositoPixCopiaCola") || {}).value || ""
    });

    if (status === "PAGO") {
      pararPollingStatusDeposito();
      atualizarStatusDeposito("Pagamento confirmado. Saldo creditado com sucesso!", false);
      await atualizarSaldoCarteira();
    }
  } catch (_err) {
    // Mantem polling silencioso para nao poluir a tela.
  }
}

async function depositarSaldo() {
  try {
    if (!usuarioAtual) {
      atualizarStatusDeposito("Faça login para gerar depósito.", true);
      return;
    }

    const valor = valorInputDeposito();
    if (valor < 1) {
      atualizarStatusDeposito("Informe um valor mínimo de R$ 1,00.", true);
      return;
    }

    const cpfInput = document.getElementById("cpfCnpjDeposito");
    const cpfCnpj = extrairDigitos(cpfInput ? cpfInput.value : "");
    const senha = String(usuarioAtual.senha || "");
    if (!senha) {
      atualizarStatusDeposito("Sessão inválida para depósito.", true);
      return;
    }

    atualizarStatusDeposito("Gerando cobrança PIX...", false);

    const payload = await requestJson(API_WALLET_CRIAR_DEPOSITO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: usuarioAtual.login,
        senha,
        valor,
        cpfCnpj
      })
    });

    const dep = payload?.deposito || {};
    depositoRefAtual = String(dep.referenceId || "");

    mostrarPixBox({
      referenceId: depositoRefAtual,
      valor: dep.valor || valor,
      status: dep.status || "PENDENTE",
      qrCodeBase64: dep.qrCodeBase64 || "",
      pixCopiaCola: dep.pixCopiaCola || ""
    });

    atualizarStatusDeposito(
      "PIX gerado. Pague o QR Code para o saldo ser creditado automaticamente.",
      false
    );

    pararPollingStatusDeposito();
    timerStatusDeposito = setInterval(() => {
      consultarStatusDepositoAtual();
    }, 15000);
  } catch (err) {
    atualizarStatusDeposito(err?.message || "Falha ao gerar depósito PIX.", true);
  }
}

function copiarCodigoPix() {
  const area = document.getElementById("depositoPixCopiaCola");
  if (!area) return;
  const texto = String(area.value || "").trim();
  if (!texto) {
    atualizarStatusDeposito("Nenhum código PIX para copiar.", true);
    return;
  }

  navigator.clipboard
    .writeText(texto)
    .then(() => atualizarStatusDeposito("Código PIX copiado.", false))
    .catch(() => atualizarStatusDeposito("Não foi possível copiar automaticamente.", true));
}

async function initDeposito() {
  carregarEstado();
  configurarMascaraValorDeposito();
  atualizarResumoUsuario();
  ocultarPixBox();
  atualizarStatusDeposito("", false);

  const btnCopiar = document.getElementById("btnCopiarPixCode");
  if (btnCopiar && !btnCopiar.dataset.bind) {
    btnCopiar.dataset.bind = "1";
    btnCopiar.addEventListener("click", copiarCodigoPix);
  }

  if (!usuarioAtual) return;

  try {
    await sincronizarUsuarioCarteira();
    await atualizarSaldoCarteira();
  } catch (_err) {
    atualizarStatusDeposito(
      "Carteira SQL ainda não configurada no servidor. Defina DB_* e ASAAS_* para ativar.",
      true
    );
  }
}

window.depositarSaldo = depositarSaldo;
window.addEventListener("load", initDeposito);
