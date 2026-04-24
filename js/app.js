const SENHA = "1234";
const STORAGE_KEY = "dados";
const APOSTAS_KEY = "apostas";
const MULTIPLICADORES_KEY = "multiplicadores_aposta";
const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const LIMITES_APOSTA_KEY = "limites_aposta";
const MAX_DIAS_HISTORICO = 7;
const CLIQUES_PARA_EXIBIR_ADMIN = 5;
const MINUTOS_ANTES_RESULTADO_PARA_FECHAR_APOSTA = 1;

const TIPOS_APOSTA = {
  grupo: "Grupo",
  dupla_grupo: "Dupla de Grupo",
  terno_grupo: "Terno de Grupo",
  milhar: "Milhar",
  centena: "Centena",
  dezena: "Dezena"
};

const PREMIO_FICTICIO_MULTIPLICADOR = {
  grupo: 18,
  dupla_grupo: 90,
  terno_grupo: 320,
  milhar: 4000,
  centena: 600,
  dezena: 60
};

const LIMITES_APOSTA_PADRAO = {
  valorMinimo: 1,
  valorMaximo: 500
};

const CAMPOS_MULTIPLICADOR = [
  { tipo: "grupo", id: "multGrupo", label: "Grupo" },
  { tipo: "dupla_grupo", id: "multDuplaGrupo", label: "Dupla de Grupo" },
  { tipo: "terno_grupo", id: "multTernoGrupo", label: "Terno de Grupo" },
  { tipo: "milhar", id: "multMilhar", label: "Milhar" },
  { tipo: "centena", id: "multCentena", label: "Centena" },
  { tipo: "dezena", id: "multDezena", label: "Dezena" }
];

const SEQUENCIAS_POR_PRACA = {
  "Rio": [
    "PPT 09:20",
    "PTM 11:20",
    "PT 14:20",
    "PTV 16:20",
    "PTN 18:20",
    "COR 21:20"
  ],
  "Look Goiás": [
    "LGO 08:20",
    "LGO 10:20",
    "LGO 12:20",
    "LGO 15:20",
    "LGO 18:20",
    "LGO 20:20"
  ]
};

const PRACAS_ORDENADAS = Object.keys(SEQUENCIAS_POR_PRACA);

let logado = false;
let dataSelecionada = hojeISO();
let multiplicadoresAposta = { ...PREMIO_FICTICIO_MULTIPLICADOR };
let limitesAposta = { ...LIMITES_APOSTA_PADRAO };
let lista = carregarDados();
let apostas = carregarApostas();
let usuarios = carregarUsuarios();
let usuarioAtual = carregarSessaoUsuario();
let cronometroApostaTimer = null;
let acessoAdminVisivel = false;
let contadorCliquesAdmin = 0;
let timerCliquesAdmin = null;
let hashLoteriasApostaDisponiveis = "";
let modoUsuarioPublico = "login";

function hojeISO() {
  return dataLocalParaISO(new Date());
}

function dataLocalParaISO(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function dataMinimaISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (MAX_DIAS_HISTORICO - 1));
  return dataLocalParaISO(d);
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

function dataDentroDaJanela(dataISO) {
  const min = dataMinimaISO();
  const max = hojeISO();
  return dataISO >= min && dataISO <= max;
}

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = String(dataISO).split("-");
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano.slice(-2)}`;
}

function normalizarDataHoraISO(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatarHorarioBR(dataHora) {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function atualizarDataApostaVisivel(dataISO) {
  const el = document.getElementById("dataApostaAtual");
  if (!el) return;
  const data = normalizarDataISO(dataISO);
  el.innerText = data ? formatarDataBR(data) : "--/--/--";
}

function extrairDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function capitalizar(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function centavosDeTextoMoeda(valor) {
  const digitos = extrairDigitos(valor);
  if (!digitos) return 0;
  const n = Number(digitos);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function formatarCentavosComoMoedaBR(centavos) {
  const base = Number(centavos || 0) / 100;
  return `R$ ${base.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function normalizarValorMoeda(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return "";

  if (txt.includes("R$")) {
    const centavos = centavosDeTextoMoeda(txt);
    return (centavos / 100).toFixed(2);
  }

  const txtNormalizado = txt.replace(",", ".");
  const n = Number(txtNormalizado);
  if (Number.isNaN(n) || n < 0) return "";
  return n.toFixed(2);
}

function normalizarTipoAposta(tipo) {
  const t = String(tipo || "").trim();
  return Object.prototype.hasOwnProperty.call(TIPOS_APOSTA, t) ? t : "";
}

function normalizarLoginUsuario(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizarUsuarioItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const nome = String(raw.nome || "").trim();
  const login = normalizarLoginUsuario(raw.login);
  const senha = String(raw.senha || "");

  if (nome.length < 2) return null;
  if (!/^[a-z0-9._-]{3,24}$/.test(login)) return null;
  if (senha.length < 4) return null;

  const id =
    typeof raw.id === "number" && Number.isFinite(raw.id)
      ? raw.id
      : Date.now() + index;

  return {
    id,
    nome,
    login,
    senha
  };
}

function sanitizarUsuarios(arr) {
  const usados = new Set();
  const sane = [];

  (Array.isArray(arr) ? arr : []).forEach((item, index) => {
    const normalizado = normalizarUsuarioItem(item, index);
    if (!normalizado) return;
    if (usados.has(normalizado.login)) return;
    usados.add(normalizado.login);
    sane.push(normalizado);
  });

  return sane;
}

function parseNumeroPositivo(valor) {
  const txt = String(valor ?? "").trim().replace(",", ".");
  const n = Number(txt);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function formatarNumeroBR(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizarConfigLimitesAposta(raw) {
  const origem = raw && typeof raw === "object" ? raw : {};
  const min = parseNumeroPositivo(origem.valorMinimo) || LIMITES_APOSTA_PADRAO.valorMinimo;
  let max = parseNumeroPositivo(origem.valorMaximo) || LIMITES_APOSTA_PADRAO.valorMaximo;
  if (max < min) max = min;

  return {
    valorMinimo: Number(min.toFixed(2)),
    valorMaximo: Number(max.toFixed(2))
  };
}

function carregarLimitesAposta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIMITES_APOSTA_KEY));
    limitesAposta = normalizarConfigLimitesAposta(parsed);
    localStorage.setItem(LIMITES_APOSTA_KEY, JSON.stringify(limitesAposta));
  } catch (_err) {
    limitesAposta = { ...LIMITES_APOSTA_PADRAO };
    localStorage.removeItem(LIMITES_APOSTA_KEY);
  }
}

function salvarLimitesApostaStorage() {
  limitesAposta = normalizarConfigLimitesAposta(limitesAposta);
  localStorage.setItem(LIMITES_APOSTA_KEY, JSON.stringify(limitesAposta));
}

function preencherCamposLimitesAposta() {
  const minimo = document.getElementById("limiteMinimoAposta");
  const maximo = document.getElementById("limiteMaximoAposta");
  if (minimo) minimo.value = String(limitesAposta.valorMinimo);
  if (maximo) maximo.value = String(limitesAposta.valorMaximo);
}

function atualizarStatusLimitesAposta(texto, erro) {
  const status = document.getElementById("limitesApostaStatus");
  if (!status) return;
  status.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  status.innerText = texto || "";
}

function atualizarInfoLimitesAposta() {
  const info = document.getElementById("infoLimitesAposta");
  if (!info) return;
  info.innerText = `Limite por aposta: R$ ${formatarNumeroBR(limitesAposta.valorMinimo)} até R$ ${formatarNumeroBR(limitesAposta.valorMaximo)}.`;
}

function lerLimitesApostaDoFormulario() {
  const minimo = parseNumeroPositivo(document.getElementById("limiteMinimoAposta").value);
  const maximo = parseNumeroPositivo(document.getElementById("limiteMaximoAposta").value);

  if (!minimo || !maximo) {
    return { ok: false, mensagem: "Informe limite mínimo e máximo válidos." };
  }

  if (maximo < minimo) {
    return { ok: false, mensagem: "O limite máximo deve ser maior ou igual ao mínimo." };
  }

  return {
    ok: true,
    valor: {
      valorMinimo: Number(minimo.toFixed(2)),
      valorMaximo: Number(maximo.toFixed(2))
    }
  };
}

function salvarLimitesAposta() {
  if (!logado) {
    alert("Faça login antes de salvar limites.");
    return;
  }

  const leitura = lerLimitesApostaDoFormulario();
  if (!leitura.ok) {
    atualizarStatusLimitesAposta(leitura.mensagem, true);
    alert(leitura.mensagem);
    return;
  }

  limitesAposta = leitura.valor;
  salvarLimitesApostaStorage();
  atualizarInfoLimitesAposta();
  atualizarStatusLimitesAposta("Limites de aposta atualizados.", false);
  atualizarPreviewPremiacaoAposta();
  mostrar();
}

