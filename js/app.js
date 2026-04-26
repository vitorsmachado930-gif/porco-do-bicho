const SENHA = "1234";
const STORAGE_KEY = "dados";
const APOSTAS_KEY = "apostas";
const MULTIPLICADORES_KEY = "multiplicadores_aposta";
const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const LIMITES_APOSTA_KEY = "limites_aposta";
const DADOS_UPDATED_AT_KEY = "dados_updated_at";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
const RESULTADOS_SYNC_API_URL = "https://www.porcodobicho.com/api/resultados.php";
const PAINEL_SYNC_API_URL = "https://www.porcodobicho.com/api/painel.php";
const RESULTADOS_SYNC_INTERVALO_MS = 30000;
const PAINEL_SYNC_INTERVALO_MS = 30000;
const MAX_DIAS_HISTORICO = 7;
const CLIQUES_PARA_EXIBIR_ADMIN = 5;
const MINUTOS_ANTES_RESULTADO_PARA_FECHAR_APOSTA = 1;
const PRACA_FIXA = "Rio";
const PAGINA_ADMIN_SEPARADA = (() => {
  const path = String(window.location.pathname || "").toLowerCase();
  return path.endsWith("/paginas/admin.html") || path.endsWith("/admin.html");
})();

const TIPOS_APOSTA = {
  grupo: "Grupo",
  dupla_grupo: "Dupla de Grupo Seco",
  terno_grupo: "Terno de Grupo Seco",
  duque_dezena: "Duque de Dezena",
  terno_dezena: "Terno de Dezena",
  passe_seco: "Passe-Seco",
  passe_vai_vem: "Passe Vai e Vem",
  dupla_grupo_1a5: "Dupla de Grupo 1º ao 5º",
  terno_grupo_1a5: "Terno de Grupo 1º ao 5º",
  milhar: "Milhar",
  centena: "Centena",
  dezena: "Dezena"
};

const PREMIO_FICTICIO_MULTIPLICADOR = {
  grupo: 18,
  dupla_grupo: 90,
  terno_grupo: 320,
  duque_dezena: 180,
  terno_dezena: 700,
  passe_seco: 120,
  passe_vai_vem: 70,
  dupla_grupo_1a5: 45,
  terno_grupo_1a5: 140,
  milhar: 4000,
  centena: 600,
  dezena: 60
};
const TIPOS_PREMIACAO_DESTAQUE_BASE = ["grupo", "terno_grupo", "milhar"];
const TIPOS_PREMIACAO_DESTAQUE_EXTRA = ["dupla_grupo", "centena", "dezena"];
const VALORES_APOSTA_DESTAQUE = [2, 3, 5, 10, 15, 20];

const LIMITES_APOSTA_PADRAO = {
  valorMinimo: 1,
  valorMaximo: 500
};
const SALDO_USUARIO_INICIAL = 0;

const USUARIO_TESTE_FIXO = Object.freeze({
  id: 102030,
  nome: "Teste",
  login: "teste",
  senha: "102030",
  saldo: SALDO_USUARIO_INICIAL,
  telefone: "",
  chavePix: ""
});

const CAMPOS_MULTIPLICADOR = [
  { tipo: "grupo", id: "multGrupo", label: "Grupo" },
  { tipo: "dupla_grupo", id: "multDuplaGrupo", label: "Dupla de Grupo Seco" },
  { tipo: "terno_grupo", id: "multTernoGrupo", label: "Terno de Grupo Seco" },
  { tipo: "duque_dezena", id: "multDuqueDezena", label: "Duque de Dezena" },
  { tipo: "terno_dezena", id: "multTernoDezena", label: "Terno de Dezena" },
  { tipo: "passe_seco", id: "multPasseSeco", label: "Passe-Seco" },
  { tipo: "passe_vai_vem", id: "multPasseVaiVem", label: "Passe Vai e Vem" },
  { tipo: "dupla_grupo_1a5", id: "multDuplaGrupo1a5", label: "Dupla de Grupo 1º ao 5º" },
  { tipo: "terno_grupo_1a5", id: "multTernoGrupo1a5", label: "Terno de Grupo 1º ao 5º" },
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
    "COR 21:30"
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
let secaoApostasEncerrada = false;
let modoUsuarioPublico = "login";
let painelUsuarioAberto = false;
let slotGrupoAtivo = 1;
let editorPalpiteGrupoAberto = true;
let toastRapidoTimer = null;
let sincronizacaoResultadosAtiva = false;
let aplicandoResultadosRemotos = false;
let sincronizacaoResultadosTimer = null;
let pushResultadosRemotosTimer = null;
let sincronizacaoPainelAtiva = false;
let aplicandoPainelRemoto = false;
let sincronizacaoPainelTimer = null;
let pushPainelRemotoTimer = null;
let apostasBilheteRascunho = [];
let contextoBilheteRascunho = null;

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

function normalizarLoginUsuario(login) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizarSaldoUsuario(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return SALDO_USUARIO_INICIAL;
  return Number(n.toFixed(2));
}

function normalizarTelefoneUsuario(valor) {
  const telefone = String(valor || "").trim();
  if (!telefone) return "";
  return telefone.slice(0, 24);
}

function normalizarChavePixUsuario(valor) {
  const chavePix = String(valor || "").trim();
  if (!chavePix) return "";
  return chavePix.slice(0, 120);
}

function criarUsuarioTesteFixo(rawExistente) {
  const raw = rawExistente && typeof rawExistente === "object" ? rawExistente : {};
  const nomeCustom = String(raw.nome || "").trim();
  return {
    id: USUARIO_TESTE_FIXO.id,
    nome: nomeCustom.length >= 2 ? nomeCustom : USUARIO_TESTE_FIXO.nome,
    login: USUARIO_TESTE_FIXO.login,
    senha: USUARIO_TESTE_FIXO.senha,
    saldo: normalizarSaldoUsuario(raw.saldo),
    telefone: normalizarTelefoneUsuario(raw.telefone),
    chavePix: normalizarChavePixUsuario(raw.chavePix)
  };
}

function normalizarUsuarioItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const nome = String(raw.nome || "").trim();
  const login = normalizarLoginUsuario(raw.login);
  const senha = String(raw.senha || "");
  const saldo = normalizarSaldoUsuario(raw.saldo);
  const telefone = normalizarTelefoneUsuario(raw.telefone);
  const chavePix = normalizarChavePixUsuario(raw.chavePix);

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
    senha,
    saldo,
    telefone,
    chavePix
  };
}

