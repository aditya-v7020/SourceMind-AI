"""Fetches a web page and extracts clean, readable text from its HTML."""
from __future__ import annotations

import re

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


class UrlFetchError(Exception):
    pass


def fetch_url_text(url: str, timeout: int = 15) -> tuple[str, str]:
    """Returns (page_title, clean_text). Raises UrlFetchError on failure."""
    if not re.match(r"^https?://", url.strip(), re.IGNORECASE):
        url = f"https://{url.strip()}"

    try:
        response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise UrlFetchError(f"Could not fetch URL: {exc}") from exc

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "noscript", "svg", "iframe", "nav", "footer"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else url

    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    clean_lines = [line for line in lines if line]
    clean_text = "\n".join(clean_lines)

    if not clean_text.strip():
        raise UrlFetchError("No readable text content found at this URL.")

    return title, clean_text
