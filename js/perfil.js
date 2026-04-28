const STORAGE_KEY = "dados";
const APOSTAS_KEY = "apostas";
const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
const MAX_DIAS_HISTORICO = 7;
const PAPEL_USUARIO_APOSTADOR = "apostador";
const PAPEL_USUARIO_PROMOTOR = "promotor";
const BONUS_INDICACAO_VALOR_POR_CADASTRO = 10;
const BONUS_INDICACAO_VALOR_CONVERSAO = 10;
const BONUS_INDICACAO_LIMITE_DIARIO = 100;

const TIPOS_APOSTA = {
  grupo: "Grupo 1º",
  dupla_grupo: "Dupla de Grupo",
  terno_grupo: "Terno de Grupo",
  duque_dezena: "Duque de Dezena",
  terno_dezena: "Terno de Dezena",
  passe_seco: "Passe-Seco",
  passe_vai_vem: "Passe Vai e Vem",
  dupla_grupo_1a5: "Dupla de Grupo 1º ao 5º",
  terno_grupo_1a5: "Terno de Grupo 1º ao 5º",
  milhar: "Milhar (Ao quinto 1º-5º)",
  milhar_seca: "Milhar (Seca 1º)",
  centena: "Centena (Ao quinto 1º-5º)",
  centena_seca: "Centena (Seca 1º)",
  dezena: "Dezena (Ao quinto 1º-5º)",
  dezena_seca: "Dezena (Seca 1º)"
};

let usuarios = [];
let apostas = [];
let resultados = [];
let usuarioAtual = null;
let modoEdicaoPerfil = false;
let saldoPerfilAnterior = null;
let timeoutAnimacaoSaldoPerfil = null;
let ultimoPainelSyncPerfil = 0;
let intervaloSyncPerfil = null;
let totalPremiosCreditadosPerfilAnterior = null;

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

function slugBilheteParte(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gerarBilheteIdAposta(data, praca, loteria, usuarioId, usuarioLogin) {
  const dataId = normalizarDataISO(data) || hojeISO();
  const pracaId = slugBilheteParte(praca) || "RIO";
  const loteriaId = slugBilheteParte(loteria) || "LOTERIA";
  const donoId =
    Number.isFinite(Number(usuarioId)) && Number(usuarioId) > 0
      ? `U${Math.floor(Number(usuarioId))}`
      : `L${slugBilheteParte(usuarioLogin) || "ANON"}`;
  return `BILHETE-${donoId}-${dataId}-${pracaId}-${loteriaId}`;
}

function normalizarDataISO(valor) {
  if (typeof valor !== "string") return "";
  const limpo = valor.trim();
  if (!limpo) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
  const d = new Date(limpo);
  if (Number.isNaN(d.getTime())) return "";
  return dataLocalParaISO(d);
}

function dataLocalParaISO(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function hojeISO() {
  return dataLocalParaISO(new Date());
}

function dataMinimaISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (MAX_DIAS_HISTORICO - 1));
  return dataLocalParaISO(d);
}

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = String(dataISO || "").split("-");
  if (!ano || !mes || !dia) return "--/--/--";
  return `${dia}/${mes}/${ano.slice(-2)}`;
}

