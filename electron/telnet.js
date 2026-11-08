// Einfacher Telnet-Client: Option-Verhandlung (ECHO, SGA, NAWS), alles andere wird abgelehnt. Kein Electron.
const { EventEmitter } = require('events');
const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;
const ECHO = 1, SGA = 3, NAWS = 31;

const dbl = (b) => (b === IAC ? [IAC, IAC] : [b]);
const nawsFrame = (cols, rows) => Buffer.from([IAC, SB, NAWS, ...dbl(cols >> 8), ...dbl(cols & 255), ...dbl(rows >> 8), ...dbl(rows & 255), IAC, SE]);

// Zerlegt Rohdaten in Nutzdaten und Antworten. st bleibt zwischen Aufrufen erhalten (angefangene Sequenzen in st.carry).
function parse(st, chunk) {
  const buf = Buffer.concat([st.carry, chunk]);
  const data = [], reply = [];
  st.carry = Buffer.alloc(0);
  const once = (k, ...bytes) => { if (!st.done.has(k)) { st.done.add(k); reply.push(Buffer.from(bytes)); } }; // je Option nur einmal antworten (keine Endlosschleife)
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== IAC) { data.push(buf[i++]); continue; }
    if (i + 1 >= buf.length) { st.carry = buf.subarray(i); break; }
    const c = buf[i + 1];
    if (c === IAC) { data.push(IAC); i += 2; continue; }
    if (c >= WILL && c <= DONT) { // 251-254: WILL/WONT/DO/DONT + Option
      if (i + 2 >= buf.length) { st.carry = buf.subarray(i); break; }
      const o = buf[i + 2];
      if (c === WILL) { if (o === ECHO || o === SGA) once(`do${o}`, IAC, DO, o); else reply.push(Buffer.from([IAC, DONT, o])); }
      else if (c === DO) {
        if (o === NAWS) { if (!st.naws) { st.naws = true; reply.push(Buffer.from([IAC, WILL, NAWS]), nawsFrame(st.cols, st.rows)); } }
        else if (o === SGA) once(`will${o}`, IAC, WILL, o);
        else reply.push(Buffer.from([IAC, WONT, o]));
      }
      i += 3; continue;
    }
    if (c === SB) { // Unterverhandlung ignorieren bis IAC SE
      let j = i + 2;
      while (j + 1 < buf.length && !(buf[j] === IAC && buf[j + 1] === SE)) j++;
      if (j + 1 >= buf.length) { st.carry = buf.subarray(i); break; }
      i = j + 2; continue;
    }
    i += 2; // sonstige Befehle (NOP, GA, …)
  }
  return { data: Buffer.from(data), reply: Buffer.concat(reply) };
}

const newState = (cols = 80, rows = 24) => ({ carry: Buffer.alloc(0), done: new Set(), naws: false, cols, rows });

// Eingabe zum Server: IAC verdoppeln, Enter (CR) als CR NUL
const encode = (s) => Buffer.from([...Buffer.from(s)].flatMap((b) => (b === IAC ? [IAC, IAC] : b === 13 ? [13, 0] : [b])));

// Terminal-Schnittstelle wie ein ssh2-Stream: write, setWindow(rows, cols), 'data', 'close'
function session(sock, { cols, rows }) {
  const st = newState(cols, rows);
  const out = new EventEmitter();
  sock.on('data', (chunk) => {
    const { data, reply } = parse(st, chunk);
    if (reply.length) sock.write(reply);
    if (data.length) out.emit('data', data);
  });
  sock.on('error', () => {});
  sock.on('close', () => out.emit('close'));
  out.write = (d) => sock.write(encode(d));
  out.setWindow = (r, c) => { st.cols = c; st.rows = r; if (st.naws) sock.write(nawsFrame(c, r)); };
  return out;
}

module.exports = { parse, newState, encode, nawsFrame, session };
