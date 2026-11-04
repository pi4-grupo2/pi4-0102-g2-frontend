const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function application() {
  const requests = [];
  const context = vm.createContext({
    localStorage: { getItem: () => 'test-token' },
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, ...options, body: options.body && JSON.parse(options.body) });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 42 }) };
    }
  });
  for (const file of ['departments', 'i18n', 'data', 'api', 'components']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js', `${file}.js`), 'utf8'), context);
  }
  return { requests, run: code => vm.runInContext(code, context) };
}

test('only department TI grants management, regardless of role', () => {
  const app = application();
  assert.equal(app.run(`isTIUser({ role: 'ADMIN', department: 'Financeiro' })`), false);
  assert.equal(app.run(`isTIUser({ role: 'SUPPORT', department: 'Compras' })`), false);
  assert.equal(app.run(`isTIUser({ role: 'CLIENT', department: 'TI' })`), true);
  assert.equal(app.run(`isTIUser({ department: ' Tecnologia da Informação ' })`), true);
  assert.equal(app.run(`isTIUser({ department: 'Administrativo' })`), false);
  assert.equal(app.run(`isTIUser({ role: 'ADMIN' })`), false);
});

test('creation sends a real assignee from any department, never trusts a submitted initial status', async () => {
  const app = application();
  await app.run(`Api.createTicket({ title: 'Teste', description: 'Detalhes', priority: 'HIGH', categoryId: 2, supportId: 7, status: 'CLOSED' })`);
  assert.deepEqual(app.requests[0].body, {
    title: 'Teste', description: 'Detalhes', priority: 'HIGH', categoryId: 2, supportId: 7
  });
  assert.equal(app.requests[0].method, 'POST');
  assert.equal(app.requests[0].headers.Authorization, 'Bearer test-token');
});

test('unauthorized mutations never issue an HTTP request', async () => {
  const app = application();
  app.run(`CURRENT_USER = { role: 'ADMIN', department: 'Financeiro' }`);
  await assert.rejects(app.run(`Api.updateTicket(42, {status: 'CLOSED'})`), /TI/);
  await assert.rejects(app.run(`Api.deleteTicket(42)`), /TI/);
  assert.equal(app.requests.length, 0);
  app.run(`CURRENT_USER.department = 'TI'`);
  await app.run(`Api.updateTicket(42, {status: 'CLOSED'})`);
  assert.equal(app.requests[0].method, 'PUT');
});

test('non-TI sees status and read actions, but no edit/delete controls or edit modal', () => {
  const app = application();
  app.run(`CURRENT_USER = { id: 1, department: 'Vendas', role: 'ADMIN' };
    tickets = [{ id: 42, title: 'Teste', status: 'ASSIGNED', priority: 'HIGH' }];`);
  const row = app.run(`renderTicketRow(tickets[0])`);
  assert.match(row, /Em atendimento/);
  assert.match(row, /App.viewTicket/);
  assert.doesNotMatch(row, /App.editTicket|App.confirmDeleteTicket/);
  assert.equal(app.run(`renderTicketModal(tickets[0])`), '');
  assert.doesNotMatch(app.run(`renderTicketModal()`), /ticketDepartment|ticketTechnician/);
  app.run(`CURRENT_USER.department = 'TI'`);
  assert.match(app.run(`renderTicketRow(tickets[0])`), /App.editTicket/);
});

test('assignment lists include non-TI users, filter by department and escape names', () => {
  const app = application();
  app.run(`USERS = [
    {id: 1, name: 'Ana <Financeiro>', department: 'Financeiro', role: 'CLIENT'},
    {id: 2, name: 'Bruno', department: 'TI', role: 'SUPPORT'}
  ];`);
  assert.match(app.run(`renderAssigneeOptions()`), /value="1"/);
  const financeOptions = app.run(`renderAssigneeOptions('Financeiro')`);
  assert.match(financeOptions, /Ana &lt;Financeiro&gt;/);
  assert.doesNotMatch(financeOptions, /Bruno/);
  assert.match(app.run(`renderAssigneeOptions('Marketing')`), /Nenhuma pessoa cadastrada/);
});

test('status labels preserve the four API enum values documented in CT22', () => {
  const app = application();
  const statuses = JSON.parse(app.run(`JSON.stringify(i18n.getStatusList().map(({id,label}) => [id,label]))`));
  assert.deepEqual(statuses, [['NEW','Em aberto'], ['ASSIGNED','Em atendimento'], ['CLOSED','Resolvido'], ['UNRESOLVED','Não solucionado']]);
});
