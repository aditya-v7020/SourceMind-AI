import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/github-dark-dimmed.css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);

/**
 * A small, dependency-light Markdown renderer built specifically for the
 * kind of formatting Gemini tends to produce (headers, bold/italic text,
 * bullet/numbered lists, horizontal rules, inline code, fenced code
 * blocks with syntax highlighting, tables, and paragraphs).
 */

function renderInline(text, keyPrefix) {
  const tokens = text.split(/(\*\*.+?\*\*|`.+?`|\*.+?\*|_.+?_|\[.+?\]\(.+?\))/g).filter(Boolean);

  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={key}>{token.slice(1, -1)}</code>;
    }
    const linkMatch = /^\[(.+?)\]\((.+?)\)$/.exec(token);
    if (linkMatch) {
      return (
        <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      );
    }
    if (
      (token.startsWith("*") && token.endsWith("*") && !token.startsWith("**")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{token}</Fragment>;
  });
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  let highlighted;
  try {
    highlighted = language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language }).value
      : hljs.highlightAuto(code).value;
  } catch {
    highlighted = code;
  }

  function handleCopy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language || "text"}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className="text-slate-200" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

function TableBlock({ headerRow, rows }) {
  return (
    <table>
      <thead>
        <tr>
          {headerRow.map((cell, i) => (
            <th key={i}>{renderInline(cell.trim(), `th-${i}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci}>{renderInline(cell.trim(), `td-${ri}-${ci}`)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Markdown({ text }) {
  if (!text) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listBuffer = [];
  let listType = null; // "ul" | "ol"
  let i = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    const ListTag = listType === "ol" ? "ol" : "ul";
    blocks.push(
      <ListTag key={`list-${blocks.length}`}>
        {listBuffer.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${blocks.length}-${idx}`)}</li>
        ))}
      </ListTag>
    );
    listBuffer = [];
    listType = null;
  }

  const isTableRow = (line) => /^\|.*\|$/.test(line.trim());
  const isTableSep = (line) => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim());

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Fenced code blocks: ```lang ... ```
    const fenceMatch = /^```(\w*)\s*$/.exec(trimmed);
    if (fenceMatch) {
      flushList();
      const language = fenceMatch[1] || "";
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(<CodeBlock key={`code-${blocks.length}`} language={language} code={codeLines.join("\n")} />);
      i += 1; // skip closing fence
      continue;
    }

    // Tables: header row, separator row, then body rows
    if (isTableRow(trimmed) && lines[i + 1] && isTableSep(lines[i + 1])) {
      flushList();
      const headerRow = trimmed.replace(/^\||\|$/g, "").split("|");
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|"));
        i += 1;
      }
      blocks.push(<TableBlock key={`table-${blocks.length}`} headerRow={headerRow} rows={rows} />);
      continue;
    }

    if (!trimmed) {
      flushList();
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${i}`} />);
      i += 1;
      continue;
    }

    const headerMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push(<Tag key={`h-${i}`}>{renderInline(headerMatch[2], `h-${i}`)}</Tag>);
      i += 1;
      continue;
    }

    const ulMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ulMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(ulMatch[1]);
      i += 1;
      continue;
    }

    const olMatch = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (olMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(olMatch[1]);
      i += 1;
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushList();
      blocks.push(<blockquote key={`bq-${i}`}>{renderInline(quoteMatch[1], `bq-${i}`)}</blockquote>);
      i += 1;
      continue;
    }

    flushList();
    blocks.push(<p key={`p-${i}`}>{renderInline(trimmed, `p-${i}`)}</p>);
    i += 1;
  }

  flushList();

  return <div className="prose-chat">{blocks}</div>;
}
