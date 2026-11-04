const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function application() {
  let ticket = { id: 20, title: 'Emails excluídos', description: 'Recuperar emails', clientId: 1,
    supportId: 2, status: 'ASSIGNED', priority: 'MEDIUM', categoryId: 1 };
  const users = [{ id: 1, name: 'Adriana', department: 'Marketing' },
    { id: 2, name: 'Vinicius', department: 'TI' }, { id: 3, name: 'Ana', department: 'TI' }];
  const requests = [];
  let requestFailure = null;
  const toasts = [];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', value: '', classList: { add() {}, remove() {} }, listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; }, querySelector: () => null, querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const routes = {};
  const events = {};
  const timers = [];
  const storage = new Map();
  const context = vm.createContext({
    console, URLSearchParams, setInterval: (handler, delay) => { timers.push({ handler, delay }); },
    localStorage: { getItem: key => key === 'token' ? 'test-token' : storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value) },
    window: {},
    document: { body: { style: {} }, visibilityState: 'visible', addEventListener: (name, callback) => { events[name] = callback; }, querySelectorAll: () => [], querySelector: () => null, getElementById: node },
    ThemeManager: { init() {}, isDark: () => false },
    Router: { register: (name, handler) => { routes[name] = handler; }, init() {}, resolve() {}, getCurrentRoute: () => 'chamados' },
    fetch: async (url, options) => {
      const body = options.body && JSON.parse(options.body);
      requests.push({ url, method: options.method, cache: options.cache, body });
      const failure = requestFailure?.(url, options);
      if (failure) return { ok: false, status: failure.status, text: async () => JSON.stringify({ error: failure.message }) };
      let data;
      if (url.endsWith('/iniciar')) {
        if (ticket.status === 'NEW') ticket = { ...ticket, status: 'ASSIGNED', supportId: 2 };
        data = { success: true };
      }
      else if (options.method === 'PUT') { ticket = { ...ticket, ...body }; data = { success: true }; }
      else if (url.endsWith('/api/chamados/20')) data = { ticket: { ...ticket }, timeline: [] };
      else if (url.endsWith('/api/chamados')) data = [{ ...ticket }];
      else if (url.endsWith('/api/users')) data = users;
      else data = [];
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
  });
  const run = code => vm.runInContext(code, context);
  for (const file of ['departments', 'i18n', 'data', 'api', 'components', 'app']) {
    run(fs.readFileSync(path.join(__dirname, '../frontend/js', `${file}.js`), 'utf8'));
  }
  context.showToast = (...args) => toasts.push(args);
  run(`CURRENT_USER = { id: 2, name: 'Vinicius', department: 'TI' };
    USERS = ${JSON.stringify(users)}; tickets = [${JSON.stringify(ticket)}];`);
  return { run, requests, routes, events, timers, toasts, node, failRequests: handler => { requestFailure = handler; }, server: patch => { ticket = { ...ticket, ...patch }; } };
}

test('TI receives one alert for each new external-sector ticket and excludes TI requests', async () => {
  const { run, toasts } = application();
  await run('App.init()');
  assert.equal(toasts.length, 0);
  run(`window.fixture = [...tickets,
    {id: 31, title: 'Impressora parada', clientDepartment: 'Produção', status: 'NEW'},
    {id: 32, title: 'Pedido interno', clientId: 2, status: 'NEW'}];
    Api.fetchTickets = async () => window.fixture;`);
  await run('reloadTickets()');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][1], 'Chamado aberto (Produção)');
  assert.match(toasts[0][2], /Impressora parada/);
  assert.equal(run('getUnreadNotificationsCount()'), 1);
  await run('reloadTickets()');
  assert.equal(toasts.length, 1);
  assert.match(run('renderNotificationsList()'), /data-chamado-id="31"/);
});

test('local TI alerts survive reload and marking read never calls the backend for a local ID', async () => {
  const { run, requests } = application();
  await run('App.init()');
  run(`Api.fetchTickets = async () => [...tickets, {id: 31, title: 'Falha', clientId: 1}];`);
  await run('reloadTickets()');
  await run(`markNotificationAsRead('ticket-opened:31')`);
  run('ticketAlertsUser = null; syncTicketAlerts(false)');
  assert.equal(run('getVisibleNotifications().length'), 1);
  assert.equal(run('getUnreadNotificationsCount()'), 0);
  assert.equal(requests.some(r => r.url.includes('ticket-opened')), false);
});

