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
        role,
        promotorId: role === PAPEL_USUARIO_PROMOTOR ? null : promotorId,
        comissaoPercentual: role === PAPEL_USUARIO_PROMOTOR ? comissaoPercentual : 0,
        comissaoSaldo: role === PAPEL_USUARIO_PROMOTOR ? comissaoSaldo : 0,
        comissaoTotal: role === PAPEL_USUARIO_PROMOTOR ? comissaoTotal : 0,
        totalDepositos,
        telefone,
        chavePix
      };
    })
    .filter(Boolean);

  const idsPromotores = new Set(
    sane.filter((item) => item.role === PAPEL_USUARIO_PROMOTOR).map((item) => item.id)
  );
  sane.forEach((item) => {
    if (item.role === PAPEL_USUARIO_PROMOTOR) {
      item.promotorId = null;
      return;
    }
    if (!idsPromotores.has(item.promotorId)) {
      item.promotorId = null;
    }
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
  usuarios[idx].totalDepositos = Number((Number(usuarios[idx].totalDepositos || 0) + valorDeposito).toFixed(2));

  const apostador = usuarios[idx];
  let comissaoGerada = 0;
  let promotorLogin = "";
  const promotorId = Number(apostador.promotorId);
  if (apostador.role !== PAPEL_USUARIO_PROMOTOR && Number.isFinite(promotorId) && promotorId > 0) {
    const idxPromotor = usuarios.findIndex(
      (u) => u.id === promotorId && String(u.role || "") === PAPEL_USUARIO_PROMOTOR
    );
    if (idxPromotor !== -1) {
      const percentual = Number(usuarios[idxPromotor].comissaoPercentual || 0);
      if (Number.isFinite(percentual) && percentual > 0) {
        comissaoGerada = Number(((valorDeposito * percentual) / 100).toFixed(2));
      }
      if (comissaoGerada > 0) {
        usuarios[idxPromotor].comissaoSaldo = Number(
          (Number(usuarios[idxPromotor].comissaoSaldo || 0) + comissaoGerada).toFixed(2)
        );
        usuarios[idxPromotor].comissaoTotal = Number(
          (Number(usuarios[idxPromotor].comissaoTotal || 0) + comissaoGerada).toFixed(2)
        );
      }
      promotorLogin = String(usuarios[idxPromotor].login || "");
    } else {
      usuarios[idx].promotorId = null;
    }
  }

  usuarioAtual = usuarios[idx];

  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  atualizarResumoUsuario();
  input.value = "R$ 0,00";
  const textoComissao =
    comissaoGerada > 0 && promotorLogin
      ? ` Comissão para @${promotorLogin}: ${formatarMoedaBR(comissaoGerada)}.`
      : "";
  atualizarStatusDeposito(
    `Depósito confirmado: +${formatarMoedaBR(valorDeposito)}. Novo saldo: ${formatarMoedaBR(novoSaldo)}.${textoComissao}`,
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