function sanitizarUsuarios(arr) {
  const base = Array.isArray(arr) ? arr : [];
  const usuarioTesteExistente = base.find(
    (item) => normalizarLoginUsuario(item && item.login) === USUARIO_TESTE_FIXO.login
  );
  const usuarioFixo = criarUsuarioTesteFixo(usuarioTesteExistente);
  const usados = new Set([usuarioFixo.login]);
  const sane = [usuarioFixo];

  base.forEach((item, index) => {
    const normalizado = normalizarUsuarioItem(item, index);
    if (!normalizado) return;
    if (normalizado.login === usuarioFixo.login) return;
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

function parseNumeroNaoNegativo(valor) {
  const txt = String(valor ?? "").trim().replace(",", ".");
  if (!txt) return null;
  const n = Number(txt);
  if (!Number.isFinite(n) || n < 0) return null;
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
    mostrarConfirmacaoApostaRapida("Faça login antes de salvar limites.", "erro");
    return;
  }

  const leitura = lerLimitesApostaDoFormulario();
  if (!leitura.ok) {
    atualizarStatusLimitesAposta(leitura.mensagem, true);
    mostrarConfirmacaoApostaRapida(leitura.mensagem, "erro");
    return;
  }

  limitesAposta = leitura.valor;
  salvarLimitesApostaStorage();
  atualizarInfoLimitesAposta();
  atualizarStatusLimitesAposta("Limites de aposta atualizados.", false);
  mostrarConfirmacaoApostaRapida("Limites de aposta atualizados.");
  atualizarPreviewPremiacaoAposta();
  mostrar();
}

function restaurarLimitesPadrao() {
  if (!logado) {
    mostrarConfirmacaoApostaRapida("Faça login antes de restaurar limites.", "erro");
    return;
  }

  limitesAposta = { ...LIMITES_APOSTA_PADRAO };
  salvarLimitesApostaStorage();
  preencherCamposLimitesAposta();
  atualizarInfoLimitesAposta();
  atualizarStatusLimitesAposta("Limites padrão restaurados.", false);
  mostrarConfirmacaoApostaRapida("Limites padrão restaurados.");
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

function obterDataHoraSorteio(dataISO, loteria) {
  const horario = obterHorarioLoteria(loteria);
  if (!horario) return null;

  const data = normalizarDataISO(dataISO);
  if (!data) return null;

  const sorteio = new Date(`${data}T00:00:00`);
  sorteio.setHours(horario.horas, horario.minutos, 0, 0);
  return sorteio;
}

function segundosAteFechamento(dataISO, loteria) {
  const fechamento = obterDataHoraFechamento(dataISO, loteria);
  if (!fechamento) return null;
  return Math.floor((fechamento.getTime() - Date.now()) / 1000);
}

function segundosAteSorteio(dataISO, loteria) {
  const sorteio = obterDataHoraSorteio(dataISO, loteria);
  if (!sorteio) return null;
  return Math.floor((sorteio.getTime() - Date.now()) / 1000);
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
    loteriasDaPraca(praca, data).forEach((loteria, idx) => {
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
    const n = parseNumeroNaoNegativo(origem[tipo]);
    novo[tipo] = n === null ? PREMIO_FICTICIO_MULTIPLICADOR[tipo] : n;
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
    const valor = parseNumeroNaoNegativo(input ? input.value : "");
    if (valor === null) {
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
    mostrarConfirmacaoApostaRapida("Faça login antes de salvar multiplicadores.", "erro");
    return;
  }

  const leitura = lerMultiplicadoresDoFormulario();
  if (!leitura.ok) {
    atualizarStatusMultiplicadores(leitura.mensagem, true);
    mostrarConfirmacaoApostaRapida(leitura.mensagem, "erro");
    return;
  }

  multiplicadoresAposta = leitura.valor;
  salvarMultiplicadoresStorage();
  apostas = sanitizarApostas(apostas);
  salvarApostas();
  atualizarPreviewPremiacaoAposta();
  atualizarStatusMultiplicadores("Multiplicadores atualizados.", false);
  mostrarConfirmacaoApostaRapida("Multiplicadores atualizados.");
  mostrar();
}

function restaurarMultiplicadoresPadrao() {
  if (!logado) {
    mostrarConfirmacaoApostaRapida("Faça login antes de restaurar multiplicadores.", "erro");
    return;
  }

  multiplicadoresAposta = { ...PREMIO_FICTICIO_MULTIPLICADOR };
  salvarMultiplicadoresStorage();
  preencherCamposMultiplicadores();
  apostas = sanitizarApostas(apostas);
  salvarApostas();
  atualizarPreviewPremiacaoAposta();
  atualizarStatusMultiplicadores("Multiplicadores padrão restaurados.", false);
  mostrarConfirmacaoApostaRapida("Multiplicadores padrão restaurados.");
  mostrar();
}

function multiplicadorTipoAposta(tipo) {
  const t = normalizarTipoAposta(tipo);
  const valorAtual = Number(multiplicadoresAposta[t]);
  if (Number.isFinite(valorAtual) && valorAtual >= 0) return valorAtual;
  const valorPadrao = Number(PREMIO_FICTICIO_MULTIPLICADOR[t]);
  if (Number.isFinite(valorPadrao) && valorPadrao >= 0) return valorPadrao;
  return 0;
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

function criarGeradorDeterministico(sementeTexto) {
  const texto = String(sementeTexto || "semente");
  let estado = 0;

  for (let i = 0; i < texto.length; i++) {
    estado = (Math.imul(31, estado) + texto.charCodeAt(i)) >>> 0;
  }

  if (!estado) estado = 123456789;

  return function proximo() {
    estado = (Math.imul(1664525, estado) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

function sortearInteiro(rand, maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
  return Math.floor(rand() * maxExclusive);
}

function formatarBichoComGrupo(grupo) {
  const numero = Number(grupo);
  const grupoTxt = String(numero).padStart(2, "0");
  return `${capitalizar(pegarAnimal(numero))} (${grupoTxt})`;
}

function montarPalpiteDestaque(tipo, rand) {
  if (tipo === "milhar") {
    return String(sortearInteiro(rand, 10000)).padStart(4, "0");
  }

  if (tipo === "grupo") {
    const grupo = sortearInteiro(rand, 25) + 1;
    return formatarBichoComGrupo(grupo);
  }

  if (tipo === "terno_grupo") {
    const usados = new Set();
    const escolhidos = [];
    while (escolhidos.length < 3) {
      const grupo = sortearInteiro(rand, 25) + 1;
      if (usados.has(grupo)) continue;
      usados.add(grupo);
      escolhidos.push(formatarBichoComGrupo(grupo));
    }
    return escolhidos.join(" | ");
  }

  return "";
}

function loteriaAptaParaPremiacaoDestaque(dataISO, loteria) {
  const data = normalizarDataISO(dataISO);
  if (!data) return false;

  const hoje = hojeISO();
  if (data < hoje) return true;
  if (data > hoje) return false;

  const horario = obterHorarioLoteria(loteria);
  if (!horario) return true;

  const agora = new Date();
  const limite = new Date(`${data}T00:00:00`);
  limite.setHours(horario.horas, horario.minutos, 0, 0);
  return agora.getTime() >= limite.getTime();
}

function deveExibirPremiacoesDestaqueExtras(dataISO) {
  return loteriaAptaParaPremiacaoDestaque(dataISO, "PT 14:20");
}

function tiposPremiacaoDestaqueAtivos(dataISO) {
  if (deveExibirPremiacoesDestaqueExtras(dataISO)) {
    return TIPOS_PREMIACAO_DESTAQUE_BASE.concat(TIPOS_PREMIACAO_DESTAQUE_EXTRA);
  }
  return TIPOS_PREMIACAO_DESTAQUE_BASE.slice();
}

function obterReferenciasPremiacaoDestaque(dataISO) {
  const data = normalizarDataISO(dataISO);
  const filtroPraca = obterPracaFiltroAtual();

  const referencias = obterResultadosDisponiveis()
    .filter((item) => {
      if (item.data !== data) return false;
      if (!loteriaAptaParaPremiacaoDestaque(data, item.loteria)) return false;
      if (filtroPraca === "TODAS") return true;
      return item.praca === filtroPraca;
    })
    .sort(compararPorHorario);

  if (referencias.length > 0) return referencias;

  return gerarResultadosPadraoDoDia(data)
    .filter((item) => {
      if (!loteriaAptaParaPremiacaoDestaque(data, item.loteria)) return false;
      if (filtroPraca === "TODAS") return true;
      return item.praca === filtroPraca;
    })
    .sort(compararPorHorario);
}

function gerarPremiacoesDestaqueDoDia(dataISO) {
  const data = normalizarDataISO(dataISO) || hojeISO();
  const rand = criarGeradorDeterministico(
    `${data}|${obterPracaFiltroAtual()}|premiacoes-destaque`
  );
  const referencias = obterReferenciasPremiacaoDestaque(data);
  if (referencias.length === 0) return [];
  const tiposAtivos = tiposPremiacaoDestaqueAtivos(data);

  return tiposAtivos.map((tipo, index) => {
    const valorAposta =
      VALORES_APOSTA_DESTAQUE[sortearInteiro(rand, VALORES_APOSTA_DESTAQUE.length)] || 2;
    const premio = Number(calcularPremiacaoFicticia(tipo, valorAposta.toFixed(2)));
    const palpite = montarPalpiteDestaque(tipo, rand);
    const tipoLabel = TIPOS_APOSTA[tipo] || tipo;
    const referencia =
      referencias.length > 0
        ? referencias[(index + sortearInteiro(rand, referencias.length)) % referencias.length]
        : null;

    return {
      tipo,
      tipoLabel,
      palpite,
      valorAposta,
      premio,
      referenciaTexto: referencia ? `${referencia.praca} | ${referencia.loteria}` : ""
    };
  });
}

function criarLinhaPremiacaoDestaque(label, valor) {
  const linha = document.createElement("div");
  const strong = document.createElement("strong");
  strong.innerText = `${label}: `;
  linha.appendChild(strong);
  linha.appendChild(document.createTextNode(valor));
  return linha;
}

function mostrarPremiacoesDestaque() {
  const listaEl = document.getElementById("listaPremiacoesDestaque");
  const dataEl = document.getElementById("dataPremiacoesDestaque");
  if (!listaEl) return;

  const data = normalizarDataISO(dataSelecionada) || hojeISO();
  if (dataEl) dataEl.innerText = formatarDataBR(data);

  const cards = gerarPremiacoesDestaqueDoDia(data);
  listaEl.innerHTML = "";

  if (cards.length === 0) {
    const aviso = document.createElement("p");
    aviso.className = "premiacao-destaque-vazio";
    aviso.innerText = data === hojeISO()
      ? "Premiações serão exibidas após o primeiro horário encerrado do dia."
      : "Sem horários elegíveis para exibir premiações nesta data.";
    listaEl.appendChild(aviso);
    return;
  }

  cards.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "premiacao-destaque-item";
    card.style.setProperty("--premiacao-delay", `${index * 0.08}s`);

    const confirmacao = document.createElement("div");
    confirmacao.className = "premiacao-confirmacao";

    const logo = document.createElement("img");
    logo.className = "premiacao-confirmacao-logo";
    logo.src = "img/mascote/icone.png?v=20260425";
    logo.alt = "Confirmacao de premiacao";
    confirmacao.appendChild(logo);
    card.appendChild(confirmacao);

    const tipo = document.createElement("div");
    tipo.className = "premiacao-destaque-tipo";
    tipo.innerText = item.tipoLabel;
    card.appendChild(tipo);

    card.appendChild(criarLinhaPremiacaoDestaque("Palpite", item.palpite));
    card.appendChild(
      criarLinhaPremiacaoDestaque("Valor apostado", formatarMoedaBR(item.valorAposta))
    );

    const premio = document.createElement("div");
    premio.className = "premiacao-destaque-valor";
    premio.innerText = `Premiação: ${formatarMoedaBR(item.premio)}`;
    card.appendChild(premio);

    if (item.referenciaTexto) {
      const ref = document.createElement("div");
      ref.className = "premiacao-destaque-referencia";
      ref.innerText = item.referenciaTexto;
      card.appendChild(ref);
    }

    listaEl.appendChild(card);
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

  if (
    tipo === "grupo" ||
    tipo === "dupla_grupo" ||
    tipo === "terno_grupo" ||
    tipo === "passe_seco" ||
    tipo === "passe_vai_vem" ||
    tipo === "dupla_grupo_1a5" ||
    tipo === "terno_grupo_1a5"
  ) {
    const grupos = extrairGruposDoPalpite(palpite);
    if (grupos.length === 0) return palpite;
    return grupos.map((g) => descricaoGrupoPorCodigo(g)).join(" - ");
  }

  if (tipo === "duque_dezena" || tipo === "terno_dezena") {
    const dezenas = extrairGruposDoPalpite(palpite);
    if (dezenas.length === 0) return palpite;
    return dezenas.map((d) => String(d).padStart(2, "0")).join(" - ");
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

  const tipo = normalizarTipoAposta(aposta.tipo);
  let ganhou = false;
  const palpite = String(aposta.palpite || "").trim();
  const dezenasResultado = numerosResultado.map((n) => n.slice(-2));
  const gruposPrimeiros2 = gruposResultado.slice(0, 2);

  if (tipo === "grupo") {
    ganhou = gruposResultado.includes(palpite);
  } else if (tipo === "dupla_grupo") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "terno_grupo") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "duque_dezena") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (tipo === "terno_dezena") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((d) => dezenasResultado.includes(d));
  } else if (tipo === "passe_seco") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      alvo[0] === gruposPrimeiros2[0] &&
      alvo[1] === gruposPrimeiros2[1];
  } else if (tipo === "passe_vai_vem") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou =
      alvo.length === 2 &&
      gruposPrimeiros2.length === 2 &&
      ((alvo[0] === gruposPrimeiros2[0] && alvo[1] === gruposPrimeiros2[1]) ||
        (alvo[0] === gruposPrimeiros2[1] && alvo[1] === gruposPrimeiros2[0]));
  } else if (tipo === "dupla_grupo_1a5") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 2 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "terno_grupo_1a5") {
    const alvo = extrairGruposDoPalpite(palpite);
    ganhou = alvo.length === 3 && alvo.every((g) => gruposResultado.includes(g));
  } else if (tipo === "milhar") {
    ganhou = numerosResultado.includes(palpite);
  } else if (tipo === "centena") {
    ganhou = numerosResultado.some((n) => n.slice(-3) === palpite);
  } else if (tipo === "dezena") {
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

function parseDezenasPalpite(valor, quantidade) {
  const bruto = String(valor || "").trim();
  const apenasDigitos = extrairDigitos(bruto);
  const temSeparador = /\D/.test(bruto);

  if (!temSeparador && apenasDigitos.length !== quantidade * 2) {
    return { ok: false, mensagem: `Informe ${quantidade} dezenas com 2 dígitos cada.` };
  }

  const encontrados = (bruto.match(/\d{1,2}/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n));

  if (encontrados.length !== quantidade) {
    return { ok: false, mensagem: `Informe ${quantidade} dezenas.` };
  }

  if (encontrados.some((d) => d < 0 || d > 99)) {
    return { ok: false, mensagem: "Dezena deve ser de 00 a 99." };
  }

  return {
    ok: true,
    valor: encontrados.map((d) => String(d).padStart(2, "0")).join("-")
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

  if (tipo === "duque_dezena") {
    return parseDezenasPalpite(palpiteTxt, 2);
  }

  if (tipo === "terno_dezena") {
    return parseDezenasPalpite(palpiteTxt, 3);
  }

  if (tipo === "passe_seco" || tipo === "passe_vai_vem" || tipo === "dupla_grupo_1a5") {
    return parseGruposPalpite(palpiteTxt, 2);
  }

  if (tipo === "terno_grupo_1a5") {
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
  const data =
    normalizarDataISO(raw.data) ||
    normalizarDataISO(raw.date) ||
    normalizarDataISO(raw.createdAt) ||
    hojeISO();

  if (!dataDentroDaJanela(data)) return null;

  const loteria = normalizarNomeLoteriaPorData(praca, raw.loteria, data);
  const tipo = normalizarTipoAposta(raw.tipo);
  const palpiteBruto = String(raw.palpite || "").trim();
  const validacaoPalpite = validarPalpiteAposta(tipo, palpiteBruto);
  if (!loteria || !tipo || !validacaoPalpite.ok) return null;

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
  const bilheteIdRaw = String(raw.bilheteId || "").trim();
  const bilheteId = bilheteIdRaw || gerarBilheteIdAposta(data, praca, loteria, usuarioId, usuarioLogin);

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
    usuarioLogin,
    bilheteId
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

function diaSemanaDaDataISO(dataISO) {
  const data = normalizarDataISO(dataISO);
  if (!data) return null;
  const d = new Date(`${data}T00:00:00`);
  const dia = d.getDay();
  return Number.isInteger(dia) ? dia : null;
}

function normalizarNomeLoteriaPorData(praca, loteria, dataISO) {
  const nome = String(loteria || "").trim();
  if (!nome) return "";
  if (praca !== "Rio") return nome;

  if (nome === "COR 21:20") {
    return "COR 21:30";
  }

  const diaSemana = diaSemanaDaDataISO(dataISO);
  const isQuartaOuSabado = diaSemana === 3 || diaSemana === 6;

  if (isQuartaOuSabado && nome === "PTN 18:20") {
    return "FEDERAL 20:00";
  }

  return nome;
}

function loteriasDaPraca(praca, dataISO) {
  const listaPraca = SEQUENCIAS_POR_PRACA[praca];
  if (!Array.isArray(listaPraca)) return [];

  if (praca !== "Rio") return listaPraca.slice();

  const dataBase = normalizarDataISO(dataISO) || dataSelecionada || hojeISO();
  const diaSemana = diaSemanaDaDataISO(dataBase);
  const isQuartaOuSabado = diaSemana === 3 || diaSemana === 6;

  if (!isQuartaOuSabado) return listaPraca.slice();

  return listaPraca.map((loteria) => normalizarNomeLoteriaPorData(praca, loteria, dataBase));
}

function ordemPraca(praca) {
  const idx = PRACAS_ORDENADAS.findIndex((nome) => nome === praca);
  return idx === -1 ? 100000 : idx;
}

function ordemLoteria(praca, nome, dataISO) {
  const limpo = String(nome || "").trim();
  const index = loteriasDaPraca(praca, dataISO).findIndex((item) => item === limpo);
  if (index !== -1) return index;
  const minutos = extrairMinutosDoHorario(limpo);
  if (minutos !== Number.MAX_SAFE_INTEGER) return 100 + minutos;
  return 100000;
}

function compararPorHorario(a, b) {
  const ordemPracaA = ordemPraca(a.praca);
  const ordemPracaB = ordemPraca(b.praca);
  if (ordemPracaA !== ordemPracaB) return ordemPracaA - ordemPracaB;

  const ordemA = ordemLoteria(a.praca, a.loteria, a.data);
  const ordemB = ordemLoteria(b.praca, b.loteria, b.data);
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
  const data =
    normalizarDataISO(raw.data) ||
    normalizarDataISO(raw.date) ||
    normalizarDataISO(raw.createdAt) ||
    hojeISO();

  if (!dataDentroDaJanela(data)) return null;

  const loteria = normalizarNomeLoteriaPorData(praca, raw.loteria, data);
  const resultados = normalizarResultados(raw);
  if (!loteria || resultados.length === 0) return null;

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

function carregarAtualizacaoDadosLocal() {
  const bruto = Number(localStorage.getItem(DADOS_UPDATED_AT_KEY));
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return Math.floor(bruto);
}

function salvarAtualizacaoDadosLocal(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const finalTs = Math.floor(ts);
  localStorage.setItem(DADOS_UPDATED_AT_KEY, String(finalTs));
  return finalTs;
}

function carregarAtualizacaoPainelLocal() {
  const bruto = Number(localStorage.getItem(PAINEL_UPDATED_AT_KEY));
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return Math.floor(bruto);
}

function salvarAtualizacaoPainelLocal(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const finalTs = Math.floor(ts);
  localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(finalTs));
  return finalTs;
}

function serializarResultadosParaHash(arr) {
  const sane = sanitizarLista(arr).map((item) => ({
    praca: item.praca,
    data: item.data,
    loteria: item.loteria,
    resultados: (Array.isArray(item.resultados) ? item.resultados : []).map((r) => ({
      numero: String(r.numero || ""),
      grupo: String(r.grupo || ""),
      animal: String(r.animal || "")
    }))
  }));

  sane.sort((a, b) => {
    if (a.data !== b.data) return String(a.data).localeCompare(String(b.data));
    return compararPorHorario(a, b);
  });
  return JSON.stringify(sane);
}

function serializarPainelParaHash(listaUsuarios, listaApostas) {
  const usuariosSane = sanitizarUsuarios(listaUsuarios).map((item) => ({
    id: item.id,
    nome: item.nome,
    login: item.login,
    senha: item.senha,
    saldo: normalizarSaldoUsuario(item.saldo),
    telefone: normalizarTelefoneUsuario(item.telefone),
    chavePix: normalizarChavePixUsuario(item.chavePix)
  }));

  usuariosSane.sort((a, b) =>
    String(a.login || "").localeCompare(String(b.login || ""), "pt-BR")
  );

  const apostasSane = sanitizarApostas(listaApostas).map((item) => ({
    id: item.id,
    data: item.data,
    praca: item.praca,
    loteria: item.loteria,
    bilheteId: item.bilheteId,
    tipo: item.tipo,
    palpite: item.palpite,
    valor: item.valor,
    premio: item.premio,
    createdAt: item.createdAt,
    usuarioId: item.usuarioId,
    usuarioLogin: item.usuarioLogin
  }));

  apostasSane.sort((a, b) => {
    if (a.data !== b.data) {
      return String(a.data).localeCompare(String(b.data), "pt-BR");
    }
    const ordemHorario = compararPorHorario(a, b);
    if (ordemHorario !== 0) return ordemHorario;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""), "pt-BR");
  });

  return JSON.stringify({
    usuarios: usuariosSane,
    apostas: apostasSane
  });
}

function agendarPushResultadosRemotos(delayMs) {
  if (!sincronizacaoResultadosAtiva || aplicandoResultadosRemotos) return;
  const delay = Number.isFinite(delayMs) ? Math.max(100, delayMs) : 500;

  if (pushResultadosRemotosTimer) {
    clearTimeout(pushResultadosRemotosTimer);
  }

  pushResultadosRemotosTimer = window.setTimeout(() => {
    sincronizarResultadosRemotos("push");
  }, delay);
}

async function fetchComTimeout(url, opcoes, timeoutMs) {
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 8000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...(opcoes || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function buscarEstadoResultadosRemotos() {
  const url = `${RESULTADOS_SYNC_API_URL}?t=${Date.now()}`;
  const resp = await fetchComTimeout(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      cache: "no-store"
    },
    7000
  );

  if (!resp.ok) {
    throw new Error(`Falha na leitura remota (${resp.status}).`);
  }

  const payload = await resp.json();
  const origem = payload && typeof payload === "object" ? payload : {};
  const resultados = sanitizarLista(origem.resultados);
  const updatedAt = Number(origem.updatedAt);

  return {
    resultados,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0
  };
}

async function enviarEstadoResultadosRemotos(timestamp) {
  const ts = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : Date.now();
  const payload = {
    updatedAt: ts,
    resultados: sanitizarLista(lista)
  };

  const resp = await fetchComTimeout(
    RESULTADOS_SYNC_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    },
    10000
  );

  if (!resp.ok) {
    throw new Error(`Falha no envio remoto (${resp.status}).`);
  }

  return ts;
}

function aplicarEstadoResultadosRemotos(estadoRemoto) {
  const remoto = estadoRemoto && typeof estadoRemoto === "object" ? estadoRemoto : {};
  const resultadosRemotos = sanitizarLista(remoto.resultados);
  const updatedAtRemoto = Number(remoto.updatedAt);
  const updatedAtValido =
    Number.isFinite(updatedAtRemoto) && updatedAtRemoto > 0 ? Math.floor(updatedAtRemoto) : 0;

  aplicandoResultadosRemotos = true;
  lista = resultadosRemotos;
  salvarDados({
    atualizarTimestamp: false,
    pularSyncRemoto: true
  });
  aplicandoResultadosRemotos = false;

  if (updatedAtValido > 0) {
    salvarAtualizacaoDadosLocal(updatedAtValido);
  }
}

async function sincronizarResultadosRemotos(modo) {
  if (!sincronizacaoResultadosAtiva) return;

  try {
    const estadoRemoto = await buscarEstadoResultadosRemotos();
    const atualizadoLocal = carregarAtualizacaoDadosLocal();
    const atualizadoRemoto = estadoRemoto.updatedAt;

    const hashLocal = serializarResultadosParaHash(lista);
    const hashRemoto = serializarResultadosParaHash(estadoRemoto.resultados);

    if (atualizadoRemoto > atualizadoLocal) {
      if (estadoRemoto.resultados.length === 0 && lista.length > 0) {
        const tsRecuperacao = Date.now();
        const tsEnviado = await enviarEstadoResultadosRemotos(tsRecuperacao);
        salvarAtualizacaoDadosLocal(tsEnviado);
        return;
      }
      aplicarEstadoResultadosRemotos(estadoRemoto);
      mostrar();
      return;
    }

    if (atualizadoLocal > atualizadoRemoto) {
      const tsEnviado = await enviarEstadoResultadosRemotos(atualizadoLocal);
      salvarAtualizacaoDadosLocal(tsEnviado);
      return;
    }

    if (hashLocal === hashRemoto) return;

    if (modo === "bootstrap" && lista.length > 0 && estadoRemoto.resultados.length === 0) {
      const tsBootstrap = Date.now();
      const tsEnviado = await enviarEstadoResultadosRemotos(tsBootstrap);
      salvarAtualizacaoDadosLocal(tsEnviado);
      return;
    }

    if (modo === "push") {
      const tsPush = Date.now();
      const tsEnviado = await enviarEstadoResultadosRemotos(tsPush);
      salvarAtualizacaoDadosLocal(tsEnviado);
      return;
    }

    aplicarEstadoResultadosRemotos(estadoRemoto);
    mostrar();
  } catch (_err) {
    // Falha remota: o app segue funcionando com armazenamento local.
  }
}

async function inicializarSincronizacaoResultadosRemotos() {
  if (!window.fetch) return;

  try {
    await buscarEstadoResultadosRemotos();
    sincronizacaoResultadosAtiva = true;
  } catch (_err) {
    sincronizacaoResultadosAtiva = false;
    return;
  }

  await sincronizarResultadosRemotos("bootstrap");

  if (!sincronizacaoResultadosTimer) {
    sincronizacaoResultadosTimer = window.setInterval(() => {
      sincronizarResultadosRemotos("pull");
    }, RESULTADOS_SYNC_INTERVALO_MS);
  }
}

function agendarPushPainelRemoto(delayMs) {
  if (!sincronizacaoPainelAtiva || aplicandoPainelRemoto) return;
  const delay = Number.isFinite(delayMs) ? Math.max(100, delayMs) : 500;

  if (pushPainelRemotoTimer) {
    clearTimeout(pushPainelRemotoTimer);
  }

  pushPainelRemotoTimer = window.setTimeout(() => {
    sincronizarPainelRemoto("push");
  }, delay);
}

async function buscarEstadoPainelRemoto() {
  const url = `${PAINEL_SYNC_API_URL}?t=${Date.now()}`;
  const resp = await fetchComTimeout(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      cache: "no-store"
    },
    7000
  );

  if (!resp.ok) {
    throw new Error(`Falha na leitura remota do painel (${resp.status}).`);
  }

  const payload = await resp.json();
  const origem = payload && typeof payload === "object" ? payload : {};
  const usuariosRemotos = sanitizarUsuarios(origem.usuarios);
  const apostasRemotas = sanitizarApostas(origem.apostas);
  const updatedAt = Number(origem.updatedAt);

  return {
    usuarios: usuariosRemotos,
    apostas: apostasRemotas,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0
  };
}

async function enviarEstadoPainelRemoto(timestamp) {
  const ts = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : Date.now();
  const payload = {
    updatedAt: ts,
    usuarios: sanitizarUsuarios(usuarios),
    apostas: sanitizarApostas(apostas)
  };

  const resp = await fetchComTimeout(
    PAINEL_SYNC_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    },
    10000
  );

  if (!resp.ok) {
    throw new Error(`Falha no envio remoto do painel (${resp.status}).`);
  }

  return ts;
}

function aplicarEstadoPainelRemoto(estadoRemoto) {
  const remoto = estadoRemoto && typeof estadoRemoto === "object" ? estadoRemoto : {};
  const usuariosRemotos = sanitizarUsuarios(remoto.usuarios);
  const apostasRemotas = sanitizarApostas(remoto.apostas);
  const updatedAtRemoto = Number(remoto.updatedAt);
  const updatedAtValido =
    Number.isFinite(updatedAtRemoto) && updatedAtRemoto > 0 ? Math.floor(updatedAtRemoto) : 0;

  aplicandoPainelRemoto = true;
  usuarios = usuariosRemotos;
  apostas = apostasRemotas;
  salvarUsuarios({
    atualizarTimestamp: false,
    pularSyncRemoto: true
  });
  salvarApostas({
    atualizarTimestamp: false,
    pularSyncRemoto: true
  });
  aplicandoPainelRemoto = false;

  usuarioAtual = carregarSessaoUsuario();
  salvarSessaoUsuario();

  if (updatedAtValido > 0) {
    salvarAtualizacaoPainelLocal(updatedAtValido);
  }
}

async function sincronizarPainelRemoto(modo) {
  if (!sincronizacaoPainelAtiva) return;

  try {
    const estadoRemoto = await buscarEstadoPainelRemoto();
    const atualizadoLocal = carregarAtualizacaoPainelLocal();
    const atualizadoRemoto = estadoRemoto.updatedAt;

    const hashLocal = serializarPainelParaHash(usuarios, apostas);
    const hashRemoto = serializarPainelParaHash(
      estadoRemoto.usuarios,
      estadoRemoto.apostas
    );

    const remotoVazio =
      estadoRemoto.usuarios.length === 0 && estadoRemoto.apostas.length === 0;
    const localVazio = usuarios.length === 0 && apostas.length === 0;

    if (atualizadoRemoto > atualizadoLocal) {
      if (!localVazio && remotoVazio) {
        const tsRecuperacao = Date.now();
        const tsEnviado = await enviarEstadoPainelRemoto(tsRecuperacao);
        salvarAtualizacaoPainelLocal(tsEnviado);
        return;
      }
      aplicarEstadoPainelRemoto(estadoRemoto);
      atualizarVisibilidadeUsuario();
      mostrar();
      return;
    }

    if (atualizadoLocal > atualizadoRemoto) {
      const tsEnviado = await enviarEstadoPainelRemoto(atualizadoLocal);
      salvarAtualizacaoPainelLocal(tsEnviado);
      return;
    }

    if (hashLocal === hashRemoto) return;

    if (modo === "bootstrap" && !localVazio && remotoVazio) {
      const tsBootstrap = Date.now();
      const tsEnviado = await enviarEstadoPainelRemoto(tsBootstrap);
      salvarAtualizacaoPainelLocal(tsEnviado);
      return;
    }

    if (modo === "push") {
      const tsPush = Date.now();
      const tsEnviado = await enviarEstadoPainelRemoto(tsPush);
      salvarAtualizacaoPainelLocal(tsEnviado);
      return;
    }

    aplicarEstadoPainelRemoto(estadoRemoto);
    atualizarVisibilidadeUsuario();
    mostrar();
  } catch (_err) {
    // Falha remota: o app segue funcionando com armazenamento local.
  }
}

async function inicializarSincronizacaoPainelRemoto() {
  if (!window.fetch) return;

  try {
    await buscarEstadoPainelRemoto();
    sincronizacaoPainelAtiva = true;
  } catch (_err) {
    sincronizacaoPainelAtiva = false;
    return;
  }

  await sincronizarPainelRemoto("bootstrap");

  if (!sincronizacaoPainelTimer) {
    sincronizacaoPainelTimer = window.setInterval(() => {
      sincronizarPainelRemoto("pull");
    }, PAINEL_SYNC_INTERVALO_MS);
  }
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

function salvarDados(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const atualizarTimestamp = cfg.atualizarTimestamp !== false;
  const pularSyncRemoto = cfg.pularSyncRemoto === true;

  lista = sanitizarLista(lista);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));

  if (atualizarTimestamp) {
    salvarAtualizacaoDadosLocal(Date.now());
  }

  if (!pularSyncRemoto) {
    agendarPushResultadosRemotos(500);
  }
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

function salvarApostas(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const atualizarTimestamp = cfg.atualizarTimestamp !== false;
  const pularSyncRemoto = cfg.pularSyncRemoto === true;

  apostas = sanitizarApostas(apostas);
  localStorage.setItem(APOSTAS_KEY, JSON.stringify(apostas));

  if (atualizarTimestamp) {
    salvarAtualizacaoPainelLocal(Date.now());
  }

  if (!pularSyncRemoto && !aplicandoPainelRemoto) {
    agendarPushPainelRemoto(500);
  }
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

function salvarUsuarios(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const atualizarTimestamp = cfg.atualizarTimestamp !== false;
  const pularSyncRemoto = cfg.pularSyncRemoto === true;

  usuarios = sanitizarUsuarios(usuarios);
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));

  if (atualizarTimestamp) {
    salvarAtualizacaoPainelLocal(Date.now());
  }

  if (!pularSyncRemoto && !aplicandoPainelRemoto) {
    agendarPushPainelRemoto(500);
  }
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

  selectPraca.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = PRACA_FIXA;
  opt.textContent = PRACA_FIXA;
  selectPraca.appendChild(opt);
  selectPraca.value = PRACA_FIXA;
  selectPraca.disabled = true;
}

function popularPracasAposta() {
  const selectPraca = document.getElementById("pracaAposta");
  if (!selectPraca) return;

  selectPraca.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = PRACA_FIXA;
  opt.textContent = PRACA_FIXA;
  selectPraca.appendChild(opt);
  selectPraca.value = PRACA_FIXA;
  selectPraca.disabled = true;
}

function popularLoterias() {
  const selectPraca = document.getElementById("praca");
  const selectLoteria = document.getElementById("loteria");
  if (!selectPraca || !selectLoteria) return;

  const atual = selectLoteria.value;
  const praca = selectPraca.value;
  const dataResultado = normalizarDataISO(
    document.getElementById("dataResultado")?.value || dataSelecionada || hojeISO()
  );
  const listaPraca = loteriasDaPraca(praca, dataResultado);

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
  const listaPraca = loteriasDaPraca(praca, dataISO);
  const data = normalizarDataISO(dataISO);
  if (!data) return listaPraca.slice();
  return listaPraca.filter((loteria) => loteriaAbertaParaAposta(data, loteria));
}

function apostasEncerradasNoDia(praca, dataISO) {
  const data = normalizarDataISO(dataISO);
  if (!data || !praca) return false;
  const listaPraca = loteriasDaPraca(praca, data);
  if (!Array.isArray(listaPraca) || listaPraca.length === 0) return false;
  const ultimaLoteria = listaPraca[listaPraca.length - 1];
  const restante = segundosAteFechamento(data, ultimaLoteria);
  return restante !== null && restante <= 0;
}

function atualizarEstadoSecaoApostas(encerrada, opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const encerradaFinal = Boolean(encerrada);
  const card = document.getElementById("cardApostas");
  const loteriaInput = document.getElementById("loteriaAposta");

  if (card) {
    card.classList.toggle("card-apostas-encerrada", encerradaFinal);
  }

  const idsControles = [
    "valorDepositoUsuario",
    "tipoAposta",
    "palpiteAposta",
    "valorAposta",
    "palpiteGrupo1",
    "palpiteGrupo2",
    "palpiteGrupo3",
    "btnEditarPalpiteGrupo",
    "btnPalpiteGrupoPrev",
    "btnPalpiteGrupoNext",
    "btnLimparPalpiteGrupo"
  ];

  idsControles.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = encerradaFinal;
  });

  const botoes = document.querySelectorAll(
    "#cardApostas .linha-deposito-aposta button, " +
    "#cardApostas .palpite-grupo-slots button, " +
    "#cardApostas .acoes-bilhete-aposta button, " +
    "#cardApostas > button[onclick=\"salvarAposta()\"]"
  );
  botoes.forEach((btn) => {
    btn.disabled = encerradaFinal;
  });

  if (loteriaInput) {
    if (encerradaFinal) {
      loteriaInput.disabled = true;
    } else if (typeof cfg.loteriaDesabilitada === "boolean") {
      loteriaInput.disabled = cfg.loteriaDesabilitada;
    }
  }

  if (encerradaFinal && !secaoApostasEncerrada) {
    limparBilheteRascunho({
      limparCampos: false
    });
    limparCamposAposta();
  }

  secaoApostasEncerrada = encerradaFinal;
  atualizarVisibilidadeApostas();
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
  const encerrada = apostasEncerradasNoDia(praca, dataAposta);
  hashLoteriasApostaDisponiveis = hashDisponibilidadeLoteriasAposta(praca, dataAposta);

  selectLoteria.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = encerrada
    ? "Apostas encerradas"
    : listaDisponivel.length === 0
      ? "Sem horários disponíveis"
      : "Selecione a loteria";
  selectLoteria.appendChild(placeholder);

  listaDisponivel.forEach((loteria) => {
    const opt = document.createElement("option");
    opt.value = loteria;
    opt.textContent = loteria;
    selectLoteria.appendChild(opt);
  });

  if (atual) {
    const existe = Array.from(selectLoteria.options).some((opt) => opt.value === atual);
    selectLoteria.value = existe ? atual : "";
  }

  atualizarEstadoSecaoApostas(encerrada, {
    loteriaDesabilitada: listaDisponivel.length === 0
  });
  atualizarCronometroApostaFormulario();
}

function popularFiltroPracas() {
  const filtro = document.getElementById("filtroPraca");
  if (!filtro) return;
  filtro.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = PRACA_FIXA;
  opt.textContent = PRACA_FIXA;
  filtro.appendChild(opt);
  filtro.value = PRACA_FIXA;
  filtro.disabled = true;
}

function selecionarPracaAdmin(_valor) {
  const selectPraca = document.getElementById("praca");
  if (!selectPraca) return;
  selectPraca.value = PRACA_FIXA;
  popularLoterias();
}

function obterPracaFiltroAtual() {
  return PRACA_FIXA;
}

function selecionarPracaFiltro(_valor) {
  const filtro = document.getElementById("filtroPraca");
  if (filtro) {
    filtro.value = PRACA_FIXA;
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

  const dataResultado = document.getElementById("dataResultado");
  if (dataResultado) {
    dataResultado.addEventListener("change", () => {
      popularLoterias();
    });
  }

  const dataHistoricoApostas = document.getElementById("dataHistoricoApostas");
  if (dataHistoricoApostas) {
    dataHistoricoApostas.addEventListener("change", () => {
      obterDataHistoricoApostasSelecionada();
      mostrarHistoricoApostasUsuario();
    });
  }
}

function atualizarDestaqueCarrosselResultados() {
  const container = document.getElementById("resultados");
  if (!container) return;

  const cards = Array.from(container.querySelectorAll(".resultado-card"));
  const ativarCarrossel = window.innerWidth <= 820 && cards.length > 1;

  container.classList.toggle("tem-carrossel", ativarCarrossel);

  if (!ativarCarrossel) {
    cards.forEach((card) => {
      card.classList.remove("resultado-card-ativo");
    });
    return;
  }

  const centroContainer = container.scrollLeft + container.clientWidth / 2;
  let menorDistancia = Number.POSITIVE_INFINITY;
  let cardAtivo = cards[0] || null;

  cards.forEach((card) => {
    const centroCard = card.offsetLeft + card.offsetWidth / 2;
    const distancia = Math.abs(centroCard - centroContainer);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      cardAtivo = card;
    }
  });

  cards.forEach((card) => {
    card.classList.toggle("resultado-card-ativo", card === cardAtivo);
  });
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
    atualizarDestaqueCarrosselResultados();
    return;
  }

  btnPrev.disabled = container.scrollLeft <= 1;
  btnNext.disabled = container.scrollLeft >= maxScroll - 1;
  atualizarDestaqueCarrosselResultados();
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
  if (tipo === "passe_seco") return 2;
  if (tipo === "passe_vai_vem") return 2;
  if (tipo === "dupla_grupo_1a5") return 2;
  if (tipo === "terno_grupo_1a5") return 3;
  return 0;
}

function limiteDigitosPalpitePorTipo(tipo) {
  if (tipo === "duque_dezena") return 4;
  if (tipo === "terno_dezena") return 6;
  if (tipo === "milhar") return 4;
  if (tipo === "centena") return 3;
  if (tipo === "dezena") return 2;
  return 10;
}

function placeholderPalpitePorTipo(tipo) {
  if (tipo === "duque_dezena") return "Duque de Dezena (ex: 12-34)";
  if (tipo === "terno_dezena") return "Terno de Dezena (ex: 12-34-56)";
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

function valorSelecionadoPalpiteGrupo(indice) {
  const select = document.getElementById("palpiteGrupo" + indice);
  return String(select ? select.value : "").trim();
}

function definirValorPalpiteGrupo(indice, valor) {
  const select = document.getElementById("palpiteGrupo" + indice);
  if (!select) return;
  const valorNorm = String(valor || "").trim();
  const existe = Array.from(select.options).some((opt) => opt.value === valorNorm);
  select.value = existe ? valorNorm : "";
}

function quantidadeGruposNoFormularioAposta() {
  const tipoInput = document.getElementById("tipoAposta");
  if (!tipoInput) return 0;
  const tipo = normalizarTipoAposta(tipoInput.value);
  return quantidadeGruposPorTipoAposta(tipo);
}

function primeiroSlotVazioPalpiteGrupo(quantidade) {
  for (let i = 1; i <= quantidade; i++) {
    if (!valorSelecionadoPalpiteGrupo(i)) return i;
  }
  return 1;
}

function quantidadeSelecionadaPalpiteGrupo(quantidade) {
  let total = 0;
  for (let i = 1; i <= quantidade; i++) {
    if (valorSelecionadoPalpiteGrupo(i)) total += 1;
  }
  return total;
}

function montarGradeBichosPalpiteGrupo() {
  const grade = document.getElementById("palpiteGrupoGrade");
  if (!grade) return;
  if (grade.childElementCount > 0) return;

  for (let grupo = 1; grupo <= 25; grupo++) {
    const grupoTxt = String(grupo).padStart(2, "0");
    const animal = pegarAnimal(grupo);
    const nomeAnimal = capitalizar(animal);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "palpite-bicho-card";
    card.dataset.grupo = grupoTxt;
    card.innerHTML =
      `<img src="img/animais/${animal}.png" alt="${nomeAnimal}">` +
      `<span class="palpite-bicho-card-nome">${nomeAnimal}</span>` +
      `<span class="palpite-bicho-card-grupo">Grupo ${grupoTxt}</span>`;
    card.addEventListener("click", () => {
      selecionarBichoDaGradePalpiteGrupo(grupoTxt);
    });
    grade.appendChild(card);
  }
}

function atualizarBotoesCarrosselPalpiteGrupo() {
  const container = document.getElementById("palpiteGrupoGrade");
  const btnPrev = document.getElementById("btnPalpiteGrupoPrev");
  const btnNext = document.getElementById("btnPalpiteGrupoNext");
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

function rolarCarrosselPalpiteGrupo(sentido) {
  const container = document.getElementById("palpiteGrupoGrade");
  if (!container) return;

  const deslocamento = Math.max(130, container.clientWidth * 0.78) * sentido;
  container.scrollBy({
    left: deslocamento,
    behavior: "smooth"
  });

  window.setTimeout(atualizarBotoesCarrosselPalpiteGrupo, 260);
}

function centralizarCardCarrosselPalpiteGrupo(grupoTxt) {
  const container = document.getElementById("palpiteGrupoGrade");
  if (!container || !grupoTxt) return;
  const alvo = container.querySelector(`button[data-grupo="${grupoTxt}"]`);
  if (!alvo) return;

  const destino = alvo.offsetLeft - (container.clientWidth - alvo.offsetWidth) / 2;
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const left = Math.min(Math.max(0, destino), maxScroll);
  container.scrollTo({
    left,
    behavior: "smooth"
  });
}

function renderizarSelecaoPalpiteGrupoPorImagem() {
  const container = document.getElementById("palpiteGrupoContainer");
  const dica = document.getElementById("palpiteGrupoDica");
  const grade = document.getElementById("palpiteGrupoGrade");
  const editor = document.getElementById("palpiteGrupoEditor");
  const btnEditar = document.getElementById("btnEditarPalpiteGrupo");
  if (!container || !dica || !grade || !editor || !btnEditar) return;

  const quantidade = quantidadeGruposNoFormularioAposta();
  if (quantidade <= 0) {
    dica.innerText = "";
    editor.style.display = "none";
    btnEditar.style.display = "none";
    atualizarBotoesCarrosselPalpiteGrupo();
    return;
  }

  if (slotGrupoAtivo < 1 || slotGrupoAtivo > quantidade) {
    slotGrupoAtivo = primeiroSlotVazioPalpiteGrupo(quantidade);
  }

  const gruposSelecionados = [];
  for (let i = 1; i <= quantidade; i++) {
    gruposSelecionados.push(valorSelecionadoPalpiteGrupo(i));
  }
  const qtdSelecionados = quantidadeSelecionadaPalpiteGrupo(quantidade);
  const completo = qtdSelecionados === quantidade;

  if (!completo) {
    editorPalpiteGrupoAberto = true;
  }

  const exibirEditor = !completo || editorPalpiteGrupoAberto;
  editor.style.display = exibirEditor ? "grid" : "none";
  btnEditar.style.display = completo && !editorPalpiteGrupoAberto ? "block" : "none";

  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById("palpiteGrupoSlot" + i);
    if (!slot) continue;

    const ativo = i <= quantidade;
    const valor = valorSelecionadoPalpiteGrupo(i);
    const img = slot.querySelector("img");
    const titulo = slot.querySelector(".palpite-grupo-slot-titulo");
    const nome = slot.querySelector(".palpite-grupo-slot-nome");

    slot.style.display = ativo ? "flex" : "none";
    slot.disabled = !ativo;
    slot.classList.toggle("ativo", ativo && i === slotGrupoAtivo);
    slot.dataset.grupo = valor;

    if (titulo) titulo.innerText = `${i}o bicho`;

    if (ativo && valor) {
      const grupoNum = Number(valor);
      const animal = pegarAnimal(grupoNum);
      const nomeAnimal = capitalizar(animal);
      if (img) {
        img.src = `img/animais/${animal}.png`;
        img.alt = nomeAnimal;
        img.style.opacity = "1";
      }
      if (nome) nome.innerText = `${nomeAnimal} (${String(grupoNum).padStart(2, "0")})`;
    } else {
      if (img) {
        img.removeAttribute("src");
        img.alt = "";
        img.style.opacity = "0.38";
      }
      if (nome) nome.innerText = "Toque em um bicho";
    }
  }

  const faltam = Math.max(0, quantidade - qtdSelecionados);
  dica.innerText =
    faltam > 0
      ? `Escolha ${faltam} bicho${faltam > 1 ? "s" : ""}.`
      : "Selecao completa.";

  const grupoAtivo = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
  const cards = grade.querySelectorAll("button[data-grupo]");
  cards.forEach((card) => {
    const grupo = String(card.dataset.grupo || "");
    card.classList.toggle("selecionado", gruposSelecionados.includes(grupo));
    card.classList.toggle("selecionado-ativo", Boolean(grupoAtivo) && grupo === grupoAtivo);
  });

  atualizarBotoesCarrosselPalpiteGrupo();
}

function selecionarBichoDaGradePalpiteGrupo(grupoTxt) {
  const quantidade = quantidadeGruposNoFormularioAposta();
  if (quantidade <= 0) return;

  if (slotGrupoAtivo < 1 || slotGrupoAtivo > quantidade) {
    slotGrupoAtivo = primeiroSlotVazioPalpiteGrupo(quantidade);
  }

  const atual = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
  if (atual === grupoTxt) {
    definirValorPalpiteGrupo(slotGrupoAtivo, "");
  } else {
    definirValorPalpiteGrupo(slotGrupoAtivo, grupoTxt);
    if (slotGrupoAtivo < quantidade) {
      slotGrupoAtivo += 1;
      if (valorSelecionadoPalpiteGrupo(slotGrupoAtivo)) {
        slotGrupoAtivo = primeiroSlotVazioPalpiteGrupo(quantidade);
      }
    }
  }

  const qtdSelecionados = quantidadeSelecionadaPalpiteGrupo(quantidade);
  editorPalpiteGrupoAberto = qtdSelecionados < quantidade;

  sincronizarPalpiteApostaGrupoParaInput();
  renderizarSelecaoPalpiteGrupoPorImagem();
  const grupoAtivo = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
  if (grupoAtivo) {
    centralizarCardCarrosselPalpiteGrupo(grupoAtivo);
  }
}

function limparSelecaoPalpiteGrupoPorImagem() {
  const quantidade = quantidadeGruposNoFormularioAposta();
  for (let i = 1; i <= Math.max(quantidade, 3); i++) {
    definirValorPalpiteGrupo(i, "");
  }
  slotGrupoAtivo = 1;
  editorPalpiteGrupoAberto = true;
  sincronizarPalpiteApostaGrupoParaInput();
  renderizarSelecaoPalpiteGrupoPorImagem();
}

function configurarPalpiteGrupoComImagens() {
  montarGradeBichosPalpiteGrupo();

  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById("palpiteGrupoSlot" + i);
    if (!slot) continue;
    slot.addEventListener("click", () => {
      if (slot.disabled) return;
      slotGrupoAtivo = i;
      editorPalpiteGrupoAberto = true;
      renderizarSelecaoPalpiteGrupoPorImagem();
      const grupoAtivo = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
      if (grupoAtivo) {
        centralizarCardCarrosselPalpiteGrupo(grupoAtivo);
      }
    });
  }

  const container = document.getElementById("palpiteGrupoGrade");
  const btnPrev = document.getElementById("btnPalpiteGrupoPrev");
  const btnNext = document.getElementById("btnPalpiteGrupoNext");
  if (container) {
    container.addEventListener("scroll", atualizarBotoesCarrosselPalpiteGrupo);
    window.addEventListener("resize", atualizarBotoesCarrosselPalpiteGrupo);
  }
  if (btnPrev) btnPrev.addEventListener("click", () => rolarCarrosselPalpiteGrupo(-1));
  if (btnNext) btnNext.addEventListener("click", () => rolarCarrosselPalpiteGrupo(1));

  const btnLimpar = document.getElementById("btnLimparPalpiteGrupo");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", limparSelecaoPalpiteGrupoPorImagem);
  }

  const btnEditar = document.getElementById("btnEditarPalpiteGrupo");
  if (btnEditar) {
    btnEditar.addEventListener("click", () => {
      editorPalpiteGrupoAberto = true;
      renderizarSelecaoPalpiteGrupoPorImagem();
      const grupoAtivo = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
      if (grupoAtivo) {
        centralizarCardCarrosselPalpiteGrupo(grupoAtivo);
      }
    });
  }

  renderizarSelecaoPalpiteGrupoPorImagem();
}

