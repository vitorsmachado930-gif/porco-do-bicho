const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";

let usuarios = [];
let usuarioAtual = null;

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

function salvarJSONStorage(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function normalizarLoginUsuario(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function extrairDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
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

function sanitizarUsuarios(arr) {
  const base = Array.isArray(arr) ? arr : [];
  return base
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const id = Number(raw.id);
      const nome = String(raw.nome || "").trim();
      const login = normalizarLoginUsuario(raw.login);
      const senha = String(raw.senha || "");
      const saldo = Number(raw.saldo);
      const telefone = String(raw.telefone || "").trim();
      const chavePix = String(raw.chavePix || "").trim().slice(0, 120);
      if (!Number.isFinite(id)) return null;
      if (nome.length < 2) return null;
      if (!login) return null;
      if (senha.length < 4) return null;
      return {
        id,
        nome,
        login,
        senha,
        saldo: Number.isFinite(saldo) && saldo >= 0 ? Number(saldo.toFixed(2)) : 0,
        telefone,
        chavePix
      };
    })
    .filter(Boolean);
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

function atualizarResumoUsuario() {
  const resumoEl = document.getElementById("depositoResumoUsuario");
  const saldoEl = document.getElementById("depositoSaldoAtual");
  const inputEl = document.getElementById("valorDepositoNovo");
  const btnEl = document.getElementById("btnDepositarSaldo");
  if (!resumoEl || !saldoEl || !inputEl || !btnEl) return;

  if (!usuarioAtual) {
    resumoEl.innerText = "Faça login na Home para usar a área de depósito.";
    saldoEl.innerText = "R$ 0,00";
    inputEl.disabled = true;
    btnEl.disabled = true;
    return;
  }

  resumoEl.innerText = `Usuário: ${usuarioAtual.nome} (@${usuarioAtual.login})`;
  saldoEl.innerText = formatarMoedaBR(usuarioAtual.saldo);
  inputEl.disabled = false;
  btnEl.disabled = false;
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

function depositarSaldo() {
  if (!usuarioAtual) {
    atualizarStatusDeposito("Sessão inválida. Volte para a Home e faça login.", true);
    return;
  }

  const input = document.getElementById("valorDepositoNovo");
  if (!input) return;
  const centavos = Number(extrairDigitos(input.value) || 0);

  if (!Number.isFinite(centavos) || centavos <= 0) {
    atualizarStatusDeposito("Informe um valor de depósito válido.", true);
    return;
  }

  const valorDeposito = centavos / 100;
  const idx = usuarios.findIndex((u) => u.id === usuarioAtual.id);
  if (idx === -1) {
    atualizarStatusDeposito("Usuário não encontrado. Faça login novamente.", true);
    return;
  }

  const saldoAtual = Number(usuarios[idx].saldo || 0);
  const novoSaldo = Number((saldoAtual + valorDeposito).toFixed(2));
  usuarios[idx].saldo = novoSaldo;
  usuarioAtual = usuarios[idx];

  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  atualizarResumoUsuario();
  input.value = "R$ 0,00";
  atualizarStatusDeposito(
    `Depósito confirmado: +${formatarMoedaBR(valorDeposito)}. Novo saldo: ${formatarMoedaBR(novoSaldo)}.`,
    false
  );
}

function initDeposito() {
  carregarEstado();
  configurarMascaraValorDeposito();
  atualizarResumoUsuario();
  atualizarStatusDeposito("", false);
}

window.depositarSaldo = depositarSaldo;
window.addEventListener("load", initDeposito);