function restaurarLimitesPadrao() {
  if (!logado) {
    alert("Faça login antes de restaurar limites.");
    return;
  }

  limitesAposta = { ...LIMITES_APOSTA_PADRAO };
  salvarLimitesApostaStorage();
  preencherCamposLimitesAposta();
  atualizarInfoLimitesAposta();
  atualizarStatusLimitesAposta("Limites padrão restaurados.", false);
  atualizarPreviewPremiacaoAposta();
  mostrar();
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

function obterDataHoraFechamento(dataISO, loteria) {
  const horario = obterHorarioLoteria(loteria);
  if (!horario) return null;

  const data = normalizarDataISO(dataISO);
  if (!data) return null;

  const fechamento = new Date(`${data}T00:00:00`);
  fechamento.setHours(horario.horas, horario.minutos, 0, 0);
  fechamento.setMinutes(
    fechamento.getMinutes() - MINUTOS_ANTES_RESULTADO_PARA_FECHAR_APOSTA
  );
  return fechamento;
}

function segundosAteFechamento(dataISO, loteria) {
  const fechamento = obterDataHoraFechamento(dataISO, loteria);
  if (!fechamento) return null;
  return Math.floor((fechamento.getTime() - Date.now()) / 1000);
}

function formatarDuracao(segundos) {
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function textoCronometroPara(dataISO, loteria) {
  const restante = segundosAteFechamento(dataISO, loteria);
  if (restante === null) return "Sem horário definido.";
  if (restante > 0) return `Aposta aberta por mais ${formatarDuracao(restante)}.`;
  return `Aposta encerrada há ${formatarDuracao(Math.abs(restante))}.`;
}

function chaveResultado(item) {
  if (!item) return "";
  return `${item.data}|${item.praca}|${item.loteria}`;
}

function gerarResultadosPadraoDoDia(dataISO) {
  const data = normalizarDataISO(dataISO);
  if (!data) return [];

  const itens = [];
  PRACAS_ORDENADAS.forEach((praca) => {
    loteriasDaPraca(praca).forEach((loteria, idx) => {
      itens.push({
        id: `padrao-${data}-${praca}-${idx}`,
        praca,
        data,
        loteria,
        resultados: [],
        publicoPadrao: true
      });
    });
  });

  return itens;
}

function obterResultadosDisponiveis() {
  const base = gerarResultadosPadraoDoDia(hojeISO());
  const mapa = new Map();

  base.forEach((item) => {
    mapa.set(chaveResultado(item), item);
  });

  lista.forEach((item) => {
    mapa.set(chaveResultado(item), item);
  });

  return Array.from(mapa.values());
}

function normalizarConfigMultiplicadores(raw) {
  const origem = raw && typeof raw === "object" ? raw : {};
  const novo = {};

  Object.keys(PREMIO_FICTICIO_MULTIPLICADOR).forEach((tipo) => {
    const n = parseNumeroPositivo(origem[tipo]);
    novo[tipo] = n || PREMIO_FICTICIO_MULTIPLICADOR[tipo];
  });

  return novo;
}

function carregarMultiplicadores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MULTIPLICADORES_KEY));
    multiplicadoresAposta = normalizarConfigMultiplicadores(parsed);
    localStorage.setItem(MULTIPLICADORES_KEY, JSON.stringify(multiplicadoresAposta));
  } catch (_err) {
    multiplicadoresAposta = { ...PREMIO_FICTICIO_MULTIPLICADOR };
    localStorage.removeItem(MULTIPLICADORES_KEY);
  }
}

function salvarMultiplicadoresStorage() {
  multiplicadoresAposta = normalizarConfigMultiplicadores(multiplicadoresAposta);
  localStorage.setItem(MULTIPLICADORES_KEY, JSON.stringify(multiplicadoresAposta));
}

function preencherCamposMultiplicadores() {
  CAMPOS_MULTIPLICADOR.forEach((campo) => {
    const input = document.getElementById(campo.id);
    if (!input) return;
    const valor = multiplicadoresAposta[campo.tipo];
    input.value = Number.isFinite(valor) ? String(valor) : "";
  });
}

function atualizarStatusMultiplicadores(texto, erro) {
  const status = document.getElementById("multiplicadoresStatus");
  if (!status) return;
  status.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  status.innerText = texto || "";
}

function lerMultiplicadoresDoFormulario() {
  const novo = {};

  for (let i = 0; i < CAMPOS_MULTIPLICADOR.length; i++) {
    const campo = CAMPOS_MULTIPLICADOR[i];
    const input = document.getElementById(campo.id);
    const valor = parseNumeroPositivo(input ? input.value : "");
    if (!valor) {
      return {
        ok: false,
        mensagem: `Informe um multiplicador válido para ${campo.label}.`
      };
    }
    novo[campo.tipo] = valor;
  }

  return { ok: true, valor: novo };
}

function salvarMultiplicadores() {
  if (!logado) {
    alert("Faça login antes de salvar multiplicadores.");
    return;
  }

  const leitura = lerMultiplicadoresDoFormulario();
  if (!leitura.ok) {
    atualizarStatusMultiplicadores(leitura.mensagem, true);
    alert(leitura.mensagem);
    return;
  }

  multiplicadoresAposta = leitura.valor;
  salvarMultiplicadoresStorage();
  apostas = sanitizarApostas(apostas);
  salvarApostas();
  atualizarPreviewPremiacaoAposta();
  atualizarStatusMultiplicadores("Multiplicadores atualizados.", false);
  mostrar();
}

function restaurarMultiplicadoresPadrao() {
  if (!logado) {
    alert("Faça login antes de restaurar multiplicadores.");
    return;
  }

  multiplicadoresAposta = { ...PREMIO_FICTICIO_MULTIPLICADOR };
  salvarMultiplicadoresStorage();
  preencherCamposMultiplicadores();
  apostas = sanitizarApostas(apostas);
  salvarApostas();
  atualizarPreviewPremiacaoAposta();
  atualizarStatusMultiplicadores("Multiplicadores padrão restaurados.", false);
  mostrar();
}

function multiplicadorTipoAposta(tipo) {
  const t = normalizarTipoAposta(tipo);
  return multiplicadoresAposta[t] || PREMIO_FICTICIO_MULTIPLICADOR[t] || 0;
}

function calcularPremiacaoFicticia(tipo, valor) {
  const mult = multiplicadorTipoAposta(tipo);
  const valorNorm = normalizarValorMoeda(valor);
  const base = Number(valorNorm || 0);
  return (base * mult).toFixed(2);
}

function formatarMoedaBR(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function extrairGruposDoPalpite(palpite) {
  return String(palpite || "")
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
}

function descricaoGrupoPorCodigo(codigoGrupo) {
  const numero = Number(codigoGrupo);
  if (!Number.isInteger(numero) || numero < 1 || numero > 25) {
    return String(codigoGrupo || "").trim();
  }
  return String(numero).padStart(2, "0");
}

function formatarPalpiteParaBilhete(item) {
  if (!item) return "";
  const tipo = normalizarTipoAposta(item.tipo);
  const palpite = String(item.palpite || "").trim();

  if (tipo === "grupo" || tipo === "dupla_grupo" || tipo === "terno_grupo") {
    const grupos = extrairGruposDoPalpite(palpite);
    if (grupos.length === 0) return palpite;
    return grupos.map((g) => descricaoGrupoPorCodigo(g)).join(" | ");
  }

  return palpite;
}

function resultadoDaAposta(aposta) {
  const resultadosDisponiveis = obterResultadosDisponiveis();
  const resultado = resultadosDisponiveis.find(
    (item) =>
      item.data === aposta.data &&
      item.praca === aposta.praca &&
      item.loteria === aposta.loteria
  );

  if (!resultado || !Array.isArray(resultado.resultados) || resultado.resultados.length === 0) {
    return {
      status: "PENDENTE",
      ganhou: false,
      retorno: 0,
      lucro: 0,
      classeStatus: "status-pendente",
      detalhe: "Aguardando resultado desta loteria."
    };
  }

  const gruposResultado = resultado.resultados
    .map((r) => String(r.grupo || "").padStart(2, "0"));
  const numerosResultado = resultado.resultados
    .map((r) => extrairDigitos(r.numero).padStart(4, "0").slice(-4));

  let ganhou = false;
  const palpite = String(aposta.palpite || "").trim();

  if (aposta.tipo === "grupo") {
    ganhou = gruposResultado.includes(palpite);
  } else if (aposta.tipo === "dupla_grupo") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "terno_grupo") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (aposta.tipo === "milhar") {
    ganhou = numerosResultado.includes(palpite);
  } else if (aposta.tipo === "centena") {
    ganhou = numerosResultado.some((n) => n.slice(-3) === palpite);
  } else if (aposta.tipo === "dezena") {
    ganhou = numerosResultado.some((n) => n.slice(-2) === palpite);
  }

  const valor = Number(aposta.valor || 0);
  const mult = multiplicadorTipoAposta(aposta.tipo);
  const retorno = ganhou ? valor * mult : 0;
  const lucro = retorno - valor;

  return {
    status: ganhou ? "GANHOU" : "PERDEU",
    ganhou,
    retorno,
    lucro,
    classeStatus: ganhou ? "status-ganhou" : "status-perdeu",
    detalhe: ganhou ? "Aposta vencedora." : "Aposta não premiada."
  };
}

function parseGruposPalpite(valor, quantidade) {
  const encontrados = (String(valor || "").match(/\d{1,2}/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n));

  if (encontrados.length !== quantidade) {
    return { ok: false, mensagem: `Informe ${quantidade} grupos.` };
  }

  if (encontrados.some((g) => g < 1 || g > 25)) {
    return { ok: false, mensagem: "Grupo deve ser de 1 a 25." };
  }

  return {
    ok: true,
    valor: encontrados.map((g) => String(g).padStart(2, "0")).join("-")
  };
}