function popularPalpitesGrupo() {
  popularSelectPalpiteGrupo("palpiteGrupo1", "Selecione o bicho");
  popularSelectPalpiteGrupo("palpiteGrupo2", "Selecione o 2o bicho");
  popularSelectPalpiteGrupo("palpiteGrupo3", "Selecione o 3o bicho");
  renderizarSelecaoPalpiteGrupoPorImagem();
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
    const valor = valorSelecionadoPalpiteGrupo(i);
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
  const digitos = extrairDigitos(palpiteInput.value).slice(0, limite);

  if (tipo === "duque_dezena" || tipo === "terno_dezena") {
    const partes = [];
    for (let i = 0; i < digitos.length; i += 2) {
      partes.push(digitos.slice(i, i + 2));
    }
    palpiteInput.value = partes.join("-");
    return;
  }

  palpiteInput.value = digitos;
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
    slotGrupoAtivo = 1;
    editorPalpiteGrupoAberto = true;

    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById("palpiteGrupo" + i);
      if (!select) continue;
      select.disabled = true;
      select.value = "";
    }
    renderizarSelecaoPalpiteGrupoPorImagem();
    return;
  }

  if (quantidade > 0) {
    grupoContainer.style.display = "grid";
    palpiteInput.style.display = "none";
    palpiteInput.readOnly = true;
    palpiteInput.dataset.modoGrupo = "1";
    if (!estavaEmGrupo) {
      editorPalpiteGrupoAberto = true;
    }

    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById("palpiteGrupo" + i);
      if (!select) continue;
      const ativo = i <= quantidade;
      select.disabled = !ativo;
      if (!ativo) select.value = "";
    }

    const qtdSelecionados = quantidadeSelecionadaPalpiteGrupo(quantidade);
    if (qtdSelecionados < quantidade) {
      editorPalpiteGrupoAberto = true;
    }

    slotGrupoAtivo = primeiroSlotVazioPalpiteGrupo(quantidade);
    sincronizarPalpiteApostaGrupoParaInput();
    renderizarSelecaoPalpiteGrupoPorImagem();
    const grupoAtivo = valorSelecionadoPalpiteGrupo(slotGrupoAtivo);
    if (grupoAtivo) {
      centralizarCardCarrosselPalpiteGrupo(grupoAtivo);
    }
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
    select.disabled = true;
  }

  if (estavaEmGrupo) {
    palpiteInput.value = "";
  }
  editorPalpiteGrupoAberto = true;
  normalizarPalpiteNumericoDigitado();
  renderizarSelecaoPalpiteGrupoPorImagem();
}

