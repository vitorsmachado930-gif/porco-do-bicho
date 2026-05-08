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
  const USUARIO_SESSAO_CPF_KEY = "usuario_sessao_cpf";
  const CARTEIRA_USUARIO_UPSERT_API_URL = "api/carteira_usuario_upsert.php";
  const CARTEIRA_SALDO_USUARIO_API_URL = "api/carteira_saldo_usuario.php";
  const CONSULTAR_PIX_API_URL = "backend/consultar_pix.php";
  const PAINEL_UPDATED_AT_KEY = "painel_updated_at";
  let sessaoAtual = "";
  let estadoUsuarioPixAtual = "";
  let monitorPixTimer = null;
  let monitorPixIniciadoEm = 0;

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
      const cpfSessao = apenasDigitos(localStorage.getItem(USUARIO_SESSAO_CPF_KEY) || "");
      if (!Array.isArray(usuarios)) return null;

      let encontrado = Number.isFinite(sessaoId)
        ? usuarios.find((u) => Number(u && u.id) === sessaoId) || null
        : null;

      if (!encontrado && cpfSessao.length === 11) {
        encontrado =
          usuarios.find(
            (u) => apenasDigitos((u && (u.cpfCnpj || u.cpf_cnpj)) || "") === cpfSessao
          ) || null;
      }

      if (encontrado) {
        localStorage.setItem(USUARIO_SESSAO_KEY, String(encontrado.id || ""));
        const cpfAtual = apenasDigitos((encontrado.cpfCnpj || encontrado.cpf_cnpj) || "");
        if (cpfAtual.length === 11) {
          localStorage.setItem(USUARIO_SESSAO_CPF_KEY, cpfAtual);
        }
      }
      return encontrado;
    } catch (_err) {
      return null;
    }
  }

  function usuarioWhatsappVerificado(usuario) {
    return Boolean(
      usuario &&
      (usuario.whatsappVerificado === true ||
        Number(usuario.whatsappVerificado) === 1 ||
        Number(usuario.whatsapp_verificado) === 1)
    );
  }

  function usuarioExigeWhatsappVerificado(usuario) {
    return Boolean(
      usuario &&
      (usuario.whatsappVerificationRequired === true ||
        Number(usuario.whatsappVerificationRequired) === 1 ||
        Number(usuario.whatsapp_verification_required) === 1)
    );
  }

  function normalizarLogin(login) {
    return String(login || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function apenasDigitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  async function requisicaoCarteiraJSON(url, opcoes, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(timeoutMs) > 0 ? Number(timeoutMs) : 12000);
    try {
      const resp = await fetch(url, {
        ...(opcoes || {}),
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-App-Client": "porcodobicho-web",
          ...((opcoes && opcoes.headers) || {})
        },
        cache: "no-store",
        signal: controller.signal
      });

      let payload = null;
      try {
        payload = await resp.json();
      } catch (_err) {
        payload = null;
      }

      if (!resp.ok || !(payload && payload.ok)) {
        const detalhe = payload && typeof payload.error === "string" ? payload.error : "";
        const base = `Falha na carteira (${resp.status}).`;
        throw new Error(detalhe ? `${base} ${detalhe}` : base);
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async function buscarUsuarioIdCarteira(usuario) {
    if (!usuario) throw new Error("Faça login para gerar o Pix.");
    const login = normalizarLogin(usuario.login);
    const senha = String(usuario.senha || "");
    if (!login) throw new Error("Login inválido para sincronizar carteira.");
    if (!senha) throw new Error("Sessão inválida para sincronizar carteira.");

    await requisicaoCarteiraJSON(
      CARTEIRA_USUARIO_UPSERT_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          login,
          senha,
          nome: String(usuario.nome || "Usuário"),
          email: String(usuario.email || ""),
          telefone: String(usuario.telefone || ""),
          cpfCnpj: apenasDigitos(usuario.cpfCnpj || usuario.cpf_cnpj || "")
        })
      },
      12000
    );

    const saldoPayload = await requisicaoCarteiraJSON(
      CARTEIRA_SALDO_USUARIO_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          login,
          senha
        })
      },
      10000
    );

    const carteiraId = Number(
      saldoPayload &&
      saldoPayload.usuario &&
      saldoPayload.usuario.id
    );

    if (!Number.isFinite(carteiraId) || carteiraId <= 0) {
      throw new Error("Usuário não encontrado na carteira.");
    }

    return carteiraId;
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
    resumo.textContent = !usuarioExigeWhatsappVerificado(usuario) || usuarioWhatsappVerificado(usuario)
      ? `Usuário logado: @${usuario.login || "--"} (pronto para depósito Pix)`
      : `Usuário logado: @${usuario.login || "--"} (confirme seu WhatsApp para liberar o Pix)`;
  }

  function atualizarSaldoLocalUsuarioLogado(novoSaldo) {
    const saldo = Number(novoSaldo);
    if (!Number.isFinite(saldo)) return;
    try {
      const usuarios = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "[]");
      const sessaoId = Number(localStorage.getItem(USUARIO_SESSAO_KEY));
      const sessaoCpf = apenasDigitos(localStorage.getItem(USUARIO_SESSAO_CPF_KEY) || "");
      if (!Array.isArray(usuarios)) return;

      const idx = usuarios.findIndex((u) => {
        const idMatch = Number.isFinite(sessaoId) && Number(u && u.id) === sessaoId;
        const cpfUser = apenasDigitos((u && (u.cpfCnpj || u.cpf_cnpj)) || "");
        const cpfMatch = sessaoCpf.length === 11 && cpfUser === sessaoCpf;
        return idMatch || cpfMatch;
      });

      if (idx !== -1) {
        usuarios[idx].saldo = Number(saldo.toFixed(2));
        localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
      }
      localStorage.setItem(PAINEL_UPDATED_AT_KEY, String(Date.now()));
      window.dispatchEvent(
        new CustomEvent("porco:saldo-atualizado", {
          detail: { saldo: Number(saldo.toFixed(2)) }
        })
      );
    } catch (_err) {
      // Mantém fluxo sem quebrar UI caso localStorage esteja corrompido.
    }
  }

  function pararMonitoramentoPix() {
    if (monitorPixTimer) {
      clearInterval(monitorPixTimer);
      monitorPixTimer = null;
    }
    monitorPixIniciadoEm = 0;
  }

  async function verificarPagamentoPix(depositoId, paymentId, usuario, monitorUsuarioId) {
    const cpf = apenasDigitos((usuario && (usuario.cpfCnpj || usuario.cpf_cnpj)) || "");
    const usuarioIdMonitor = Number(monitorUsuarioId || 0);
    const usuarioIdSessao = Number((usuario && usuario.id) || 0);
    const usuarioId = Number.isFinite(usuarioIdMonitor) && usuarioIdMonitor > 0
      ? usuarioIdMonitor
      : (Number.isFinite(usuarioIdSessao) ? usuarioIdSessao : 0);

    const resp = await fetch(CONSULTAR_PIX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        deposito_id: Number(depositoId || 0),
        payment_id: String(paymentId || ""),
        usuario_id: Number.isFinite(usuarioId) ? usuarioId : 0,
        cpf
      })
    });

    let payload = null;
    try {
      payload = await resp.json();
    } catch (_err) {
      payload = null;
    }

    if (!resp.ok || !payload || payload.ok !== true) {
      throw new Error(
        payload && payload.error ? String(payload.error) : `Falha ao consultar Pix (${resp.status}).`
      );
    }

    if (payload.pago === true) {
      atualizarSaldoLocalUsuarioLogado(payload.saldo);
      // Após confirmar, remove o QR da tela para limpar a interface automaticamente.
      limparResultadoPix(true);
      setStatus("Pagamento confirmado! Saldo atualizado.", false);
      pararMonitoramentoPix();
      return true;
    }

    return false;
  }

  function iniciarMonitoramentoPix(depositoId, paymentId, usuario, monitorUsuarioId) {
    pararMonitoramentoPix();
    monitorPixIniciadoEm = Date.now();
    verificarPagamentoPix(depositoId, paymentId, usuario, monitorUsuarioId).catch(() => {});
    monitorPixTimer = setInterval(async () => {
      try {
        const pago = await verificarPagamentoPix(depositoId, paymentId, usuario, monitorUsuarioId);
        if (pago) return;

        // Timeout de 10 minutos para não ficar consultando indefinidamente.
        if (Date.now() - monitorPixIniciadoEm > 10 * 60 * 1000) {
          setStatus("Pix gerado. Aguardando confirmação do pagamento.", false);
          pararMonitoramentoPix();
        }
      } catch (_err) {
        // Em caso de erro transitório, segue tentando até timeout.
      }
    }, 3000);
  }

  function limparResultadoPix(manterStatus = false) {
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
    if (!manterStatus) {
      setStatus("", false);
    }
  }

  function atualizarVisibilidadePix() {
    const card = el(IDS.card);
    const btnGerar = el(IDS.btnGerar);
    if (!card) return;

    const usuario = carregarUsuarioLogado();
    if (!usuario) {
      pararMonitoramentoPix();
      card.style.display = "none";
      limparResultadoPix();
      preencherUsuarioAutomatico();
      return;
    }

    card.style.display = "";
    preencherUsuarioAutomatico();
    estadoUsuarioPixAtual = JSON.stringify({
      id: Number(usuario.id || 0),
      login: String(usuario.login || ""),
      whatsappVerificado: usuarioWhatsappVerificado(usuario),
      whatsappVerificationRequired: usuarioExigeWhatsappVerificado(usuario)
    });
    if (btnGerar) {
      const requerConfirmacao = usuarioExigeWhatsappVerificado(usuario);
      const verificado = usuarioWhatsappVerificado(usuario);
      btnGerar.disabled = requerConfirmacao && !verificado;
      if (requerConfirmacao && !verificado) {
        setStatus("Confirme seu WhatsApp no cadastro para liberar o depósito Pix.", true);
      } else if (String(el(IDS.status)?.textContent || "").includes("Confirme seu WhatsApp")) {
        setStatus("", false);
      }
    }
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
    if (usuarioExigeWhatsappVerificado(usuarioLogado) && !usuarioWhatsappVerificado(usuarioLogado)) {
      setStatus("Confirme seu WhatsApp antes de gerar Pix.", true);
      return;
    }
    const cpfUsuario = apenasDigitos(usuarioLogado.cpfCnpj || usuarioLogado.cpf_cnpj || "");
    if (cpfUsuario.length !== 11) {
      setStatus("CPF obrigatório para depósito Pix. Atualize seu cadastro com 11 dígitos.", true);
      return;
    }

    const valor = normalizarValor(inputValor.value);

    if (valor <= 0) {
      setStatus("Informe um valor maior que zero.", true);
      return;
    }

    btn.disabled = true;
    setStatus("Sincronizando usuário da carteira...", false);

    try {
      let usuarioId = 0;
      try {
        usuarioId = await buscarUsuarioIdCarteira(usuarioLogado);
      } catch (_syncErr) {
        // Fallback: segue com backend direto pelo login do usuário.
        usuarioId = Number(usuarioLogado.id || 0);
      }

      inputId.value = String(usuarioId > 0 ? usuarioId : "");
      const resumo = el(IDS.resumo);
      if (resumo) {
        if (usuarioId > 0) {
          resumo.textContent = `Usuário logado: @${usuarioLogado.login || "--"} (ID carteira: ${usuarioId})`;
        } else {
          resumo.textContent = `Usuário logado: @${usuarioLogado.login || "--"} (fallback por login ativo)`;
        }
      }

      setStatus("Gerando Pix...", false);

      const resp = await fetch("backend/criar_pix.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          login: String(usuarioLogado.login || ""),
          nome: String(usuarioLogado.nome || ""),
          email: String(usuarioLogado.email || ""),
          cpf_cnpj: cpfUsuario,
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
      const monitorUsuarioId = Number(payload.usuario_id || usuarioId || 0);
      iniciarMonitoramentoPix(
        payload.deposito_id,
        payload.payment_id || payload.asaas_payment_id,
        usuarioLogado,
        monitorUsuarioId
      );
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
      const usuarioAtual = carregarUsuarioLogado();
      const novoEstadoUsuario = JSON.stringify({
        id: Number((usuarioAtual && usuarioAtual.id) || 0),
        login: String((usuarioAtual && usuarioAtual.login) || ""),
        whatsappVerificado: usuarioWhatsappVerificado(usuarioAtual),
        whatsappVerificationRequired: usuarioExigeWhatsappVerificado(usuarioAtual)
      });
      if (novaSessao !== sessaoAtual || novoEstadoUsuario !== estadoUsuarioPixAtual) {
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