function validarPalpiteAposta(tipo, palpite) {
  const palpiteTxt = String(palpite || "").trim();
  const digitos = extrairDigitos(palpiteTxt);

  if (tipo === "grupo") {
    return parseGruposPalpite(palpiteTxt, 1);
  }

  if (tipo === "dupla_grupo") {
    return parseGruposPalpite(palpiteTxt, 2);
  }

  if (tipo === "terno_grupo") {
    return parseGruposPalpite(palpiteTxt, 3);
  }

  if (tipo === "milhar") {
    if (digitos.length !== 4) return { ok: false, mensagem: "Milhar precisa ter 4 dígitos." };
    return { ok: true, valor: digitos };
  }

  if (tipo === "centena") {
    if (digitos.length !== 3) return { ok: false, mensagem: "Centena precisa ter 3 dígitos." };
    return { ok: true, valor: digitos };
  }

  if (tipo === "dezena") {
    if (digitos.length !== 2) return { ok: false, mensagem: "Dezena precisa ter 2 dígitos." };
    return { ok: true, valor: digitos };
  }

  return { ok: false, mensagem: "Tipo de aposta inválido." };
}

function normalizarApostaItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const pracaRaw = String(raw.praca || "").trim();
  const praca = PRACAS_ORDENADAS.includes(pracaRaw) ? pracaRaw : "Rio";
  const loteria = String(raw.loteria || "").trim();
  const tipo = normalizarTipoAposta(raw.tipo);
  const palpiteBruto = String(raw.palpite || "").trim();
  const validacaoPalpite = validarPalpiteAposta(tipo, palpiteBruto);
  if (!loteria || !tipo || !validacaoPalpite.ok) return null;

  const data =
    normalizarDataISO(raw.data) ||
    normalizarDataISO(raw.date) ||
    normalizarDataISO(raw.createdAt) ||
    hojeISO();

  if (!dataDentroDaJanela(data)) return null;

  const valor = normalizarValorMoeda(raw.valor) || "1.00";
  const premio = calcularPremiacaoFicticia(tipo, valor);

  const id =
    typeof raw.id === "number" && Number.isFinite(raw.id)
      ? raw.id
      : Date.now() + index;
  let createdAt =
    normalizarDataHoraISO(raw.createdAt) ||
    normalizarDataHoraISO(raw.criadoEm);
  if (!createdAt && Number.isFinite(id) && id > 946684800000 && id < 4102444800000) {
    createdAt = normalizarDataHoraISO(id);
  }
  if (!createdAt) createdAt = new Date().toISOString();
  const usuarioId =
    typeof raw.usuarioId === "number" && Number.isFinite(raw.usuarioId)
      ? raw.usuarioId
      : null;
  const usuarioLogin = normalizarLoginUsuario(raw.usuarioLogin);

  return {
    id,
    data,
    praca,
    loteria,
    tipo,
    palpite: validacaoPalpite.valor,
    valor,
    premio,
    createdAt,
    usuarioId,
    usuarioLogin
  };
}

function sanitizarApostas(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((item, index) => normalizarApostaItem(item, index))
    .filter(Boolean);
}

function calcularGrupoPorNumero(numero) {
  const digitos = extrairDigitos(numero);
  if (!digitos) return null;

  const base = digitos.slice(-2);
  let final = Number(base);
  if (Number.isNaN(final)) return null;
  if (final === 0) final = 100;

  return Math.ceil(final / 4);
}

function calcularBichoPorNumero(numero) {
  const grupo = calcularGrupoPorNumero(numero);
  if (!grupo) return null;
  const animal = pegarAnimal(grupo);
  return { grupo, animal };
}

function extrairMinutosDoHorario(texto) {
  const match = String(texto || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + m;
}

function loteriasDaPraca(praca) {
  const listaPraca = SEQUENCIAS_POR_PRACA[praca];
  return Array.isArray(listaPraca) ? listaPraca : [];
}

function ordemPraca(praca) {
  const idx = PRACAS_ORDENADAS.findIndex((nome) => nome === praca);
  return idx === -1 ? 100000 : idx;
}

function ordemLoteria(praca, nome) {
  const limpo = String(nome || "").trim();
  const index = loteriasDaPraca(praca).findIndex((item) => item === limpo);
  if (index !== -1) return index;
  const minutos = extrairMinutosDoHorario(limpo);
  if (minutos !== Number.MAX_SAFE_INTEGER) return 100 + minutos;
  return 100000;
}

function compararPorHorario(a, b) {
  const ordemPracaA = ordemPraca(a.praca);
  const ordemPracaB = ordemPraca(b.praca);
  if (ordemPracaA !== ordemPracaB) return ordemPracaA - ordemPracaB;

  const ordemA = ordemLoteria(a.praca, a.loteria);
  const ordemB = ordemLoteria(b.praca, b.loteria);
  if (ordemA !== ordemB) return ordemA - ordemB;
  return String(a.loteria).localeCompare(String(b.loteria), "pt-BR");
}

function pegarAnimal(grupo) {
  const mapa = {
    1: "avestruz",
    2: "aguia",
    3: "burro",
    4: "borboleta",
    5: "cachorro",
    6: "cabra",
    7: "carneiro",
    8: "camelo",
    9: "cobra",
    10: "coelho",
    11: "cavalo",
    12: "elefante",
    13: "galo",
    14: "gato",
    15: "jacare",
    16: "leao",
    17: "macaco",
    18: "porco",
    19: "pavao",
    20: "peru",
    21: "touro",
    22: "tigre",
    23: "urso",
    24: "veado",
    25: "vaca"
  };

  const chave = Number(String(grupo || "").trim());
  return mapa[chave] || "porco";
}

function normalizarResultados(item) {
  if (!item || typeof item !== "object") return [];

  if (Array.isArray(item.resultados)) {
    return item.resultados
      .map((r) => ({
        numero: String(r && r.numero ? r.numero : "").trim(),
        grupo: String(r && r.grupo ? r.grupo : "").trim(),
        animal: String(r && r.animal ? r.animal : "").trim()
      }))
      .map((r) => {
        if (r.animal && r.grupo) return r;
        const auto = calcularBichoPorNumero(r.numero);
        if (!auto) return r;
        return {
          numero: r.numero,
          grupo: r.grupo || String(auto.grupo),
          animal: r.animal || auto.animal
        };
      })
      .filter((r) => r.numero);
  }

  if (Array.isArray(item.numeros)) {
    return item.numeros
      .map((n) => ({
        numero: String(n || "").trim(),
        grupo: ""
      }))
      .filter((r) => r.numero);
  }

  return [];
}

function normalizarItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const pracaRaw = String(raw.praca || "").trim();
  const praca = PRACAS_ORDENADAS.includes(pracaRaw) ? pracaRaw : "Rio";
  const loteria = String(raw.loteria || "").trim();
  const resultados = normalizarResultados(raw);
  if (!loteria || resultados.length === 0) return null;

  const data =
    normalizarDataISO(raw.data) ||
    normalizarDataISO(raw.date) ||
    normalizarDataISO(raw.createdAt) ||
    hojeISO();

  if (!dataDentroDaJanela(data)) return null;

  const id =
    typeof raw.id === "number" && Number.isFinite(raw.id)
      ? raw.id
      : Date.now() + index;

  return {
    id,
    praca,
    data,
    loteria,
    resultados
  };
}

function sanitizarLista(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((item, index) => normalizarItem(item, index))
    .filter(Boolean);
}

function carregarDados() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const sane = sanitizarLista(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sane));
    return sane;
  } catch (_err) {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function salvarDados() {
  lista = sanitizarLista(lista);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

function carregarApostas() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APOSTAS_KEY));
    const sane = sanitizarApostas(parsed);
    localStorage.setItem(APOSTAS_KEY, JSON.stringify(sane));
    return sane;
  } catch (_err) {
    localStorage.removeItem(APOSTAS_KEY);
    return [];
  }
}

function salvarApostas() {
  apostas = sanitizarApostas(apostas);
  localStorage.setItem(APOSTAS_KEY, JSON.stringify(apostas));
}

function carregarUsuarios() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USUARIOS_KEY));
    const sane = sanitizarUsuarios(parsed);
    localStorage.setItem(USUARIOS_KEY, JSON.stringify(sane));
    return sane;
  } catch (_err) {
    localStorage.removeItem(USUARIOS_KEY);
    return [];
  }
}

function salvarUsuarios() {
  usuarios = sanitizarUsuarios(usuarios);
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
}

function carregarSessaoUsuario() {
  const salvo = localStorage.getItem(USUARIO_SESSAO_KEY);
  if (!salvo) return null;

  const id = Number(salvo);
  if (!Number.isFinite(id)) {
    localStorage.removeItem(USUARIO_SESSAO_KEY);
    return null;
  }

  const encontrado = usuarios.find((u) => u.id === id) || null;
  if (!encontrado) {
    localStorage.removeItem(USUARIO_SESSAO_KEY);
  }

  return encontrado;
}

function salvarSessaoUsuario() {
  if (!usuarioAtual) {
    localStorage.removeItem(USUARIO_SESSAO_KEY);
    return;
  }
  localStorage.setItem(USUARIO_SESSAO_KEY, String(usuarioAtual.id));
}

function popularPracas() {
  const selectPraca = document.getElementById("praca");
  if (!selectPraca) return;

  const atual = selectPraca.value;
  selectPraca.innerHTML = '<option value="">Selecione a praça</option>';

  PRACAS_ORDENADAS.forEach((praca) => {
    const opt = document.createElement("option");
    opt.value = praca;
    opt.textContent = praca;
    selectPraca.appendChild(opt);
  });

  const pracaPadrao = PRACAS_ORDENADAS[0] || "";
  selectPraca.value = atual && PRACAS_ORDENADAS.includes(atual) ? atual : pracaPadrao;
}