function atualizarPreviewPremiacaoAposta() {
  const tipoInput = document.getElementById("tipoAposta");
  const valorInput = document.getElementById("valorAposta");
  const bloco = document.getElementById("blocoPremiacaoAposta");
  const destaque = document.getElementById("destaquePremiacaoAposta");

  if (!tipoInput || !valorInput || !bloco || !destaque) return;

  const tipo = normalizarTipoAposta(tipoInput.value);
  const valor = normalizarValorMoeda(valorInput.value);

  if (!tipo || !valor) {
    destaque.innerText = "";
    destaque.classList.remove("ativo");
    bloco.classList.remove("ativa");
    return;
  }

  const premio = calcularPremiacaoFicticia(tipo, valor);
  destaque.innerText = `Possível Prêmio: ${formatarMoedaBR(premio)}`;
  destaque.classList.add("ativo");
  bloco.classList.add("ativa");
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

function aplicarMascaraValorDepositoUsuario() {
  const input = document.getElementById("valorDepositoUsuario");
  if (!input) return;
  const centavos = centavosDeTextoMoeda(input.value);
  input.value = formatarCentavosComoMoedaBR(centavos);
}

function configurarMascaraValorDepositoUsuario() {
  const input = document.getElementById("valorDepositoUsuario");
  if (!input) return;

  input.addEventListener("keydown", (event) => {
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

  input.addEventListener("paste", (event) => {
    const texto = String(event.clipboardData?.getData("text") || "").trim();

    if (!/^\d+$/.test(texto)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const centavos = Number(texto);
    input.value = formatarCentavosComoMoedaBR(centavos);
  });

  input.addEventListener("drop", (event) => {
    event.preventDefault();
  });

  input.addEventListener("input", () => {
    aplicarMascaraValorDepositoUsuario();
    atualizarStatusDepositoUsuario("", false);
  });

  input.addEventListener("focus", () => {
    if (!String(input.value || "").trim()) {
      input.value = "R$ 0,00";
    }
  });

  aplicarMascaraValorDepositoUsuario();
}

function depositarSaldoUsuario() {
  if (secaoApostasEncerrada) {
    atualizarStatusDepositoUsuario("Apostas encerradas para hoje.", true);
    mostrarConfirmacaoApostaRapida("Apostas encerradas para hoje.", "erro");
    return;
  }

  const usuarioSincronizado = sincronizarUsuarioAtualComLista();
  if (!usuarioSincronizado) {
    atualizarStatusUsuario("Faça login de usuário para depositar.", true);
    mostrarConfirmacaoApostaRapida("Faça login de usuário para depositar.", "erro");
    return;
  }

  const input = document.getElementById("valorDepositoUsuario");
  if (!input) return;

  const valor = normalizarValorMoeda(input.value);
  if (!valor) {
    atualizarStatusDepositoUsuario("Informe um valor de depósito.", true);
    mostrarConfirmacaoApostaRapida("Informe um valor de depósito.", "erro");
    return;
  }

  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    atualizarStatusDepositoUsuario("Informe um valor válido para depósito.", true);
    mostrarConfirmacaoApostaRapida("Informe um valor válido para depósito.", "erro");
    return;
  }

  const saldoAtual = normalizarSaldoUsuario(usuarioSincronizado.saldo);
  const novoSaldo = normalizarSaldoUsuario(saldoAtual + valorNum);
  usuarioSincronizado.saldo = novoSaldo;
  salvarUsuarios();
  salvarSessaoUsuario();
  atualizarCarteiraUsuarioAposta();
  atualizarStatusDepositoUsuario(
    `Depósito fictício confirmado: +${formatarMoedaBR(valorNum)}.`,
    false
  );
  mostrarConfirmacaoApostaRapida("Depósito confirmado com sucesso.");
  input.value = "R$ 0,00";
  mostrarPainelAdmin();
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

  configurarPalpiteGrupoComImagens();
  popularPalpitesGrupo();
  atualizarModoCampoPalpiteAposta();
  configurarMascaraValorAposta();

  atualizarPreviewPremiacaoAposta();
  renderizarBilheteRascunhoAposta();
}

function atualizarCronometroApostaFormulario() {
  const el = document.getElementById("cronometroAposta");
  const dataInput = document.getElementById("dataAposta");
  const loteriaInput = document.getElementById("loteriaAposta");
  const pracaInput = document.getElementById("pracaAposta");
  if (!el || !dataInput || !loteriaInput || !pracaInput) return;

  const data = normalizarDataISO(dataInput.value);
  const praca = String(pracaInput.value || "").trim();
  const loteria = String(loteriaInput.value || "").trim();

  if (data && praca && apostasEncerradasNoDia(praca, data)) {
    el.innerText = "Apostas encerradas para hoje.";
    el.classList.remove("cronometro-aberto");
    el.classList.add("cronometro-encerrado");
    return;
  }

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

function textoCronometroResultadoPara(dataISO, loteria) {
  const restante = segundosAteSorteio(dataISO, loteria);
  if (restante === null) return "Horario do sorteio indisponivel.";
  if (restante > 0) return `Proximo sorteio em ${formatarDuracao(restante)}.`;
  return "Horario atingido. Aguardando divulgacao do resultado.";
}

function atualizarCronometrosResultados() {
  const spans = document.querySelectorAll(".cronometro-resultado");
  if (!spans || spans.length === 0) return;

  spans.forEach((span) => {
    const data = normalizarDataISO(span.dataset.dataResultado || "");
    const loteria = String(span.dataset.loteriaResultado || "").trim();
    if (!data || !loteria) return;

    const restante = segundosAteSorteio(data, loteria);
    span.innerText = textoCronometroResultadoPara(data, loteria);

    span.classList.remove("cronometro-sorteio-aberto", "cronometro-sorteio-encerrado");
    if (restante !== null) {
      span.classList.add(restante > 0 ? "cronometro-sorteio-aberto" : "cronometro-sorteio-encerrado");
    }
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
  atualizarCronometrosResultados();

  if (!cronometroApostaTimer) {
    cronometroApostaTimer = window.setInterval(() => {
      atualizarDisponibilidadeLoteriasAposta(false);
      atualizarCronometroApostaFormulario();
      atualizarCronometrosDaLista();
      atualizarCronometrosResultados();
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
  const dataHistoricoApostas = document.getElementById("dataHistoricoApostas");

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

  if (dataHistoricoApostas) {
    dataHistoricoApostas.min = min;
    dataHistoricoApostas.max = max;
    let dataHistorico = normalizarDataISO(dataHistoricoApostas.value);
    if (!dataHistorico) dataHistorico = dataSelecionada;
    if (dataHistorico < min) dataHistorico = min;
    if (dataHistorico > max) dataHistorico = max;
    dataHistoricoApostas.value = dataHistorico;
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

  mostrarPainelAdmin();
}

function alternarAcessoAdminOculto() {
  if (!PAGINA_ADMIN_SEPARADA) {
    window.location.href = "paginas/admin.html";
    return;
  }

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

function atualizarStatusDepositoUsuario(texto, erro) {
  const status = document.getElementById("statusDepositoUsuario");
  if (!status) return;
  status.style.color = erro ? "#ff6b6b" : "#9fb3c8";
  status.innerText = texto || "";
}

function mostrarConfirmacaoApostaRapida(texto, tipo) {
  const mensagem = String(texto || "").trim() || "Aposta salva!";
  let toast = document.getElementById("toastConfirmacaoAposta");
  const tipoFinal = tipo === "erro" ? "erro" : "sucesso";

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toastConfirmacaoAposta";
    toast.className = "toast-aposta-confirmacao";
    document.body.appendChild(toast);
  }

  toast.innerText = mensagem;
  toast.classList.remove("sucesso", "erro");
  toast.classList.add(tipoFinal);
  toast.classList.add("visivel");

  if (toastRapidoTimer) {
    clearTimeout(toastRapidoTimer);
  }

  toastRapidoTimer = window.setTimeout(() => {
    toast.classList.remove("visivel");
  }, 1000);
}

function sincronizarUsuarioAtualComLista() {
  if (!usuarioAtual) return null;
  const idx = usuarios.findIndex((item) => item.id === usuarioAtual.id);
  if (idx === -1) {
    usuarioAtual = null;
    salvarSessaoUsuario();
    return null;
  }
  usuarioAtual = usuarios[idx];
  return usuarioAtual;
}

function atualizarCarteiraUsuarioAposta() {
  const saldoEl = document.getElementById("saldoUsuarioAposta");
  const saldoCabecalhoEl = document.getElementById("saldoUsuarioCabecalho");
  const usuarioSincronizado = sincronizarUsuarioAtualComLista();
  const saldoAtual = normalizarSaldoUsuario(usuarioSincronizado && usuarioSincronizado.saldo);
  if (saldoEl) saldoEl.innerText = formatarMoedaBR(saldoAtual);
  if (saldoCabecalhoEl) saldoCabecalhoEl.innerText = formatarMoedaBR(saldoAtual);
}

function irHomeCabecalho() {
  irHoje();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirMeuPerfil() {
  if (!usuarioAtual) {
    mostrarConfirmacaoApostaRapida("Faça login para acessar seu perfil.", "erro");
    return;
  }
  window.location.href = "paginas/meu-perfil.html";
}

function abrirDeposito() {
  if (!usuarioAtual) {
    mostrarConfirmacaoApostaRapida("Faça login para acessar a área de depósito.", "erro");
    return;
  }
  window.location.href = "paginas/deposito.html";
}

function abrirPainelLoginUsuario() {
  painelUsuarioAberto = true;
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
  preencherCredenciaisTesteNoFormulario();
  const loginUsuario = document.getElementById("loginUsuario");
  if (loginUsuario) loginUsuario.focus();
}

function atualizarVisibilidadeApostas() {
  const cardApostas = document.getElementById("cardApostas");
  const avisoApostasEncerradas = document.getElementById("avisoApostasEncerradas");
  const logado = Boolean(usuarioAtual);

  if (cardApostas) {
    cardApostas.style.display = logado && !secaoApostasEncerrada ? "block" : "none";
  }

  if (avisoApostasEncerradas) {
    avisoApostasEncerradas.style.display = logado && secaoApostasEncerrada ? "flex" : "none";
  }

  if (!usuarioAtual) {
    atualizarStatusDepositoUsuario("", false);
  }
  atualizarCarteiraUsuarioAposta();
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
  painelUsuarioAberto = true;
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("cadastro");
  atualizarVisibilidadeUsuario();
}

function abrirRecuperacaoSenha() {
  painelUsuarioAberto = true;
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("recuperar");
  atualizarVisibilidadeUsuario();
}

function voltarLoginUsuario() {
  painelUsuarioAberto = true;
  atualizarStatusUsuario("", false);
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
}

function atualizarVisibilidadeUsuario() {
  const cardUsuario = document.getElementById("cardUsuario");
  const blocoUsuarioTopo = document.getElementById("blocoUsuarioTopo");
  const entradaInicial = document.getElementById("usuarioEntradaInicial");
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
    areaPublica.style.display = !usuarioAtual && painelUsuarioAberto ? "block" : "none";
    if (!usuarioAtual) {
      definirModoUsuarioPublico(modoUsuarioPublico);
    }
  }

  if (entradaInicial) {
    entradaInicial.style.display = !usuarioAtual && !painelUsuarioAberto ? "block" : "none";
  }

  if (areaLogado) {
    areaLogado.style.display = usuarioAtual ? "block" : "none";
  }

  if (btnSair) {
    btnSair.style.display = usuarioAtual ? "block" : "none";
  }

  if (status) {
    status.style.display = !usuarioAtual && painelUsuarioAberto ? "block" : "none";
  }

  atualizarVisibilidadeApostas();
}

function sairUsuarioCabecalho() {
  sairUsuario();
}

function preencherCredenciaisTesteNoFormulario() {
  const loginUsuario = document.getElementById("loginUsuario");
  const senhaUsuario = document.getElementById("senhaUsuario");

  if (loginUsuario && !String(loginUsuario.value || "").trim()) {
    loginUsuario.value = USUARIO_TESTE_FIXO.login;
  }

  if (senhaUsuario && !String(senhaUsuario.value || "").trim()) {
    senhaUsuario.value = USUARIO_TESTE_FIXO.senha;
  }
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
  if (loginUsuario) loginUsuario.value = USUARIO_TESTE_FIXO.login;
  if (senhaUsuario) senhaUsuario.value = USUARIO_TESTE_FIXO.senha;
  if (recuperarLogin) recuperarLogin.value = "";
  if (recuperarSenha) recuperarSenha.value = "";
}

function cadastrarUsuario() {
  const nome = String(document.getElementById("cadastroNome").value || "").trim();
  const login = normalizarLoginUsuario(document.getElementById("cadastroLogin").value);
  const senha = String(document.getElementById("cadastroSenha").value || "");

  if (nome.length < 2) {
    atualizarStatusUsuario("Informe um nome com pelo menos 2 caracteres.", true);
    mostrarConfirmacaoApostaRapida("Informe um nome com pelo menos 2 caracteres.", "erro");
    return;
  }

  if (!/^[a-z0-9._-]{3,24}$/.test(login)) {
    atualizarStatusUsuario("Login inválido. Use 3-24 caracteres (a-z, 0-9, . _ -).", true);
    mostrarConfirmacaoApostaRapida(
      "Login inválido. Use 3-24 caracteres (a-z, 0-9, . _ -).",
      "erro"
    );
    return;
  }

  if (senha.length < 4) {
    atualizarStatusUsuario("A senha deve ter pelo menos 4 caracteres.", true);
    mostrarConfirmacaoApostaRapida("A senha deve ter pelo menos 4 caracteres.", "erro");
    return;
  }

  const existe = usuarios.some((u) => u.login === login);
  if (existe) {
    atualizarStatusUsuario("Este login já está em uso.", true);
    mostrarConfirmacaoApostaRapida("Este login já está em uso.", "erro");
    return;
  }

  const novoUsuario = {
    id: Date.now(),
    nome,
    login,
    senha,
    saldo: SALDO_USUARIO_INICIAL,
    telefone: "",
    chavePix: ""
  };

  usuarios.unshift(novoUsuario);
  salvarUsuarios();
  usuarioAtual = novoUsuario;
  salvarSessaoUsuario();
  painelUsuarioAberto = false;
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
  atualizarStatusUsuario(`Cadastro concluído. Conectado como ${nome} (@${login}).`, false);
  mostrarConfirmacaoApostaRapida("Cadastro concluído com sucesso.");
  limparCamposUsuario();
  mostrar();
}

function redefinirSenhaUsuario() {
  const login = normalizarLoginUsuario(document.getElementById("recuperarLogin").value);
  const novaSenha = String(document.getElementById("recuperarSenha").value || "");

  if (login === USUARIO_TESTE_FIXO.login) {
    atualizarStatusUsuario("A conta de teste usa senha fixa: 102030.", false);
    mostrarConfirmacaoApostaRapida("A conta de teste usa senha fixa: 102030.", "erro");
    const recuperarSenha = document.getElementById("recuperarSenha");
    if (recuperarSenha) recuperarSenha.value = "";
    return;
  }

  if (!login || novaSenha.length < 4) {
    atualizarStatusUsuario("Informe login e nova senha (mínimo 4 caracteres).", true);
    mostrarConfirmacaoApostaRapida("Informe login e nova senha (mínimo 4 caracteres).", "erro");
    return;
  }

  const idx = usuarios.findIndex((u) => u.login === login);
  if (idx === -1) {
    atualizarStatusUsuario("Login não encontrado.", true);
    mostrarConfirmacaoApostaRapida("Login não encontrado.", "erro");
    return;
  }

  usuarios[idx].senha = novaSenha;
  salvarUsuarios();
  painelUsuarioAberto = true;
  definirModoUsuarioPublico("login");
  const loginUsuario = document.getElementById("loginUsuario");
  if (loginUsuario) loginUsuario.value = login;
  atualizarStatusUsuario("Senha atualizada. Faça login.", false);
  mostrarConfirmacaoApostaRapida("Senha atualizada com sucesso.");

  const recuperarSenha = document.getElementById("recuperarSenha");
  if (recuperarSenha) recuperarSenha.value = "";
}

function entrarUsuario() {
  const login = normalizarLoginUsuario(document.getElementById("loginUsuario").value);
  const senha = String(document.getElementById("senhaUsuario").value || "");

  if (!login || !senha) {
    atualizarStatusUsuario("Informe login e senha.", true);
    mostrarConfirmacaoApostaRapida("Informe login e senha.", "erro");
    return;
  }

  const encontrado = usuarios.find((u) => u.login === login && u.senha === senha);
  if (!encontrado) {
    atualizarStatusUsuario("Login ou senha inválidos.", true);
    mostrarConfirmacaoApostaRapida("Login ou senha inválidos.", "erro");
    return;
  }

  usuarioAtual = encontrado;
  salvarSessaoUsuario();
  painelUsuarioAberto = false;
  definirModoUsuarioPublico("login");
  atualizarVisibilidadeUsuario();
  atualizarStatusUsuario(`Conectado como ${encontrado.nome} (@${encontrado.login}).`, false);
  mostrarConfirmacaoApostaRapida(`Login realizado. Bem-vindo, ${encontrado.nome}!`);
  limparCamposUsuario();
  mostrar();
}

function sairUsuario() {
  usuarioAtual = null;
  salvarSessaoUsuario();
  painelUsuarioAberto = false;
  limparBilheteRascunho({
    limparCampos: false
  });
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
  resumo.innerText = `Data selecionada: ${formatarDataBR(dataSelecionada)} | Praça: ${PRACA_FIXA}`;
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
    mostrarConfirmacaoApostaRapida("Admin conectado com sucesso.");
    preencherCamposMultiplicadores();
    preencherCamposLimitesAposta();
    atualizarStatusMultiplicadores("Admin conectado.", false);
    atualizarStatusLimitesAposta("Admin conectado.", false);
    selecionarPracaAdmin(PRACA_FIXA);
    const pracaAposta = document.getElementById("pracaAposta");
    const dataAposta = document.getElementById("dataAposta");
    if (dataAposta) dataAposta.value = hojeISO();
    if (pracaAposta) {
      pracaAposta.value = PRACA_FIXA;
      popularLoteriasAposta();
    }
    const dataResultado = document.getElementById("dataResultado");
    if (dataResultado) dataResultado.value = hojeISO();
    popularLoterias();
    atualizarDisponibilidadeLoteriasAposta(true);
    mostrar();
  } else {
    status.innerText = "Senha incorreta!";
    mostrarConfirmacaoApostaRapida("Senha do admin incorreta.", "erro");
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
  limparBilheteRascunho({
    limparCampos: false
  });
  limparCamposAposta();
  mostrar();
}

function salvar() {
  if (!logado) {
    mostrarConfirmacaoApostaRapida("Faça login antes de salvar.", "erro");
    return;
  }

  const praca = document.getElementById("praca").value.trim();
  const dataInput = document.getElementById("dataResultado").value;
  const data = normalizarDataISO(dataInput);
  const loteria = normalizarNomeLoteriaPorData(
    praca,
    document.getElementById("loteria").value,
    data
  );

  if (!praca || !PRACAS_ORDENADAS.includes(praca)) {
    mostrarConfirmacaoApostaRapida("Selecione a praça.", "erro");
    return;
  }

  if (!loteria) {
    mostrarConfirmacaoApostaRapida("Selecione a loteria.", "erro");
    return;
  }

  if (!data) {
    mostrarConfirmacaoApostaRapida("Escolha uma data válida.", "erro");
    return;
  }

  if (!dataDentroDaJanela(data)) {
    mostrarConfirmacaoApostaRapida(
      `A data deve estar entre ${formatarDataBR(dataMinimaISO())} e ${formatarDataBR(hojeISO())}.`,
      "erro"
    );
    return;
  }

  const resultados = [];

  for (let i = 1; i <= 5; i++) {
    const numeroInput = document.getElementById("n" + i);
    const grupoInput = document.getElementById("g" + i);
    const numero = extrairDigitos(numeroInput ? numeroInput.value : "").slice(-4);
    const auto = calcularBichoPorNumero(numero);

    if (numero.length !== 4 || !auto) {
      mostrarConfirmacaoApostaRapida("Preencha os 5 números com 4 dígitos.", "erro");
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
  mostrarConfirmacaoApostaRapida("Resultado salvo com sucesso.");
}

function contextoAtualFormularioAposta() {
  const data = hojeISO();
  const praca = String(document.getElementById("pracaAposta").value || "").trim();
  const loteria = normalizarNomeLoteriaPorData(
    praca,
    document.getElementById("loteriaAposta").value,
    data
  );
  return { data, praca, loteria };
}

function contextoIgualBilheteRascunho(contexto) {
  if (!contextoBilheteRascunho) return false;
  return (
    String(contextoBilheteRascunho.data || "") === String(contexto.data || "") &&
    String(contextoBilheteRascunho.praca || "") === String(contexto.praca || "") &&
    String(contextoBilheteRascunho.loteria || "") === String(contexto.loteria || "")
  );
}

function formularioApostaTemConteudoDigitado() {
  const tipo = normalizarTipoAposta(document.getElementById("tipoAposta").value);
  const palpite = String(document.getElementById("palpiteAposta").value || "").trim();
  const valor = normalizarValorMoeda(document.getElementById("valorAposta").value);
  return Boolean(tipo || palpite || Number(valor || 0) > 0);
}

function lerLinhaApostaDoFormulario() {
  const contexto = contextoAtualFormularioAposta();
  const tipo = normalizarTipoAposta(document.getElementById("tipoAposta").value);
  sincronizarPalpiteApostaGrupoParaInput();
  const palpite = String(document.getElementById("palpiteAposta").value || "").trim();
  const valor = normalizarValorMoeda(document.getElementById("valorAposta").value);

  if (!contexto.praca || !PRACAS_ORDENADAS.includes(contexto.praca)) {
    return { ok: false, mensagem: "Selecione a praça da aposta." };
  }
  if (!contexto.loteria) {
    return { ok: false, mensagem: "Selecione a loteria da aposta." };
  }
  if (!tipo) {
    return { ok: false, mensagem: "Selecione o tipo de aposta." };
  }
  if (!valor) {
    return { ok: false, mensagem: "Informe o valor da aposta." };
  }

  const valorNum = Number(valor);
  if (valorNum < limitesAposta.valorMinimo || valorNum > limitesAposta.valorMaximo) {
    return {
      ok: false,
      mensagem:
        `O valor da aposta deve estar entre R$ ${formatarNumeroBR(limitesAposta.valorMinimo)} ` +
        `e R$ ${formatarNumeroBR(limitesAposta.valorMaximo)}.`
    };
  }

  const restante = segundosAteFechamento(contexto.data, contexto.loteria);
  if (restante !== null && restante <= 0) {
    return {
      ok: false,
      mensagem: "Esta loteria já encerrou para apostas nesta data."
    };
  }

  const validacao = validarPalpiteAposta(tipo, palpite);
  if (!validacao.ok) {
    return { ok: false, mensagem: validacao.mensagem };
  }

  return {
    ok: true,
    contexto,
    linha: {
      tipo,
      palpite: validacao.valor,
      valor,
      premio: calcularPremiacaoFicticia(tipo, valor)
    }
  };
}

function renderizarBilheteRascunhoAposta() {
  const bloco = document.getElementById("bilheteRascunhoAposta");
  const resumo = document.getElementById("resumoBilheteRascunho");
  const lista = document.getElementById("listaBilheteRascunho");
  if (!bloco || !resumo || !lista) return;

  if (apostasBilheteRascunho.length === 0) {
    bloco.style.display = "none";
    resumo.innerText = "";
    lista.innerHTML = "";
    return;
  }

  bloco.style.display = "block";
  const totalApostas = apostasBilheteRascunho.length;
  const valorTotal = apostasBilheteRascunho.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const potencialTotal = apostasBilheteRascunho.reduce((acc, item) => acc + Number(item.premio || 0), 0);
  const loteria = String(contextoBilheteRascunho.loteria || "--");
  resumo.innerText =
    `Bilhete ${loteria}: ${totalApostas} aposta(s) | ` +
    `Total: ${formatarMoedaBR(valorTotal)} | Potencial: ${formatarMoedaBR(potencialTotal)}`;

  lista.innerHTML = apostasBilheteRascunho
    .map((item, index) => {
      const tipo = TIPOS_APOSTA[item.tipo] || item.tipo;
      const palpite = formatarPalpiteParaBilhete(item);
      return (
        `<div class="item-bilhete-rascunho">` +
        `<div class="item-bilhete-rascunho-topo">` +
        `<strong>${tipo}</strong>` +
        `<button type="button" class="btn-danger btn-remover-rascunho" onclick="removerApostaBilheteRascunho(${index})">Remover</button>` +
        `</div>` +
        `<div>Palpite: <b>${palpite}</b></div>` +
        `<div>Valor: ${formatarMoedaBR(item.valor)} | Potencial: ${formatarMoedaBR(item.premio)}</div>` +
        `</div>`
      );
    })
    .join("");
}

function limparBilheteRascunho(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  apostasBilheteRascunho = [];
  contextoBilheteRascunho = null;
  renderizarBilheteRascunhoAposta();
  if (cfg.limparCampos !== false) {
    limparCamposAposta({
      manterLoteria: true
    });
  }
}

function removerApostaBilheteRascunho(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= apostasBilheteRascunho.length) return;
  apostasBilheteRascunho.splice(idx, 1);
  if (apostasBilheteRascunho.length === 0) {
    contextoBilheteRascunho = null;
  }
  renderizarBilheteRascunhoAposta();
}

function adicionarApostaAoBilhete() {
  if (secaoApostasEncerrada) {
    mostrarConfirmacaoApostaRapida("Apostas encerradas para hoje.", "erro");
    return;
  }

  const usuarioSincronizado = sincronizarUsuarioAtualComLista();
  if (!usuarioSincronizado) {
    atualizarStatusUsuario("Faça login de usuário para apostar.", true);
    mostrarConfirmacaoApostaRapida("Faça login de usuário para apostar.", "erro");
    return;
  }

  const leitura = lerLinhaApostaDoFormulario();
  if (!leitura.ok) {
    mostrarConfirmacaoApostaRapida(leitura.mensagem, "erro");
    return;
  }

  if (apostasBilheteRascunho.length > 0 && !contextoIgualBilheteRascunho(leitura.contexto)) {
    mostrarConfirmacaoApostaRapida(
      "Finalize ou limpe o bilhete atual antes de trocar de loteria.",
      "erro"
    );
    return;
  }

  if (apostasBilheteRascunho.length === 0) {
    contextoBilheteRascunho = leitura.contexto;
  }

  apostasBilheteRascunho.push(leitura.linha);
  renderizarBilheteRascunhoAposta();
  limparCamposAposta({
    manterLoteria: true
  });
  mostrarConfirmacaoApostaRapida("Aposta adicionada ao bilhete.");
}

function salvarAposta() {
  if (secaoApostasEncerrada) {
    mostrarConfirmacaoApostaRapida("Apostas encerradas para hoje.", "erro");
    return;
  }

  const usuarioSincronizado = sincronizarUsuarioAtualComLista();
  if (!usuarioSincronizado) {
    atualizarStatusUsuario("Faça login de usuário para apostar.", true);
    mostrarConfirmacaoApostaRapida("Faça login de usuário para apostar.", "erro");
    return;
  }

  const linhasParaSalvar = apostasBilheteRascunho.slice();
  let contexto = contextoBilheteRascunho;

  if (linhasParaSalvar.length === 0) {
    const leitura = lerLinhaApostaDoFormulario();
    if (!leitura.ok) {
      mostrarConfirmacaoApostaRapida(leitura.mensagem, "erro");
      return;
    }
    linhasParaSalvar.push(leitura.linha);
    contexto = leitura.contexto;
  } else if (formularioApostaTemConteudoDigitado()) {
    const leituraAtual = lerLinhaApostaDoFormulario();
    if (!leituraAtual.ok) {
      mostrarConfirmacaoApostaRapida(
        "Há uma aposta preenchida. Clique em 'Adicionar ao bilhete' ou limpe os campos.",
        "erro"
      );
      return;
    }
    if (!contextoIgualBilheteRascunho(leituraAtual.contexto)) {
      mostrarConfirmacaoApostaRapida(
        "A aposta preenchida é de outra loteria. Ajuste para a mesma loteria do bilhete.",
        "erro"
      );
      return;
    }
    linhasParaSalvar.push(leituraAtual.linha);
  }

  if (!contexto || !contexto.praca || !contexto.loteria || !contexto.data) {
    mostrarConfirmacaoApostaRapida("Não foi possível definir os dados do bilhete.", "erro");
    return;
  }

  const valorTotalBilhete = linhasParaSalvar.reduce(
    (acc, linha) => acc + Number(linha.valor || 0),
    0
  );

  const saldoDisponivel = normalizarSaldoUsuario(usuarioSincronizado.saldo);
  if (valorTotalBilhete > saldoDisponivel) {
    const mensagemSaldo =
      `Saldo insuficiente. Saldo atual: ${formatarMoedaBR(saldoDisponivel)}. ` +
      `Total do bilhete: ${formatarMoedaBR(valorTotalBilhete)}.`;
    atualizarStatusDepositoUsuario(mensagemSaldo, true);
    mostrarConfirmacaoApostaRapida(mensagemSaldo, "erro");
    return;
  }

  const bilheteId = gerarBilheteIdAposta(
    contexto.data,
    contexto.praca,
    contexto.loteria,
    usuarioSincronizado.id,
    usuarioSincronizado.login
  );
  const apostasNoBilheteAntes = apostas.filter(
    (aposta) =>
      String(aposta.bilheteId || "") === bilheteId &&
      aposta.usuarioId === usuarioSincronizado.id
  ).length;

  const agoraBase = Date.now();
  const itensNovos = linhasParaSalvar.map((linha, index) => {
    const ts = agoraBase + index;
    return {
      id: ts,
      data: contexto.data,
      praca: contexto.praca,
      loteria: contexto.loteria,
      bilheteId,
      tipo: linha.tipo,
      palpite: linha.palpite,
      valor: linha.valor,
      premio: linha.premio,
      createdAt: new Date(ts).toISOString(),
      usuarioId: usuarioSincronizado.id,
      usuarioLogin: usuarioSincronizado.login
    };
  });

  for (let i = itensNovos.length - 1; i >= 0; i--) {
    apostas.unshift(itensNovos[i]);
  }

  usuarioSincronizado.saldo = normalizarSaldoUsuario(saldoDisponivel - valorTotalBilhete);
  salvarUsuarios({
    atualizarTimestamp: false,
    pularSyncRemoto: true
  });
  salvarApostas();
  atualizarCarteiraUsuarioAposta();
  atualizarStatusDepositoUsuario(
    `Bilhete confirmado: -${formatarMoedaBR(valorTotalBilhete)}. ` +
    `Saldo restante: ${formatarMoedaBR(usuarioSincronizado.saldo)}.`,
    false
  );

  dataSelecionada = contexto.data;
  aplicarLimitesDeData();
  atualizarEstadoNavegacao();
  atualizarResumoData();
  mostrar();
  limparBilheteRascunho({
    limparCampos: false
  });
  limparCamposAposta();

  const totalBilhete = apostasNoBilheteAntes + linhasParaSalvar.length;
  mostrarConfirmacaoApostaRapida(
    `Bilhete ${contexto.loteria} salvo com ${linhasParaSalvar.length} aposta(s). Total no bilhete: ${totalBilhete}.`
  );
}

function limparCamposAposta(opcoes) {
  const cfg = opcoes && typeof opcoes === "object" ? opcoes : {};
  const manterLoteria = cfg.manterLoteria === true;
  const tipo = document.getElementById("tipoAposta");
  const palpite = document.getElementById("palpiteAposta");
  const valor = document.getElementById("valorAposta");
  const loteriaAposta = document.getElementById("loteriaAposta");
  const palpiteGrupo1 = document.getElementById("palpiteGrupo1");
  const palpiteGrupo2 = document.getElementById("palpiteGrupo2");
  const palpiteGrupo3 = document.getElementById("palpiteGrupo3");

  if (tipo) tipo.value = "";
  if (palpite) palpite.value = "";
  if (valor) valor.value = "R$ 0,00";
  if (!manterLoteria && loteriaAposta) loteriaAposta.value = "";
  if (palpiteGrupo1) palpiteGrupo1.value = "";
  if (palpiteGrupo2) palpiteGrupo2.value = "";
  if (palpiteGrupo3) palpiteGrupo3.value = "";
  atualizarModoCampoPalpiteAposta();
  atualizarPreviewPremiacaoAposta();
  atualizarCronometroApostaFormulario();
}

function montarHtmlBilheteAposta(item, incluirAcoesAdmin) {
  const valorNum = Number(item.valor || 0);
  const potencialNum = Number(calcularPremiacaoFicticia(item.tipo, item.valor));
  const valorTxt = formatarMoedaBR(valorNum);
  const premioTxt = formatarMoedaBR(potencialNum);
  const horarioAposta = formatarHorarioBR(item.createdAt);
  const tipoLabel = TIPOS_APOSTA[item.tipo] || item.tipo;
  const palpiteBilhete = formatarPalpiteParaBilhete(item);
  const conf = resultadoDaAposta(item);
  const linhaResultado = `Status: <span class="status-aposta ${conf.classeStatus}">${conf.status}</span> | ${conf.detalhe}`;
  const acoes = incluirAcoesAdmin
    ? `<div class="acoes-aposta acao-admin"><button class="btn-danger btn-inline" onclick="excluirApostaPorId(${item.id})">Excluir aposta</button></div>`
    : "";

  return `
    <div class="aposta-item">
      <strong>${item.praca} | ${item.loteria}</strong><br>
      <div class="linha-horario-aposta">Aposta feita às <b>${horarioAposta}</b></div>
      ${tipoLabel}: <b>${palpiteBilhete}</b> | Valor: ${valorTxt}<br>
      Ganho potencial: <span class="valor-potencial-destaque">${premioTxt}</span><br>
      ${linhaResultado}
      ${acoes}
    </div>
  `;
}

function obterDataHistoricoApostasSelecionada() {
  const input = document.getElementById("dataHistoricoApostas");
  const min = dataMinimaISO();
  const max = hojeISO();
  const fallback = normalizarDataISO(dataSelecionada) || max;
  let data = normalizarDataISO(input && input.value ? input.value : "");

  if (!data) data = fallback;
  if (data < min) data = min;
  if (data > max) data = max;

  if (input) input.value = data;
  return data;
}

function mostrarHistoricoApostasUsuario() {
  const container = document.getElementById("listaApostasHistorico");
  const resumo = document.getElementById("historicoApostasResumo");
  if (!container) return;

  const dataConsulta = obterDataHistoricoApostasSelecionada();
  container.innerHTML = "";
  container.classList.remove("apostas-unico");

  if (!usuarioAtual) {
    if (resumo) {
      resumo.innerText = "Escolha uma data para consultar seus bilhetes anteriores.";
    }
    container.innerHTML = "<p>Faça login de usuário para consultar o histórico.</p>";
    return;
  }

  const usuarioIdAtual = usuarioAtual.id;
  const historico = apostas
    .filter((item) => item.usuarioId === usuarioIdAtual && item.data === dataConsulta)
    .sort(compararPorHorario);

  if (resumo) {
    const qtd = historico.length;
    resumo.innerText =
      `${formatarDataBR(dataConsulta)}: ` +
      (qtd === 1 ? "1 bilhete encontrado." : `${qtd} bilhetes encontrados.`);
  }

  if (historico.length === 0) {
    container.innerHTML = "<p>Nenhuma aposta encontrada para a data selecionada.</p>";
    return;
  }

  if (historico.length === 1) {
    container.classList.add("apostas-unico");
  }

  historico.forEach((item) => {
    container.innerHTML += montarHtmlBilheteAposta(item, logado);
  });
}

function irHojeHistoricoApostas() {
  const input = document.getElementById("dataHistoricoApostas");
  const hoje = hojeISO();
  if (input) input.value = hoje;
  mostrarHistoricoApostasUsuario();
}

function mostrarApostas() {
  const container = document.getElementById("listaApostas");
  if (!container) {
    mostrarHistoricoApostasUsuario();
    return;
  }

  const campoData = document.getElementById("minhasApostasData");
  const campoResumo = document.getElementById("minhasApostasResumo");
  const dataDoDia = hojeISO();
  const usuarioIdAtual = usuarioAtual ? usuarioAtual.id : null;
  if (campoData) {
    campoData.innerText = formatarDataBR(dataDoDia);
  }

  const doDia = apostas
    .filter((item) => {
      if (item.data !== dataDoDia) return false;
      if (!usuarioIdAtual) return false;
      return item.usuarioId === usuarioIdAtual;
    })
    .sort(compararPorHorario);

  if (campoResumo) {
    if (!usuarioAtual) {
      campoResumo.innerText = "Entre com seu usuário para acompanhar os bilhetes do dia.";
    } else {
      const qtd = doDia.length;
      campoResumo.innerText =
        qtd === 1 ? "1 bilhete registrado hoje." : `${qtd} bilhetes registrados hoje.`;
    }
  }

  container.innerHTML = "";
  container.classList.remove("apostas-unico");

  if (doDia.length === 0) {
    if (!usuarioAtual) {
      container.innerHTML = "<p>Faça login de usuário para registrar e ver suas apostas.</p>";
    } else {
      container.innerHTML = "<p>Você ainda não registrou apostas hoje.</p>";
    }
    mostrarHistoricoApostasUsuario();
    return;
  }

  if (doDia.length === 1) {
    container.classList.add("apostas-unico");
  }

  doDia.forEach((item) => {
    container.innerHTML += montarHtmlBilheteAposta(item, logado);
  });

  atualizarCronometrosDaLista();
  mostrarHistoricoApostasUsuario();
}

function formatarDataHoraCurtaBR(dataHora) {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return "--/--/-- --:--";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dataCadastroUsuario(usuario) {
  const idNum = Number(usuario && usuario.id);
  if (Number.isFinite(idNum) && idNum > 946684800000 && idNum < 4102444800000) {
    return formatarDataHoraCurtaBR(idNum);
  }
  return "--/--/-- --:--";
}

function mostrarPainelAdmin() {
  const resumo = document.getElementById("resumoPainelAdmin");
  const listaUsuariosAdmin = document.getElementById("listaUsuariosAdmin");
  const listaApostasAdmin = document.getElementById("listaApostasAdmin");
  if (!resumo || !listaUsuariosAdmin || !listaApostasAdmin) return;

  if (!logado) {
    resumo.innerText = "Faça login no admin para visualizar os cadastros e as apostas.";
    listaUsuariosAdmin.innerHTML = "";
    listaApostasAdmin.innerHTML = "";
    return;
  }

  const usuariosOrdenados = sanitizarUsuarios(usuarios).slice().sort((a, b) =>
    String(a.login || "").localeCompare(String(b.login || ""), "pt-BR")
  );
  const apostasOrdenadas = sanitizarApostas(apostas).slice().sort((a, b) => {
    if (a.data !== b.data) return String(b.data).localeCompare(String(a.data), "pt-BR");
    return compararPorHorario(a, b);
  });

  const mapaApostasPorUsuario = new Map();
  apostasOrdenadas.forEach((item) => {
    const chave = String(item.usuarioLogin || "");
    if (!chave) return;
    mapaApostasPorUsuario.set(chave, (mapaApostasPorUsuario.get(chave) || 0) + 1);
  });

  const apostasDaData = apostasOrdenadas.filter((item) => item.data === dataSelecionada);

  resumo.innerText =
    `Cadastros: ${usuariosOrdenados.length} | ` +
    `Apostas totais: ${apostasOrdenadas.length} | ` +
    `Apostas em ${formatarDataBR(dataSelecionada)}: ${apostasDaData.length}`;

  if (usuariosOrdenados.length === 0) {
    listaUsuariosAdmin.innerHTML = '<div class="item-admin-linha">Nenhum usuário cadastrado.</div>';
  } else {
    listaUsuariosAdmin.innerHTML = usuariosOrdenados
      .map((user) => {
        const totalApostas = mapaApostasPorUsuario.get(String(user.login || "")) || 0;
        return (
          `<div class="item-admin-linha">` +
          `<b>${user.nome}</b> (@${user.login})<br>` +
          `Cadastro: ${dataCadastroUsuario(user)}<br>` +
          `Saldo: <b>${formatarMoedaBR(user.saldo)}</b><br>` +
          `Apostas: <b>${totalApostas}</b>` +
          `</div>`
        );
      })
      .join("");
  }

  if (apostasDaData.length === 0) {
    listaApostasAdmin.innerHTML =
      `<div class="item-admin-linha">Nenhuma aposta em ${formatarDataBR(dataSelecionada)}.</div>`;
  } else {
    listaApostasAdmin.innerHTML = apostasDaData
      .map((item) => {
        const tipoLabel = TIPOS_APOSTA[item.tipo] || item.tipo;
        const palpiteBilhete = formatarPalpiteParaBilhete(item);
        return (
          `<div class="item-admin-linha">` +
          `<b>${item.praca} | ${item.loteria}</b><br>` +
          `Usuário: <b>@${item.usuarioLogin || "-"}</b><br>` +
          `${tipoLabel}: <b>${palpiteBilhete}</b><br>` +
          `Valor: <b>${formatarMoedaBR(item.valor)}</b> | ` +
          `Potencial: <b>${formatarMoedaBR(item.premio)}</b><br>` +
          `Feita em: ${formatarDataHoraCurtaBR(item.createdAt)}` +
          `</div>`
        );
      })
      .join("");
  }
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
    mostrarConfirmacaoApostaRapida("Somente o admin pode excluir apostas.", "erro");
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
    mostrarPremiacoesDestaque();
    mostrarApostas();
    mostrarPainelAdmin();
    return;
  }

  if (doDia.length === 1) {
    container.classList.add("resultados-unico");
  }

  doDia.forEach((item) => {
    const loteriaTitulo =
      String(item.loteria || "").toUpperCase().includes("FEDERAL")
        ? "FEDERAL"
        : `${item.praca} | ${item.loteria}`;

    let html = `<div class="resultado-card">
      <div class="resultado-titulo">${loteriaTitulo}</div>`;

    if (!item.resultados || item.resultados.length === 0) {
      html += `<div class="resultado-pendente-bloco">`;
      html += `<p class="resultado-pendente">Aguardando resultado desta loteria.</p>`;
      html += `<p class="resultado-chamada-aposta">Aposte Agora!</p>`;
      const hoje = hojeISO();
      if (item.data === hoje) {
        const restante = segundosAteSorteio(item.data, item.loteria);
        if (restante !== null) {
          const classeCronometro =
            restante > 0 ? "cronometro-sorteio-aberto" : "cronometro-sorteio-encerrado";
          html += `<p class="cronometro-resultado ${classeCronometro}" data-data-resultado="${item.data}" data-loteria-resultado="${item.loteria}">${textoCronometroResultadoPara(item.data, item.loteria)}</p>`;
        }
      }
      html += `</div>`;
    } else {
      item.resultados.forEach((r, i) => {
        const animal = r.animal || pegarAnimal(r.grupo);

        html += `
          <div class="premio">
            <span class="posicao">${i + 1}º</span>
            <div class="premio-bicho">
              <img src="img/animais/${animal}.png" alt="${animal}">
              <strong class="premio-numero">${r.numero}</strong>
            </div>
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
  atualizarCronometrosResultados();
  mostrarPremiacoesDestaque();
  mostrarApostas();
  mostrarPainelAdmin();
}

async function init() {
  lista = sanitizarLista(lista);
  carregarMultiplicadores();
  carregarLimitesAposta();
  apostas = sanitizarApostas(apostas);
  usuarios = sanitizarUsuarios(usuarios);
  usuarioAtual = carregarSessaoUsuario();
  salvarDados({
    atualizarTimestamp: false,
    pularSyncRemoto: true
  });
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
  configurarMascaraValorDepositoUsuario();
  configurarCronometroAposta();
  preencherCamposMultiplicadores();
  preencherCamposLimitesAposta();
  atualizarInfoLimitesAposta();
  atualizarStatusMultiplicadores("", false);
  atualizarStatusLimitesAposta("", false);
  if (PAGINA_ADMIN_SEPARADA) {
    acessoAdminVisivel = true;
  }
  painelUsuarioAberto = false;
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
  await inicializarSincronizacaoResultadosRemotos();
  await inicializarSincronizacaoPainelRemoto();
  mostrar();
}

window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.cadastrarUsuario = cadastrarUsuario;
window.redefinirSenhaUsuario = redefinirSenhaUsuario;
window.entrarUsuario = entrarUsuario;
window.sairUsuario = sairUsuario;
window.sairUsuarioCabecalho = sairUsuarioCabecalho;
window.abrirPainelLoginUsuario = abrirPainelLoginUsuario;
window.abrirCadastroUsuario = abrirCadastroUsuario;
window.abrirRecuperacaoSenha = abrirRecuperacaoSenha;
window.voltarLoginUsuario = voltarLoginUsuario;
window.salvar = salvar;
window.salvarMultiplicadores = salvarMultiplicadores;
window.restaurarMultiplicadoresPadrao = restaurarMultiplicadoresPadrao;
window.salvarLimitesAposta = salvarLimitesAposta;
window.restaurarLimitesPadrao = restaurarLimitesPadrao;
window.salvarAposta = salvarAposta;
window.adicionarApostaAoBilhete = adicionarApostaAoBilhete;
window.limparBilheteRascunho = limparBilheteRascunho;
window.removerApostaBilheteRascunho = removerApostaBilheteRascunho;
window.depositarSaldoUsuario = depositarSaldoUsuario;
window.mostrar = mostrar;
window.excluirPorId = excluirPorId;
window.excluirApostaPorId = excluirApostaPorId;
window.selecionarData = selecionarData;
window.selecionarPracaFiltro = selecionarPracaFiltro;
window.voltarDia = voltarDia;
window.avancarDia = avancarDia;
window.irHoje = irHoje;
window.irHojeHistoricoApostas = irHojeHistoricoApostas;
window.irHomeCabecalho = irHomeCabecalho;
window.abrirMeuPerfil = abrirMeuPerfil;
window.abrirDeposito = abrirDeposito;

window.addEventListener("load", () => {
  init();
});
