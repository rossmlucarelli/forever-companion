// Reads WoW SavedVariables files (a small subset of Lua: assignments of
// tables, strings, numbers, booleans and nil). It never executes anything.

export function parseSavedVariables(text) {
  let i = 0;
  const n = text.length;
  const out = {};

  const err = (msg) => {
    throw new Error(`SavedVariables parse error at ${i}: ${msg}`);
  };

  function skip() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text.startsWith("--[[", i)) {
        const end = text.indexOf("]]", i + 4);
        i = end < 0 ? n : end + 2;
      } else if (text.startsWith("--", i)) {
        while (i < n && text[i] !== "\n") i++;
      } else break;
    }
  }

  function ident() {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, i + 200));
    if (!m) err("expected a name");
    i += m[0].length;
    return m[0];
  }

  function string() {
    const q = text[i++];
    let s = "";
    while (i < n && text[i] !== q) {
      let c = text[i++];
      if (c === "\\") {
        c = text[i++];
        if (c === "n") s += "\n";
        else if (c === "t") s += "\t";
        else if (c === "r") s += "\r";
        else if (c === "\n") s += "\n";
        else if (/[0-9]/.test(c)) {
          let d = c;
          while (d.length < 3 && /[0-9]/.test(text[i])) d += text[i++];
          s += String.fromCharCode(parseInt(d, 10));
        } else s += c; // \" \\ \'
      } else s += c;
    }
    i++; // closing quote
    // WoW writes UTF-8 bytes; \ddd escapes produce single bytes, so re-decode.
    if (/[\x80-\xff]/.test(s)) {
      try {
        return Buffer.from(s, "latin1").toString("utf8");
      } catch {
        return s;
      }
    }
    return s;
  }

  function longString() {
    const m = /^\[(=*)\[/.exec(text.slice(i, i + 20));
    const close = "]" + m[1] + "]";
    const start = i + m[0].length;
    const end = text.indexOf(close, start);
    i = end + close.length;
    return text.slice(start, end).replace(/^\n/, "");
  }

  function value() {
    skip();
    const c = text[i];
    if (c === "{") return table();
    if (c === '"' || c === "'") return string();
    if (c === "[" && /^\[=*\[/.test(text.slice(i, i + 20))) return longString();
    const num = /^-?(0x[0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|inf|nan)/.exec(text.slice(i, i + 40));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const word = ident();
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "nil") return null;
    err(`unexpected ${word}`);
  }

  function table() {
    i++; // {
    const arr = [];
    const obj = {};
    let hasKeys = false;
    for (;;) {
      skip();
      if (text[i] === "}") {
        i++;
        break;
      }
      let key;
      if (text[i] === "[" && !/^\[=*\[/.test(text.slice(i, i + 20))) {
        i++;
        key = value();
        skip();
        if (text[i] !== "]") err("expected ]");
        i++;
        skip();
        if (text[i] !== "=") err("expected =");
        i++;
      } else {
        const save = i;
        const m = /^[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/.exec(text.slice(i, i + 200));
        if (m && !/^(true|false|nil)\b/.test(m[0])) {
          key = ident();
          skip();
          i++; // =
        } else i = save;
      }
      const v = value();
      if (key === undefined) arr.push(v);
      else if (typeof key === "number" && Number.isInteger(key) && key >= 1) arr[key - 1] = v;
      else {
        obj[String(key)] = v;
        hasKeys = true;
      }
      skip();
      if (text[i] === "," || text[i] === ";") i++;
    }
    if (!hasKeys) return arr.filter((x) => x !== undefined);
    arr.forEach((v, idx) => {
      if (v !== undefined) obj[String(idx + 1)] = v;
    });
    return obj;
  }

  for (;;) {
    skip();
    if (i >= n) break;
    const name = ident();
    skip();
    if (text[i] !== "=") err("expected = after " + name);
    i++;
    out[name] = value();
  }
  return out;
}