function popularPracasAposta() {
  const selectPraca = document.getElementById("pracaAposta");
  if (!selectPraca) return;

  const atual = selectPraca.value;
  selectPraca.innerHTML = '<option value="">Selecione a praça</option>';

  PRACAS_ORDENADAS.forEach((praca) => {
    const opt = document.createElement("option");
    opt.value = praca;
    opt.textContent = praca;
    selectPraca.appendChild(opt);
  });

  const pracaPadrao = PRACAS_ORDENADAS[0] || "";
  selectPraca.value = atual && PRACAS_ORDENADAS.includes(atual) ? atual : pracaPadrao;
}

function popularLoterias() {
  const selectPraca = document.getElementById("praca");
  const selectLoteria = document.getElementById("loteria");
  if (!selectPraca || !selectLoteria) return;

  const atual = selectLoteria.value;
  const praca = selectPraca.value;
  const listaPraca = loteriasDaPraca(praca);

  selectLoteria.innerHTML = '<option value="">Selecione a loteria</option>';

  listaPraca.forEach((loteria) => {
    const opt = document.createElement("option");
    opt.value = loteria;
    opt.textContent = loteria;
    selectLoteria.appendChild(opt);
  });

  if (atual) {
    const existe = Array.from(selectLoteria.options).some((opt) => opt.value === atual);
    selectLoteria.value = existe ? atual : "";
  }
}

function loteriaAbertaParaAposta(dataISO, loteria) {
  const restante = segundosAteFechamento(dataISO, loteria);
  return restante === null || restante > 0;
}

function loteriasDisponiveisParaAposta(praca, dataISO) {
  const listaPraca = loteriasDaPraca(praca);
  const data = normalizarDataISO(dataISO);
  if (!data) return listaPraca.slice();
  return listaPraca.filter((loteria) => loteriaAbertaParaAposta(data, loteria));
}

function hashDisponibilidadeLoteriasAposta(praca, dataISO) {
  const disponiveis = loteriasDisponiveisParaAposta(praca, dataISO);
  return `${praca}|${normalizarDataISO(dataISO)}|${disponiveis.join("|")}`;
}

function atualizarDisponibilidadeLoteriasAposta(force) {
  const selectPraca = document.getElementById("pracaAposta");
  const dataInput = document.getElementById("dataAposta");
  if (!selectPraca || !dataInput) return;

  const praca = String(selectPraca.value || "").trim();
  const data = normalizarDataISO(dataInput.value);
  const novoHash = hashDisponibilidadeLoteriasAposta(praca, data);

  if (!force && novoHash === hashLoteriasApostaDisponiveis) return;
  popularLoteriasAposta();
}

function popularLoteriasAposta() {
  const selectPraca = document.getElementById("pracaAposta");
  const selectLoteria = document.getElementById("loteriaAposta");
  if (!selectPraca || !selectLoteria) return;

  const atual = selectLoteria.value;
  const praca = selectPraca.value;
  const dataAposta = normalizarDataISO(document.getElementById("dataAposta")?.value || "");
  const listaDisponivel = loteriasDisponiveisParaAposta(praca, dataAposta);
  hashLoteriasApostaDisponiveis = hashDisponibilidadeLoteriasAposta(praca, dataAposta);

  selectLoteria.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = listaDisponivel.length === 0
    ? "Sem horários disponíveis"
    : "Selecione a loteria";
  selectLoteria.appendChild(placeholder);

  listaDisponivel.forEach((loteria) => {
    const opt = document.createElement("option");
    opt.value = loteria;
    opt.textContent = loteria;
    selectLoteria.appendChild(opt);
  });

  selectLoteria.disabled = listaDisponivel.length === 0;

  if (atual) {
    const existe = Array.from(selectLoteria.options).some((opt) => opt.value === atual);
    selectLoteria.value = existe ? atual : "";
  }

  atualizarCronometroApostaFormulario();
}

function popularFiltroPracas() {
  const filtro = document.getElementById("filtroPraca");
  if (!filtro) return;

  const atual = filtro.value || "TODAS";
  filtro.innerHTML = '<option value="TODAS">Todas as praças</option>';

  PRACAS_ORDENADAS.forEach((praca) => {
    const opt = document.createElement("option");
    opt.value = praca;
    opt.textContent = praca;
    filtro.appendChild(opt);
  });

  filtro.value = atual === "TODAS" || PRACAS_ORDENADAS.includes(atual) ? atual : "TODAS";
}

function selecionarPracaAdmin(valor) {
  const selectPraca = document.getElementById("praca");
  if (!selectPraca) return;
  if (valor && PRACAS_ORDENADAS.includes(valor)) {
    selectPraca.value = valor;
  }
  popularLoterias();
}

function obterPracaFiltroAtual() {
  const filtro = document.getElementById("filtroPraca");
  if (!filtro) return "TODAS";
  const valor = String(filtro.value || "TODAS");
  if (valor === "TODAS") return valor;
  return PRACAS_ORDENADAS.includes(valor) ? valor : "TODAS";
}

function selecionarPracaFiltro(valor) {
  const filtro = document.getElementById("filtroPraca");
  if (filtro) {
    if (valor === "TODAS" || PRACAS_ORDENADAS.includes(valor)) {
      filtro.value = valor;
    } else {
      filtro.value = "TODAS";
    }
  }
  atualizarResumoData();
  mostrar();
}

function configurarSeletores() {
  const selectPraca = document.getElementById("praca");
  if (selectPraca) {
    selectPraca.addEventListener("change", () => {
      popularLoterias();
    });
  }

  const selectPracaAposta = document.getElementById("pracaAposta");
  if (selectPracaAposta) {
    selectPracaAposta.addEventListener("change", () => {
      popularLoteriasAposta();
    });
  }
}

function atualizarBotoesNavegacaoResultados() {
  const container = document.getElementById("resultados");
  const btnPrev = document.getElementById("btnResultadosPrev");
  const btnNext = document.getElementById("btnResultadosNext");
  if (!container || !btnPrev || !btnNext) return;

  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const temOverflow = maxScroll > 2;

  if (!temOverflow) {
    btnPrev.disabled = true;
    btnNext.disabled = true;
    return;
  }

  btnPrev.disabled = container.scrollLeft <= 1;
  btnNext.disabled = container.scrollLeft >= maxScroll - 1;
}

function rolarResultadosHorizontal(sentido) {
  const container = document.getElementById("resultados");
  if (!container) return;

  const deslocamento = Math.max(220, container.clientWidth * 0.9) * sentido;
  container.scrollBy({
    left: deslocamento,
    behavior: "smooth"
  });

  window.setTimeout(atualizarBotoesNavegacaoResultados, 260);
}

function configurarNavegacaoResultados() {
  const container = document.getElementById("resultados");
  const btnPrev = document.getElementById("btnResultadosPrev");
  const btnNext = document.getElementById("btnResultadosNext");
  if (!container || !btnPrev || !btnNext) return;

  btnPrev.addEventListener("click", () => rolarResultadosHorizontal(-1));
  btnNext.addEventListener("click", () => rolarResultadosHorizontal(1));
  container.addEventListener("scroll", atualizarBotoesNavegacaoResultados);
  window.addEventListener("resize", atualizarBotoesNavegacaoResultados);

  atualizarBotoesNavegacaoResultados();
}

function quantidadeGruposPorTipoAposta(tipo) {
  if (tipo === "grupo") return 1;
  if (tipo === "dupla_grupo") return 2;
  if (tipo === "terno_grupo") return 3;
  return 0;
}

function limiteDigitosPalpitePorTipo(tipo) {
  if (tipo === "milhar") return 4;
  if (tipo === "centena") return 3;
  if (tipo === "dezena") return 2;
  return 10;
}

function placeholderPalpitePorTipo(tipo) {
  if (tipo === "milhar") return "Milhar (4 digitos)";
  if (tipo === "centena") return "Centena (3 digitos)";
  if (tipo === "dezena") return "Dezena (2 digitos)";
  return "Palpite numerico";
}

function popularSelectPalpiteGrupo(selectId, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const atual = String(select.value || "");
  select.innerHTML = "";

  const optPlaceholder = document.createElement("option");
  optPlaceholder.value = "";
  optPlaceholder.textContent = placeholder;
  select.appendChild(optPlaceholder);

  for (let grupo = 1; grupo <= 25; grupo++) {
    const valorGrupo = String(grupo).padStart(2, "0");
    const animal = capitalizar(pegarAnimal(grupo));
    const opt = document.createElement("option");
    opt.value = valorGrupo;
    opt.textContent = animal;
    select.appendChild(opt);
  }

  if (atual) {
    const existe = Array.from(select.options).some((opt) => opt.value === atual);
    select.value = existe ? atual : "";
  }
}

function popularPalpitesGrupo() {
  popularSelectPalpiteGrupo("palpiteGrupo1", "Selecione o bicho");
  popularSelectPalpiteGrupo("palpiteGrupo2", "Selecione o 2o bicho");
  popularSelectPalpiteGrupo("palpiteGrupo3", "Selecione o 3o bicho");
}