function formatarHorarioBR(dataHora) {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function obterHorarioLoteria(loteria) {
  const match = String(loteria || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return null;
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return { horas, minutos };
}

function loteriaJaCorreuNaData(dataISO, loteria) {
  const data = normalizarDataISO(dataISO);
  const horario = obterHorarioLoteria(loteria);
  if (!data || !horario) return false;

  const sorteio = new Date(`${data}T00:00:00`);
  sorteio.setHours(horario.horas, horario.minutos, 0, 0);
  return Date.now() >= sorteio.getTime();
}

function extrairDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarTelefoneBrasil(valor) {
  let digitos = extrairDigitos(valor);
  if (digitos.startsWith("55") && digitos.length > 11) {
    digitos = digitos.slice(2);
  }
  if (digitos.length > 11) {
    digitos = digitos.slice(0, 11);
  }
  return digitos;
}

function formatarTelefoneBrasil(valor) {
  const digitos = normalizarTelefoneBrasil(valor);
  if (!digitos) return "";

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);

  if (digitos.length <= 2) {
    return `(${ddd}`;
  }

  if (numero.length <= 4) {
    return `(${ddd}) ${numero}`;
  }

  if (numero.length <= 8) {
    return `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
  }

  return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5, 9)}`;
}

function validarTelefoneBrasil(valor) {
  const digitos = normalizarTelefoneBrasil(valor);
  if (!digitos) {
    return { ok: true, valor: "" };
  }

  if (digitos.length < 10 || digitos.length > 11) {
    return {
      ok: false,
      mensagem: "Informe telefone com DDD e número válido (10 ou 11 dígitos)."
    };
  }

  const ddd = Number(digitos.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) {
    return {
      ok: false,
      mensagem: "DDD inválido. Informe um DDD entre 11 e 99."
    };
  }

  return {
    ok: true,
    valor: formatarTelefoneBrasil(digitos)
  };
}

function normalizarValorMoeda(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return "0.00";
  if (txt.includes("R$")) {
    const digitos = extrairDigitos(txt);
    const centavos = Number(digitos || 0);
    if (!Number.isFinite(centavos)) return "0.00";
    return (centavos / 100).toFixed(2);
  }
  const n = Number(txt.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

function formatarMoedaBR(valor) {
  const n = Number(normalizarValorMoeda(valor));
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

function normalizarContadorNaoNegativo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      const telefone = formatarTelefoneBrasil(raw.telefone);
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
        saldoApostador: role === PAPEL_USUARIO_PROMOTOR ? saldoApostador : 0,
        indicadorId: role === PAPEL_USUARIO_PROMOTOR ? null : indicadorId,
        bonusIndicacaoSaldo: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoSaldo,
        bonusIndicacaoTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoTotal,
        bonusIndicacaoConvertidoTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoConvertidoTotal,
        bonusIndicacaoConvertidoHoje: role === PAPEL_USUARIO_PROMOTOR ? 0 : bonusIndicacaoConvertidoHoje,
        bonusIndicacaoConvertidoHojeData: role === PAPEL_USUARIO_PROMOTOR ? "" : (bonusIndicacaoConvertidoHojeData || ""),
        indicadosTotal: role === PAPEL_USUARIO_PROMOTOR ? 0 : indicadosTotal,
        telefone,
        chavePix
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

function sanitizarApostas(arr) {
  const base = Array.isArray(arr) ? arr : [];
  return base
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const id = Number(raw.id);
      const data = normalizarDataISO(raw.data);
      const praca = String(raw.praca || "").trim();
      const loteria = String(raw.loteria || "").trim();
      const tipo = String(raw.tipo || "").trim();
      const palpite = String(raw.palpite || "").trim();
      const valor = normalizarValorMoeda(raw.valor);
      const premio = normalizarValorMoeda(raw.premio);
      const createdAt = String(raw.createdAt || "").trim();
      const usuarioId = Number(raw.usuarioId);
      const usuarioLogin = normalizarLoginUsuario(raw.usuarioLogin);
      const bilheteIdRaw = String(raw.bilheteId || "").trim();
      const premioCreditado = Boolean(raw.premioCreditado || raw.premioPago);
      const premioCreditadoValor = normalizarValorNaoNegativo(
        raw.premioCreditadoValor ?? raw.premioPagoValor
      );
      const premioCreditadoEm = String(raw.premioCreditadoEm || raw.premioPagoEm || "").trim();
      if (!Number.isFinite(id)) return null;
      if (!data || !praca || !loteria || !tipo || !palpite) return null;
      const bilheteId =
        bilheteIdRaw || gerarBilheteIdAposta(data, praca, loteria, usuarioId, usuarioLogin);
      return {
        id,
        data,
        praca,
        loteria,
        bilheteId,
        tipo,
        palpite,
        valor,
        premio,
        createdAt,
        usuarioId: Number.isFinite(usuarioId) ? usuarioId : null,
        usuarioLogin,
        premioCreditado,
        premioCreditadoValor: premioCreditado ? premioCreditadoValor : 0,
        premioCreditadoEm: premioCreditado ? premioCreditadoEm : ""
      };
    })
    .filter(Boolean);
}

function sanitizarResultados(arr) {
  const base = Array.isArray(arr) ? arr : [];
  return base
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const data = normalizarDataISO(raw.data);
      const praca = String(raw.praca || "").trim();
      const loteria = String(raw.loteria || "").trim();
      const listaResultados = Array.isArray(raw.resultados)
        ? raw.resultados
            .map((r) => ({
              numero: extrairDigitos(r && r.numero).padStart(4, "0").slice(-4),
              grupo: String(r && r.grupo || "").padStart(2, "0").slice(-2)
            }))
            .filter((r) => r.numero && r.grupo)
        : [];
      if (!data || !praca || !loteria) return null;
      return { data, praca, loteria, resultados: listaResultados };
    })
    .filter(Boolean);
}

function carregarEstado() {
  usuarios = sanitizarUsuarios(lerJSONStorage(USUARIOS_KEY, []));
  apostas = sanitizarApostas(lerJSONStorage(APOSTAS_KEY, []));
  resultados = sanitizarResultados(lerJSONStorage(STORAGE_KEY, []));

  const sessaoId = Number(localStorage.getItem(USUARIO_SESSAO_KEY));
  if (!Number.isFinite(sessaoId)) {
    usuarioAtual = null;
    return;
  }
  usuarioAtual = usuarios.find((u) => u.id === sessaoId) || null;
}

function gruposDoPalpite(palpite) {
  return String(palpite || "")
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatarPalpiteBilhete(aposta) {
  const tipo = String(aposta && aposta.tipo || "");
  const palpite = String(aposta && aposta.palpite || "");
  if (
    tipo === "grupo" ||
    tipo === "dupla_grupo" ||
    tipo === "terno_grupo" ||
    tipo === "passe_seco" ||
    tipo === "passe_vai_vem" ||
    tipo === "dupla_grupo_1a5" ||
    tipo === "terno_grupo_1a5" ||
    tipo === "duque_dezena" ||
    tipo === "terno_dezena"
  ) {
    return gruposDoPalpite(palpite).join(" - ");
  }
  return palpite;
}

function resultadoDaAposta(aposta) {
  const achado = resultados.find(
    (item) =>
      item.data === aposta.data &&
      item.praca === aposta.praca &&
      item.loteria === aposta.loteria
  );

  if (!achado || !Array.isArray(achado.resultados) || achado.resultados.length === 0) {
    return {
      status: "PENDENTE",
      classe: "status-pendente",
      detalhe: "Aguardando resultado."
    };
  }

  const gruposResultado = achado.resultados.map((r) => String(r.grupo || "").padStart(2, "0"));
  const numerosResultado = achado.resultados.map((r) => String(r.numero || "").padStart(4, "0"));
  const dezenasResultado = numerosResultado.map((n) => n.slice(-2));
  const gruposPrimeiros2 = gruposResultado.slice(0, 2);
  const primeiroNumero = numerosResultado[0] || "";
  const palpite = String(aposta.palpite || "").trim();
  let ganhou = false;

  if (aposta.tipo === "grupo") {
    ganhou = gruposResultado.includes(palpite);
  } else if (aposta.tipo === "dupla_grupo") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "terno_grupo") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "duque_dezena") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (aposta.tipo === "terno_dezena") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (aposta.tipo === "passe_seco") {
    const alvo = gruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      alvo[0] === gruposPrimeiros2[0] &&
      alvo[1] === gruposPrimeiros2[1];
  } else if (aposta.tipo === "passe_vai_vem") {
    const alvo = gruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      ((alvo[0] === gruposPrimeiros2[0] && alvo[1] === gruposPrimeiros2[1]) ||
        (alvo[0] === gruposPrimeiros2[1] && alvo[1] === gruposPrimeiros2[0]));
  } else if (aposta.tipo === "dupla_grupo_1a5") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "terno_grupo_1a5") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "milhar") {
    ganhou = numerosResultado.includes(palpite);
  } else if (aposta.tipo === "milhar_seca") {
    ganhou = primeiroNumero === palpite;
  } else if (aposta.tipo === "centena") {
    ganhou = numerosResultado.some((n) => n.slice(-3) === palpite);
  } else if (aposta.tipo === "centena_seca") {
    ganhou = primeiroNumero.slice(-3) === palpite;
  } else if (aposta.tipo === "dezena") {
    ganhou = numerosResultado.some((n) => n.slice(-2) === palpite);
  } else if (aposta.tipo === "dezena_seca") {
    ganhou = primeiroNumero.slice(-2) === palpite;
  }

  return ganhou
    ? { status: "GANHOU", classe: "status-ganhou", detalhe: "Bilhete premiado." }
    : { status: "PERDEU", classe: "status-perdeu", detalhe: "Bilhete não premiado." };
}

