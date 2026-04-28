const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
const PAPEL_USUARIO_APOSTADOR = "apostador";
const PAPEL_USUARIO_PROMOTOR = "promotor";

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

function normalizarDataISO(valor) {
  if (typeof valor !== "string") return "";
  const limpo = valor.trim();
  if (!limpo) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
  const d = new Date(limpo);
  if (Number.isNaN(d.getTime())) return "";
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function hojeISO() {
  return normalizarDataISO(new Date().toISOString()) || "";
}

function normalizarContadorNaoNegativo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function resetarControleDiarioBonusIndicacao(usuario, dataReferencia) {
  if (!usuario || typeof usuario !== "object") return;
  const referencia = normalizarDataISO(dataReferencia) || hojeISO();
  if (String(usuario.bonusIndicacaoConvertidoHojeData || "") !== referencia) {
    usuario.bonusIndicacaoConvertidoHoje = 0;
    usuario.bonusIndicacaoConvertidoHojeData = referencia;
  }
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
      const promotorIdNum = Number(raw.promotorId);
      const promotorId =
        Number.isFinite(promotorIdNum) && promotorIdNum > 0 ? Math.floor(promotorIdNum) : null;
      const comissaoPercentualRaw = Number(raw.comissaoPercentual);
      const comissaoPercentual = Number.isFinite(comissaoPercentualRaw)
        ? Math.max(0, Math.min(100, Number(comissaoPercentualRaw.toFixed(2))))
        : 0;
      const comissaoSaldoRaw = Number(raw.comissaoSaldo);
      const comissaoSaldo = Number.isFinite(comissaoSaldoRaw) && comissaoSaldoRaw >= 0
        ? Number(comissaoSaldoRaw.toFixed(2))
        : 0;
      const comissaoTotalRaw = Number(raw.comissaoTotal);
      const comissaoTotal = Number.isFinite(comissaoTotalRaw) && comissaoTotalRaw >= 0
        ? Number(comissaoTotalRaw.toFixed(2))
        : 0;
      const totalDepositosRaw = Number(raw.totalDepositos);
      const totalDepositos = Number.isFinite(totalDepositosRaw) && totalDepositosRaw >= 0
        ? Number(totalDepositosRaw.toFixed(2))
        : 0;
      const saldoApostador = normalizarValorNaoNegativo(raw.saldoApostador);
      const indicadorId = normalizarIdPositivo(raw.indicadorId);
      const bonusIndicacaoSaldo = normalizarValorNaoNegativo(raw.bonusIndicacaoSaldo);
      const bonusIndicacaoTotal = normalizarValorNaoNegativo(raw.bonusIndicacaoTotal);
      const bonusIndicacaoConvertidoTotal = normalizarValorNaoNegativo(raw.bonusIndicacaoConvertidoTotal);
      const bonusIndicacaoConvertidoHoje = normalizarValorNaoNegativo(raw.bonusIndicacaoConvertidoHoje);
      const bonusIndicacaoConvertidoHojeData = normalizarDataISO(raw.bonusIndicacaoConvertidoHojeData);
      const indicadosTotal = normalizarContadorNaoNegativo(raw.indicadosTotal);
      const telefone = String(raw.telefone || "").trim();
      const chavePix = String(raw.chavePix || "").trim().slice(0, 120);
      const bloqueado = Boolean(raw.bloqueado || raw.blocked || raw.suspenso);
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
        role,
        promotorId: role === PAPEL_USUARIO_PROMOTOR ? null : promotorId,
        comissaoPercentual: role === PAPEL_USUARIO_PROMOTOR ? comissaoPercentual : 0,
        comissaoSaldo: role === PAPEL_USUARIO_PROMOTOR ? comissaoSaldo : 0,
        comissaoTotal: role === PAPEL_USUARIO_PROMOTOR ? comissaoTotal : 0,
        totalDepositos,
        saldoApostador: role === PAPEL_USUARIO_PROMOTOR ? saldoApostador : 0,
        indicadorId: role === PAPEL_USUARIO_PROMOTOR ? null : indicadorId,
        bonusIndicacaoSaldo: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoSaldo,
        bonusIndicacaoTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoTotal,
        bonusIndicacaoConvertidoTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoConvertidoTotal,
        bonusIndicacaoConvertidoHoje: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoConvertidoHoje,
        bonusIndicacaoConvertidoHojeData: role === PAPEL_USUARIO_PROMOTOR ? "" : (bonusIndicacaoConvertidoHojeData || ""),
        indicadosTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : indicadosTotal,
        telefone,
        chavePix,
        bloqueado
      };
    })
    .filter(Boolean);

  const idsPromotores = new Set(
    sane.filter((item) => item.role === PAPEL_USUARIO_PROMOTOR).map((item) => item.id)
  );
  const idsApostadores = new Set(
    sane.filter((item) => item.role !== PAPEL_USUARIO_PROMOTOR).map((item) => item.id)
  );
  sane.forEach((item) => {
    if (item.role === PAPEL_USUARIO_PROMOTOR) {
      item.promotorId = null;
      item.indicadorId = null;
      item.bonusIndicacaoSaldo = 0;
      item.bonusIndicacaoTotal = 0;
      item.bonusIndicacaoConvertidoTotal = 0;
      item.bonusIndicacaoConvertidoHoje = 0;
      item.bonusIndicacaoConvertidoHojeData = "";
      item.indicadosTotal = 0;
      return;
    }
    item.saldoApostador = 0;
    if (!idsPromotores.has(item.promotorId)) {
      item.promotorId = null;
    }
    if (!idsApostadores.has(item.indicadorId) || item.indicadorId === item.id) {
      item.indicadorId = null;
    }
    resetarControleDiarioBonusIndicacao(item, hojeISO());
  });

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
  if (usuarioAtual && usuarioAtual.bloqueado) {
    localStorage.removeItem(USUARIO_SESSAO_KEY);
    usuarioAtual = null;
  }
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

  if (usuarioAtual) {
    saldoEl.innerText = formatarMoedaBR(usuarioAtual.saldo);
  } else {
    saldoEl.innerText = "R$ 0,00";
  }
  resumoEl.innerText = "Recarga disponível somente no Painel Admin.";
  inputEl.disabled = true;
  btnEl.disabled = true;
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
  atualizarStatusDeposito("Recarga disponível somente no Painel Admin.", true);
}

function initDeposito() {
  carregarEstado();
  configurarMascaraValorDeposito();
  atualizarResumoUsuario();
  atualizarStatusDeposito("", false);
}

window.depositarSaldo = depositarSaldo;
window.addEventListener("load", initDeposito);