function sincronizarPalpiteApostaGrupoParaInput() {
  const palpiteInput = document.getElementById("palpiteAposta");
  const tipoInput = document.getElementById("tipoAposta");
  if (!palpiteInput || !tipoInput) return;

  const tipo = normalizarTipoAposta(tipoInput.value);
  const quantidade = quantidadeGruposPorTipoAposta(tipo);

  if (quantidade <= 0) return;

  const grupos = [];
  for (let i = 1; i <= quantidade; i++) {
    const select = document.getElementById("palpiteGrupo" + i);
    const valor = String(select ? select.value : "").trim();
    if (valor) grupos.push(valor);
  }

  palpiteInput.value = grupos.join("-");
}

function normalizarPalpiteNumericoDigitado() {
  const palpiteInput = document.getElementById("palpiteAposta");
  const tipoInput = document.getElementById("tipoAposta");
  if (!palpiteInput || !tipoInput) return;

  const tipo = normalizarTipoAposta(tipoInput.value);
  if (quantidadeGruposPorTipoAposta(tipo) > 0) return;

  const limite = limiteDigitosPalpitePorTipo(tipo);
  palpiteInput.value = extrairDigitos(palpiteInput.value).slice(0, limite);
}

function atualizarModoCampoPalpiteAposta() {
  const tipoInput = document.getElementById("tipoAposta");
  const palpiteInput = document.getElementById("palpiteAposta");
  const grupoContainer = document.getElementById("palpiteGrupoContainer");
  if (!tipoInput || !palpiteInput || !grupoContainer) return;

  const tipo = normalizarTipoAposta(tipoInput.value);
  const quantidade = quantidadeGruposPorTipoAposta(tipo);
  const estavaEmGrupo = palpiteInput.dataset.modoGrupo === "1";

  if (!tipo) {
    grupoContainer.style.display = "none";
    palpiteInput.style.display = "none";
    palpiteInput.readOnly = true;
    palpiteInput.dataset.modoGrupo = "0";
    palpiteInput.value = "";

    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById("palpiteGrupo" + i);
      if (!select) continue;
      select.style.display = "none";
      select.disabled = true;
      select.value = "";
    }
    return;
  }

  if (quantidade > 0) {
    grupoContainer.style.display = "grid";
    palpiteInput.style.display = "none";
    palpiteInput.readOnly = true;
    palpiteInput.dataset.modoGrupo = "1";

    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById("palpiteGrupo" + i);
      if (!select) continue;
      const ativo = i <= quantidade;
      select.style.display = ativo ? "block" : "none";
      select.disabled = !ativo;
      if (!ativo) select.value = "";
    }

    sincronizarPalpiteApostaGrupoParaInput();
    return;
  }

  grupoContainer.style.display = "none";
  palpiteInput.style.display = "block";
  palpiteInput.readOnly = false;
  palpiteInput.inputMode = "numeric";
  palpiteInput.placeholder = placeholderPalpitePorTipo(tipo);
  palpiteInput.dataset.modoGrupo = "0";

  for (let i = 1; i <= 3; i++) {
    const select = document.getElementById("palpiteGrupo" + i);
    if (!select) continue;
    select.style.display = "none";
    select.disabled = true;
  }

  if (estavaEmGrupo) {
    palpiteInput.value = "";
  }
  normalizarPalpiteNumericoDigitado();
}

function atualizarPreviewPremiacaoAposta() {
  const tipoInput = document.getElementById("tipoAposta");
  const valorInput = document.getElementById("valorAposta");
  const premioInput = document.getElementById("premiacaoAposta");

  if (!tipoInput || !valorInput || !premioInput) return;

  const tipo = normalizarTipoAposta(tipoInput.value);
  const valor = normalizarValorMoeda(valorInput.value);

  if (!tipo || !valor) {
    premioInput.value = "";
    return;
  }

  const mult = multiplicadorTipoAposta(tipo);
  const premio = calcularPremiacaoFicticia(tipo, valor);
  premioInput.value = `R$ ${premio} (${mult}x)`;
}

function aplicarMascaraValorAposta() {
  const valorInput = document.getElementById("valorAposta");
  if (!valorInput) return;
  const centavos = centavosDeTextoMoeda(valorInput.value);
  valorInput.value = formatarCentavosComoMoedaBR(centavos);
}

function configurarMascaraValorAposta() {
  const valorInput = document.getElementById("valorAposta");
  if (!valorInput) return;

  valorInput.addEventListener("keydown", (event) => {
    const tecla = String(event.key || "");
    const teclaLower = tecla.toLowerCase();

    const teclasControle = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Tab",
      "Home",
      "End",
      "Escape",
      "Enter"
    ];

    if (teclasControle.includes(tecla)) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const atalhosPermitidos = ["a", "c", "x", "v", "z", "y"];
      if (atalhosPermitidos.includes(teclaLower)) {
        return;
      }
    }

    if (!/^\d$/.test(tecla)) {
      event.preventDefault();
    }
  });

  valorInput.addEventListener("paste", (event) => {
    const texto = String(event.clipboardData?.getData("text") || "").trim();

    if (!/^\d+$/.test(texto)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const centavos = Number(texto);
    valorInput.value = formatarCentavosComoMoedaBR(centavos);
    atualizarPreviewPremiacaoAposta();
  });

  valorInput.addEventListener("drop", (event) => {
    event.preventDefault();
  });

  valorInput.addEventListener("input", () => {
    aplicarMascaraValorAposta();
    atualizarPreviewPremiacaoAposta();
  });

  valorInput.addEventListener("focus", () => {
    if (!String(valorInput.value || "").trim()) {
      valorInput.value = "R$ 0,00";
    }
  });

  aplicarMascaraValorAposta();
}

function configurarCamposAposta() {
  const tipoInput = document.getElementById("tipoAposta");
  const palpiteInput = document.getElementById("palpiteAposta");
  const selectGrupo1 = document.getElementById("palpiteGrupo1");
  const selectGrupo2 = document.getElementById("palpiteGrupo2");
  const selectGrupo3 = document.getElementById("palpiteGrupo3");

  if (tipoInput) {
    tipoInput.addEventListener("change", () => {
      atualizarModoCampoPalpiteAposta();
      atualizarPreviewPremiacaoAposta();
    });
  }

  if (palpiteInput) {
    palpiteInput.addEventListener("input", normalizarPalpiteNumericoDigitado);
  }

  [selectGrupo1, selectGrupo2, selectGrupo3].forEach((select) => {
    if (!select) return;
    select.addEventListener("change", sincronizarPalpiteApostaGrupoParaInput);
  });

  popularPalpitesGrupo();
  atualizarModoCampoPalpiteAposta();
  configurarMascaraValorAposta();

  atualizarPreviewPremiacaoAposta();
}

function atualizarCronometroApostaFormulario() {
  const el = document.getElementById("cronometroAposta");
  const dataInput = document.getElementById("dataAposta");
  const loteriaInput = document.getElementById("loteriaAposta");
  if (!el || !dataInput || !loteriaInput) return;

  const data = normalizarDataISO(dataInput.value);
  const loteria = String(loteriaInput.value || "").trim();

  if (!data || !loteria) {
    el.innerText = "Selecione a loteria para ver o cronômetro.";
    el.classList.remove("cronometro-aberto", "cronometro-encerrado");
    return;
  }

  const restante = segundosAteFechamento(data, loteria);
  el.innerText = textoCronometroPara(data, loteria);

  el.classList.remove("cronometro-aberto", "cronometro-encerrado");
  if (restante !== null) {
    if (restante > 0) {
      el.classList.add("cronometro-aberto");
    } else {
      el.classList.add("cronometro-encerrado");
    }
  }
}

function atualizarCronometrosDaLista() {
  const spans = document.querySelectorAll(".cronometro-aposta");
  if (!spans || spans.length === 0) return;

  spans.forEach((span) => {
    const id = Number(span.dataset.apostaId || "");
    if (!Number.isFinite(id)) return;
    const aposta = apostas.find((item) => item.id === id);
    if (!aposta) return;
    span.innerText = textoCronometroPara(aposta.data, aposta.loteria);
  });
}

function configurarCronometroAposta() {
  const dataInput = document.getElementById("dataAposta");
  const loteriaInput = document.getElementById("loteriaAposta");

  if (dataInput) {
    dataInput.addEventListener("change", atualizarCronometroApostaFormulario);
  }

  if (loteriaInput) {
    loteriaInput.addEventListener("change", atualizarCronometroApostaFormulario);
  }

  atualizarDisponibilidadeLoteriasAposta(true);
  atualizarCronometroApostaFormulario();
  atualizarCronometrosDaLista();

  if (!cronometroApostaTimer) {
    cronometroApostaTimer = window.setInterval(() => {
      atualizarDisponibilidadeLoteriasAposta(false);
      atualizarCronometroApostaFormulario();
      atualizarCronometrosDaLista();
    }, 1000);
  }
}

function atualizarPreviewBicho(index) {
  const numeroInput = document.getElementById("n" + index);
  const grupoInput = document.getElementById("g" + index);
  if (!numeroInput || !grupoInput) return;

  const digitos = extrairDigitos(numeroInput.value).slice(-4);
  numeroInput.value = digitos;

  if (digitos.length < 4) {
    grupoInput.value = digitos.length ? "Digite 4 dígitos" : "";
    grupoInput.dataset.grupo = "";
    grupoInput.dataset.animal = "";
    return;
  }

  const auto = calcularBichoPorNumero(digitos);
  if (!auto) {
    grupoInput.value = "";
    grupoInput.dataset.grupo = "";
    grupoInput.dataset.animal = "";
    return;
  }

  grupoInput.value = `${String(auto.grupo).padStart(2, "0")} - ${capitalizar(auto.animal)}`;
  grupoInput.dataset.grupo = String(auto.grupo);
  grupoInput.dataset.animal = auto.animal;
}