function atualizarResumoUsuario() {
  const resumo = document.getElementById("perfilResumoUsuario");
  if (!resumo) return;
  if (!usuarioAtual) {
    resumo.innerText = "Faça login na Home para acessar seu perfil.";
    return;
  }
  resumo.innerText = `Login: @${usuarioAtual.login}`;
}

function limparAnimacaoSaldoPerfil() {
  const card = document.getElementById("perfilSaldoCard");
  const aviso = document.getElementById("perfilSaldoAnimacao");
  if (card) card.classList.remove("saldo-premiado");
  if (aviso) aviso.innerText = "";
  if (timeoutAnimacaoSaldoPerfil) {
    clearTimeout(timeoutAnimacaoSaldoPerfil);
    timeoutAnimacaoSaldoPerfil = null;
  }
}

function dispararAnimacaoSaldoPremiado(aumento) {
  const card = document.getElementById("perfilSaldoCard");
  const aviso = document.getElementById("perfilSaldoAnimacao");
  if (!card || !aviso) return;

  const valorAumento = normalizarValorNaoNegativo(aumento);
  limparAnimacaoSaldoPerfil();
  void card.offsetWidth;
  card.classList.add("saldo-premiado");
  aviso.innerText = `Premiação creditada: +${formatarMoedaBR(valorAumento)}`;
  timeoutAnimacaoSaldoPerfil = window.setTimeout(() => {
    limparAnimacaoSaldoPerfil();
  }, 2400);
}

function totalPremiosCreditadosDoUsuarioAtual() {
  if (!usuarioAtual) return 0;
  const usuarioId = Number(usuarioAtual.id);
  const usuarioLogin = normalizarLoginUsuario(usuarioAtual.login);
  return apostas.reduce((acc, item) => {
    if (!item || !item.premioCreditado) return acc;
    const ehDoUsuario =
      (Number.isFinite(usuarioId) && Number(item.usuarioId) === usuarioId) ||
      normalizarLoginUsuario(item.usuarioLogin) === usuarioLogin;
    if (!ehDoUsuario) return acc;
    return acc + normalizarValorNaoNegativo(item.premioCreditadoValor);
  }, 0);
}

function atualizarCardSaldoPerfil(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const animarSeSubiu = cfg.animarSeSubiu !== false;
  const saldoEl = document.getElementById("perfilSaldoAtual");
  const card = document.getElementById("perfilSaldoCard");
  if (!saldoEl || !card) return;

  if (!usuarioAtual) {
    saldoPerfilAnterior = null;
    totalPremiosCreditadosPerfilAnterior = null;
    saldoEl.innerText = "R$ 0,00";
    limparAnimacaoSaldoPerfil();
    return;
  }

  const saldoAtual = normalizarValorNaoNegativo(usuarioAtual.saldo);
  const totalPremiosAtual = normalizarValorNaoNegativo(totalPremiosCreditadosDoUsuarioAtual());
  saldoEl.innerText = formatarMoedaBR(saldoAtual);

  if (
    saldoPerfilAnterior === null ||
    totalPremiosCreditadosPerfilAnterior === null ||
    !animarSeSubiu
  ) {
    saldoPerfilAnterior = saldoAtual;
    totalPremiosCreditadosPerfilAnterior = totalPremiosAtual;
    return;
  }

  const aumentoPremio = Number(
    (totalPremiosAtual - totalPremiosCreditadosPerfilAnterior).toFixed(2)
  );
  saldoPerfilAnterior = saldoAtual;
  totalPremiosCreditadosPerfilAnterior = totalPremiosAtual;
  if (aumentoPremio > 0) {
    dispararAnimacaoSaldoPremiado(aumentoPremio);
  }
}

function valorTimestampPainelLocal() {
  const bruto = Number(localStorage.getItem(PAINEL_UPDATED_AT_KEY));
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return Math.floor(bruto);
}

