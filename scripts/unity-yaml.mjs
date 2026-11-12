// A tolerant parser for the subset of YAML that Unity writes (.anim, .controller, .unity, .meta), no dependencies.
// Written by Claude Code.
//
// Handles: `--- !u!<classID> &<fileID>` document headers, block mappings, block sequences (Unity writes `- ` items at
// the same indent as their key), flow mappings `{a: 1, b: {c: 2}}`, the empty flow sequence `[]`, and double-quoted
// strings with `\xHH`/`\uHHHH` escapes (`"SeaAnimTr\xEAs"`). Scalars stay strings: callers convert with `Number`.
// Not handled (Unity doesn't write them in these files): anchors inside documents, multi-line scalars, block flow
// sequences with items.

const unquote = (text) => {
  if (!text.startsWith("\"")) {
    return text;
  }

  return text.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, escape) => {
    if (escape[0] === "x" || escape[0] === "u") {
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    }

    return { n: "\n", t: "\t", "\"": "\"", "\\": "\\" }[escape] ?? escape;
  });
};

// Splits `a: 1, b: {c: 2}` on its top-level commas.
const splitFlow = (body) => {
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (char === "{" || char === "[") {
      depth++;
    } else if (char === "}" || char === "]") {
      depth--;
    } else if (char === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(body.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part !== "");
};

const parseScalar = (raw) => {
  const text = raw.trim();

  if (text === "[]") {
    return [];
  }

  if (text.startsWith("{") && text.endsWith("}")) {
    const result = {};

    for (const entry of splitFlow(text.slice(1, -1))) {
      const colon = entry.indexOf(":");

      result[entry.slice(0, colon).trim()] = parseScalar(entry.slice(colon + 1));
    }

    return result;
  }

  return unquote(text);
};

// `key: value` → [key, value]; a quoted key is not something Unity writes.
const splitKey = (content) => {
  const match = /^([^:]+?):(?:\s(.*)|$)/.exec(content);

  return match === null ? null : [match[1], match[2] ?? ""];
};

const tokenize = (text) => text.split(/\r?\n/)
  .filter((line) => line.trim() !== "" && !line.startsWith("%"))
  .map((line) => {
    const indent = line.length - line.trimStart().length;

    return { indent, content: line.trim() };
  });

/** Parses one document's lines (no `---` header) into nested objects, arrays and strings. */
const parseLines = (lines) => {
  let index = 0;

  const parseBlock = (indent) => {
    const line = lines[index];

    if (line === undefined || line.indent < indent) {
      return "";
    }

    return line.content.startsWith("- ") || line.content === "-" ? parseSequence(line.indent) : parseMapping(line.indent);
  };

  const parseSequence = (indent) => {
    const items = [];

    while (index < lines.length && lines[index].indent === indent && lines[index].content.startsWith("-")) {
      const rest = lines[index].content.slice(1).trimStart();
      const itemIndent = indent + 2;

      if (rest === "") {
        index++;
        items.push(parseBlock(itemIndent));
      } else if (splitKey(rest) !== null && !rest.startsWith("{")) {
        // `- key: value`: the item is a mapping whose first entry shares the dash's line.
        lines[index] = { indent: itemIndent, content: rest };
        items.push(parseMapping(itemIndent));
      } else {
        index++;
        items.push(parseScalar(rest));
      }
    }

    return items;
  };

  const parseMapping = (indent) => {
    const result = {};

    while (index < lines.length && lines[index].indent === indent && !lines[index].content.startsWith("- ")) {
      const entry = splitKey(lines[index].content);

      index++;

      if (entry === null) {
        continue;
      }

      const [key, value] = entry;
      const next = lines[index];

      if (value !== "") {
        result[key] = parseScalar(value);
      } else if (next !== undefined && (next.indent > indent || (next.indent === indent && next.content.startsWith("-")))) {
        result[key] = parseBlock(next.indent);
      } else {
        result[key] = "";
      }
    }

    return result;
  };

  return parseBlock(0);
};

/**
 * Splits a Unity YAML file into its documents: `{ classId, fileId, body }`, where `body` is the parsed document (for an
 * object, `{ <TypeName>: { ...fields } }`).
 */
export const parseUnityYaml = (text) => {
  const documents = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const header = /^--- !u!(\d+) &(-?\d+)/.exec(line);

    if (header !== null) {
      current = { classId: Number(header[1]), fileId: header[2], lines: [] };
      documents.push(current);
    } else if (line.startsWith("---")) {
      current = { classId: 0, fileId: "", lines: [] };
      documents.push(current);
    } else if (current === null) {
      // A .meta file has no header: one implicit document.
      if (!line.startsWith("%") && line.trim() !== "") {
        current = { classId: 0, fileId: "", lines: [line] };
        documents.push(current);
      }
    } else {
      current.lines.push(line);
    }
  }

  return documents.map(({ classId, fileId, lines }) => ({
    classId,
    fileId,
    body: parseLines(tokenize(lines.join("\n"))),
  }));
};
