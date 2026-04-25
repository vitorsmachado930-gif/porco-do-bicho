const STORAGE_KEY = "dados";
const APOSTAS_KEY = "apostas";
const USUARIOS_KEY = "usuarios_aposta";
const USUARIO_SESSAO_KEY = "usuario_sessao_id";
const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
const MAX_DIAS_HISTORICO = 7;

const TIPOS_APOSTA = {
  grupo: "Grupo",
  dupla_grupo: "Dupla de Grupo",
  terno_grupo: "Terno de Grupo",
  milhar: "Milhar",
  centena: "Centena",
  dezena: "Dezena"
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

function extrairDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
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

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      const telefone = String(raw.telefone || "").trim().slice(0, 24);
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
  if (tipo === "grupo" || tipo === "dupla_grupo" || tipo === "terno_grupo") {
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
  } else if (aposta.tipo === "milhar") {
    ganhou = numerosResultado.includes(palpite);
  } else if (aposta.tipo === "centena") {
    ganhou = numerosResultado.some((n) => n.slice(-3) === palpite);
  } else if (aposta.tipo === "dezena") {
    ganhou = numerosResultado.some((n) => n.slice(-2) === palpite);
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
  resumo.innerText =
    `Login: @${usuarioAtual.login} | Saldo atual: ${formatarMoedaBR(usuarioAtual.saldo)}`;
}

function preencherCamposPerfil() {
  const nome = document.getElementById("perfilNome");
  const telefone = document.getElementById("perfilTelefone");
  const chavePix = document.getElementById("perfilChavePix");
  if (!nome || !telefone || !chavePix) return;

  if (!usuarioAtual) {
    nome.value = "";
    telefone.value = "";
    chavePix.value = "";
    nome.disabled = true;
    telefone.disabled = true;
    chavePix.disabled = true;
    return;
  }

  nome.value = usuarioAtual.nome || "";
  telefone.value = usuarioAtual.telefone || "";
  chavePix.value = usuarioAtual.chavePix || "";
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
  const telefone = String(telefoneEl.value || "").trim().slice(0, 24);
  const chavePix = String(pixEl.value || "").trim().slice(0, 120);

  if (nome.length < 2) {
    atualizarStatusPerfil("Informe um nome válido com pelo menos 2 caracteres.", true);
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
  atualizarStatusPerfil("Dados do perfil salvos com sucesso.", false);
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

function montarCardAposta(item) {
  const tipoLabel = TIPOS_APOSTA[item.tipo] || item.tipo;
  const status = resultadoDaAposta(item);
  const horario = formatarHorarioBR(item.createdAt);
  const palpite = formatarPalpiteBilhete(item);
  const valor = formatarMoedaBR(item.valor);
  const premio = formatarMoedaBR(item.premio || item.valor);

  return (
    `<div class="aposta-item">` +
    `<strong>${escaparHTML(item.praca)} | ${escaparHTML(item.loteria)}</strong><br>` +
    `<div>Aposta feita às <b>${escaparHTML(horario)}</b></div>` +
    `${escaparHTML(tipoLabel)}: <b>${escaparHTML(palpite)}</b> | Valor: ${escaparHTML(valor)}<br>` +
    `Ganho potencial: <b>${escaparHTML(premio)}</b><br>` +
    `Status: <span class="status-aposta ${status.classe}">${status.status}</span> | ${status.detalhe}` +
    `</div>`
  );
}

function mostrarApostasPerfil() {
  const lista = document.getElementById("perfilListaApostas");
  const resumo = document.getElementById("perfilApostasResumo");
  const inputData = document.getElementById("perfilDataApostas");
  if (!lista || !resumo || !inputData) return;

  const dataSelecionada = normalizarDataISO(inputData.value) || hojeISO();
  inputData.value = dataSelecionada;
  lista.innerHTML = "";

  if (!usuarioAtual) {
    resumo.innerText = "Entre na Home com seu usuário para ver seus bilhetes.";
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

  resumo.innerText =
    `${formatarDataBR(dataSelecionada)}: ` +
    (filtradas.length === 1 ? "1 bilhete encontrado." : `${filtradas.length} bilhetes encontrados.`);

  if (filtradas.length === 0) {
    lista.innerHTML = "<p>Nenhuma aposta encontrada para esta data.</p>";
    return;
  }

  filtradas.forEach((item) => {
    lista.innerHTML += montarCardAposta(item);
  });
}

function irHojeApostasPerfil() {
  const input = document.getElementById("perfilDataApostas");
  if (!input) return;
  input.value = hojeISO();
  mostrarApostasPerfil();
}

function initPerfil() {
  carregarEstado();
  atualizarResumoUsuario();
  preencherCamposPerfil();
  configurarFiltroDataApostas();
  mostrarApostasPerfil();

  const btnSalvar = document.getElementById("btnSalvarPerfil");
  if (btnSalvar) {
    btnSalvar.disabled = !usuarioAtual;
    btnSalvar.addEventListener("click", salvarDadosPerfil);
  }

  const inputData = document.getElementById("perfilDataApostas");
  if (inputData) {
    inputData.addEventListener("change", mostrarApostasPerfil);
  }

  const btnHoje = document.getElementById("btnPerfilHoje");
  if (btnHoje) {
    btnHoje.addEventListener("click", irHojeApostasPerfil);
  }
}

window.addEventListener("load", initPerfil);
