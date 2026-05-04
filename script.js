// Integração simples de depósito Pix (Asaas) para usuário leigo.
// Observação: API Key fica SOMENTE no backend, nunca neste arquivo.
(function () {
  "use strict";

  const IDS = {
    card: "cardPixAsaas",
    resumo: "pixResumoUsuario",
    usuarioId: "pixUsuarioId",
    valor: "pixValorDeposito",
    btnGerar: "btnGerarPixAsaas",
    status: "pixStatusMensagem",
    box: "pixResultadoBox",
    qr: "pixQrImage",
    copia: "pixCopiaCola",
    btnCopiar: "btnCopiarPixAsaas"
  };

  const USUARIOS_KEY = "usuarios_aposta";
  const USUARIO_SESSAO_KEY = "usuario_sessao_id";
  let sessaoAtual = "";

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(texto, erro) {
    const status = el(IDS.status);
    if (!status) return;
    status.style.color = erro ? "#ff6b6b" : "#9fb3c8";
    status.textContent = texto || "";
  }

  function normalizarValor(valorTexto) {
    const txt = String(valorTexto || "").trim();
    if (!txt) return 0;
    const semMoeda = txt.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(semMoeda);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Number(n.toFixed(2));
  }

  function carregarUsuarioLogado() {
    try {
      const usuarios = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "[]");
      const sessaoId = Number(localStorage.getItem(USUARIO_SESSAO_KEY));
      if (!Array.isArray(usuarios) || !Number.isFinite(sessaoId)) return null;
      return usuarios.find((u) => Number(u && u.id) === sessaoId) || null;
    } catch (_err) {
      return null;
    }
  }

  function preencherUsuarioAutomatico() {
    const inputId = el(IDS.usuarioId);
    const resumo = el(IDS.resumo);
    if (!inputId || !resumo) return;

    const usuario = carregarUsuarioLogado();
    if (!usuario) {
      inputId.value = "";
      inputId.readOnly = false;
      resumo.textContent = "Faça login para liberar o depósito via Pix.";
      return;
    }

    inputId.value = String(usuario.id || "");
    inputId.readOnly = true;
    resumo.textContent = `Usuário logado: @${usuario.login || "--"} (ID: ${usuario.id || "--"})`;
  }

  function limparResultadoPix() {
    const box = el(IDS.box);
    const qr = el(IDS.qr);
    const copia = el(IDS.copia);
    const valor = el(IDS.valor);

    if (valor) valor.value = "";
    if (copia) copia.value = "";
    if (qr) {
      qr.removeAttribute("src");
      qr.style.display = "none";
    }
    if (box) box.style.display = "none";
    setStatus("", false);
  }

  function atualizarVisibilidadePix() {
    const card = el(IDS.card);
    if (!card) return;

    const usuario = carregarUsuarioLogado();
    if (!usuario) {
      card.style.display = "none";
      limparResultadoPix();
      preencherUsuarioAutomatico();
      return;
    }

    card.style.display = "";
    preencherUsuarioAutomatico();
  }

  function mostrarResultadoPix(payload) {
    const box = el(IDS.box);
    const qr = el(IDS.qr);
    const copia = el(IDS.copia);
    if (!box || !qr || !copia) return;

    const qrBase64 = String(payload && payload.qr_code_base64 ? payload.qr_code_base64 : "").trim();
    const copiaCola = String(payload && payload.payload_pix ? payload.payload_pix : "").trim();

    if (qrBase64) {
      qr.src = `data:image/png;base64,${qrBase64}`;
      qr.style.display = "block";
    } else {
      qr.removeAttribute("src");
      qr.style.display = "none";
    }

    copia.value = copiaCola;
    box.style.display = "block";
  }

  async function gerarPix() {
    const inputId = el(IDS.usuarioId);
    const inputValor = el(IDS.valor);
    const btn = el(IDS.btnGerar);
    if (!inputId || !inputValor || !btn) return;

    const usuarioLogado = carregarUsuarioLogado();
    if (!usuarioLogado || !Number.isFinite(Number(usuarioLogado.id)) || Number(usuarioLogado.id) <= 0) {
      setStatus("Faça login para gerar o Pix.", true);
      return;
    }

    const usuarioId = Number(usuarioLogado.id);
    const valor = normalizarValor(inputValor.value);

    if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
      setStatus("Informe um ID de usuário válido.", true);
      return;
    }
    if (valor <= 0) {
      setStatus("Informe um valor maior que zero.", true);
      return;
    }

    btn.disabled = true;
    setStatus("Gerando Pix...", false);

    try {
      const resp = await fetch("backend/criar_pix.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          valor
        })
      });

      const payload = await resp.json();
      if (!resp.ok || !payload || !payload.ok) {
        const erro = payload && payload.error ? String(payload.error) : "Falha ao gerar Pix.";
        throw new Error(erro);
      }

      mostrarResultadoPix(payload);
      setStatus("Pix gerado. Após o pagamento, o saldo será atualizado automaticamente.", false);
    } catch (err) {
      setStatus(String((err && err.message) || "Erro inesperado ao gerar Pix."), true);
    } finally {
      btn.disabled = false;
    }
  }

  async function copiarPix() {
    const area = el(IDS.copia);
    if (!area) return;
    const texto = String(area.value || "");
    if (!texto) {
      setStatus("Nenhum código Pix para copiar.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(texto);
      setStatus("Código Pix copiado com sucesso.", false);
    } catch (_err) {
      area.focus();
      area.select();
      document.execCommand("copy");
      setStatus("Código Pix copiado.", false);
    }
  }

  function iniciar() {
    if (!el(IDS.btnGerar)) return; // Não quebra outras páginas.
    sessaoAtual = String(localStorage.getItem(USUARIO_SESSAO_KEY) || "");
    atualizarVisibilidadePix();

    const btnGerar = el(IDS.btnGerar);
    const btnCopiar = el(IDS.btnCopiar);
    if (btnGerar) btnGerar.addEventListener("click", gerarPix);
    if (btnCopiar) btnCopiar.addEventListener("click", copiarPix);

    window.addEventListener("storage", atualizarVisibilidadePix);

    // Detecta login/logout no mesmo navegador sem recarregar a página.
    setInterval(() => {
      const novaSessao = String(localStorage.getItem(USUARIO_SESSAO_KEY) || "");
      if (novaSessao !== sessaoAtual) {
        sessaoAtual = novaSessao;
        atualizarVisibilidadePix();
      }
    }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