function sincronizarPerfilComStorage(forcar) {
  const tsAtual = valorTimestampPainelLocal();
  const precisaSincronizar = Boolean(forcar) || tsAtual !== ultimoPainelSyncPerfil;
  if (!precisaSincronizar) return;
  ultimoPainelSyncPerfil = tsAtual;

  const sessaoId = Number(localStorage.getItem(USUARIO_SESSAO_KEY));
  usuarios = sanitizarUsuarios(lerJSONStorage(USUARIOS_KEY, []));
  apostas = sanitizarApostas(lerJSONStorage(APOSTAS_KEY, []));
  resultados = sanitizarResultados(lerJSONStorage(STORAGE_KEY, []));
  usuarioAtual = Number.isFinite(sessaoId) ? usuarios.find((u) => u.id === sessaoId) || null : null;

  atualizarResumoUsuario();
  atualizarCardSaldoPerfil({ animarSeSubiu: true });
  atualizarCardBonusIndicacaoPerfil();
  if (!modoEdicaoPerfil) {
    preencherCamposPerfil();
  }
  configurarFiltroDataApostas();
  mostrarApostasPerfil();
  atualizarControlesEdicaoPerfil();
}

function configurarSincronizacaoPerfilTempoReal() {
  window.addEventListener("storage", (event) => {
    const chave = String(event && event.key || "");
    if (
      chave === USUARIOS_KEY ||
      chave === APOSTAS_KEY ||
      chave === STORAGE_KEY ||
      chave === USUARIO_SESSAO_KEY ||
      chave === PAINEL_UPDATED_AT_KEY
    ) {
      sincronizarPerfilComStorage(true);
    }
  });

  if (intervaloSyncPerfil) {
    clearInterval(intervaloSyncPerfil);
  }
  intervaloSyncPerfil = window.setInterval(() => {
    sincronizarPerfilComStorage(false);
  }, 1500);
}

