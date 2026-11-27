// Helpers for the warehouse page. This file is intentionally loaded after the page's
// inline script so these corrected implementations are available to its load handler.
(() => {
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.erro || `Erro HTTP ${response.status}`);
    return data;
  };

  const showError = error => {
    if (typeof window.showToast === "function") window.showToast(error.message || "Falha na operação.", "error");
    else console.error(error);
  };

  const textCell = (tag, text, className) => {
    const element = document.createElement(tag);
    element.textContent = text == null ? "" : String(text);
    if (className) element.className = className;
    return element;
  };

  window.carregarEstoque = async function carregarEstoque() {
    const tbody = document.getElementById("tableEstoque") || document.getElementById("tabelaEstoque");
    if (!tbody) return;
    try {
      const items = await api("/estoque");
      window.estoqueGlobal = items;
      ["statItens", "statOk", "statBaixo", "statZerado"].forEach(id => {
        if (!document.getElementById(id)) return;
      });
      const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
      set("statItens", items.length);
      set("statOk", items.filter(item => Number(item.quantidade) > 10).length);
      set("statBaixo", items.filter(item => Number(item.quantidade) > 0 && Number(item.quantidade) <= 10).length);
      set("statZerado", items.filter(item => Number(item.quantidade) <= 0).length);

      const low = items.filter(item => Number(item.quantidade) > 0 && Number(item.quantidade) <= 10);
      const empty = items.filter(item => Number(item.quantidade) <= 0);
      const alert = document.getElementById("alertaEstoque");
      const alertText = document.getElementById("alertaTexto");
      if (alert && alertText) {
        const messages = [];
        if (empty.length) messages.push(`${empty.length} medicamento(s) esgotado(s): ${empty.map(item => item.nome).join(", ")}`);
        if (low.length) messages.push(`${low.length} medicamento(s) com estoque baixo`);
        alertText.textContent = messages.length ? `${messages.join(" | ")} — reponha com urgência!` : "";
        alert.style.display = messages.length ? "flex" : "none";
      }

      const filterBox = document.getElementById("filterChips");
      if (filterBox) {
        filterBox.replaceChildren();
        const categories = [...new Set(items.map(item => item.categoria).filter(Boolean))];
        const addChip = (category, label) => {
          const chip = textCell("button", label, `chip ${window.filtroAtivo === category ? "active" : ""}`);
          chip.type = "button";
          chip.addEventListener("click", () => window.setFiltro(category, chip));
          filterBox.appendChild(chip);
        };
        addChip("todos", "Todos");
        categories.forEach(category => addChip(category, category));
      }

      const search = (document.getElementById("buscaMed")?.value || "").trim().toLocaleLowerCase("pt-BR");
      const category = window.filtroAtivo || "todos";
      const filtered = items.filter(item =>
        (category === "todos" || item.categoria === category) &&
        `${item.nome || ""} ${item.categoria || ""}`.toLocaleLowerCase("pt-BR").includes(search)
      );
      tbody.replaceChildren();
      if (!filtered.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        const emptyState = textCell("div", "Nenhum medicamento encontrado.", "empty-state");
        cell.appendChild(emptyState);
        row.appendChild(cell);
        tbody.appendChild(row);
      } else {
        filtered.forEach(item => {
          const row = document.createElement("tr");
          row.appendChild(textCell("td", item.nome, "med-name"));
          row.appendChild(textCell("td", item.categoria || "—", "med-cat"));
          const quantity = Number(item.quantidade) || 0;
          const badge = textCell("span", `${quantity === 0 ? "🚫" : quantity <= 5 ? "🔴" : quantity <= 10 ? "🟡" : "🟢"} ${quantity}`, `stock-badge ${quantity === 0 ? "stock-empty" : quantity <= 5 ? "stock-critical" : quantity <= 10 ? "stock-low" : "stock-ok"}`);
          const amountCell = document.createElement("td"); amountCell.appendChild(badge); row.appendChild(amountCell);
          row.appendChild(textCell("td", item.unidade || "—"));
          const actions = document.createElement("td");
          const actionRow = document.createElement("div"); actionRow.className = "action-row";
          const edit = textCell("button", "Editar", "btn-sm btn-success"); edit.type = "button";
          edit.addEventListener("click", () => window.abrirModalEditar(item.id, item.nome, quantity));
          const remove = textCell("button", "Remover", "btn-sm btn-danger-sm"); remove.type = "button";
          remove.addEventListener("click", () => window.removerMedicamento(item.id, item.nome));
          actionRow.append(edit, remove); actions.appendChild(actionRow); row.appendChild(actions);
          tbody.appendChild(row);
        });
      }
      window.preencherSelectRepor();
    } catch (error) {
      showError(error);
      tbody.replaceChildren();
      const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 5;
      cell.textContent = `Não foi possível carregar o estoque: ${error.message}`; row.appendChild(cell); tbody.appendChild(row);
    }
  };

  window.setFiltro = function setFiltro(category, chip) {
    window.filtroAtivo = category;
    document.querySelectorAll("#filterChips .chip").forEach(item => item.classList.toggle("active", item === chip));
    window.carregarEstoque();
  };
  window.filtrarTabela = () => window.carregarEstoque();

  window.preencherSelectRepor = function preencherSelectRepor() {
    const select = document.getElementById("selReporMed");
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option("-- Selecione --", ""));
    (window.estoqueGlobal || []).forEach(item => select.add(new Option(`${item.nome} (atual: ${item.quantidade} ${item.unidade || "unidades"})`, item.id)));
    if (selected) select.value = selected;
  };

  window.darEntrada = async function darEntrada() {
    const nome = document.getElementById("emNome")?.value.trim();
    const quantidade = Number(document.getElementById("emQtd")?.value);
    const unidade = document.getElementById("emUnidade")?.value;
    const categoria = document.getElementById("emCategoria")?.value;
    if (!nome || !Number.isInteger(quantidade) || quantidade <= 0) return window.showToast("Informe um nome e uma quantidade válida.", "warning");
    try {
      const result = await api("/estoque", { method: "POST", body: JSON.stringify({ nome, quantidade, unidade, categoria }) });
      window.showToast(result.mensagem, "success");
      document.getElementById("emNome").value = "";
      document.getElementById("emQtd").value = "10";
      await Promise.all([window.carregarEstoque(), window.carregarHistoricoEntradas()]);
    } catch (error) { showError(error); }
  };

  window.reporEstoque = async function reporEstoque() {
    const id = document.getElementById("selReporMed")?.value;
    const quantidade = Number(document.getElementById("reporQtd")?.value);
    if (!id) return window.showToast("Selecione um medicamento.", "warning");
    if (!Number.isInteger(quantidade) || quantidade <= 0) return window.showToast("Informe uma quantidade válida.", "warning");
    try {
      const result = await api(`/estoque/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantidade, observacao: document.getElementById("reporObs")?.value || "" })
      });
      window.showToast(`+${quantidade} ${result.medicamento.unidade} adicionados. Total: ${result.medicamento.quantidade}.`, "success");
      document.getElementById("reporQtd").value = "10";
      document.getElementById("reporObs").value = "";
      await Promise.all([window.carregarEstoque(), window.carregarHistoricoEntradas()]);
    } catch (error) { showError(error); }
  };

  window.abrirModalEditar = function abrirModalEditar(id, nome, quantity) {
    window.editandoId = id;
    const label = document.getElementById("modalMedNome"); if (label) label.textContent = `💊 ${nome} — estoque atual: ${quantity}`;
    const input = document.getElementById("modalQtd"); if (input) input.value = "0";
    document.getElementById("modalEditar")?.classList.add("open");
  };
  window.fecharModal = function fecharModal() {
    document.getElementById("modalEditar")?.classList.remove("open");
    window.editandoId = null;
  };
  window.confirmarEdicao = async function confirmarEdicao() {
    const quantity = Number(document.getElementById("modalQtd")?.value);
    if (!window.editandoId) return;
    if (!Number.isInteger(quantity) || quantity === 0) return window.showToast("Informe uma quantidade inteira diferente de zero.", "warning");
    try {
      const result = await api(`/estoque/${encodeURIComponent(window.editandoId)}`, { method: "PATCH", body: JSON.stringify({ quantidade: quantity }) });
      window.showToast(`Estoque atualizado: ${result.medicamento.quantidade} ${result.medicamento.unidade}.`, "success");
      window.fecharModal();
      await Promise.all([window.carregarEstoque(), window.carregarHistoricoEntradas()]);
    } catch (error) { showError(error); }
  };
  window.removerMedicamento = async function removerMedicamento(id, nome) {
    if (!window.confirm(`Tem certeza que deseja remover "${nome}" do estoque?`)) return;
    try {
      await api(`/estoque/${encodeURIComponent(id)}`, { method: "DELETE" });
      window.showToast("Medicamento removido do estoque.", "success");
      await window.carregarEstoque();
    } catch (error) { showError(error); }
  };

  window.carregarHistoricoEntradas = async function carregarHistoricoEntradas() {
    const container = document.getElementById("historicoEntradas");
    if (!container) return;
    try {
      const entries = await api("/historico-entradas");
      container.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement("div"); empty.className = "empty-state";
        empty.append(textCell("div", "📋", "empty-icon"), textCell("p", "Nenhuma entrada registrada ainda."));
        container.appendChild(empty); return;
      }
      entries.slice(0, 10).forEach(entry => {
        const item = document.createElement("p");
        const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
        item.textContent = `${entry.nome}: +${entry.quantidade} ${entry.unidade || "unidades"}${date ? ` — ${date}` : ""}${entry.observacao ? ` — ${entry.observacao}` : ""}`;
        item.style.cssText = "padding: 10px 0; border-bottom: 1px solid var(--border);";
        container.appendChild(item);
      });
    } catch (error) { showError(error); }
  };

  // The original page uses two spellings for this button handler.
  window.carregaarHistoricoEntradas = window.carregarHistoricoEntradas;
})();
