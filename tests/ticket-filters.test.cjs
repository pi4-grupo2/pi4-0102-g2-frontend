const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function application() {
  let route = 'chamados';
  const nodes = new Map();
  const timers = new Set();
  for (const id of ['pageContent', 'searchTickets', 'filterTechnician', 'filterDepartment', 'filterDate', 'filterStatus', 'filterPriority', 'filterCategory', 'btnClearFilters']) {
    nodes.set(id, { value: '', innerHTML: '', listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; } });
  }
  const context = vm.createContext({
    setTimeout: handler => { timers.add(handler); return handler; },
    clearTimeout: handler => timers.delete(handler),
    document: { addEventListener() {}, querySelector: () => null, getElementById: id => nodes.get(id) || null },
    Router: { getCurrentRoute: () => route }
  });
  const run = code => vm.runInContext(code, context);
  for (const file of ['departments', 'i18n', 'data', 'components', 'app']) {
    run(fs.readFileSync(path.join(__dirname, '../frontend/js', `${file}.js`), 'utf8'));
  }
  run(`CURRENT_USER = {id: 1, department: 'TI'};
    USERS = [{id: 1, name: 'Ana <TI>', department: 'TI'},
      {id: 2, name: 'Bruno', department: 'Tecnologia da Informação'},
      {id: 3, name: 'Carla', department: 'Vendas'}, {id: 4, name: 'Daniel', department: 'Compras'}];
    CATEGORIES = [{id: 1, name: 'Sistemas'}];
    tickets = [
      {id: 10, title: 'Venda A', clientId: 3, supportId: 1, createdAt: '2026-11-04T09:00:00', status: 'CLOSED', categoryId: 1, priority: 'HIGH'},
      {id: 11, title: 'Compra B', clientId: 4, supportId: '1', createdAt: '2026-11-05T09:00:00', status: 'NEW', categoryId: 1, priority: 'LOW'},
      {id: 12, title: 'Venda C', clientId: 3, supportId: 2, createdAt: '2026-11-04T18:00:00', status: 'NEW', categoryId: 1, priority: 'HIGH'},
      {id: 13, title: 'Venda D', clientId: 3, supportId: 3, createdAt: 'invalid', status: 'NEW', categoryId: 1, priority: 'LOW'}
    ]; tickets.forEach(ticket => { ticket.description = ''; }); App.renderLiveViews();`);
  return {
    run, nodes,
    flushSearch() { for (const handler of timers) handler(); timers.clear(); },
    change(id, value) { const node = nodes.get(id); node.value = value; node.listeners.change(); },
    ids() { return [...(nodes.get('ticketListResults') || nodes.get('pageContent')).innerHTML.matchAll(/onclick="App.viewTicket\((\d+)\)/g)].map(match => Number(match[1])).sort(); },
    navigate(value) { route = value; run('App.renderLiveViews()'); }
  };
}

test('technician and requester sector filters combine and retain selection after updates', () => {
  const app = application();
  const html = app.nodes.get('pageContent').innerHTML;
  assert.match(html, /Ana &lt;TI&gt;/);
  assert.match(html, /<option value="2">Bruno/);
  assert.doesNotMatch(html, /<option value="3">Carla/);
  app.change('filterTechnician', '1');
  assert.deepEqual(app.ids(), [10, 11]);
  app.change('filterDepartment', 'Vendas');
  assert.deepEqual(app.ids(), [10]);
  app.run('App.renderLiveViews()');
  assert.equal(app.nodes.get('filterTechnician').value, '1');
  assert.equal(app.nodes.get('filterDepartment').value, 'Vendas');
  app.change('filterPriority', 'LOW');
  assert.deepEqual(app.ids(), []);
});

test('calendar filters by local opening day, ignores invalid dates and can be cleared', () => {
  const app = application();
  assert.match(app.nodes.get('pageContent').innerHTML, /type="date"[^>]*id="filterDate"/);
  app.change('filterDate', '2026-11-04');
  assert.deepEqual(app.ids(), [10, 12]);
  // This instant is on November 4 in local time, regardless of the host timezone.
  const instant = new Date(2026, 10, 4, 23, 30).toISOString();
  app.run(`tickets[1].createdAt = ${JSON.stringify(instant)}; App.renderLiveViews()`);
  assert.deepEqual(app.ids(), [10, 11, 12]);
  app.change('filterDate', '2026-11-06');
  assert.deepEqual(app.ids(), []);
  app.nodes.get('btnClearFilters').listeners.click();
  assert.deepEqual(app.ids(), [10, 11, 12, 13]);
  assert.equal(app.nodes.get('filterDate').value, '');
});

test('resolved tickets keep independent filters and always require closed status', () => {
  const app = application();
  app.change('filterTechnician', '2');
  app.navigate('resolvidos');
  assert.deepEqual(app.ids(), [10]);
  assert.equal(app.nodes.get('filterTechnician').value, '');
  app.change('filterDate', '2026-11-05');
  assert.deepEqual(app.ids(), []);
  app.nodes.get('btnClearFilters').listeners.click();
  assert.deepEqual(app.ids(), [10]);
  app.navigate('chamados');
  assert.equal(app.nodes.get('filterTechnician').value, '2');
  assert.deepEqual(app.ids(), [12]);
});

test('filters preserve department access restrictions', () => {
  const app = application();
  app.run('CURRENT_USER = USERS[2]; App.renderLiveViews()');
  assert.deepEqual(app.ids(), [10, 12, 13]);
  app.change('filterDepartment', 'Compras');
  assert.deepEqual(app.ids(), []);
  app.change('filterTechnician', '1');
  assert.deepEqual(app.ids(), []);
});


test('live updates and debounced search preserve the mounted toolbar and typed selection', () => {
  const app = application();
  const page = app.nodes.get('pageContent');
  let pageWrites = 0;
  Object.defineProperty(page, 'innerHTML', { get: () => '', set: () => { pageWrites++; } });
  let markup = '';
  let resultWrites = 0;
  const results = {};
  Object.defineProperty(results, 'innerHTML', {
    get: () => markup,
    // Simulate browser normalization of generated markup.
    set: value => { resultWrites++; markup = value.replaceAll('/>', '></svg>'); }
  });
  app.nodes.set('ticketListResults', results);
  const input = app.nodes.get('searchTickets');
  input.value = 'Venda';
  input.selectionStart = 2;
  input.selectionEnd = 4;
  input.listeners.input();
  app.run("tickets[0].priority = 'LOW'; App.renderLiveViews()");
  assert.equal(pageWrites, 0);
  assert.equal(app.nodes.get('searchTickets'), input);
  assert.equal(input.value, 'Venda');
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 4);
  app.flushSearch();
  assert.deepEqual(app.ids(), [10, 12, 13]);
  const writes = resultWrites;
  app.run('App.renderLiveViews()');
  assert.equal(resultWrites, writes);
  assert.equal(pageWrites, 0);
  assert.equal(input.value, 'Venda');
});

test('partial results support empty searches and clearing the mounted controls', () => {
  const app = application();
  app.nodes.set('ticketListResults', { innerHTML: '' });
  app.change('filterPriority', 'HIGH');
  const input = app.nodes.get('searchTickets');
  input.value = 'inexistente';
  input.listeners.input();
  app.flushSearch();
  assert.deepEqual(app.ids(), []);
  assert.match(app.nodes.get('ticketListResults').innerHTML, /table-empty/);
  app.nodes.get('btnClearFilters').listeners.click();
  assert.equal(input.value, '');
  assert.equal(app.nodes.get('filterPriority').value, '');
  assert.deepEqual(app.ids(), [10, 11, 12, 13]);
});
