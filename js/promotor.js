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
let modoEdicaoPerfilPromotor = false;
let secaoPromotorAtual = "dashboard";
let dashboardFiltroModoPromotor = "dia";
let dashboardFiltroDiaPromotor = "";
let dashboardFiltroInicioPromotor = "";
let dashboardFiltroFimPromotor = "";

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

  if (digitos.length <= 2) return `(${ddd}`;
  if (numero.length <= 4) return `(${ddd}) ${numero}`;
  if (numero.length <= 8) return `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
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
  return { ok: true, valor: formatarTelefoneBrasil(digitos) };
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
  const totalMigrado = migrarComissoesPromotoresParaSaldo();
  if (totalMigrado > 0) {
    salvarJSONStorage(USUARIOS_KEY, usuarios);
    localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));
  }
  apostas = sanitizarApostas(lerJSONStorage(APOSTAS_KEY, []));
  resultados = sanitizarResultados(lerJSONStorage(STORAGE_KEY, []));

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

function atualizarStatusPerfilPromotor(texto, erro) {
  const el = document.getElementById("statusPerfilPromotor");
  if (!el) return;
  el.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  el.innerText = texto || "";
}

function obterCamposPerfilPromotor() {
  return {
    resumo: document.getElementById("promotorPerfilResumo"),
    nome: document.getElementById("promotorPerfilNome"),
    telefone: document.getElementById("promotorPerfilTelefone"),
    pix: document.getElementById("promotorPerfilPix")
  };
}

function atualizarControlesPerfilPromotor() {
  const btnSalvar = document.getElementById("btnSalvarPerfilPromotor");
  const camposEdicao = document.getElementById("promotorPerfilCamposEdicao");
  const podeEditar = Boolean(usuarioAtual && usuarioAtual.role === PAPEL_USUARIO_PROMOTOR);
  if (btnSalvar) {
    btnSalvar.style.display = "inline-block";
    btnSalvar.disabled = !podeEditar;
  }
  if (camposEdicao) {
    camposEdicao.hidden = false;
  }
}

function definirModoEdicaoPerfilPromotor(ativo, focar) {
  modoEdicaoPerfilPromotor = Boolean(usuarioAtual && usuarioAtual.role === PAPEL_USUARIO_PROMOTOR);
  const campos = obterCamposPerfilPromotor();
  const desabilitar = !modoEdicaoPerfilPromotor;
  if (campos.nome) campos.nome.disabled = desabilitar;
  if (campos.telefone) campos.telefone.disabled = desabilitar;
  if (campos.pix) campos.pix.disabled = desabilitar;
  atualizarControlesPerfilPromotor();

  if (modoEdicaoPerfilPromotor && focar && campos.nome) {
    campos.nome.focus();
    campos.nome.select();
  }
}

function preencherCamposPerfilPromotor() {
  const campos = obterCamposPerfilPromotor();
  if (!campos.nome || !campos.telefone || !campos.pix || !campos.resumo) return;

  if (!usuarioAtual) {
    campos.resumo.innerText = "Faça login como promotor para editar seu perfil.";
    campos.nome.value = "";
    campos.telefone.value = "";
    campos.pix.value = "";
    definirModoEdicaoPerfilPromotor(false, false);
    return;
  }

  campos.resumo.innerText = `Login: @${usuarioAtual.login}`;
  campos.nome.value = String(usuarioAtual.nome || "");
  campos.telefone.value = formatarTelefoneBrasil(usuarioAtual.telefone || "");
  campos.pix.value = String(usuarioAtual.chavePix || "");
  definirModoEdicaoPerfilPromotor(true, false);
}

function salvarPerfilPromotor() {
  if (!usuarioAtual || usuarioAtual.role !== PAPEL_USUARIO_PROMOTOR) {
    atualizarStatusPerfilPromotor("Sessão de promotor não encontrada.", true);
    return;
  }

  const nomeEl = document.getElementById("promotorPerfilNome");
  const telefoneEl = document.getElementById("promotorPerfilTelefone");
  const pixEl = document.getElementById("promotorPerfilPix");
  if (!nomeEl || !telefoneEl || !pixEl) return;

  const nome = String(nomeEl.value || "").trim();
  const validacaoTelefone = validarTelefoneBrasil(telefoneEl.value || "");
  const telefone = validacaoTelefone.ok ? validacaoTelefone.valor : "";
  const chavePix = String(pixEl.value || "").trim().slice(0, 120);

  if (nome.length < 2) {
    atualizarStatusPerfilPromotor("Informe um nome válido com pelo menos 2 caracteres.", true);
    return;
  }
  if (!validacaoTelefone.ok) {
    atualizarStatusPerfilPromotor(validacaoTelefone.mensagem, true);
    return;
  }

  const idx = usuarios.findIndex(
    (u) => Number(u.id) === Number(usuarioAtual.id) && u.role === PAPEL_USUARIO_PROMOTOR
  );
  if (idx === -1) {
    atualizarStatusPerfilPromotor("Promotor não encontrado no armazenamento local.", true);
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
  preencherCamposPerfilPromotor();
  atualizarStatusPerfilPromotor("Dados do perfil salvos com sucesso.", false);
  renderPainelPromotor();
}

function configurarMascaraTelefonePerfilPromotor() {
  const telefoneEl = document.getElementById("promotorPerfilTelefone");
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

function atualizarSelectApostadoresPromotor(id, base) {
  const select = document.getElementById(id);
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

function atualizarSelecoesApostadoresPromotor(base) {
  atualizarSelectApostadoresPromotor("repasseApostadorPromotor", base);
}

function calcularComissaoPromotor(valorDeposito, percentualComissao) {
  const base = normalizarValorNaoNegativo(valorDeposito);
  const pct = normalizarValorNaoNegativo(percentualComissao);
  if (base <= 0 || pct <= 0) return 0;
  return Number(((base * pct) / 100).toFixed(2));
}

function creditarComissaoNoSaldoPromotor(promotor, valorComissao) {
  if (!promotor || promotor.role !== PAPEL_USUARIO_PROMOTOR) return 0;
  const comissao = normalizarValorNaoNegativo(valorComissao);
  if (comissao <= 0) return 0;
  promotor.saldo = normalizarValorNaoNegativo(normalizarValorNaoNegativo(promotor.saldo) + comissao);
  promotor.comissaoTotal = normalizarValorNaoNegativo(
    normalizarValorNaoNegativo(promotor.comissaoTotal) + comissao
  );
  return comissao;
}

function migrarComissaoDisponivelParaSaldoPromotor(promotor) {
  if (!promotor || promotor.role !== PAPEL_USUARIO_PROMOTOR) return 0;
  const disponivel = normalizarValorNaoNegativo(promotor.comissaoSaldo);
  if (disponivel <= 0) return 0;
  promotor.comissaoSaldo = 0;
  promotor.saldo = normalizarValorNaoNegativo(normalizarValorNaoNegativo(promotor.saldo) + disponivel);
  return disponivel;
}

function migrarComissoesPromotoresParaSaldo() {
  let totalMigrado = 0;
  usuarios.forEach((item) => {
    totalMigrado += migrarComissaoDisponivelParaSaldoPromotor(item);
  });
  return normalizarValorNaoNegativo(totalMigrado);
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

function resumoApostador(apostador, filtroPeriodo) {
  const usuarioId = Number(apostador.id);
  const usuarioLogin = String(apostador.login || "");
  const periodo = filtroPeriodo && typeof filtroPeriodo === "object" ? filtroPeriodo : null;
  const apostasBase = apostas.filter((item) => {
    if (Number.isFinite(usuarioId) && item.usuarioId === usuarioId) return true;
    return String(item.usuarioLogin || "") === usuarioLogin;
  });
  const apostasFiltradas = !periodo
    ? apostasBase
    : apostasBase.filter((item) => {
        const data = normalizarDataISO(item.data);
        if (!data) return false;
        return data >= periodo.inicio && data <= periodo.fim;
      });

  let totalApostado = 0;
  let totalGanhos = 0;
  let totalPerdas = 0;
  let pendentes = 0;
  apostasFiltradas.forEach((item) => {
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
    apostas: apostasFiltradas.length,
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

function atualizarSecaoPromotorVisivel() {
  const mapa = {
    dashboard: "secaoDashboardPromotor",
    perfil: "secaoPerfilPromotor",
    cadastro: "secaoCadastroBasePromotor",
    apostadores: "secaoApostadoresBasePromotor",
    repasse: "secaoRepasseBasePromotor"
  };

  const chaves = Object.keys(mapa);
  const secaoValida = chaves.includes(secaoPromotorAtual) ? secaoPromotorAtual : "dashboard";

  chaves.forEach((chave) => {
    const el = document.getElementById(mapa[chave]);
    if (el) {
      el.classList.toggle("ativa", chave === secaoValida);
    }
  });

  const botoes = Array.from(document.querySelectorAll("[data-secao-promotor]"));
  botoes.forEach((btn) => {
    const chave = String(btn.getAttribute("data-secao-promotor") || "").trim();
    btn.classList.toggle("ativo", chave === secaoValida);
  });
}

function selecionarSecaoPromotor(secao) {
  secaoPromotorAtual = String(secao || "").trim() || "dashboard";
  atualizarSecaoPromotorVisivel();
}

function normalizarEstadoFiltroDashboardPromotor() {
  const hoje = hojeISO();
  dashboardFiltroModoPromotor = dashboardFiltroModoPromotor === "periodo" ? "periodo" : "dia";
  dashboardFiltroDiaPromotor = normalizarDataISO(dashboardFiltroDiaPromotor) || hoje;
  dashboardFiltroInicioPromotor = normalizarDataISO(dashboardFiltroInicioPromotor) || dashboardFiltroDiaPromotor;
  dashboardFiltroFimPromotor = normalizarDataISO(dashboardFiltroFimPromotor) || dashboardFiltroInicioPromotor;
  if (dashboardFiltroFimPromotor < dashboardFiltroInicioPromotor) {
    const troca = dashboardFiltroInicioPromotor;
    dashboardFiltroInicioPromotor = dashboardFiltroFimPromotor;
    dashboardFiltroFimPromotor = troca;
  }
}

function obterPeriodoDashboardPromotor() {
  normalizarEstadoFiltroDashboardPromotor();
  if (dashboardFiltroModoPromotor === "periodo") {
    return {
      inicio: dashboardFiltroInicioPromotor,
      fim: dashboardFiltroFimPromotor,
      label: `${formatarDataBR(dashboardFiltroInicioPromotor)} até ${formatarDataBR(dashboardFiltroFimPromotor)}`
    };
  }
  return {
    inicio: dashboardFiltroDiaPromotor,
    fim: dashboardFiltroDiaPromotor,
    label: `Dia ${formatarDataBR(dashboardFiltroDiaPromotor)}`
  };
}

function atualizarResumoFiltroDashboardPromotor() {
  const periodo = obterPeriodoDashboardPromotor();
  const el = document.getElementById("dashFiltroResumoPromotor");
  if (!el) return;
  el.innerText = `Filtro ativo: ${periodo.label}`;
}

function atualizarVisibilidadeCamposFiltroDashboardPromotor() {
  const modoEl = document.getElementById("dashFiltroModoPromotor");
  const diaEl = document.getElementById("dashFiltroDiaPromotor");
  const inicioEl = document.getElementById("dashFiltroInicioPromotor");
  const fimEl = document.getElementById("dashFiltroFimPromotor");
  if (!modoEl || !diaEl || !inicioEl || !fimEl) return;

  const modo = String(modoEl.value || "dia").trim() === "periodo" ? "periodo" : "dia";
  diaEl.style.display = modo === "dia" ? "inline-block" : "none";
  inicioEl.style.display = modo === "periodo" ? "inline-block" : "none";
  fimEl.style.display = modo === "periodo" ? "inline-block" : "none";
}

function sincronizarCamposFiltroDashboardPromotor() {
  normalizarEstadoFiltroDashboardPromotor();
  const modoEl = document.getElementById("dashFiltroModoPromotor");
  const diaEl = document.getElementById("dashFiltroDiaPromotor");
  const inicioEl = document.getElementById("dashFiltroInicioPromotor");
  const fimEl = document.getElementById("dashFiltroFimPromotor");

  if (modoEl) modoEl.value = dashboardFiltroModoPromotor;
  if (diaEl) diaEl.value = dashboardFiltroDiaPromotor;
  if (inicioEl) inicioEl.value = dashboardFiltroInicioPromotor;
  if (fimEl) fimEl.value = dashboardFiltroFimPromotor;
  atualizarVisibilidadeCamposFiltroDashboardPromotor();
  atualizarResumoFiltroDashboardPromotor();
}

function aplicarFiltrosDashboardPromotorDoDOM() {
  const modoEl = document.getElementById("dashFiltroModoPromotor");
  const diaEl = document.getElementById("dashFiltroDiaPromotor");
  const inicioEl = document.getElementById("dashFiltroInicioPromotor");
  const fimEl = document.getElementById("dashFiltroFimPromotor");

  if (modoEl) dashboardFiltroModoPromotor = String(modoEl.value || "dia").trim();
  if (diaEl) dashboardFiltroDiaPromotor = String(diaEl.value || "").trim();
  if (inicioEl) dashboardFiltroInicioPromotor = String(inicioEl.value || "").trim();
  if (fimEl) dashboardFiltroFimPromotor = String(fimEl.value || "").trim();

  normalizarEstadoFiltroDashboardPromotor();
  sincronizarCamposFiltroDashboardPromotor();
  renderPainelPromotor();
}

function irHojeDashboardPromotor() {
  const hoje = hojeISO();
  dashboardFiltroModoPromotor = "dia";
  dashboardFiltroDiaPromotor = hoje;
  dashboardFiltroInicioPromotor = hoje;
  dashboardFiltroFimPromotor = hoje;
  sincronizarCamposFiltroDashboardPromotor();
  renderPainelPromotor();
}

function configurarEventosFiltroDashboardPromotor() {
  const modoEl = document.getElementById("dashFiltroModoPromotor");
  const diaEl = document.getElementById("dashFiltroDiaPromotor");
  const inicioEl = document.getElementById("dashFiltroInicioPromotor");
  const fimEl = document.getElementById("dashFiltroFimPromotor");
  const btnHoje = document.getElementById("btnDashFiltroHojePromotor");

  if (modoEl) {
    modoEl.addEventListener("change", () => {
      dashboardFiltroModoPromotor = String(modoEl.value || "dia").trim();
      atualizarVisibilidadeCamposFiltroDashboardPromotor();
      aplicarFiltrosDashboardPromotorDoDOM();
    });
  }
  if (diaEl) diaEl.addEventListener("change", aplicarFiltrosDashboardPromotorDoDOM);
  if (inicioEl) inicioEl.addEventListener("change", aplicarFiltrosDashboardPromotorDoDOM);
  if (fimEl) fimEl.addEventListener("change", aplicarFiltrosDashboardPromotorDoDOM);
  if (btnHoje) btnHoje.addEventListener("click", irHojeDashboardPromotor);
}

function atualizarEstadoRepassePromotor() {
  const inputSaldo = document.getElementById("repasseSaldoDisponivelPromotor");
  const btnRepassar = document.getElementById("btnRepassarSaldoPromotor");
  const saldoDisponivel = normalizarValorNaoNegativo(
    usuarioAtual && usuarioAtual.role === PAPEL_USUARIO_PROMOTOR ? usuarioAtual.saldoApostador : 0
  );

  if (inputSaldo) {
    inputSaldo.value = `Saldo disponível para repasse: ${formatarMoedaBR(saldoDisponivel)}`;
  }

  if (btnRepassar) {
    const semSaldo = saldoDisponivel <= 0;
    btnRepassar.disabled = semSaldo;
    btnRepassar.title = semSaldo ? "Sem saldo disponível para repassar." : "";
  }
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
    const menuPromotorInfo = document.getElementById("menuPromotorInfo");
    if (menuPromotorInfo) menuPromotorInfo.innerText = "Painel do Promotor";
    atualizarEstadoRepassePromotor();
    atualizarSelecoesApostadoresPromotor([]);
    return;
  }

  if (usuarioAtual.role !== PAPEL_USUARIO_PROMOTOR) {
    avisoEl.style.display = "block";
    painelEl.style.display = "none";
    avisoEl.innerText = "Seu usuário não possui perfil de promotor.";
    const menuPromotorInfo = document.getElementById("menuPromotorInfo");
    if (menuPromotorInfo) menuPromotorInfo.innerText = "Painel do Promotor";
    atualizarEstadoRepassePromotor();
    atualizarSelecoesApostadoresPromotor([]);
    return;
  }

  const idxPromotor = usuarios.findIndex((u) => u.id === usuarioAtual.id);
  if (idxPromotor === -1) {
    avisoEl.style.display = "block";
    painelEl.style.display = "none";
    avisoEl.innerText = "Promotor não encontrado. Faça login novamente.";
    atualizarEstadoRepassePromotor();
    atualizarSelecoesApostadoresPromotor([]);
    return;
  }
  usuarioAtual = usuarios[idxPromotor];
  const menuPromotorInfo = document.getElementById("menuPromotorInfo");
  if (menuPromotorInfo) {
    menuPromotorInfo.innerText = `${usuarioAtual.nome} (@${usuarioAtual.login})`;
  }

  avisoEl.style.display = "none";
  painelEl.style.display = "block";
  atualizarSecaoPromotorVisivel();
  atualizarEstadoRepassePromotor();

  const base = usuarios.filter(
    (u) => u.role !== PAPEL_USUARIO_PROMOTOR && Number(u.promotorId) === Number(usuarioAtual.id)
  );
  const periodoDashboard = obterPeriodoDashboardPromotor();
  sincronizarCamposFiltroDashboardPromotor();

  const totais = base.reduce(
    (acc, apostador) => {
      const resumo = resumoApostador(apostador, periodoDashboard);
      acc.totalApostadores += 1;
      acc.totalDepositos += Number(apostador.totalDepositos || 0);
      acc.totalApostas += resumo.apostas;
      acc.totalApostado += resumo.apostado;
      return acc;
    },
    {
      totalApostadores: 0,
      totalDepositos: 0,
      totalApostas: 0,
      totalApostado: 0
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
  setTexto("dashPromotorComissaoSaldo", formatarMoedaBR(usuarioAtual.comissaoSaldo));
  setTexto("dashPromotorComissaoTotal", formatarMoedaBR(usuarioAtual.comissaoTotal));

  resumoPromotorEl.innerText =
    `Promotor: ${usuarioAtual.nome} (@${usuarioAtual.login}) | Comissão por depósito: ${formatarPercentual(usuarioAtual.comissaoPercentual)}`;
  resumoBaseEl.innerText =
    `${totais.totalApostadores} apostador(es) na sua base | Filtro: ${periodoDashboard.label} | Apostas: ${totais.totalApostas}`;
  atualizarSelecoesApostadoresPromotor(base);
  preencherCamposPerfilPromotor();

  if (base.length === 0) {
    listaEl.innerHTML = "<p>Nenhum apostador vinculado à sua base ainda.</p>";
    return;
  }

  listaEl.innerHTML = base
    .map((apostador) => {
      const resumo = resumoApostador(apostador, periodoDashboard);
      return (
        `<div class="item-base-promotor">` +
        `<strong>${escaparHTML(apostador.nome)}</strong> (@${escaparHTML(apostador.login)})<br>` +
        `Saldo: <b>${formatarMoedaBR(apostador.saldo)}</b> | Depósitos: <b>${formatarMoedaBR(apostador.totalDepositos)}</b><br>` +
        `Apostas: <b>${resumo.apostas}</b> | Apostado: <b>${formatarMoedaBR(resumo.apostado)}</b><br>` +
        `Pendentes: <b>${resumo.pendentes}</b>` +
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
    chavePix: "",
    bloqueado: false
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
  usuarios[idxApostador].totalDepositos = normalizarValorNaoNegativo(
    normalizarValorNaoNegativo(usuarios[idxApostador].totalDepositos) + valor
  );
  const comissao = calcularComissaoPromotor(valor, usuarios[idxPromotor].comissaoPercentual);
  if (comissao > 0) {
    creditarComissaoNoSaldoPromotor(usuarios[idxPromotor], comissao);
  }

  usuarioAtual = usuarios[idxPromotor];
  salvarJSONStorage(USUARIOS_KEY, usuarios);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));

  inputValor.value = "";
  atualizarStatusRepassePromotor(
    `Repasse concluído: ${formatarMoedaBR(valor)} para @${usuarios[idxApostador].login}. Comissão creditada no saldo: ${formatarMoedaBR(comissao)}.`,
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
  secaoPromotorAtual = "dashboard";
  dashboardFiltroModoPromotor = "dia";
  dashboardFiltroDiaPromotor = hojeISO();
  dashboardFiltroInicioPromotor = dashboardFiltroDiaPromotor;
  dashboardFiltroFimPromotor = dashboardFiltroDiaPromotor;
  configurarMascaraTelefonePerfilPromotor();
  atualizarStatusPromotor("", false);
  atualizarStatusPerfilPromotor("", false);
  atualizarStatusRepassePromotor("", false);
  configurarEventosFiltroDashboardPromotor();
  sincronizarCamposFiltroDashboardPromotor();
  preencherCamposPerfilPromotor();
  renderPainelPromotor();
  atualizarControlesPerfilPromotor();

  const btnSalvarPerfil = document.getElementById("btnSalvarPerfilPromotor");
  if (btnSalvarPerfil) {
    btnSalvarPerfil.addEventListener("click", salvarPerfilPromotor);
  }
}

window.cadastrarApostadorBasePromotor = cadastrarApostadorBasePromotor;
window.repassarSaldoApostadorPromotor = repassarSaldoApostadorPromotor;
window.selecionarSecaoPromotor = selecionarSecaoPromotor;
window.sairPromotor = sairPromotor;
window.addEventListener("load", initPromotor);
