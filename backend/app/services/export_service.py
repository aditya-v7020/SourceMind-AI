"""Renders a conversation's messages into a downloadable Markdown or PDF
file for the Export Chat feature."""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any


def _timestamp_str(ts: float) -> str:
    try:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def to_markdown(title: str, messages: list[dict[str, Any]]) -> str:
    lines = [f"# {title}", ""]
    for msg in messages:
        role = "You" if msg.get("role") == "user" else "Assistant"
        ts = _timestamp_str(msg.get("timestamp", 0))
        lines.append(f"### {role}{f' — {ts}' if ts else ''}")
        lines.append("")
        lines.append(msg.get("content", ""))
        meta = msg.get("meta") or {}
        citations = meta.get("citations") or []
        if citations:
            lines.append("")
            lines.append(f"*Sources: {', '.join(citations)}*")
        lines.append("")
    return "\n".join(lines)


def _strip_markdown(text: str) -> str:
    """Very small markdown-to-plaintext cleanup so the PDF body reads
    cleanly (headers/bold/bullets) without needing a full renderer."""
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return text


def to_pdf(title: str, messages: list[dict[str, Any]]) -> bytes:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        title=title,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ChatTitle", parent=styles["Title"], fontSize=18, spaceAfter=14)
    role_user = ParagraphStyle(
        "RoleUser", parent=styles["Heading4"], textColor=colors.HexColor("#14162B"), spaceBefore=10
    )
    role_assistant = ParagraphStyle(
        "RoleAssistant", parent=styles["Heading4"], textColor=colors.HexColor("#1F7A6C"), spaceBefore=10
    )
    body_style = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10.5, leading=15)
    meta_style = ParagraphStyle(
        "Meta", parent=styles["BodyText"], fontSize=8.5, textColor=colors.HexColor("#5B5D72")
    )

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    story = [Paragraph(esc(title), title_style), HRFlowable(width="100%", color=colors.HexColor("#E3E1D8")), Spacer(1, 8)]

    for msg in messages:
        role = "You" if msg.get("role") == "user" else "Assistant"
        ts = _timestamp_str(msg.get("timestamp", 0))
        style = role_user if msg.get("role") == "user" else role_assistant
        header = f"{role}" + (f"  ·  {ts}" if ts else "")
        story.append(Paragraph(esc(header), style))

        content = _strip_markdown(msg.get("content", ""))
        for para in content.split("\n\n"):
            para = para.strip()
            if not para:
                continue
            story.append(Paragraph(esc(para).replace("\n", "<br/>"), body_style))

        meta = msg.get("meta") or {}
        citations = meta.get("citations") or []
        if citations:
            story.append(Paragraph(esc(f"Sources: {', '.join(citations)}"), meta_style))
        story.append(Spacer(1, 6))

    doc.build(story)
    return buffer.getvalue()