test('sector accounts receive no TI opening alerts, even for their own new requests', async () => {
  const { run, toasts } = application();
  run(`CURRENT_USER = {id: 1, department: 'Marketing'};`);
  await run('App.init()');
  run(`Api.fetchTickets = async () => [...tickets, {id: 31, title: 'Falha', clientId: 1}];`);
  await run('reloadTickets()');
  assert.equal(toasts.length, 0);
  assert.equal(run('getUnreadNotificationsCount()'), 0);
});

test('backend copies of opening alerts are deduplicated and ticket text is escaped', async () => {
  const { run } = application();
  await run('App.init()');
  run(`tickets.push({id: 31, title: '<img src=x onerror=alert(1)>', clientId: 1});
    syncTicketAlerts();
    notifications = [{id: 8, ticketId: 31, type: 'chamado_novo'},
      {id: 9, ticketId: 20, type: 'status_alterado'}];`);
  assert.equal(run('getVisibleNotifications().length'), 2);
  assert.doesNotMatch(run('renderNotificationsList()'), /<img/);
  assert.match(run('renderNotificationsList()'), /&lt;img/);
  await run('markAllNotificationsAsRead()');
  assert.equal(run('getUnreadNotificationsCount()'), 0);
});

test('notification sound is unlocked by interaction and only played for TI', async () => {
  const { run, events } = application();
  await run('App.init()');
  run(`window.tones = 0;
    window.AudioContext = class {
      constructor() { this.state = 'suspended'; this.currentTime = 0; }
      async resume() { this.state = 'running'; }
      createOscillator() { return {frequency: {}, connect() {}, start() { window.tones++; }, stop() {}}; }
      createGain() { return {gain: {setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}}; }
    };`);
  await events.pointerdown();
  run(`App.notifyNewTickets([{title: 'Chamado aberto (Produção)', message: 'Falha'}])`);
  assert.equal(run('window.tones'), 2);
  run(`CURRENT_USER.department = 'Produção'; App.notifyNewTickets([{title: 'Teste', message: 'Teste'}])`);
  assert.equal(run('window.tones'), 2);
});

test('department column follows title in both tables and uses requester rather than assignee sector', () => {
  const { run } = application();
  for (const view of ['renderTicketsList()', 'renderDashboard()']) {
    const html = run(view);
    assert.match(html, /Título[\s\S]*?<\/th>\s*<th>Departamento<\/th>/);
    assert.match(html, /<td>Marketing<\/td>/);
  }
  assert.match(run(`renderTicketDetail(tickets[0])`), /Adriana<\/span>\s*<small[^>]*>Marketing<\/small>/);
});

test('creation department selector excludes legacy and test departments without editing users', () => {
  const { run } = application();
  run(`USERS.push(...['SI', 'Sistemas de Informação', 'teste', 'tst'].map((department, i) => ({id: 10 + i, name: 'Pessoa', department})))`);
  const html = run(`renderTicketModal()`);
  const select = html.match(/id="ticketDepartment">([\s\S]*?)<\/select>/)[1];
  assert.doesNotMatch(select, /value="(?:SI|Sistemas de Informação|teste|tst)"/);
  assert.match(select, /value="Marketing"/);
  assert.equal(run(`USERS.length`), 7);
});

test('fresh detail also updates list state and dashboard statistics; GET requests bypass cache', async () => {
  const { run, server, requests } = application();
  server({ status: 'CLOSED' });
  await run(`Api.fetchTicketById(20)`);
  assert.equal(run(`tickets[0].status`), 'CLOSED');
  assert.equal(run(`getDashboardStats().closed`), 1);
  assert.match(run(`renderTicketsList()`), /Resolvido/);
  assert.equal(requests[0].cache, 'no-store');
});

test('reassigning a resolved ticket preserves server status even when local list is stale', async () => {
  const { run, server, requests } = application();
  server({ status: 'CLOSED' });
  await run(`App.quickTechnicianChange(20, '3')`);
  const update = requests.find(request => request.method === 'PUT');
  assert.equal(update.body.status, 'CLOSED');
  assert.equal(update.body.supportId, 3);
  assert.equal(run(`tickets[0].status`), 'CLOSED');
  assert.equal(run(`getDashboardStats().closed`), 1);
});

test('resolution blocks a simultaneous reassignment and leaves both list and server resolved', async () => {
  const { run, requests } = application();
  await run(`Promise.all([App.quickStatusChange(20, 'CLOSED'), App.quickTechnicianChange(20, '3')])`);
  const updates = requests.filter(request => request.method === 'PUT');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].body.status, 'CLOSED');
  assert.equal(run(`tickets[0].status`), 'CLOSED');
});

