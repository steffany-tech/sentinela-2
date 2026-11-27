const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Avoid a missing /favicon.ico request from browsers that do not honor the SVG link.
app.get("/favicon.ico", (req, res) => {
  res.type("image/svg+xml").sendFile(path.join(__dirname, "favicon.svg"));
});

// The HTML and static assets are stored in the repository root.
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: [],
      estoque: [],
      entradas: []
    };
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  // Older database files predate the warehouse feature.
  db.estoque = Array.isArray(db.estoque) ? db.estoque : [];
  db.entradas = Array.isArray(db.entradas) ? db.entradas : [];
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function registrarEntrada(db, medicamento, quantidade, observacao = "") {
  const entrada = {
    id: Date.now(),
    medicamentoId: medicamento.id,
    nome: medicamento.nome,
    quantidade,
    unidade: medicamento.unidade || "unidades",
    observacao,
    responsavel: "Almoxarifado",
    createdAt: new Date().toISOString()
  };
  db.entradas.unshift(entrada);
  return entrada;
}

// CADASTRAR USUÁRIO
app.post("/usuarios", (req, res) => {
  const db = readDB();
  const { usuario, senha, tipo } = req.body;

  if (!usuario || !senha || !tipo) {
    return res.status(400).json({ erro: "Preencha todos os campos!" });
  }

  const existente = db.usuarios.find(u => u.usuario === usuario);
  if (existente) {
    return res.status(409).json({ erro: "Esse usuário já está cadastrado!" });
  }

  const novoUsuario = { id: Date.now(), usuario, senha, tipo };
  db.usuarios.push(novoUsuario);
  writeDB(db);
  res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!" });
});

// LISTAR USUÁRIOS
app.get("/usuarios", (req, res) => {
  const db = readDB();
  const usuarios = db.usuarios.map(u => ({ id: u.id, usuario: u.usuario, tipo: u.tipo }));
  res.json(usuarios);
});

// LOGIN
app.post("/login", (req, res) => {
  const db = readDB();
  const user = db.usuarios.find(u =>
    u.usuario === req.body.usuario && u.senha === req.body.senha
  );
  if (!user) return res.status(401).json({ erro: "Login inválido" });
  res.json(user);
});

// ATENDIMENTO
app.post("/atendimento", (req, res) => {
  const db = readDB();
  const paciente = {
    id: Date.now(),
    nome: req.body.nome,
    cpf: req.body.cpf,
    tipo: req.body.tipo,
    status: "triagem",
    createdAt: new Date()
  };
  db.pacientes.push(paciente);
  writeDB(db);
  res.json(paciente);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  const db = readDB();
  let risco = req.body.risco;
  if (req.body.temperatura >= 39) risco = "vermelho";
  else if (req.body.temperatura >= 38) risco = "amarelo";
  else if (!risco) risco = "verde";

  const triagem = {
    id: Date.now(),
    nome: req.body.nome,
    sintoma: req.body.sintoma,
    temperatura: req.body.temperatura,
    alergia: req.body.alergia,
    observacao: req.body.observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date()
  };
  db.triagens.push(triagem);
  writeDB(db);
  res.json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// ALMOXARIFADO: listar medicamentos em estoque.
app.get("/estoque", (req, res) => {
  res.json(readDB().estoque);
});

// Cadastrar medicamento e registrar sua entrada inicial.
app.post("/estoque", (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const quantidade = Number(req.body.quantidade);
  const unidade = String(req.body.unidade || "unidades").trim();
  const categoria = String(req.body.categoria || "Geral").trim();

  if (!nome || !Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({ erro: "Informe o medicamento e uma quantidade válida." });
  }

  const db = readDB();
  if (db.estoque.some(item => item.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) {
    return res.status(409).json({ erro: "Esse medicamento já está cadastrado. Use a opção de reposição." });
  }

  const medicamento = { id: Date.now(), nome, quantidade, unidade, categoria };
  db.estoque.push(medicamento);
  registrarEntrada(db, medicamento, quantidade);
  writeDB(db);
  res.status(201).json({ mensagem: "Entrada registrada com sucesso.", medicamento });
});

// Atualizar a quantidade por delta (positivo adiciona; negativo remove).
app.patch("/estoque/:id", (req, res) => {
  const quantidade = Number(req.body.quantidade);
  if (!Number.isInteger(quantidade) || quantidade === 0) {
    return res.status(400).json({ erro: "Informe uma quantidade inteira diferente de zero." });
  }

  const db = readDB();
  const medicamento = db.estoque.find(item => String(item.id) === req.params.id);
  if (!medicamento) return res.status(404).json({ erro: "Medicamento não encontrado." });
  if (medicamento.quantidade + quantidade < 0) {
    return res.status(400).json({ erro: "A quantidade não pode deixar o estoque negativo." });
  }

  medicamento.quantidade += quantidade;
  if (quantidade > 0) registrarEntrada(db, medicamento, quantidade, req.body.observacao || "");
  writeDB(db);
  res.json({ mensagem: "Estoque atualizado.", medicamento });
});

app.delete("/estoque/:id", (req, res) => {
  const db = readDB();
  const index = db.estoque.findIndex(item => String(item.id) === req.params.id);
  if (index === -1) return res.status(404).json({ erro: "Medicamento não encontrado." });
  const [medicamento] = db.estoque.splice(index, 1);
  writeDB(db);
  res.json({ mensagem: "Medicamento removido.", medicamento });
});

app.get("/historico-entradas", (req, res) => {
  res.json(readDB().entradas);
});

// Lista fixa de medicações
app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona", "Paracetamol", "Ibuprofeno", "Amoxicilina", "Azitromicina",
    "Loratadina", "Omeprazol", "Buscopan", "Dramin", "Soro fisiológico"
  ]);
});

// CONSULTA
app.post("/consulta", (req, res) => {
  const db = readDB();
  const consulta = {
    id: Date.now(),
    paciente: req.body.paciente,
    diagnostico: req.body.diagnostico,
    medicacao: req.body.medicacao,
    obs: req.body.obs,
    createdAt: new Date()
  };
  db.consultas.push(consulta);
  writeDB(db);
  res.json(consulta);
});

// MEDICAÇÕES
app.get("/medicacoes", (req, res) => {
  res.json(readDB().consultas);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🏥 Hospital Pro rodando na porta ${port}`);
});