function configurarAutoBichoInputs() {
  for (let i = 1; i <= 5; i++) {
    const numeroInput = document.getElementById("n" + i);
    if (!numeroInput) continue;
    numeroInput.addEventListener("input", () => atualizarPreviewBicho(i));
    atualizarPreviewBicho(i);
  }
}

function aplicarLimitesDeData() {
  const min = dataMinimaISO();
  const max = hojeISO();
  const dataResultado = document.getElementById("dataResultado");
  const dataAposta = document.getElementById("dataAposta");
  const filtroData = document.getElementById("filtroData");

  if (dataResultado) {
    dataResultado.min = min;
    dataResultado.max = max;
    if (!normalizarDataISO(dataResultado.value)) {
      dataResultado.value = dataSelecionada;
    }
  }

  if (dataAposta) {
    // Aposta sempre no dia atual.
    dataAposta.min = max;
    dataAposta.max = max;
    dataAposta.value = max;
  }
  atualizarDataApostaVisivel(max);

  if (filtroData) {
    filtroData.min = min;
    filtroData.max = max;
    filtroData.value = dataSelecionada;
  }

  atualizarDisponibilidadeLoteriasAposta(true);
  atualizarCronometroApostaFormulario();
}

function atualizarVisibilidadeAdmin() {
  const acesso = document.getElementById("acessoAdmin");
  const painel = document.getElementById("painelAdmin");
  const btnSair = document.getElementById("btnSairAdmin");

  if (document.body) {
    document.body.classList.toggle("admin-logado", Boolean(logado));
  }

  if (acesso) {
    acesso.style.display = acessoAdminVisivel || logado ? "block" : "none";
  }

  if (painel) {
    painel.style.display = logado ? "block" : "none";
  }

  if (btnSair) {
    btnSair.style.display = logado ? "block" : "none";
  }
}

function alternarAcessoAdminOculto() {
  acessoAdminVisivel = !acessoAdminVisivel;
  if (!acessoAdminVisivel && !logado) {
    const status = document.getElementById("adminStatus");
    if (status) status.innerText = "";
  }
  atualizarVisibilidadeAdmin();
}

function registrarCliqueGatilhoAdmin() {
  contadorCliquesAdmin += 1;

  if (timerCliquesAdmin) {
    clearTimeout(timerCliquesAdmin);
  }

  timerCliquesAdmin = window.setTimeout(() => {
    contadorCliquesAdmin = 0;
  }, 2000);

  if (contadorCliquesAdmin >= CLIQUES_PARA_EXIBIR_ADMIN) {
    contadorCliquesAdmin = 0;
    alternarAcessoAdminOculto();
  }
}

function configurarGatilhoAdminOculto() {
  const gatilho = document.getElementById("gatilhoAdmin");
  if (!gatilho) return;
  gatilho.addEventListener("click", registrarCliqueGatilhoAdmin);
}

function atualizarStatusUsuario(texto, erro) {
  const status = document.getElementById("usuarioStatus");
  if (!status) return;
  status.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  status.innerText = texto || "";
}

function definirModoUsuarioPublico(modo) {
  const modoFinal = modo === "cadastro" || modo === "recuperar" ? modo : "login";
  modoUsuarioPublico = modoFinal;

  const blocoLogin = document.getElementById("usuarioModoLogin");
  const blocoCadastro = document.getElementById("usuarioModoCadastro");
  const blocoRecuperar = document.getElementById("usuarioModoRecuperar");

  if (blocoLogin) blocoLogin.style.display = modoFinal === "login" ? "block" : "none";
  if (blocoCadastro) blocoCadastro.style.display = modoFinal === "cadastro" ? "block" : "none";
  if (blocoRecuperar) blocoRecuperar.style.display = modoFinal === "recuperar" ? "block" : "none";
}

function abrirCadastroUsuario() {
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("cadastro");
}

function abrirRecuperacaoSenha() {
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("recuperar");
}

function voltarLoginUsuario() {
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("login");
}

function atualizarVisibilidadeUsuario() {
  const cardUsuario = document.getElementById("cardUsuario");
  const blocoUsuarioTopo = document.getElementById("blocoUsuarioTopo");
  const cabecalhoUsuario = document.getElementById("cabecalhoUsuario");
  const cabecalhoUsuarioNome = document.getElementById("cabecalhoUsuarioNome");
  const areaPublica = document.getElementById("usuarioAreaPublica");
  const areaLogado = document.getElementById("usuarioAreaLogado");
  const btnSair = document.getElementById("btnSairUsuario");
  const status = document.getElementById("usuarioStatus");

  if (cabecalhoUsuario) {
    cabecalhoUsuario.style.display = usuarioAtual ? "flex" : "none";
  }

  if (cabecalhoUsuarioNome) {
    cabecalhoUsuarioNome.innerText = usuarioAtual
      ? `Olá, ${usuarioAtual.nome} (@${usuarioAtual.login})`
      : "";
  }

  if (cardUsuario) {
    cardUsuario.style.display = usuarioAtual ? "none" : "block";
    cardUsuario.classList.toggle("compacto", Boolean(usuarioAtual));
  }

  if (blocoUsuarioTopo) {
    blocoUsuarioTopo.style.display = usuarioAtual ? "none" : "block";
  }

  if (areaPublica) {
    areaPublica.style.display = usuarioAtual ? "none" : "block";
    if (!usuarioAtual) {
      definirModoUsuarioPublico(modoUsuarioPublico);
    }
  }

  if (areaLogado) {
    areaLogado.style.display = usuarioAtual ? "block" : "none";
  }

  if (btnSair) {
    btnSair.style.display = usuarioAtual ? "block" : "none";
  }

  if (status) {
    status.style.display = usuarioAtual ? "none" : "block";
  }
}

function sairUsuarioCabecalho() {
  sairUsuario();
}

function limparCamposUsuario() {
  const cadastroNome = document.getElementById("cadastroNome");
  const cadastroLogin = document.getElementById("cadastroLogin");
  const cadastroSenha = document.getElementById("cadastroSenha");
  const loginUsuario = document.getElementById("loginUsuario");
  const senhaUsuario = document.getElementById("senhaUsuario");
  const recuperarLogin = document.getElementById("recuperarLogin");
  const recuperarSenha = document.getElementById("recuperarSenha");

  if (cadastroNome) cadastroNome.value = "";
  if (cadastroLogin) cadastroLogin.value = "";
  if (cadastroSenha) cadastroSenha.value = "";
  if (loginUsuario) loginUsuario.value = "";
  if (senhaUsuario) senhaUsuario.value = "";
  if (recuperarLogin) recuperarLogin.value = "";
  if (recuperarSenha) recuperarSenha.value = "";
}

function cadastrarUsuario() {
  const nome = String(document.getElementById("cadastroNome").value || "").trim();
  const login = normalizarLoginUsuario(document.getElementById("cadastroLogin").value);
  const senha = String(document.getElementById("cadastroSenha").value || "");

  if (nome.length < 2) {
    atualizarStatusUsuario("Informe um nome com pelo menos 2 caracteres.", true);
    alert("Informe um nome com pelo menos 2 caracteres.");
    return;
  }

  if (!/^[a-z0-9._-]{3,24}$/.test(login)) {
    atualizarStatusUsuario("Login inválido. Use 3-24 caracteres (a-z, 0-9, . _ -).", true);
    alert("Login inválido. Use 3-24 caracteres (a-z, 0-9, . _ -).");
    return;
  }

  if (senha.length < 4) {
    atualizarStatusUsuario("A senha deve ter pelo menos 4 caracteres.", true);
    alert("A senha deve ter pelo menos 4 caracteres.");
    return;
  }

  const existe = usuarios.some((u) => u.login === login);
  if (existe) {
    atualizarStatusUsuario("Este login já está em uso.", true);
    alert("Este login já está em uso.");
    return;
  }

  const novoUsuario = {
    id: Date.now(),
    nome,
    login,
    senha
  };

  usuarios.unshift(novoUsuario);
  salvarUsuarios();
  usuarioAtual = novoUsuario;
  salvarSessaoUsuario();
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
  atualizarStatusUsuario(`Cadastro concluído. Conectado como ${nome} (@${login}).`, false);
  limparCamposUsuario();
  mostrar();
}

function redefinirSenhaUsuario() {
  const login = normalizarLoginUsuario(document.getElementById("recuperarLogin").value);
  const novaSenha = String(document.getElementById("recuperarSenha").value || "");

  if (!login || novaSenha.length < 4) {
    atualizarStatusUsuario("Informe login e nova senha (mínimo 4 caracteres).", true);
    alert("Informe login e nova senha (mínimo 4 caracteres).");
    return;
  }

  const idx = usuarios.findIndex((u) => u.login === login);
  if (idx === -1) {
    atualizarStatusUsuario("Login não encontrado.", true);
    alert("Login não encontrado.");
    return;
  }

  usuarios[idx].senha = novaSenha;
  salvarUsuarios();
  definirModoUsuarioPublico("login");
  const loginUsuario = document.getElementById("loginUsuario");
  if (loginUsuario) loginUsuario.value = login;
  atualizarStatusUsuario("Senha atualizada. Faça login.", false);

  const recuperarSenha = document.getElementById("recuperarSenha");
  if (recuperarSenha) recuperarSenha.value = "";
}

