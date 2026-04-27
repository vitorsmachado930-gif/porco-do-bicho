const STORAGE_KEY = "dados";
const APOSTAS_KEY = "apostas";
const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
const PAPEL_USUARIO_APOSTADOR = "apostador";
const PAPEL_USUARIO_PROMOTOR = "promotor";

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
  milhar: "Milhar",
  milhar_seca: "Milhar (Seca 1º)",
  centena: "Centena",
  centena_seca: "Centena (Seca 1º)",
  dezena: "Dezena",
  dezena_seca: "Dezena (Seca 1º)"
};

let usuarios = [];
let apostas = [];
let resultados = [];
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

function normalizarValorMoeda(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return "0.00";
  if (txt.includes("R$")) {
    const centavos = Number(extrairDigitos(txt) || 0);
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

function formatarPercentual(valor) {
  const n = Number(valor || 0);
  if (!Number.isFinite(n)) return "0,00%";
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function normalizarValorNaoNegativo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(2));
}

function parseNumeroPositivo(valor) {
  const txt = String(valor || "").replace(",", ".").trim();
  if (!txt) return null;
  const numero = Number(txt);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Number(numero.toFixed(2));
}

function normalizarContadorNaoNegativo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = String(dataISO || "").split("-");
  if (!ano || !mes || !dia) return "--/--/--";
  return `${dia}/${mes}/${ano.slice(-2)}`;
}

