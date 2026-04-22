let saldo = 0;
let apostaAtual = null;
let historico = [];
let travado = false;

function atualizarSaldo() {
  document.getElementById("saldo").innerText = saldo.toFixed(2);
}

function trocarTela(id) {
  document.querySelectorAll(".tela").forEach(t => t.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
}

function depositar() {
  let valor = parseFloat(document.getElementById("valorDeposito").value);

  saldo += valor;
  atualizarSaldo();
  alert("Depósito realizado!");
}

function apostar() {
  let numero = parseInt(document.getElementById("numero").value);
  let valor = parseFloat(document.getElementById("valorAposta").value);

  if (apostaAtual) return alert("Já existe aposta ativa!");
  if (saldo < valor) return alert("Saldo insuficiente");

  saldo -= valor;
  atualizarSaldo();

  apostaAtual = { numero, valor };

  alert("Aposta registrada!");
}

function sortear() {
  if (travado) return;
  if (!apostaAtual) return alert("Faça uma aposta primeiro!");

  travado = true;

  let texto = document.getElementById("resultadoTexto");
  texto.innerText = "Sorteando...";

  let anim = setInterval(() => {
    texto.innerText = Math.floor(Math.random() * 100);
  }, 80);

  setTimeout(() => {
    clearInterval(anim);

    let resultado = Math.floor(Math.random() * 100);
    texto.innerText = resultado;

    document.getElementById("resultadoHome").innerText = resultado;

    processar(resultado);

    travado = false;
  }, 1500);
}

function processar(resultado) {
  if (apostaAtual.numero == resultado) {
    let ganho = apostaAtual.valor * 10;
    saldo += ganho;

    mostrarEfeito("ganhou");
    alert("GANHOU R$ " + ganho);
  } else {
    mostrarEfeito("perdeu");
    alert("Não foi dessa vez");
  }

  historico.push({ ...apostaAtual, resultado });
  apostaAtual = null;

  atualizarSaldo();
  atualizarHistorico();
}

function mostrarEfeito(tipo) {
  document.body.classList.add(tipo);

  setTimeout(() => {
    document.body.classList.remove(tipo);
  }, 500);
}

function atualizarHistorico() {
  let el = document.getElementById("historico");
  el.innerHTML = "";

  historico.slice(-5).reverse().forEach(h => {
    el.innerHTML += `<p>🎯 ${h.numero} | 🎲 ${h.resultado}</p>`;
  });
}
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function openGame() {
  show("game");
}
function sortear() {
  if (travado) return;
  if (!apostaAtual) return alert("Faça uma aposta primeiro!");

  travado = true;

  let el = document.getElementById("resultadoTexto");
  el.innerText = "Girando...";

  let i = 0;

  let interval = setInterval(() => {
    el.innerText = Math.floor(Math.random() * 100);
    i++;
  }, 50);

  setTimeout(() => {
    clearInterval(interval);

    let resultado = Math.floor(Math.random() * 100);
    el.innerText = resultado;

    document.getElementById("resultadoHome").innerText = resultado;

    processar(resultado);

    travado = false;
  }, 2000);
}
function efeito(tipo) {
  document.body.classList.add(tipo);

  setTimeout(() => {
    document.body.classList.remove(tipo);
  }, 400);
}
function processar(resultado) {
  let ganhou = apostaAtual.numero === resultado;

  if (ganhou) {
    let ganho = apostaAtual.valor * 10;
    saldo += ganho;

    efeito("win");

    alert("🎉 VOCÊ GANHOU R$ " + ganho);
  } else {
    efeito("lose");

    alert("❌ Você perdeu!");
  }

  historico.push({
    ...apostaAtual,
    resultado,
    ganhou
  });

  apostaAtual = null;

  atualizarSaldo();
  atualizarHistorico();
}