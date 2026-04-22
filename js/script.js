let saldo = 0;
let apostaAtual = null;
let historico = [];

const animais = [
  "avestruz","aguia","burro","borboleta","cachorro",
  "cabra","carneiro","camelo","cobra","coelho",
  "cavalo","elefante","galo","gato","jacare",
  "leao","macaco","porco","pavao","peru",
  "touro","tigre","urso","veado","vaca"
];

window.onload = () => {
  atualizarSaldo();
  carregarAnimais();
};

function atualizarSaldo() {
  document.getElementById("saldo").innerText = saldo.toFixed(2);
}

function depositar() {
  saldo += 100;
  atualizarSaldo();
}

function trocarTela(tela) {
  document.getElementById("home").style.display = "none";
  document.getElementById("apostar").style.display = "none";
  document.getElementById(tela).style.display = "block";
}

function carregarAnimais() {
  const lista = document.getElementById("listaAnimais");

  animais.forEach(nome => {
    const div = document.createElement("div");
    div.className = "animal";

    div.innerHTML = `
      <img src="./img/animais/${nome}.png">
      <span>${nome}</span>
    `;

    div.onclick = () => selecionarAnimal(div, nome);

    lista.appendChild(div);
  });
}

function selecionarAnimal(el, animal) {
  document.querySelectorAll(".animal").forEach(a => a.style.background = "#334155");
  el.style.background = "#22c55e";
  apostaAtual = animal;
}

function apostar() {
  let valor = parseFloat(document.getElementById("valor").value);

  if (!apostaAtual) return alert("Escolha um animal!");
  if (!valor || valor <= 0) return alert("Valor inválido!");
  if (valor > saldo) return alert("Saldo insuficiente!");

  saldo -= valor;

  let i = 0;
  let roleta = document.getElementById("roleta");

  let interval = setInterval(() => {
    roleta.innerText = animais[i % animais.length];
    i++;
  }, 100);

  setTimeout(() => {
    clearInterval(interval);

    let sorteado = animais[Math.floor(Math.random() * animais.length)];

    let ganhou = sorteado === apostaAtual;

    if (ganhou) saldo += valor * 10;

    atualizarSaldo();

    roleta.innerText = "🎯 " + sorteado;

    historico.unshift({
      animal: apostaAtual,
      valor,
      sorteado
    });

    atualizarHistorico();

  }, 2000);
}

function atualizarHistorico() {
  const div = document.getElementById("historico");
  div.innerHTML = "";

  historico.slice(0, 10).forEach(item => {
    const ganhou = item.animal === item.sorteado;

    div.innerHTML += `
      <div style="background:${ganhou ? 'green' : 'red'}">
        R$${item.valor} - ${item.animal} → ${item.sorteado}
      </div>
    `;
  });
}