test('entering tickets refreshes status changed from another page or browser tab', async () => {
  const { run, server, routes, node } = application();
  await run(`App.init()`);
  server({ status: 'CLOSED' });
  await routes.chamados();
  assert.match(node('pageContent').innerHTML, /Resolvido/);
  assert.equal(run(`tickets[0].status`), 'CLOSED');
});

test('returning to an already open tab refreshes the displayed status', async () => {
  const { run, server, events, node } = application();
  await run(`App.init()`);
  server({ status: 'CLOSED' });
  await events.visibilitychange();
  assert.match(node('pageContent').innerHTML, /Resolvido/);
  assert.equal(run(`getDashboardStats().closed`), 1);
});

async function resolvedApplication(department = 'TI') {
  const app = application();
  await app.run(`App.init()`);
  app.run(`CURRENT_USER = { id: 1, name: 'Adriana', department: '${department}', role: 'ADMIN' };
    USERS = [CURRENT_USER, {id: 2, name: 'Ana', department: 'Vendas'}];
    window.fixture = [
      {id: 20, title: 'Resolvido Marketing', description: '', clientId: 1, status: 'CLOSED', priority: 'MEDIUM'},
      {id: 21, title: 'Resolvido Vendas', description: '', clientId: 2, status: 'CLOSED', priority: 'HIGH'},
      {id: 22, title: 'Ainda em atendimento', description: '', clientId: 1, status: 'ASSIGNED', priority: 'HIGH'},
      {id: 23, title: 'Não solucionado', description: '', clientId: 1, status: 'UNRESOLVED', priority: 'HIGH'}
    ];
    Api.fetchTickets = async () => window.fixture;
    Router.getCurrentRoute = () => 'resolvidos';`);
  await app.routes.resolvidos();
  return app;
}

test('resolved route shows TI all resolved tickets without a sidebar entry', async () => {
  const { run, node } = await resolvedApplication();
  const html = node('pageContent').innerHTML;
  assert.match(html, /<h1[^>]*>Resolvidos<\/h1>/);
  assert.match(html, /data-ticket-id="20"/);
  assert.match(html, /data-ticket-id="21"/);
  assert.doesNotMatch(html, /data-ticket-id="22"|data-ticket-id="23"/);
  assert.doesNotMatch(run(`renderSidebar()`), /data-route="resolvidos"|sidebarResolvedCount/);
  assert.equal(node('sidebarResolvedCount').textContent, 2);
  assert.equal(node('filterStatus').value, 'CLOSED');
});

test('non-TI ADMIN only sees department resolved tickets even when API fixture contains all sectors', async () => {
  const { run, node } = await resolvedApplication('Marketing');
  const html = node('pageContent').innerHTML;
  assert.match(html, /data-ticket-id="20"/);
  assert.doesNotMatch(html, /data-ticket-id="21"|data-ticket-id="22"|data-ticket-id="23"/);
  assert.equal(node('sidebarResolvedCount').textContent, 1);
  assert.doesNotMatch(run(`renderSidebar()`), /data-route="resolvidos"|sidebarResolvedCount/);
});

test('resolved filters cannot expose open tickets and remain separate from the main list', async () => {
  const { run, node, routes } = await resolvedApplication();
  node('filterStatus').value = 'ASSIGNED';
  node('filterStatus').listeners.change();
  assert.doesNotMatch(node('pageContent').innerHTML, /data-ticket-id="22"/);
  node('filterPriority').value = 'HIGH';
  node('filterPriority').listeners.change();
  assert.match(node('pageContent').innerHTML, /data-ticket-id="21"/);
  assert.doesNotMatch(node('pageContent').innerHTML, /data-ticket-id="20"|data-ticket-id="22"/);
  run(`Router.getCurrentRoute = () => 'chamados'`);
  await routes.chamados();
  assert.match(node('pageContent').innerHTML, /data-ticket-id="20"/);
  assert.match(node('pageContent').innerHTML, /data-ticket-id="22"/);
});

test('resolved view removes reopened tickets and refreshes its counter when returning to the tab', async () => {
  const { run, events, node } = await resolvedApplication('Marketing');
  run(`window.fixture = window.fixture.map(ticket => ticket.id === 20 ? {...ticket, status: 'NEW'} : ticket)`);
  await events.visibilitychange();
  assert.match(node('pageContent').innerHTML, /Nenhum chamado resolvido encontrado/);
  assert.doesNotMatch(node('pageContent').innerHTML, /data-ticket-id="20"/);
  assert.equal(node('sidebarResolvedCount').textContent, 0);
});

