const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function socketApp(url = 'wss://example.test/ws') {
  const sockets = [], timers = [], events = [], state = { reloads: 0, renders: 0 };
  const label = {textContent:''};
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.closed = true; this.onclose?.(); }
    message(type, data) { return this.onmessage({data: JSON.stringify({type, data})}); }
  }
  const context = vm.createContext({
    URL, WebSocket: FakeSocket,
    CURRENT_USER: {id:2},
    localStorage: {getItem: key => key === 'token' ? 'test-token' : null},
    document: {querySelector: () => ({content:url}),getElementById: () => label},
    window: {location:{protocol:'https:'}, addEventListener() {}},
    setTimeout: (fn, delay) => { const timer = {fn,delay}; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; },
    reloadTickets: async () => { state.reloads++; return true; },
    App: {handleTicketUpdated: data => events.push(data),renderLiveViews: () => {state.renders++;}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/socket.js'),'utf8'),context);
  const run = code => vm.runInContext(code,context);
  run('TicketSocket.connect()');
  return {run,sockets,timers,events,state,label};
}

test('socket authenticates with CT19, accepts CT22 only after auth and reloads on reconnect', async () => {
  const app = socketApp();
  const first = app.sockets[0];
  first.onopen();
  assert.deepEqual(first.sent[0],{type:'autenticarConexao',data:{token:'test-token'}});
  await first.message('chamadoAtualizado',{ticketId:20});
  assert.equal(app.events.length,0);
  await first.message('conexaoAutenticada',{userId:2});
  assert.equal(app.state.reloads,1);
  await first.message('chamadoAtualizado',{ticketId:20});
  assert.equal(app.events.length,1);
  first.close();
  const timer = app.timers.find(t => t.delay === 1000);
  assert.ok(timer);
  timer.fn();
  await app.sockets[1].message('conexaoAutenticada',{userId:2});
  assert.equal(app.state.reloads,2);
  assert.match(app.label.textContent,/conectado/);
});

test('socket tolerates invalid JSON and stops reconnecting on rejected authentication', async () => {
  const app = socketApp();
  await app.sockets[0].onmessage({data:'bad json'});
  await app.sockets[0].onmessage({data:'null'});
  await app.sockets[0].message('erro',{code:'TOKEN_INVALIDO'});
  assert.equal(app.events.length,0);
  assert.equal(app.timers.filter(t=>!t.cancelled).length,0);
  assert.match(app.label.textContent,/recusada/);
});

test('missing URL and insecure URL on HTTPS never open a socket', () => {
  for(const url of ['', 'ws://example.test/ws', 'https://example.test']) {
    const app = socketApp(url);
    assert.equal(app.sockets.length,0);
  }
});

// O evento deve atualizar o detalhe sem executar a rota que inicia atendimento.
test('socket refresh reads complete tickets and renders detail without starting service', async () => {
  let reads = 0;
  const page = { innerHTML: '' };
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => id === 'pageContent' ? page : null,
      querySelector: () => null, querySelectorAll: () => [] },
    Router: { getCurrentRoute: () => 'chamado/20', resolve: () => assert.fail('Não deve reabrir a rota') },
    tickets: [], notifications: [], getUnreadNotificationsCount: () => 0,
    getDashboardStats: () => ({closed:0}), getVisibleTickets: () => [],
    canViewTicket: () => true,
    renderTicketDetail: ticket => ticket ? ticket.title : 'Sem acesso',
    reloadTickets: async () => {
      reads++;
      context.tickets = [{id:20, title:'Atualizado pela API', status:'NEW'}];
      return true;
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/app.js'),'utf8'),context);
  await vm.runInContext("App.handleTicketUpdated({action:'UPDATED',ticketId:20})",context);
  assert.equal(reads,1);
  assert.equal(page.innerHTML,'Atualizado pela API');
  await vm.runInContext("App.handleTicketUpdated({action:'INVALID',ticketId:20})",context);
  assert.equal(reads,1);
});