function formatarHorarioBR(dataHora) {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizarPapelUsuario(valor) {
  const papel = String(valor || "").trim().toLowerCase();
  if (papel === PAPEL_USUARIO_PROMOTOR) return PAPEL_USUARIO_PROMOTOR;
  return PAPEL_USUARIO_APOSTADOR;
}

function normalizarPromotorId(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const id = Number(valor);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

function normalizarIndicadorId(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const id = Number(valor);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

function resetarControleDiarioBonusIndicacao(usuario, dataReferencia) {
  if (!usuario || typeof usuario !== "object") return;
  const referencia = normalizarDataISO(dataReferencia) || dataLocalParaISO(new Date());
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
      const role = normalizarPapelUsuario(raw.role);
      const promotorId = normalizarPromotorId(raw.promotorId);
      const comissaoPercentual = Number(raw.comissaoPercentual);
      const comissaoSaldo = Number(raw.comissaoSaldo);
      const comissaoTotal = Number(raw.comissaoTotal);
      const totalDepositos = Number(raw.totalDepositos);
      const saldoApostador = normalizarValorNaoNegativo(raw.saldoApostador);
      const indicadorId = normalizarIndicadorId(raw.indicadorId);
      const bonusIndicacaoSaldo = normalizarValorNaoNegativo(raw.bonusIndicacaoSaldo);
      const bonusIndicacaoTotal = normalizarValorNaoNegativo(raw.bonusIndicacaoTotal);
      const bonusIndicacaoConvertidoTotal = normalizarValorNaoNegativo(raw.bonusIndicacaoConvertidoTotal);
      const bonusIndicacaoConvertidoHoje = normalizarValorNaoNegativo(raw.bonusIndicacaoConvertidoHoje);
      const bonusIndicacaoConvertidoHojeData = normalizarDataISO(raw.bonusIndicacaoConvertidoHojeData);
      const indicadosTotal = normalizarContadorNaoNegativo(raw.indicadosTotal);
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
        comissaoPercentual:
          role === PAPEL_USUARIO_PROMOTOR && Number.isFinite(comissaoPercentual)
            ? Math.max(0, Math.min(100, Number(comissaoPercentual.toFixed(2))))
            : 0,
        comissaoSaldo:
          role === PAPEL_USUARIO_PROMOTOR && Number.isFinite(comissaoSaldo) && comissaoSaldo >= 0
            ? Number(comissaoSaldo.toFixed(2))
            : 0,
        comissaoTotal:
          role === PAPEL_USUARIO_PROMOTOR && Number.isFinite(comissaoTotal) && comissaoTotal >= 0
            ? Number(comissaoTotal.toFixed(2))
            : 0,
        totalDepositos:
          Number.isFinite(totalDepositos) && totalDepositos >= 0
            ? Number(totalDepositos.toFixed(2))
            : 0,
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
    resetarControleDiarioBonusIndicacao(item, dataLocalParaISO(new Date()));
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
      if (!Number.isFinite(id)) return null;
      if (!data || !praca || !loteria || !tipo || !palpite) return null;
      return {
        id,
        data,
        praca,
        loteria,
        tipo,
        palpite,
        valor,
        premio,
        createdAt,
        usuarioId: Number.isFinite(usuarioId) ? usuarioId : null,
        usuarioLogin
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
              grupo: String((r && r.grupo) || "").padStart(2, "0").slice(-2)
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

function atualizarStatusPromotor(texto, erro) {
  const el = document.getElementById("statusPromotor");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function atualizarStatusRepassePromotor(texto, erro) {
  const el = document.getElementById("statusRepassePromotor");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function atualizarSelecaoRepassePromotor(base) {
  const select = document.getElementById("repasseApostadorPromotor");
  if (!select) return;
  const listaBase = Array.isArray(base) ? base : [];
  const valorAtual = String(select.value || "");
  select.innerHTML = '<option value="">Selecione o apostador da base</option>';
  listaBase.forEach((apostador) => {
    const opt = document.createElement("option");
    opt.value = String(apostador.id);
    opt.innerText = `${apostador.nome} (@${apostador.login})`;
    select.appendChild(opt);
  });
  if (valorAtual && listaBase.some((apostador) => String(apostador.id) === valorAtual)) {
    select.value = valorAtual;
  }
}

function gruposDoPalpite(palpite) {
  return String(palpite || "")
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusAposta(aposta) {
  const achado = resultados.find(
    (item) =>
      item.data === aposta.data &&
      item.praca === aposta.praca &&
      item.loteria === aposta.loteria
  );

  if (!achado || !Array.isArray(achado.resultados) || achado.resultados.length === 0) {
    return "PENDENTE";
  }

  const gruposResultado = achado.resultados.map((r) => String(r.grupo || "").padStart(2, "0"));
  const numerosResultado = achado.resultados.map((r) => String(r.numero || "").padStart(4, "0"));
  const dezenasResultado = numerosResultado.map((n) => n.slice(-2));
  const gruposPrimeiros2 = gruposResultado.slice(0, 2);
  const primeiroNumero = numerosResultado[0] || "";
  const palpite = String(aposta.palpite || "").trim();
  const tipo = String(aposta.tipo || "").trim();

  let ganhou = false;
  if (tipo === "grupo") {
    ganhou = gruposResultado.includes(palpite);
  } else if (tipo === "dupla_grupo") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "terno_grupo") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "duque_dezena") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (tipo === "terno_dezena") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (tipo === "passe_seco") {
    const alvo = gruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      alvo[0] === gruposPrimeiros2[0] &&
      alvo[1] === gruposPrimeiros2[1];
  } else if (tipo === "passe_vai_vem") {
    const alvo = gruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      ((alvo[0] === gruposPrimeiros2[0] && alvo[1] === gruposPrimeiros2[1]) ||
        (alvo[0] === gruposPrimeiros2[1] && alvo[1] === gruposPrimeiros2[0]));
  } else if (tipo === "dupla_grupo_1a5") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "terno_grupo_1a5") {
    const alvo = gruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "milhar") {
    ganhou = numerosResultado.includes(palpite);
  } else if (tipo === "milhar_seca") {
    ganhou = primeiroNumero === palpite;
  } else if (tipo === "centena") {
    ganhou = numerosResultado.some((n) => n.slice(-3) === palpite);
  } else if (tipo === "centena_seca") {
    ganhou = primeiroNumero.slice(-3) === palpite;
  } else if (tipo === "dezena") {
    ganhou = numerosResultado.some((n) => n.slice(-2) === palpite);
  } else if (tipo === "dezena_seca") {
    ganhou = primeiroNumero.slice(-2) === palpite;
  }

  return ganhou ? "GANHOU" : "PERDEU";
}

function resumoApostador(apostador) {
  const usuarioId = Number(apostador.id);
  const usuarioLogin = String(apostador.login || "");
  const apostasBase = apostas.filter((item) => {
    if (Number.isFinite(usuarioId) && item.usuarioId === usuarioId) return true;
    return String(item.usuarioLogin || "") === usuarioLogin;
  });

  let totalApostado = 0;
  let totalGanhos = 0;
  let totalPerdas = 0;
  let pendentes = 0;
  apostasBase.forEach((item) => {
    const valor = Number(normalizarValorMoeda(item.valor) || 0);
    const premio = Number(normalizarValorMoeda(item.premio) || 0);
    const status = statusAposta(item);
    totalApostado += valor;
    if (status === "GANHOU") {
      totalGanhos += premio;
    } else if (status === "PERDEU") {
      totalPerdas += valor;
    } else {
      pendentes += 1;
    }
  });

  return {
    apostas: apostasBase.length,
    apostado: Number(totalApostado.toFixed(2)),
    ganhos: Number(totalGanhos.toFixed(2)),
    perdas: Number(totalPerdas.toFixed(2)),
    pendentes
  };
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPainelPromotor() {
  const avisoEl = document.getElementById("avisoPromotor");
  const painelEl = document.getElementById("painelPromotor");
  const listaEl = document.getElementById("listaApostadoresBasePromotor");
  const resumoBaseEl = document.getElementById("resumoBasePromotor");
  const resumoPromotorEl = document.getElementById("resumoPromotor");

  if (!avisoEl || !painelEl || !listaEl || !resumoBaseEl || !resumoPromotorEl) return;

  if (!usuarioAtual) {
    avisoEl.style.display = "block";
    painelEl.style.display = "none";
    avisoEl.innerText = "Faça login na Home como promotor para acessar este painel.";
    atualizarSelecaoRepassePromotor([]);
    return;
  }

  if (usuarioAtual.role !== PAPEL_USUARIO_PROMOTOR) {
    avisoEl.style.display = "block";
    painelEl.style.display = "none";
    avisoEl.innerText = "Seu usuário não possui perfil de promotor.";
    atualizarSelecaoRepassePromotor([]);
    return;
  }

  const idxPromotor = usuarios.findIndex((u) => u.id === usuarioAtual.id);
  if (idxPromotor === -1) {
    avisoEl.style.display = "block";
    painelEl.style.display = "none";
    avisoEl.innerText = "Promotor não encontrado. Faça login novamente.";
    atualizarSelecaoRepassePromotor([]);
    return;
  }
  usuarioAtual = usuarios[idxPromotor];

  avisoEl.style.display = "none";
  painelEl.style.display = "block";

  const base = usuarios.filter(
    (u) => u.role !== PAPEL_USUARIO_PROMOTOR && Number(u.promotorId) === Number(usuarioAtual.id)
  );

  const totais = base.reduce(
    (acc, apostador) => {
      const resumo = resumoApostador(apostador);
      acc.totalApostadores += 1;
      acc.totalDepositos += Number(apostador.totalDepositos || 0);
      acc.totalApostas += resumo.apostas;
      acc.totalApostado += resumo.apostado;
      acc.totalGanhos += resumo.ganhos;
      acc.totalPerdas += resumo.perdas;
      return acc;
    },
    {
      totalApostadores: 0,
      totalDepositos: 0,
      totalApostas: 0,
      totalApostado: 0,
      totalGanhos: 0,
      totalPerdas: 0
    }
  );

  const setTexto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.innerText = valor;
  };
  setTexto("dashPromotorSaldoProprio", formatarMoedaBR(usuarioAtual.saldo));
  setTexto("dashPromotorSaldoApostador", formatarMoedaBR(usuarioAtual.saldoApostador));
  setTexto("dashPromotorApostadores", String(totais.totalApostadores));
  setTexto("dashPromotorDepositos", formatarMoedaBR(totais.totalDepositos));
  setTexto("dashPromotorApostas", String(totais.totalApostas));
  setTexto("dashPromotorApostado", formatarMoedaBR(totais.totalApostado));
  setTexto("dashPromotorGanhos", formatarMoedaBR(totais.totalGanhos));
  setTexto("dashPromotorPerdas", formatarMoedaBR(totais.totalPerdas));
  setTexto("dashPromotorComissaoSaldo", formatarMoedaBR(usuarioAtual.comissaoSaldo));
  setTexto("dashPromotorComissaoTotal", formatarMoedaBR(usuarioAtual.comissaoTotal));

  resumoPromotorEl.innerText =
    `Promotor: ${usuarioAtual.nome} (@${usuarioAtual.login}) | Comissão por depósito: ${formatarPercentual(usuarioAtual.comissaoPercentual)}`;
  resumoBaseEl.innerText =
    `${totais.totalApostadores} apostador(es) na sua base | Depósitos: ${formatarMoedaBR(totais.totalDepositos)} | Apostas: ${totais.totalApostas}`;
  atualizarSelecaoRepassePromotor(base);

  if (base.length === 0) {
    listaEl.innerHTML = "<p>Nenhum apostador vinculado à sua base ainda.</p>";
    return;
  }

  listaEl.innerHTML = base
    .map((apostador) => {
      const resumo = resumoApostador(apostador);
      return (
        `<div class="item-base-promotor">` +
        `<strong>${escaparHTML(apostador.nome)}</strong> (@${escaparHTML(apostador.login)})<br>` +
        `Saldo: <b>${formatarMoedaBR(apostador.saldo)}</b> | Depósitos: <b>${formatarMoedaBR(apostador.totalDepositos)}</b><br>` +
        `Apostas: <b>${resumo.apostas}</b> | Apostado: <b>${formatarMoedaBR(resumo.apostado)}</b><br>` +
        `Ganhos: <b>${formatarMoedaBR(resumo.ganhos)}</b> | Perdidas: <b>${formatarMoedaBR(resumo.perdas)}</b> | Pendentes: <b>${resumo.pendentes}</b>` +
        `</div>`
      );
    })
    .join("");
}

function cadastrarApostadorBasePromotor() {
  if (!usuarioAtual || usuarioAtual.role !== PAPEL_USUARIO_PROMOTOR) {
    atualizarStatusPromotor("Somente promotores podem cadastrar apostadores da base.", true);
    return;
  }

  const nomeInput = document.getElementById("baseNome");
  const loginInput = document.getElementById("baseLogin");
  const senhaInput = document.getElementById("baseSenha");
  if (!nomeInput || !loginInput || !senhaInput) return;

  const nome = String(nomeInput.value || "").trim();
  const login = normalizarLoginUsuario(loginInput.value);
  const senha = String(senhaInput.value || "");

  if (nome.length < 2) {
    atualizarStatusPromotor("Informe o nome do apostador (mínimo 2 caracteres).", true);
    return;
  }
  if (!/^[a-z0-9._-]{3,24}$/.test(login)) {
    atualizarStatusPromotor("Login inválido. Use 3-24 caracteres (a-z, 0-9, . _ -).", true);
    return;
  }
  if (login === "admin") {
    atualizarStatusPromotor("O login admin é reservado.", true);
    return;
  }
  if (senha.length < 4) {
    atualizarStatusPromotor("A senha precisa ter pelo menos 4 caracteres.", true);
    return;
  }
  if (usuarios.some((u) => u.login === login)) {
    atualizarStatusPromotor("Este login já está em uso.", true);
    return;
  }

  usuarios.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    nome,
    login,
    senha,
    saldo: 0,
    role: PAPEL_USUARIO_APOSTADOR,
    promotorId: usuarioAtual.id,
    comissaoPercentual: 0,
    comissaoSaldo: 0,
    comissaoTotal: 0,
    totalDepositos: 0,
    saldoApostador: 0,
    indicadorId: null,
    bonusIndicacaoSaldo: 0,
    bonusIndicacaoTotal: 0,
    bonusIndicacaoConvertidoTotal: 0,
    bonusIndicacaoConvertidoHoje: 0,
    bonusIndicacaoConvertidoHojeData: "",
    indicadosTotal: 0,
    telefone: "",
    chavePix: ""
  });

  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  nomeInput.value = "";
  loginInput.value = "";
  senhaInput.value = "";
  atualizarStatusPromotor(`Apostador ${nome} cadastrado na sua base com sucesso.`, false);
  renderPainelPromotor();
}

function repassarSaldoApostadorPromotor() {
  if (!usuarioAtual || usuarioAtual.role !== PAPEL_USUARIO_PROMOTOR) {
    atualizarStatusRepassePromotor("Somente promotores podem repassar saldo aos apostadores.", true);
    return;
  }

  const idxPromotor = usuarios.findIndex(
    (u) => Number(u.id) === Number(usuarioAtual.id) && u.role === PAPEL_USUARIO_PROMOTOR
  );
  if (idxPromotor === -1) {
    atualizarStatusRepassePromotor("Promotor não encontrado. Faça login novamente.", true);
    return;
  }

  const selectApostador = document.getElementById("repasseApostadorPromotor");
  const inputValor = document.getElementById("repasseValorPromotor");
  if (!selectApostador || !inputValor) return;

  const apostadorId = Number(selectApostador.value);
  if (!Number.isFinite(apostadorId)) {
    atualizarStatusRepassePromotor("Selecione um apostador da sua base.", true);
    return;
  }

  const valor = parseNumeroPositivo(inputValor.value);
  if (!valor) {
    atualizarStatusRepassePromotor("Informe um valor válido para repasse.", true);
    return;
  }

  const idxApostador = usuarios.findIndex(
    (u) =>
      Number(u.id) === apostadorId &&
      u.role !== PAPEL_USUARIO_PROMOTOR &&
      Number(u.promotorId) === Number(usuarioAtual.id)
  );
  if (idxApostador === -1) {
    atualizarStatusRepassePromotor("Apostador inválido para repasse.", true);
    return;
  }

  const saldoApostadorPromotor = normalizarValorNaoNegativo(usuarios[idxPromotor].saldoApostador);
  if (saldoApostadorPromotor < valor) {
    atualizarStatusRepassePromotor(
      `Saldo apostador insuficiente. Disponível: ${formatarMoedaBR(saldoApostadorPromotor)}.`,
      true
    );
    return;
  }

  usuarios[idxPromotor].saldoApostador = normalizarValorNaoNegativo(saldoApostadorPromotor - valor);
  usuarios[idxApostador].saldo = normalizarValorNaoNegativo(
    normalizarValorNaoNegativo(usuarios[idxApostador].saldo) + valor
  );

  usuarioAtual = usuarios[idxPromotor];
  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  inputValor.value = "";
  atualizarStatusRepassePromotor(
    `Repasse concluído: ${formatarMoedaBR(valor)} para @${usuarios[idxApostador].login}.`,
    false
  );
  renderPainelPromotor();
}

function sairPromotor() {
  localStorage.removeItem(USUARIO_SESSAO_KEY);
  window.location.href = "../index.html";
}

function initPromotor() {
  carregarEstado();
  atualizarStatusPromotor("", false);
  atualizarStatusRepassePromotor("", false);
  renderPainelPromotor();
}

window.cadastrarApostadorBasePromotor = cadastrarApostadorBasePromotor;
window.repassarSaldoApostadorPromotor = repassarSaldoApostadorPromotor;
window.sairPromotor = sairPromotor;
window.addEventListener("load", initPromotor);