function atualizarStatusBonusPerfil(texto, erro) {
  const el = document.getElementById("perfilBonusStatus");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function atualizarCardBonusIndicacaoPerfil() {
  const resumoEl = document.getElementById("perfilIndicacaoResumo");
  const loginEl = document.getElementById("perfilLoginIndicacao");
  const disponivelEl = document.getElementById("perfilBonusDisponivel");
  const convertidoHojeEl = document.getElementById("perfilBonusConvertidoHoje");
  const limiteHojeEl = document.getElementById("perfilBonusLimiteHoje");
  const btnConverter = document.getElementById("btnConverterBonusPerfil");
  if (!resumoEl || !loginEl || !disponivelEl || !convertidoHojeEl || !limiteHojeEl || !btnConverter) return;

  limiteHojeEl.innerText = formatarMoedaBR(BONUS_INDICACAO_LIMITE_DIARIO);

  if (!usuarioAtual) {
    resumoEl.innerText = "Faça login para acompanhar seu bônus de indicação.";
    loginEl.innerText = "@--";
    disponivelEl.innerText = "R$ 0,00";
    convertidoHojeEl.innerText = "R$ 0,00";
    btnConverter.disabled = true;
    return;
  }

  if (String(usuarioAtual.role || "") === PAPEL_USUARIO_PROMOTOR) {
    resumoEl.innerText =
      "Programa de indicação disponível para apostadores da plataforma (não para perfil promotor).";
    loginEl.innerText = `@${usuarioAtual.login}`;
    disponivelEl.innerText = "R$ 0,00";
    convertidoHojeEl.innerText = "R$ 0,00";
    btnConverter.disabled = true;
    return;
  }

  resetarControleDiarioBonusIndicacao(usuarioAtual, hojeISO());
  const bonusDisponivel = normalizarValorNaoNegativo(usuarioAtual.bonusIndicacaoSaldo);
  const convertidoHoje = normalizarValorNaoNegativo(usuarioAtual.bonusIndicacaoConvertidoHoje);
  const indicadosTotal = normalizarContadorNaoNegativo(usuarioAtual.indicadosTotal);
  const limiteRestante = normalizarValorNaoNegativo(BONUS_INDICACAO_LIMITE_DIARIO - convertidoHoje);
  const podeConverter =
    bonusDisponivel >= BONUS_INDICACAO_VALOR_CONVERSAO &&
    limiteRestante >= BONUS_INDICACAO_VALOR_CONVERSAO;

  resumoEl.innerText =
    `Bônus por indicação: a cada cadastro indicado você recebe ${formatarMoedaBR(BONUS_INDICACAO_VALOR_POR_CADASTRO)} de bônus. ` +
    `Conversão em saldo: ${formatarMoedaBR(BONUS_INDICACAO_VALOR_CONVERSAO)} por vez, ` +
    `com limite de ${formatarMoedaBR(BONUS_INDICACAO_LIMITE_DIARIO)} por dia. ` +
    `Indicados totais: ${indicadosTotal}.`;
  loginEl.innerText = `@${usuarioAtual.login}`;
  disponivelEl.innerText = formatarMoedaBR(bonusDisponivel);
  convertidoHojeEl.innerText = formatarMoedaBR(convertidoHoje);
  btnConverter.disabled = !podeConverter;
}

function converterBonusIndicacaoPerfil() {
  if (!usuarioAtual) {
    atualizarStatusBonusPerfil("Faça login para converter bônus.", true);
    return;
  }

  if (String(usuarioAtual.role || "") === PAPEL_USUARIO_PROMOTOR) {
    atualizarStatusBonusPerfil("Perfil promotor não possui conversão de bônus de indicação.", true);
    return;
  }

  const idx = usuarios.findIndex((u) => u.id === usuarioAtual.id);
  if (idx === -1) {
    atualizarStatusBonusPerfil("Usuário não encontrado. Faça login novamente.", true);
    return;
  }

  const alvo = usuarios[idx];
  resetarControleDiarioBonusIndicacao(alvo, hojeISO());

  const bonusDisponivel = normalizarValorNaoNegativo(alvo.bonusIndicacaoSaldo);
  const convertidoHoje = normalizarValorNaoNegativo(alvo.bonusIndicacaoConvertidoHoje);
  const limiteRestante = normalizarValorNaoNegativo(BONUS_INDICACAO_LIMITE_DIARIO - convertidoHoje);
  if (bonusDisponivel < BONUS_INDICACAO_VALOR_CONVERSAO) {
    atualizarStatusBonusPerfil(
      `Você precisa de pelo menos ${formatarMoedaBR(BONUS_INDICACAO_VALOR_CONVERSAO)} em bônus para converter.`,
      true
    );
    atualizarCardBonusIndicacaoPerfil();
    return;
  }
  if (limiteRestante < BONUS_INDICACAO_VALOR_CONVERSAO) {
    atualizarStatusBonusPerfil(
      `Limite diário de conversão atingido (${formatarMoedaBR(BONUS_INDICACAO_LIMITE_DIARIO)}).`,
      true
    );
    atualizarCardBonusIndicacaoPerfil();
    return;
  }

  const valorConversao = BONUS_INDICACAO_VALOR_CONVERSAO;
  alvo.bonusIndicacaoSaldo = normalizarValorNaoNegativo(alvo.bonusIndicacaoSaldo - valorConversao);
  alvo.bonusIndicacaoConvertidoHoje = normalizarValorNaoNegativo(alvo.bonusIndicacaoConvertidoHoje + valorConversao);
  alvo.bonusIndicacaoConvertidoHojeData = hojeISO();
  alvo.bonusIndicacaoConvertidoTotal = normalizarValorNaoNegativo(
    alvo.bonusIndicacaoConvertidoTotal + valorConversao
  );
  alvo.saldo = normalizarValorNaoNegativo(alvo.saldo + valorConversao);

  usuarios[idx] = alvo;
  usuarioAtual = alvo;
  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  atualizarResumoUsuario();
  atualizarCardSaldoPerfil({ animarSeSubiu: false });
  atualizarCardBonusIndicacaoPerfil();
  atualizarStatusBonusPerfil(
    `Conversão concluída: +${formatarMoedaBR(valorConversao)} no saldo.`,
    false
  );
}

function obterCamposPerfil() {
  return {
    nome: document.getElementById("perfilNome"),
    telefone: document.getElementById("perfilTelefone"),
    chavePix: document.getElementById("perfilChavePix")
  };
}

function atualizarControlesEdicaoPerfil() {
  const btnEditar = document.getElementById("btnEditarPerfil");
  const btnCancelar = document.getElementById("btnCancelarPerfil");
  const btnSalvar = document.getElementById("btnSalvarPerfil");
  const podeEditar = Boolean(usuarioAtual);
  const emEdicao = Boolean(modoEdicaoPerfil && podeEditar);

  if (btnEditar) {
    btnEditar.style.display = emEdicao ? "none" : "inline-block";
    btnEditar.disabled = !podeEditar;
  }
  if (btnCancelar) {
    btnCancelar.style.display = emEdicao ? "inline-block" : "none";
    btnCancelar.disabled = !emEdicao;
  }
  if (btnSalvar) {
    btnSalvar.style.display = emEdicao ? "inline-block" : "none";
    btnSalvar.disabled = !emEdicao;
  }
}

function definirModoEdicaoPerfil(ativo, opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const focar = cfg.focar === true;
  modoEdicaoPerfil = Boolean(ativo) && Boolean(usuarioAtual);

  const campos = obterCamposPerfil();
  const desabilitar = !modoEdicaoPerfil;
  if (campos.nome) campos.nome.disabled = desabilitar;
  if (campos.telefone) campos.telefone.disabled = desabilitar;
  if (campos.chavePix) campos.chavePix.disabled = desabilitar;

  atualizarControlesEdicaoPerfil();

  if (modoEdicaoPerfil && focar && campos.nome) {
    campos.nome.focus();
    campos.nome.select();
  }
}

function preencherCamposPerfil() {
  const campos = obterCamposPerfil();
  const nome = campos.nome;
  const telefone = campos.telefone;
  const chavePix = campos.chavePix;
  if (!nome || !telefone || !chavePix) return;

  if (!usuarioAtual) {
    nome.value = "";
    telefone.value = "";
    chavePix.value = "";
    definirModoEdicaoPerfil(false);
    return;
  }

  nome.value = usuarioAtual.nome || "";
  telefone.value = formatarTelefoneBrasil(usuarioAtual.telefone || "");
  chavePix.value = usuarioAtual.chavePix || "";
  definirModoEdicaoPerfil(false);
}

function atualizarStatusPerfil(texto, erro) {
  const el = document.getElementById("perfilStatus");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function salvarDadosPerfil() {
  if (!usuarioAtual) {
    atualizarStatusPerfil("Sessão de usuário não encontrada. Volte para a Home e faça login.", true);
    return;
  }

  const nomeEl = document.getElementById("perfilNome");
  const telefoneEl = document.getElementById("perfilTelefone");
  const pixEl = document.getElementById("perfilChavePix");
  if (!nomeEl || !telefoneEl || !pixEl) return;

  const nome = String(nomeEl.value || "").trim();
  const validacaoTelefone = validarTelefoneBrasil(telefoneEl.value || "");
  const telefone = validacaoTelefone.ok ? validacaoTelefone.valor : "";
  const chavePix = String(pixEl.value || "").trim().slice(0, 120);

  if (nome.length < 2) {
    atualizarStatusPerfil("Informe um nome válido com pelo menos 2 caracteres.", true);
    return;
  }

  if (!validacaoTelefone.ok) {
    atualizarStatusPerfil(validacaoTelefone.mensagem, true);
    return;
  }

  const idx = usuarios.findIndex((u) => u.id === usuarioAtual.id);
  if (idx === -1) {
    atualizarStatusPerfil("Usuário não encontrado no armazenamento local.", true);
    return;
  }

  usuarios[idx] = {
    ...usuarios[idx],
    nome,
    telefone,
    chavePix
  };
  usuarioAtual = usuarios[idx];
  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));
  atualizarResumoUsuario();
  atualizarCardSaldoPerfil({ animarSeSubiu: false });
  definirModoEdicaoPerfil(false);
  atualizarStatusPerfil("Dados do perfil salvos com sucesso.", false);
}