function entrarUsuario() {
  const login = normalizarLoginUsuario(document.getElementById("loginUsuario").value);
  const senha = String(document.getElementById("senhaUsuario").value || "");

  if (!login || !senha) {
    atualizarStatusUsuario("Informe login e senha.", true);
    alert("Informe login e senha.");
    return;
  }

  const encontrado = usuarios.find((u) => u.login === login && u.senha === senha);
  if (!encontrado) {
    atualizarStatusUsuario("Login ou senha inválidos.", true);
    alert("Login ou senha inválidos.");
    return;
  }

  usuarioAtual = encontrado;
  salvarSessaoUsuario();
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
  atualizarStatusUsuario(`Conectado como ${encontrado.nome} (@${encontrado.login}).`, false);
  limparCamposUsuario();
  mostrar();
}

function sairUsuario() {
  usuarioAtual = null;
  salvarSessaoUsuario();
  atualizarVisibilidadeUsuario();
  atualizarStatusUsuario("Usuário desconectado.", false);
  limparCamposUsuario();
  mostrar();
}

function atualizarEstadoNavegacao() {
  const min = dataMinimaISO();
  const max = hojeISO();
  const btnAnterior = document.getElementById("btnDiaAnterior");
  const btnProximo = document.getElementById("btnDiaProximo");
  const btnHoje = document.getElementById("btnDiaHoje");

  if (btnAnterior) btnAnterior.disabled = dataSelecionada <= min;
  if (btnProximo) btnProximo.disabled = dataSelecionada >= max;
  if (btnHoje) btnHoje.disabled = dataSelecionada === max;
}

function atualizarResumoData() {
  const resumo = document.getElementById("resumoData");
  if (!resumo) return;
  const filtroPraca = obterPracaFiltroAtual();
  const pracaTxt = filtroPraca === "TODAS" ? "Todas as praças" : filtroPraca;
  resumo.innerText = `Data selecionada: ${formatarDataBR(dataSelecionada)} | Praça: ${pracaTxt}`;
}

function selecionarData(valor) {
  const data = normalizarDataISO(valor);
  if (!data) return;

  let nova = data;
  if (nova < dataMinimaISO()) nova = dataMinimaISO();
  if (nova > hojeISO()) nova = hojeISO();

  dataSelecionada = nova;
  aplicarLimitesDeData();
  atualizarEstadoNavegacao();
  atualizarResumoData();
  mostrar();
}

function voltarDia() {
  const atual = new Date(`${dataSelecionada}T00:00:00`);
  atual.setDate(atual.getDate() - 1);
  selecionarData(dataLocalParaISO(atual));
}

function avancarDia() {
  const atual = new Date(`${dataSelecionada}T00:00:00`);
  atual.setDate(atual.getDate() + 1);
  selecionarData(dataLocalParaISO(atual));
}

function irHoje() {
  selecionarData(hojeISO());
}

function loginAdmin() {
  const senha = document.getElementById("senhaAdmin").value;
  const status = document.getElementById("adminStatus");

  if (senha === SENHA) {
    logado = true;
    atualizarVisibilidadeAdmin();
    status.innerText = "Liberado!";
    preencherCamposMultiplicadores();
    preencherCamposLimitesAposta();
    atualizarStatusMultiplicadores("Admin conectado.", false);
    atualizarStatusLimitesAposta("Admin conectado.", false);
    selecionarPracaAdmin("Rio");
    const pracaAposta = document.getElementById("pracaAposta");
    const dataAposta = document.getElementById("dataAposta");
    if (dataAposta) dataAposta.value = hojeISO();
    if (pracaAposta) {
      pracaAposta.value = "Rio";
      popularLoteriasAposta();
    }
    const dataResultado = document.getElementById("dataResultado");
    if (dataResultado) dataResultado.value = hojeISO();
    atualizarDisponibilidadeLoteriasAposta(true);
    mostrar();
  } else {
    status.innerText = "Senha incorreta!";
  }
}

function logoutAdmin() {
  logado = false;
  acessoAdminVisivel = false;
  atualizarVisibilidadeAdmin();

  const status = document.getElementById("adminStatus");
  const senha = document.getElementById("senhaAdmin");

  if (status) status.innerText = "Admin desconectado.";
  if (senha) senha.value = "";
  atualizarStatusMultiplicadores("");
  atualizarStatusLimitesAposta("");

  limparCamposResultado();
  limparCamposAposta();
  mostrar();
}

function salvar() {
  if (!logado) {
    alert("Faça login antes de salvar.");
    return;
  }

  const praca = document.getElementById("praca").value.trim();
  const loteria = document.getElementById("loteria").value.trim();
  const dataInput = document.getElementById("dataResultado").value;
  const data = normalizarDataISO(dataInput);

  if (!praca || !PRACAS_ORDENADAS.includes(praca)) {
    alert("Selecione a praça.");
    return;
  }

  if (!loteria) {
    alert("Selecione a loteria.");
    return;
  }

  if (!data) {
    alert("Escolha uma data válida.");
    return;
  }

  if (!dataDentroDaJanela(data)) {
    alert(`A data deve estar entre ${formatarDataBR(dataMinimaISO())} e ${formatarDataBR(hojeISO())}.`);
    return;
  }

  const resultados = [];

  for (let i = 1; i <= 5; i++) {
    const numeroInput = document.getElementById("n" + i);
    const grupoInput = document.getElementById("g" + i);
    const numero = extrairDigitos(numeroInput ? numeroInput.value : "").slice(-4);
    const auto = calcularBichoPorNumero(numero);

    if (numero.length !== 4 || !auto) {
      alert("Preencha os 5 números com 4 dígitos.");
      return;
    }

    if (numeroInput) numeroInput.value = numero;
    if (grupoInput) {
      grupoInput.dataset.grupo = String(auto.grupo);
      grupoInput.dataset.animal = auto.animal;
      grupoInput.value = `${String(auto.grupo).padStart(2, "0")} - ${capitalizar(auto.animal)}`;
    }

    resultados.push({
      numero,
      grupo: String(auto.grupo),
      animal: auto.animal
    });
  }

  const existenteIndex = lista.findIndex(
    (item) => item.data === data && item.praca === praca && item.loteria === loteria
  );

  const novoItem = {
    id: existenteIndex !== -1 ? lista[existenteIndex].id : Date.now(),
    praca,
    data,
    loteria,
    resultados
  };

  if (existenteIndex !== -1) {
    lista[existenteIndex] = novoItem;
  } else {
    lista.push(novoItem);
  }

  salvarDados();
  dataSelecionada = data;
  aplicarLimitesDeData();
  atualizarEstadoNavegacao();
  atualizarResumoData();
  mostrar();
  limparCamposResultado();
  alert("Resultado salvo!");
}

function salvarAposta() {
  if (!usuarioAtual) {
    atualizarStatusUsuario("Faça login de usuário para apostar.", true);
    alert("Faça login de usuário para apostar.");
    return;
  }

  const data = hojeISO();
  const praca = String(document.getElementById("pracaAposta").value || "").trim();
  const loteria = String(document.getElementById("loteriaAposta").value || "").trim();
  const tipo = normalizarTipoAposta(document.getElementById("tipoAposta").value);
  sincronizarPalpiteApostaGrupoParaInput();
  const palpite = String(document.getElementById("palpiteAposta").value || "").trim();
  const valor = normalizarValorMoeda(document.getElementById("valorAposta").value);

  if (!praca || !PRACAS_ORDENADAS.includes(praca)) {
    alert("Selecione a praça da aposta.");
    return;
  }

  if (!loteria) {
    alert("Selecione a loteria da aposta.");
    return;
  }

  if (!tipo) {
    alert("Selecione o tipo de aposta.");
    return;
  }

  if (!valor) {
    alert("Informe o valor da aposta.");
    return;
  }

  const valorNum = Number(valor);
  if (valorNum < limitesAposta.valorMinimo || valorNum > limitesAposta.valorMaximo) {
    alert(
      `O valor da aposta deve estar entre R$ ${formatarNumeroBR(limitesAposta.valorMinimo)} e R$ ${formatarNumeroBR(limitesAposta.valorMaximo)}.`
    );
    return;
  }

  const restante = segundosAteFechamento(data, loteria);
  if (restante !== null && restante <= 0) {
    alert("Esta loteria já encerrou para apostas nesta data.");
    return;
  }

  const validacao = validarPalpiteAposta(tipo, palpite);
  if (!validacao.ok) {
    alert(validacao.mensagem);
    return;
  }

  const premio = calcularPremiacaoFicticia(tipo, valor);
  const agora = Date.now();

  const item = {
    id: agora,
    data,
    praca,
    loteria,
    tipo,
    palpite: validacao.valor,
    valor,
    premio,
    createdAt: new Date(agora).toISOString(),
    usuarioId: usuarioAtual.id,
    usuarioLogin: usuarioAtual.login
  };

  apostas.unshift(item);
  salvarApostas();
  dataSelecionada = data;
  aplicarLimitesDeData();
  atualizarEstadoNavegacao();
  atualizarResumoData();
  mostrar();
  limparCamposAposta();
  alert("Aposta salva!");
}

