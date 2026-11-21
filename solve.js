// kopler-csv-reader: a fast drop-in for make.fun's csv-reader 1.0.0.
// Written from scratch for csv-reader-speed-01. It returns exactly what
// csv-reader 1.0.0 returns for every input {text, header}, only faster:
// a per-record line-end hint so unquoted fields need a single comma scan,
// whole clean lines split natively at commas, and indexOf-driven quoted
// fields with slice-bounded newline handling. No dependencies, no I/O,
// nothing kept from one call to the next.
const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  let recLine = 1;
  let recRow = null;
  let ended = END;
  // le: index of the next LF at or after the current field start, -1 when none
  // is left in the text, -2 when not yet computed. An unquoted field ends at
  // the next comma or at le, so only the comma needs a fresh scan per field.
  // A quoted field that swallows le leaves pos past it, which refreshes le.
  let le = -2;

  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  function error(code) {
    errors.push({ code, line: recLine, row: recRow });
  }

  // Reads unquoted characters onto `init` up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). Returns the field; sets `ended`.
  function readUnquoted(init) {
    let v = init;
    let seg = pos;
    while (true) {
      if (le < -1 || (le >= 0 && pos > le)) le = text.indexOf('\n', pos);
      const iC = text.indexOf(',', pos);
      let i;
      let isComma;
      if (iC >= 0 && (le < 0 || iC < le)) {
        i = iC;
        isComma = true;
      } else if (le >= 0) {
        i = le;
        isComma = false;
      } else {
        i = -1;
      }
      if (i < 0) {
        // No comma or LF left: field runs to end of text, dropping stray CRs.
        let s = seg;
        while (true) {
          const r = text.indexOf('\r', s);
          if (r < 0) {
            if (n > s) v += text.slice(s);
            pos = n;
            ended = END;
            return v;
          }
          if (r > s) v += text.slice(s, r);
          error('stray_cr');
          s = r + 1;
        }
      }
      const segStr = text.slice(seg, i);
      const r = segStr.indexOf('\r');
      if (r < 0) {
        if (i > seg) v += segStr;
        if (isComma) {
          pos = i + 1;
          ended = COMMA;
          return v;
        }
        pos = i + 1;
        line += 1;
        ended = BREAK;
        return v;
      }
      if (!isComma && seg + r === i - 1) {
        // The only CR in the segment closes it as CRLF.
        if (r > 0) v += segStr.slice(0, r);
        pos = i + 1;
        line += 1;
        ended = BREAK;
        return v;
      }
      // A stray CR inside the segment.
      if (r > 0) v += segStr.slice(0, r);
      error('stray_cr');
      pos = seg + r + 1;
      seg = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; sets `ended`.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let v = '';
    let seg = pos;
    while (true) {
      const q = text.indexOf('"', pos);
      if (q < 0) {
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (q > seg) {
        const segStr = text.slice(seg, q);
        if (segStr.indexOf('\n') < 0 && segStr.indexOf('\r') < 0) {
          v += segStr;
        } else {
          const parts = segStr.split(/\r\n|\r|\n/);
          line += parts.length - 1;
          v += parts.join('\n');
        }
      }
      if (text.charCodeAt(q + 1) === 34) {
        v += '"';
        pos = q + 2;
        seg = q + 2;
        continue;
      }
      pos = q + 1;
      break;
    }
    if (pos >= n) {
      ended = END;
      return v;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return v;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = BREAK;
      return v;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = BREAK;
      return v;
    }
    const junk = readUnquoted(v);
    if (junk.length > v.length) error('quote_junk');
    return junk;
  }

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    // Fast path: a whole line with no quote and no stray CR splits at commas.
    // A CR at le - 1 is the line's own CRLF end, not dirt.
    let fields = null;
    let lastQuoted = false;
    if (le < -1 || (le >= 0 && pos > le)) le = text.indexOf('\n', pos);
    if (le >= 0) {
      // A quote in the line already means fallback; only then check for a CR.
      const q = text.indexOf('"', pos);
      if (q < 0 || q >= le) {
        const r = text.indexOf('\r', pos);
        if (r < 0 || r >= le - 1) {
          const end = text.charCodeAt(le - 1) === 13 ? le - 1 : le;
          fields = text.slice(pos, end).split(',');
          pos = le + 1;
          line += 1;
        }
      }
    } else {
      // Last line, no LF: clean only when it holds no quote and no CR at all.
      const q = text.indexOf('"', pos);
      if (q < 0) {
        const r = text.indexOf('\r', pos);
        if (r < 0) {
          fields = text.slice(pos).split(',');
          pos = n;
        }
      }
    }

    if (fields === null) {
      fields = [];
      do {
        const quoted = text.charCodeAt(pos) === 34;
        lastQuoted = quoted;
        fields.push(quoted ? readQuoted() : readUnquoted(''));
      } while (ended === COMMA);
    }

    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