function configurarMascaraTelefonePerfil() {
  const telefoneEl = document.getElementById("perfilTelefone");
  if (!telefoneEl) return;

  telefoneEl.addEventListener("input", () => {
    const cursorNoFim = telefoneEl.selectionStart === telefoneEl.value.length;
    telefoneEl.value = formatarTelefoneBrasil(telefoneEl.value);
    if (cursorNoFim) {
      const pos = telefoneEl.value.length;
      telefoneEl.setSelectionRange(pos, pos);
    }
  });

  telefoneEl.addEventListener("blur", () => {
    telefoneEl.value = formatarTelefoneBrasil(telefoneEl.value);
  });
}

function abrirEdicaoPerfil() {
  if (!usuarioAtual) {
    atualizarStatusPerfil("Faça login na Home para editar seus dados.", true);
    return;
  }
  definirModoEdicaoPerfil(true, { focar: true });
  atualizarStatusPerfil("Modo de edição ativado.", false);
}

function cancelarEdicaoPerfil() {
  preencherCamposPerfil();
  definirModoEdicaoPerfil(false);
  atualizarStatusPerfil("Edição cancelada.", false);
}

function configurarFiltroDataApostas() {
  const input = document.getElementById("perfilDataApostas");
  if (!input) return;

  const usuarioId = usuarioAtual ? usuarioAtual.id : null;
  const login = usuarioAtual ? usuarioAtual.login : "";
  const datasUsuario = apostas
    .filter((item) => {
      if (!usuarioId) return false;
      return item.usuarioId === usuarioId || item.usuarioLogin === login;
    })
    .map((item) => item.data)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

  const minPadrao = dataMinimaISO();
  input.min = datasUsuario[0] || minPadrao;
  input.max = hojeISO();
  if (!normalizarDataISO(input.value)) {
    input.value = hojeISO();
  }
}

function agruparApostasPorBilhete(listaApostas) {
  const mapa = new Map();

  listaApostas.forEach((item) => {
    const chave =
      String(item.bilheteId || "").trim() ||
      gerarBilheteIdAposta(item.data, item.praca, item.loteria, item.usuarioId, item.usuarioLogin);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        bilheteId: chave,
        data: item.data,
        praca: item.praca,
        loteria: item.loteria,
        apostas: []
      });
    }

    mapa.get(chave).apostas.push(item);
  });

  const grupos = Array.from(mapa.values());
  grupos.forEach((grupo) => {
    grupo.apostas.sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""), "pt-BR")
    );
  });

  grupos.sort((a, b) => {
    const aData = String(a.apostas[0] && a.apostas[0].createdAt || "");
    const bData = String(b.apostas[0] && b.apostas[0].createdAt || "");
    return aData.localeCompare(bData, "pt-BR");
  });

  return grupos;
}

function resumoStatusBilhete(apostasBilhete) {
  const resultados = apostasBilhete.map((item) => resultadoDaAposta(item));
  const ganhos = resultados.filter((r) => r.status === "GANHOU").length;
  const pendentes = resultados.filter((r) => r.status === "PENDENTE").length;

  if (ganhos > 0) {
    return {
      status: "GANHOU",
      classe: "status-ganhou",
      detalhe: ganhos === 1 ? "1 aposta premiada neste bilhete." : `${ganhos} apostas premiadas neste bilhete.`
    };
  }

  if (pendentes > 0) {
    return {
      status: "PENDENTE",
      classe: "status-pendente",
      detalhe: "Aguardando resultado das apostas deste bilhete."
    };
  }

  return {
    status: "PERDEU",
    classe: "status-perdeu",
    detalhe: "Nenhuma aposta premiada neste bilhete."
  };
}

function classificarBilhetesDoDia(bilhetes) {
  const enriquecidos = (Array.isArray(bilhetes) ? bilhetes : []).map((grupo) => {
    const status = resumoStatusBilhete(Array.isArray(grupo.apostas) ? grupo.apostas : []);
    const createdAtRef = String(
      grupo && grupo.apostas && grupo.apostas[0] && grupo.apostas[0].createdAt || ""
    );
    return {
      grupo,
      status,
      createdAtRef
    };
  });

  enriquecidos.sort((a, b) => a.createdAtRef.localeCompare(b.createdAtRef, "pt-BR"));

  return {
    pendentes: enriquecidos.filter((item) => item.status.status === "PENDENTE"),
    premiados: enriquecidos.filter((item) => item.status.status === "GANHOU"),
    perdidos: enriquecidos.filter((item) => item.status.status === "PERDEU")
  };
}