function limparCamposAposta() {
  const tipo = document.getElementById("tipoAposta");
  const palpite = document.getElementById("palpiteAposta");
  const valor = document.getElementById("valorAposta");
  const premio = document.getElementById("premiacaoAposta");
  const loteriaAposta = document.getElementById("loteriaAposta");
  const palpiteGrupo1 = document.getElementById("palpiteGrupo1");
  const palpiteGrupo2 = document.getElementById("palpiteGrupo2");
  const palpiteGrupo3 = document.getElementById("palpiteGrupo3");

  if (tipo) tipo.value = "";
  if (palpite) palpite.value = "";
  if (valor) valor.value = "R$ 0,00";
  if (premio) premio.value = "";
  if (loteriaAposta) loteriaAposta.value = "";
  if (palpiteGrupo1) palpiteGrupo1.value = "";
  if (palpiteGrupo2) palpiteGrupo2.value = "";
  if (palpiteGrupo3) palpiteGrupo3.value = "";
  atualizarModoCampoPalpiteAposta();
  atualizarPreviewPremiacaoAposta();
  atualizarCronometroApostaFormulario();
}

function mostrarApostas() {
  const container = document.getElementById("listaApostas");
  if (!container) return;

  const filtroPraca = obterPracaFiltroAtual();
  const usuarioIdAtual = usuarioAtual ? usuarioAtual.id : null;
  const doDia = apostas
    .filter((item) => {
      if (item.data !== dataSelecionada) return false;
      if (filtroPraca !== "TODAS" && item.praca !== filtroPraca) return false;
      if (logado) return true;
      if (!usuarioIdAtual) return false;
      return item.usuarioId === usuarioIdAtual;
    })
    .sort(compararPorHorario);

  container.innerHTML = "";
  container.classList.remove("apostas-unico");

  if (doDia.length === 0) {
    if (!logado && !usuarioAtual) {
      container.innerHTML = "<p>Faça login de usuário para registrar e ver suas apostas.</p>";
    } else if (!logado && usuarioAtual) {
      container.innerHTML = "<p>Você ainda não tem apostas nesta data.</p>";
    } else {
      container.innerHTML = "<p>Nenhuma aposta cadastrada para esta data.</p>";
    }
    return;
  }

  if (doDia.length === 1) {
    container.classList.add("apostas-unico");
  }

  doDia.forEach((item) => {
    const mult = multiplicadorTipoAposta(item.tipo);
    const valorNum = Number(item.valor || 0);
    const potencialNum = Number(calcularPremiacaoFicticia(item.tipo, item.valor));
    const valorTxt = formatarMoedaBR(valorNum);
    const premioTxt = formatarMoedaBR(potencialNum);
    const horarioAposta = formatarHorarioBR(item.createdAt);
    const tipoLabel = TIPOS_APOSTA[item.tipo] || item.tipo;
    const palpiteBilhete = formatarPalpiteParaBilhete(item);
    const conf = resultadoDaAposta(item);
    let linhaResultado = `Status: <span class="status-aposta ${conf.classeStatus}">${conf.status}</span> | ${conf.detalhe}`;
    const podeExcluir = logado;
    const acoes = podeExcluir
      ? `<div class="acoes-aposta acao-admin"><button class="btn-danger btn-inline" onclick="excluirApostaPorId(${item.id})">Excluir aposta</button></div>`
      : "";
    const dono = logado && item.usuarioLogin
      ? `Apostador: <b>@${item.usuarioLogin}</b><br>`
      : "";

    container.innerHTML += `
      <div class="aposta-item">
        <strong>${item.praca} | ${item.loteria}</strong><br>
        <div class="linha-horario-aposta">Aposta feita às <b>${horarioAposta}</b></div>
        ${dono}
        ${tipoLabel}: <b>${palpiteBilhete}</b> | Valor: ${valorTxt}<br>
        Ganho potencial: <span class="valor-potencial-destaque">${premioTxt}</span> (${mult}x)<br>
        ${linhaResultado}
        ${acoes}
      </div>
    `;
  });

  atualizarCronometrosDaLista();
}

function limparCamposResultado() {
  const loteria = document.getElementById("loteria");
  if (loteria) loteria.value = "";
  for (let i = 1; i <= 5; i++) {
    document.getElementById("n" + i).value = "";
    document.getElementById("g" + i).value = "";
    document.getElementById("g" + i).dataset.grupo = "";
    document.getElementById("g" + i).dataset.animal = "";
  }
}

function excluirPorId(id) {
  if (!logado) return;
  if (!confirm("Excluir este resultado?")) return;

  lista = lista.filter((item) => item.id !== id);
  salvarDados();
  mostrar();
}

function excluirApostaPorId(id) {
  const alvo = apostas.find((item) => item.id === id);
  if (!alvo) return;

  if (!logado) {
    alert("Somente o admin pode excluir apostas.");
    return;
  }

  if (!confirm("Excluir esta aposta?")) return;

  apostas = apostas.filter((item) => item.id !== id);
  salvarApostas();
  mostrarApostas();
}

function mostrar() {
  const container = document.getElementById("resultados");
  if (!container) return;

  const filtroPraca = obterPracaFiltroAtual();
  const resultadosDisponiveis = obterResultadosDisponiveis();
  const doDia = resultadosDisponiveis
    .filter((item) => {
      if (item.data !== dataSelecionada) return false;
      if (filtroPraca === "TODAS") return true;
      return item.praca === filtroPraca;
    })
    .sort(compararPorHorario);

  container.innerHTML = "";
  container.classList.remove("resultados-unico");

  if (doDia.length === 0) {
    container.innerHTML = "<p>Nenhum resultado cadastrado para esta data.</p>";
    atualizarBotoesNavegacaoResultados();
    mostrarApostas();
    return;
  }

  if (doDia.length === 1) {
    container.classList.add("resultados-unico");
  }

  doDia.forEach((item) => {
    let html = `<div class="resultado-card">
      <div class="resultado-titulo">${item.praca} | ${item.loteria} - ${formatarDataBR(item.data)}</div>`;

    if (!item.resultados || item.resultados.length === 0) {
      html += `<p>Aguardando resultado desta loteria.</p>`;
    } else {
      item.resultados.forEach((r, i) => {
        const animal = r.animal || pegarAnimal(r.grupo);

        html += `
          <div class="premio">
            <span class="posicao">${i + 1}º</span>
            <img src="img/animais/${animal}.png" alt="${animal}">
            <strong>${r.numero}</strong>
            <span class="grupo">${r.grupo || "-"} - ${capitalizar(animal)}</span>
          </div>
        `;
      });
    }

    if (logado && !item.publicoPadrao) {
      html += `<button class="acao-admin" onclick="excluirPorId(${item.id})">Excluir</button>`;
    }

    html += "</div>";
    container.innerHTML += html;
  });

  atualizarBotoesNavegacaoResultados();
  mostrarApostas();
}

function init() {
  lista = sanitizarLista(lista);
  carregarMultiplicadores();
  carregarLimitesAposta();
  apostas = sanitizarApostas(apostas);
  usuarios = sanitizarUsuarios(usuarios);
  usuarioAtual = carregarSessaoUsuario();
  salvarDados();
  salvarApostas();
  salvarUsuarios();
  salvarLimitesApostaStorage();
  popularPracas();
  popularLoterias();
  popularPracasAposta();
  popularLoteriasAposta();
  popularFiltroPracas();
  configurarGatilhoAdminOculto();
  configurarNavegacaoResultados();
  configurarSeletores();
  configurarAutoBichoInputs();
  configurarCamposAposta();
  configurarCronometroAposta();
  preencherCamposMultiplicadores();
  preencherCamposLimitesAposta();
  atualizarInfoLimitesAposta();
  atualizarStatusMultiplicadores("", false);
  atualizarStatusLimitesAposta("", false);
  atualizarVisibilidadeUsuario();
  definirModoUsuarioPublico("login");
  if (usuarioAtual) {
    atualizarStatusUsuario(`Conectado como ${usuarioAtual.nome} (@${usuarioAtual.login}).`, false);
  } else {
    atualizarStatusUsuario("Cadastre-se ou faça login para apostar.", false);
  }
  atualizarVisibilidadeAdmin();
  dataSelecionada = hojeISO();
  aplicarLimitesDeData();
  atualizarEstadoNavegacao();
  atualizarResumoData();
  mostrar();
}

window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.cadastrarUsuario = cadastrarUsuario;
window.redefinirSenhaUsuario = redefinirSenhaUsuario;
window.entrarUsuario = entrarUsuario;
window.sairUsuario = sairUsuario;
window.sairUsuarioCabecalho = sairUsuarioCabecalho;
window.abrirCadastroUsuario = abrirCadastroUsuario;
window.abrirRecuperacaoSenha = abrirRecuperacaoSenha;
window.voltarLoginUsuario = voltarLoginUsuario;
window.salvar = salvar;
window.salvarMultiplicadores = salvarMultiplicadores;
window.restaurarMultiplicadoresPadrao = restaurarMultiplicadoresPadrao;
window.salvarLimitesAposta = salvarLimitesAposta;
window.restaurarLimitesPadrao = restaurarLimitesPadrao;
window.salvarAposta = salvarAposta;
window.mostrar = mostrar;
window.excluirPorId = excluirPorId;
window.excluirApostaPorId = excluirApostaPorId;
window.selecionarData = selecionarData;
window.selecionarPracaFiltro = selecionarPracaFiltro;
window.voltarDia = voltarDia;
window.avancarDia = avancarDia;
window.irHoje = irHoje;

window.addEventListener("load", init);