test('nominating an assignee in creation keeps the displayed status NEW', async () => {
  const { run, node, events } = application();
  await run(`App.init()`);
  const form = { querySelector: selector => node(selector.slice(1)) };
  const assignee = node('ticketTechnician');
  assignee.value = '3'; assignee.closest = () => form;
  node('ticketStatus').disabled = true;
  node('ticketStatus').value = 'NEW';
  events.change({ target: assignee });
  assert.equal(node('ticketStatus').value, 'NEW');
  assert.match(run(`renderTicketModal()`), /O chamado começa Em aberto/);
});

test('only entering TI detail starts NEW service and repeated opening does not repeat the operation', async () => {
  const { run, server, requests, routes, node } = application();
  server({ status: 'NEW', supportId: 1 });
  await run(`App.init();`);
  await routes.chamados();
  assert.equal(requests.filter(request => request.url.endsWith('/iniciar')).length, 0);
  run(`Router.getCurrentRoute = () => 'chamado/20'`);
  await routes['chamado/:id']({ id: '20' });
  assert.equal(requests.filter(request => request.url.endsWith('/iniciar')).length, 1);
  assert.equal(run(`tickets[0].status`), 'ASSIGNED');
  assert.equal(run(`tickets[0].supportId`), 2);
  assert.match(node('pageContent').innerHTML, /Em atendimento/);
  await routes['chamado/:id']({ id: '20' });
  assert.equal(requests.filter(request => request.url.endsWith('/iniciar')).length, 1);
});

test('requester viewing a NEW ticket and TI editing it never start service', async () => {
  const { run, server, requests, routes, node } = application();
  server({ status: 'NEW' });
  await run(`App.init()`);
  await run(`App.editTicket(20)`);
  run(`CURRENT_USER = { id: 1, name: 'Adriana', department: 'Marketing' }; Router.getCurrentRoute = () => 'chamado/20'`);
  await routes['chamado/:id']({ id: '20' });
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  assert.equal(run(`tickets[0].status`), 'NEW');
  assert.match(node('pageContent').innerHTML, /Em aberto/);
  await assert.rejects(run(`Api.startTicket(20)`), /TI/);
});

test('TI viewing resolved tickets cannot restart them', async () => {
  const { run, server, requests, routes } = application();
  server({ status: 'CLOSED' });
  await run(`App.init()`);
  run(`Router.getCurrentRoute = () => 'chamado/20'`);
  await routes['chamado/:id']({ id: '20' });
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  assert.equal(run(`tickets[0].status`), 'CLOSED');
});

test('visible requester list periodically synchronizes service started in the TI account', async () => {
  const { run, server, timers, node, requests } = application();
  server({ status: 'NEW' });
  await run(`App.init()`);
  run(`CURRENT_USER = { id: 1, name: 'Adriana', department: 'Marketing' }`);
  server({ status: 'ASSIGNED', supportId: 2 });
  assert.equal(timers[0].delay, 15000);
  await timers[0].handler();
  assert.match(node('pageContent').innerHTML, /Em atendimento/);
  assert.equal(run(`getDashboardStats().assigned`), 1);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('failed resolution displays API error and resets the uncommitted status selection', async () => {
  const { run, node, toasts, failRequests } = application();
  failRequests((url, options) => options.method === 'PUT' ? { status: 400, message: 'Responsável não encontrado' } : null);
  node('quickStatusChange').value = 'CLOSED';
  await run(`App.quickStatusChange(20, 'CLOSED')`);
  assert.equal(run(`tickets[0].status`), 'ASSIGNED');
  assert.equal(node('quickStatusChange').value, '');
  assert.equal(toasts.at(-1)[0], 'error');
  assert.equal(toasts.at(-1)[2], 'Responsável não encontrado');
});

test('resolution saved before a refresh failure is not reported as a failed write', async () => {
  const { run, requests, toasts, failRequests } = application();
  failRequests(url => url.endsWith('/api/chamados') && requests.some(request => request.method === 'PUT')
    ? { status: 503, message: 'Serviço indisponível' } : null);
  await run(`App.quickStatusChange(20, 'CLOSED')`);
  assert.equal(run(`tickets[0].status`), 'CLOSED');
  assert.equal(toasts.some(toast => toast[0] === 'error'), false);
  assert.equal(toasts.at(-1)[0], 'warning');
  assert.equal(toasts.at(-1)[1], 'Alteração salva');
});