function atualizarResumoStatusDia(pendentes, premiados, perdidos) {
  const el = document.getElementById("perfilResumoStatusDia");
  if (!el) return;

  const listaPendentes = Array.isArray(pendentes) ? pendentes : [];
  const listaPremiados = Array.isArray(premiados) ? premiados : [];
  const listaPerdidos = Array.isArray(perdidos) ? perdidos : [];
  const premiadas = listaPremiados.length;
  const perdidas = listaPerdidos.length;

  el.innerHTML =
    `<div class="perfil-status-dia-item premiadas">Apostas premiadas do dia<b>${premiadas}</b></div>` +
    `<div class="perfil-status-dia-item perdidas">Apostas perdidas do dia<b>${perdidas}</b></div>`;

  if (listaPendentes.length === 0 && listaPremiados.length === 0 && listaPerdidos.length === 0) {
    el.innerHTML =
      `<div class="perfil-status-dia-item premiadas">Apostas premiadas do dia<b>0</b></div>` +
      `<div class="perfil-status-dia-item perdidas">Apostas perdidas do dia<b>0</b></div>`;
  }
}

function obterFiltroApostasPerfil() {
  const select = document.getElementById("perfilFiltroApostas");
  const valor = String(select && select.value || "").trim();
  if (valor === "pendentes" || valor === "premiadas" || valor === "perdidas") return valor;
  return "todas";
}

function renderizarSecaoBilhetes(listaEl, titulo, itens) {
  const bilhetes = Array.isArray(itens) ? itens : [];
  if (!listaEl || bilhetes.length === 0) return;
  listaEl.innerHTML += `<div class="perfil-secao-apostas">${escaparHTML(titulo)} (${bilhetes.length})</div>`;
  bilhetes.forEach((item) => {
    listaEl.innerHTML += montarCardBilhete(item.grupo);
  });
}

function montarCardBilhete(grupo) {
  const apostasBilhete = Array.isArray(grupo.apostas) ? grupo.apostas : [];
  const statusBilhete = resumoStatusBilhete(apostasBilhete);
  const dataRef = formatarDataBR(grupo && grupo.data);
  const aposHorarioBilhete = loteriaJaCorreuNaData(grupo && grupo.data, grupo && grupo.loteria);
  const valorTotal = apostasBilhete.reduce(
    (acc, item) => acc + Number(normalizarValorMoeda(item.valor)),
    0
  );
  const premioTotal = apostasBilhete.reduce(
    (acc, item) => acc + Number(normalizarValorMoeda(item.premio || item.valor)),
    0
  );
  const premioTotalApurado = apostasBilhete.reduce((acc, item) => {
    const conf = resultadoDaAposta(item);
    if (conf.status !== "GANHOU") return acc;
    const premio = normalizarValorNaoNegativo(
      item.premioCreditado ? item.premioCreditadoValor : item.premio
    );
    return acc + premio;
  }, 0);
  const horarioRef = formatarHorarioBR(apostasBilhete[0] && apostasBilhete[0].createdAt);

  const linhasApostas = apostasBilhete
    .map((item) => {
      const tipoLabel = TIPOS_APOSTA[item.tipo] || item.tipo;
      const palpite = formatarPalpiteBilhete(item);
      const valor = formatarMoedaBR(item.valor);
      const premio = formatarMoedaBR(item.premio || item.valor);
      const conf = resultadoDaAposta(item);
      const premioApurado = formatarMoedaBR(
        item.premioCreditado ? item.premioCreditadoValor : item.premio
      );
      const classeLinhaPremiada = conf.status === "GANHOU" ? " ganhou" : "";
      const classePalpitePremiado = conf.status === "GANHOU" ? "palpite-premiado" : "";
      const detalhePremiacao = !aposHorarioBilhete
        ? ` | Potencial: ${escaparHTML(premio)}`
        : conf.status === "GANHOU"
          ? ` | Prêmio: ${escaparHTML(premioApurado)}`
          : "";
      return (
        `<div class="bilhete-linha-aposta${classeLinhaPremiada}">` +
        `${escaparHTML(tipoLabel)}: <b class="${classePalpitePremiado}">${escaparHTML(palpite)}</b> | ` +
        `Valor: ${escaparHTML(valor)}${detalhePremiacao}` +
        `</div>`
      );
    })
    .join("");

  const linhaPotencialOuPremio = !aposHorarioBilhete
    ? `<div class="bilhete-resumo-total bilhete-resumo-potencial">Ganho potencial total: <b class="ganho-potencial-total">${escaparHTML(formatarMoedaBR(premioTotal))}</b></div>`
    : premioTotalApurado > 0
      ? `<div class="bilhete-resumo-total bilhete-resumo-potencial">Prêmio total: <b class="ganho-potencial-total">${escaparHTML(formatarMoedaBR(premioTotalApurado))}</b></div>`
      : "";

  return (
    `<div class="aposta-item">` +
    `<strong>${escaparHTML(grupo.praca)} | ${escaparHTML(grupo.loteria)} | ${escaparHTML(dataRef)}</strong><br>` +
    `<div>Bilhete criado às <b>${escaparHTML(horarioRef)}</b> | ${apostasBilhete.length} aposta(s)</div>` +
    linhasApostas +
    `<div class="bilhete-resumo-total">Total apostado: <b>${escaparHTML(formatarMoedaBR(valorTotal))}</b></div>` +
    linhaPotencialOuPremio +
    `Status: <span class="status-aposta ${statusBilhete.classe}">${statusBilhete.status}</span> | ${statusBilhete.detalhe}` +
    `</div>`
  );
}

function mostrarApostasPerfil() {
  const lista = document.getElementById("perfilListaApostas");
  const resumo = document.getElementById("perfilApostasResumo");
  const inputData = document.getElementById("perfilDataApostas");
  const filtro = obterFiltroApostasPerfil();
  if (!lista || !resumo || !inputData) return;

  const dataSelecionada = normalizarDataISO(inputData.value) || hojeISO();
  inputData.value = dataSelecionada;
  lista.innerHTML = "";

  if (!usuarioAtual) {
    resumo.innerText = "Entre na Home com seu usuário para ver seus bilhetes.";
    atualizarResumoStatusDia([], [], []);
    lista.innerHTML = "<p>Nenhuma sessão ativa.</p>";
    return;
  }

  const usuarioId = usuarioAtual.id;
  const login = usuarioAtual.login;
  const filtradas = apostas
    .filter((item) => {
      const ehDoUsuario = item.usuarioId === usuarioId || item.usuarioLogin === login;
      return ehDoUsuario && item.data === dataSelecionada;
    })
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""), "pt-BR"));

  const bilhetes = agruparApostasPorBilhete(filtradas);
  const classificados = classificarBilhetesDoDia(bilhetes);
  const totalExibicao =
    filtro === "pendentes"
      ? classificados.pendentes.length
      : filtro === "premiadas"
        ? classificados.premiados.length
        : filtro === "perdidas"
          ? classificados.perdidos.length
          : bilhetes.length;
  const labelFiltro =
    filtro === "pendentes"
      ? "Apostas em Andamento"
      : filtro === "premiadas"
        ? "Apostas Premiadas"
        : filtro === "perdidas"
          ? "Apostas Perdidas"
          : "Todas as Apostas";

  resumo.innerText =
    `${formatarDataBR(dataSelecionada)}: ` +
    `${totalExibicao} bilhete(s) exibido(s) em "${labelFiltro}" | ${filtradas.length} aposta(s).`;
  atualizarResumoStatusDia(classificados.pendentes, classificados.premiados, classificados.perdidos);

  if (filtradas.length === 0) {
    lista.innerHTML = "<p>Nenhuma aposta encontrada para esta data.</p>";
    return;
  }

  if (filtro === "todas") {
    renderizarSecaoBilhetes(lista, "Apostas em Andamento", classificados.pendentes);
    renderizarSecaoBilhetes(lista, "Apostas Premiadas", classificados.premiados);
    renderizarSecaoBilhetes(lista, "Apostas Perdidas", classificados.perdidos);
  } else if (filtro === "pendentes") {
    renderizarSecaoBilhetes(lista, "Apostas em Andamento", classificados.pendentes);
  } else if (filtro === "premiadas") {
    renderizarSecaoBilhetes(lista, "Apostas Premiadas", classificados.premiados);
  } else if (filtro === "perdidas") {
    renderizarSecaoBilhetes(lista, "Apostas Perdidas", classificados.perdidos);
  }

  if (!lista.innerHTML.trim()) {
    lista.innerHTML = "<p>Nenhum bilhete encontrado para o filtro selecionado.</p>";
  }
}

function irHojeApostasPerfil() {
  const input = document.getElementById("perfilDataApostas");
  if (!input) return;
  input.value = hojeISO();
  mostrarApostasPerfil();
}

function initPerfil() {
  carregarEstado();
  ultimoPainelSyncPerfil = valorTimestampPainelLocal();
  configurarMascaraTelefonePerfil();
  atualizarResumoUsuario();
  atualizarCardSaldoPerfil({ animarSeSubiu: false });
  atualizarCardBonusIndicacaoPerfil();
  atualizarStatusBonusPerfil("", false);
  preencherCamposPerfil();
  configurarFiltroDataApostas();
  mostrarApostasPerfil();
  configurarSincronizacaoPerfilTempoReal();

  const btnEditar = document.getElementById("btnEditarPerfil");
  if (btnEditar) {
    btnEditar.disabled = !usuarioAtual;
    btnEditar.addEventListener("click", abrirEdicaoPerfil);
  }

  const btnSalvar = document.getElementById("btnSalvarPerfil");
  if (btnSalvar) {
    btnSalvar.disabled = !usuarioAtual;
    btnSalvar.addEventListener("click", salvarDadosPerfil);
  }

  const btnCancelar = document.getElementById("btnCancelarPerfil");
  if (btnCancelar) {
    btnCancelar.disabled = !usuarioAtual;
    btnCancelar.addEventListener("click", cancelarEdicaoPerfil);
  }

  const inputData = document.getElementById("perfilDataApostas");
  if (inputData) {
    inputData.addEventListener("change", mostrarApostasPerfil);
  }

  const filtroApostas = document.getElementById("perfilFiltroApostas");
  if (filtroApostas) {
    filtroApostas.addEventListener("change", mostrarApostasPerfil);
  }

  const btnHoje = document.getElementById("btnPerfilHoje");
  if (btnHoje) {
    btnHoje.addEventListener("click", irHojeApostasPerfil);
  }

  const btnConverterBonus = document.getElementById("btnConverterBonusPerfil");
  if (btnConverterBonus) {
    btnConverterBonus.disabled = !usuarioAtual;
    btnConverterBonus.addEventListener("click", converterBonusIndicacaoPerfil);
  }

  atualizarControlesEdicaoPerfil();
}

window.addEventListener("load", initPerfil);
window.addEventListener("beforeunload", () => {
  if (intervaloSyncPerfil) {
    clearInterval(intervaloSyncPerfil);
    intervaloSyncPerfil = null;
  }
});
