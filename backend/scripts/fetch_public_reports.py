#!/usr/bin/env python3
"""Fetch real public filings/reports for system preload.

Sources:
- SEC official filings (10-K/10-Q/20-F/6-K) by ticker
- Web-discovered public report PDFs (DuckDuckGo HTML search)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote_plus, unquote, urlencode, urlparse
from urllib.request import Request, urlopen


SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_ARCHIVE_DOC_URL = "https://www.sec.gov/Archives/edgar/data/{cik_nozero}/{accession_no_dash}/{doc}"
DUCKDUCKGO_HTML_URL = "https://duckduckgo.com/html/?q={query}"
SSE_A_SHARE_LIST_URL = "http://query.sse.com.cn/security/stock/getStockListData2.do"
SSE_A_SHARE_REFERER = "https://www.sse.com.cn/assortment/stock/list/share/"
SZSE_REPORT_DATA_URL = "https://www.szse.cn/api/report/ShowReport/data"
SZSE_STOCK_LIST_REFERER = "https://www.szse.cn/market/product/stock/list/index.html"
CNINFO_STOCK_LIST_URL = "http://www.cninfo.com.cn/new/data/szse_stock.json"

ALLOWED_SEC_FORMS = {"10-K", "10-Q", "20-F", "6-K"}
DEFAULT_USER_AGENT = "Mozilla/5.0"
DEFAULT_SEC_USER_AGENT = (
    "chayan-preload-bot/1.0 (contact: data-team@example.com) "
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
)

REPORT_KEYWORDS = (
    ".pdf",
    "annual-report",
    "annual reports",
    "annual_report",
    "interim-report",
    "interim_report",
    "financial-report",
    "financial-reports",
    "financial_statement",
    "earnings",
    "results",
    "招股书",
    "财报",
    "年报",
    "中报",
    "季报",
)

NON_REPORT_DOMAINS = {
    "get.adobe.com",
    "www.ilovepdf.com",
    "smallpdf.com",
    "www.smallpdf.com",
    "www.canva.com",
    "www.pdf2go.com",
    "www.sejda.com",
    "www.freepdfconvert.com",
    "news.qq.com",
    "finance.sina.com.cn",
    "news.futunn.com",
    "www.thepaper.cn",
    "m.thepaper.cn",
    "aiqicha.baidu.com",
    "xueqiu.com",
}

TRUSTED_REPORT_DOMAINS = {
    "www1.hkexnews.hk",
    "www.hkexnews.hk",
    "ir.naixue.com",
    "nayuki-umb.azurewebsites.net",
    "www.sec.gov",
    "data.sec.gov",
    "investor.chagee.com",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def sanitize_filename(value: str, max_len: int = 120) -> str:
    cleaned = re.sub(r"[^\w\-.]+", "_", value.strip(), flags=re.UNICODE)
    cleaned = re.sub(r"_+", "_", cleaned).strip("._")
    if not cleaned:
        cleaned = "file"
    return cleaned[:max_len]


def file_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def request_url(
    url: str,
    *,
    timeout: int,
    user_agent: str,
    accept: str = "*/*",
    extra_headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Dict[str, str], bytes]:
    headers = {"User-Agent": user_agent, "Accept": accept}
    if extra_headers:
        for k, v in extra_headers.items():
            if k and v is not None:
                headers[k] = str(v)
    req = Request(url, headers=headers)
    with urlopen(req, timeout=timeout) as resp:
        status = int(getattr(resp, "status", 200))
        headers = {k.lower(): v for k, v in resp.headers.items()}
        body = resp.read()
        return status, headers, body


def fetch_json(
    url: str,
    *,
    timeout: int,
    user_agent: str,
    retries: int = 2,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Optional[dict]:
    for attempt in range(max(0, retries) + 1):
        try:
            status, headers, body = request_url(
                url,
                timeout=timeout,
                user_agent=user_agent,
                accept="application/json,text/plain,*/*",
                extra_headers=extra_headers,
            )
            if status >= 400:
                if attempt < retries:
                    time.sleep(1.0 + attempt * 0.6)
                    continue
                return None
            content_type = str(headers.get("content-type") or "")
            enc_match = re.search(r"charset=([a-zA-Z0-9\-_]+)", content_type, flags=re.IGNORECASE)
            candidates: List[str] = []
            if enc_match:
                candidates.append(enc_match.group(1).strip())
            candidates.extend(["utf-8", "gbk", "gb18030"])
            seen = set()
            for enc in candidates:
                if not enc:
                    continue
                enc_key = enc.lower()
                if enc_key in seen:
                    continue
                seen.add(enc_key)
                try:
                    return json.loads(body.decode(enc, errors="strict"))
                except Exception:
                    continue
            return json.loads(body.decode("utf-8", errors="ignore"))
        except Exception:
            if attempt < retries:
                time.sleep(1.0 + attempt * 0.6)
                continue
            return None
    return None


def guess_extension(url: str, content_type: str) -> str:
    path = urlparse(url).path.lower()
    if path.endswith(".pdf"):
        return ".pdf"
    if path.endswith(".xlsx"):
        return ".xlsx"
    if path.endswith(".xls"):
        return ".xls"
    if path.endswith(".csv"):
        return ".csv"
    if path.endswith(".json"):
        return ".json"
    if "pdf" in (content_type or "").lower():
        return ".pdf"
    if "spreadsheetml" in (content_type or "").lower():
        return ".xlsx"
    if "ms-excel" in (content_type or "").lower():
        return ".xls"
    if "csv" in (content_type or "").lower():
        return ".csv"
    if "json" in (content_type or "").lower():
        return ".json"
    if "html" in (content_type or "").lower():
        return ".html"
    return ".bin"


def write_file(path: Path, content: bytes) -> None:
    ensure_dir(path.parent)
    path.write_bytes(content)


def parse_duckduckgo_links(html: str) -> List[str]:
    links: List[str] = []

    # Redirect-style links: /l/?uddg=<encoded_url>
    for encoded in re.findall(r"uddg=([^&\"']+)", html, flags=re.IGNORECASE):
        try:
            url = unquote(encoded)
        except Exception:
            continue
        if url.startswith("http"):
            links.append(url)

    # Direct links fallback
    for raw in re.findall(r'href="(https?://[^"]+)"', html, flags=re.IGNORECASE):
        if "duckduckgo.com" in raw:
            continue
        links.append(raw)

    # Deduplicate
    seen = set()
    output: List[str] = []
    for link in links:
        key = link.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(key)
    return output


def looks_like_report(url: str) -> bool:
    lower = url.lower()
    return any(keyword in lower for keyword in REPORT_KEYWORDS)


def is_blocked_non_report_domain(url: str) -> bool:
    host = (urlparse(url).netloc or "").lower()
    if host in NON_REPORT_DOMAINS:
        return True
    return host.endswith(".ilovepdf.com")


def is_high_confidence_report_link(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    if ".pdf" in path:
        return True
    if host in TRUSTED_REPORT_DOMAINS:
        return True
    if any(token in path for token in ("/investor", "/investors", "/financial-report", "/financial-reports", "/annual-report")):
        return True
    return False


def strip_html(text: str) -> str:
    value = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", value).strip()


def is_a_share_category(category: str) -> bool:
    text = str(category or "").upper().replace(" ", "")
    if not text:
        return False
    if "B" in text and "A" not in text and "Ａ" not in text:
        return False
    return ("A" in text) or ("Ａ" in text)


def detect_cn_a_share_exchange(code: str, org_id: str) -> str:
    stock_code = str(code or "").strip()
    org = str(org_id or "").strip().lower()
    if stock_code.startswith(("600", "601", "603", "605", "688", "689")):
        return "SSE"
    if stock_code.startswith(("000", "001", "002", "003", "300", "301")):
        return "SZSE"
    if stock_code.startswith(("430", "83", "87", "88", "92")):
        return "BSE"
    if org.startswith("gssh"):
        return "SSE"
    if org.startswith("gssz"):
        return "SZSE"
    if org.startswith("gfbj"):
        return "BSE"
    return "UNKNOWN"


def export_szse_universe_from_cninfo(output_dir: Path, *, timeout: int, user_agent: str) -> List[dict]:
    universe_dir = output_dir / "universe"
    ensure_dir(universe_dir)
    payload = fetch_json(CNINFO_STOCK_LIST_URL, timeout=timeout, user_agent=user_agent, retries=3)
    if not isinstance(payload, dict):
        return []
    stock_list = payload.get("stockList") or []
    if not isinstance(stock_list, list) or not stock_list:
        return []

    normalized = []
    raw_rows = []
    seen_codes = set()
    for row in stock_list:
        if not isinstance(row, dict):
            continue
        code = str(row.get("code") or "").strip()
        if not re.fullmatch(r"\d{6}", code):
            continue
        category = str(row.get("category") or "").strip()
        if not is_a_share_category(category):
            continue
        exchange = detect_cn_a_share_exchange(code, str(row.get("orgId") or ""))
        if exchange != "SZSE":
            continue
        if code in seen_codes:
            continue
        seen_codes.add(code)
        raw_rows.append(row)
        normalized.append(
            {
                "exchange": "SZSE",
                "ticker": code,
                "companyName": str(row.get("zwjc") or "").strip(),
                "category": category,
                "orgId": str(row.get("orgId") or "").strip(),
                "source": "CNINFO",
            }
        )

    if not normalized:
        return []

    raw_payload = {
        "exchange": "SZSE",
        "source": "CNINFO fallback",
        "sourceUrl": CNINFO_STOCK_LIST_URL,
        "recordCount": len(raw_rows),
        "companyCount": len(normalized),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "records": raw_rows,
    }
    raw_path = universe_dir / "szse_a_share_list.json"
    raw_bytes = json.dumps(raw_payload, ensure_ascii=False, indent=2).encode("utf-8")
    write_file(raw_path, raw_bytes)

    normalized_path = universe_dir / "szse_a_share_list.normalized.jsonl"
    with normalized_path.open("w", encoding="utf-8") as f:
        for row in normalized:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return [
        {
            "sourceType": "szse_universe",
            "url": CNINFO_STOCK_LIST_URL,
            "path": str(raw_path),
            "size": len(raw_bytes),
            "sha256": file_sha256(raw_bytes),
            "contentType": "application/json",
            "companyCount": len(normalized),
            "normalizedPath": str(normalized_path),
            "fallback": True,
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    ]


def search_report_links(query: str, *, timeout: int, user_agent: str, limit: int) -> List[str]:
    search_url = DUCKDUCKGO_HTML_URL.format(query=quote_plus(query))
    try:
        status, _, body = request_url(
            search_url,
            timeout=timeout,
            user_agent=user_agent,
            accept="text/html,application/xhtml+xml,*/*",
        )
        if status >= 400:
            return []
        html = body.decode("utf-8", errors="ignore")
        links = parse_duckduckgo_links(html)
        report_links = [
            link
            for link in links
            if (
                not is_blocked_non_report_domain(link)
                and looks_like_report(link)
                and is_high_confidence_report_link(link)
            )
        ]
        if not report_links:
            # fallback: keep the top clean links so we can crawl IR pages for pdfs
            report_links = [
                link
                for link in links
                if not is_blocked_non_report_domain(link) and is_high_confidence_report_link(link)
            ]
        return report_links[: max(0, limit)]
    except Exception:
        return []


def extract_pdf_links_from_html(base_url: str, html: str) -> List[str]:
    candidates = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)
    output: List[str] = []
    for href in candidates:
        href = href.strip()
        if not href:
            continue
        if href.lower().startswith("javascript:"):
            continue
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            parsed = urlparse(base_url)
            href = f"{parsed.scheme}://{parsed.netloc}{href}"
        elif not href.startswith("http"):
            parsed = urlparse(base_url)
            href = f"{parsed.scheme}://{parsed.netloc}/{href.lstrip('/')}"
        if ".pdf" not in href.lower():
            continue
        output.append(href)

    seen = set()
    unique: List[str] = []
    for item in output:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    return unique


def download_document(
    url: str,
    out_dir: Path,
    *,
    timeout: int,
    user_agent: str,
    max_file_mb: int,
    base_name: str,
) -> Optional[dict]:
    try:
        status, headers, body = request_url(url, timeout=timeout, user_agent=user_agent, accept="*/*")
        if status >= 400:
            return None

        max_bytes = max(1, max_file_mb) * 1024 * 1024
        if len(body) > max_bytes:
            return None

        content_type = headers.get("content-type", "")
        ext = guess_extension(url, content_type)
        filename = sanitize_filename(base_name)
        if not filename.lower().endswith(ext):
            filename = f"{filename}{ext}"

        path = out_dir / filename
        if path.exists() and path.stat().st_size > 0:
            return {
                "path": str(path),
                "size": path.stat().st_size,
                "sha256": file_sha256(path.read_bytes()),
                "contentType": content_type,
                "url": url,
                "cached": True,
            }

        write_file(path, body)
        return {
            "path": str(path),
            "size": len(body),
            "sha256": file_sha256(body),
            "contentType": content_type,
            "url": url,
            "cached": False,
        }
    except Exception:
        return None


def load_seeds(path: Path) -> dict:
    if not path.exists():
        return {"sec_tickers": [], "web_search": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {"sec_tickers": [], "web_search": []}
    return {
        "sec_tickers": list(data.get("sec_tickers") or []),
        "web_search": list(data.get("web_search") or []),
    }


def fetch_sec_reports(
    tickers: Iterable[str],
    output_dir: Path,
    *,
    timeout: int,
    user_agent: str,
    max_docs_per_ticker: int,
    max_file_mb: int,
) -> List[dict]:
    ticker_map = fetch_json(SEC_TICKER_MAP_URL, timeout=timeout, user_agent=user_agent)
    if not ticker_map:
        log("[SEC] Failed to load ticker map.")
        return []

    # Build {TICKER: CIK}
    sec_lookup: Dict[str, str] = {}
    for item in ticker_map.values():
        if not isinstance(item, dict):
            continue
        ticker = str(item.get("ticker") or "").strip().upper()
        cik = str(item.get("cik_str") or "").strip()
        if ticker and cik:
            sec_lookup[ticker] = cik

    records: List[dict] = []
    sec_root = output_dir / "sec"
    ensure_dir(sec_root)

    for ticker_raw in tickers:
        ticker = str(ticker_raw or "").strip().upper()
        if not ticker:
            continue

        cik = sec_lookup.get(ticker)
        if not cik:
            log(f"[SEC] Ticker not found: {ticker}")
            continue

        cik10 = cik.zfill(10)
        cik_nozero = str(int(cik))
        submissions = fetch_json(
            SEC_SUBMISSIONS_URL.format(cik=cik10),
            timeout=timeout,
            user_agent=user_agent,
        )
        if not submissions:
            log(f"[SEC] Failed submissions: {ticker}")
            continue

        recent = (submissions.get("filings") or {}).get("recent") or {}
        forms = recent.get("form") or []
        filing_dates = recent.get("filingDate") or []
        accessions = recent.get("accessionNumber") or []
        docs = recent.get("primaryDocument") or []

        ticker_dir = sec_root / ticker
        ensure_dir(ticker_dir)

        picked = 0
        for idx in range(min(len(forms), len(filing_dates), len(accessions), len(docs))):
            form = str(forms[idx] or "").strip().upper()
            if form not in ALLOWED_SEC_FORMS:
                continue
            filing_date = str(filing_dates[idx] or "").strip()
            accession = str(accessions[idx] or "").strip()
            primary_doc = str(docs[idx] or "").strip()
            if not accession or not primary_doc:
                continue

            accession_no_dash = accession.replace("-", "")
            doc_url = SEC_ARCHIVE_DOC_URL.format(
                cik_nozero=cik_nozero, accession_no_dash=accession_no_dash, doc=primary_doc
            )
            base_name = f"{ticker}_{form}_{filing_date}_{accession_no_dash}_{Path(primary_doc).name}"
            result = download_document(
                doc_url,
                ticker_dir,
                timeout=timeout,
                user_agent=user_agent,
                max_file_mb=max_file_mb,
                base_name=base_name,
            )
            if not result:
                continue

            records.append(
                {
                    "sourceType": "sec_filing",
                    "ticker": ticker,
                    "cik": cik10,
                    "form": form,
                    "filingDate": filing_date,
                    "url": doc_url,
                    "path": result["path"],
                    "size": result["size"],
                    "sha256": result["sha256"],
                    "contentType": result["contentType"],
                    "cached": result["cached"],
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )
            picked += 1
            if picked >= max_docs_per_ticker:
                break

        facts = fetch_json(
            SEC_COMPANYFACTS_URL.format(cik=cik10),
            timeout=timeout,
            user_agent=user_agent,
        )
        if facts:
            facts_path = ticker_dir / f"{ticker}_companyfacts.json"
            facts_bytes = json.dumps(facts, ensure_ascii=False).encode("utf-8")
            write_file(facts_path, facts_bytes)
            records.append(
                {
                    "sourceType": "sec_companyfacts",
                    "ticker": ticker,
                    "cik": cik10,
                    "url": SEC_COMPANYFACTS_URL.format(cik=cik10),
                    "path": str(facts_path),
                    "size": len(facts_bytes),
                    "sha256": file_sha256(facts_bytes),
                    "contentType": "application/json",
                    "cached": False,
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )

        log(f"[SEC] {ticker}: downloaded {picked} filings")

    return records


def fetch_web_reports(
    web_items: Iterable[dict],
    output_dir: Path,
    *,
    timeout: int,
    user_agent: str,
    max_links_per_query: int,
    max_file_mb: int,
) -> List[dict]:
    records: List[dict] = []
    web_root = output_dir / "web"
    ensure_dir(web_root)
    seen_urls = set()

    for item in web_items:
        if not isinstance(item, dict):
            continue
        company = str(item.get("company") or "").strip()
        queries = [str(q).strip() for q in (item.get("queries") or []) if str(q).strip()]
        direct_urls = [str(u).strip() for u in (item.get("direct_urls") or []) if str(u).strip()]
        if not company or not queries:
            if not company or not direct_urls:
                continue

        company_dir = web_root / sanitize_filename(company, max_len=80)
        ensure_dir(company_dir)

        for direct_idx, direct_url in enumerate(direct_urls, start=1):
            if direct_url in seen_urls:
                continue
            seen_urls.add(direct_url)
            parsed_direct = urlparse(direct_url)
            direct_host = sanitize_filename(parsed_direct.netloc or "unknown", max_len=50)
            direct_slug = hashlib.md5(direct_url.encode("utf-8")).hexdigest()[:10]
            direct_name = f"direct_{direct_idx:02d}_{direct_host}_{direct_slug}"
            direct_result = download_document(
                direct_url,
                company_dir,
                timeout=timeout,
                user_agent=user_agent,
                max_file_mb=max_file_mb,
                base_name=direct_name,
            )
            if not direct_result:
                continue
            records.append(
                {
                    "sourceType": "web_public_report_direct",
                    "company": company,
                    "url": direct_url,
                    "path": direct_result["path"],
                    "size": direct_result["size"],
                    "sha256": direct_result["sha256"],
                    "contentType": direct_result["contentType"],
                    "cached": direct_result["cached"],
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )

        for q_idx, query in enumerate(queries, start=1):
            links = search_report_links(query, timeout=timeout, user_agent=user_agent, limit=max_links_per_query)
            log(f"[WEB] {company} query#{q_idx}: found {len(links)} candidates")
            for link_idx, link in enumerate(links, start=1):
                if link in seen_urls:
                    continue
                seen_urls.add(link)
                parsed = urlparse(link)
                host = sanitize_filename(parsed.netloc or "unknown", max_len=50)
                slug = hashlib.md5(link.encode("utf-8")).hexdigest()[:10]
                base_name = f"{q_idx:02d}_{link_idx:02d}_{host}_{slug}"

                result = download_document(
                    link,
                    company_dir,
                    timeout=timeout,
                    user_agent=user_agent,
                    max_file_mb=max_file_mb,
                    base_name=base_name,
                )
                if not result:
                    continue

                records.append(
                    {
                        "sourceType": "web_public_report",
                        "company": company,
                        "query": query,
                        "url": link,
                        "path": result["path"],
                        "size": result["size"],
                        "sha256": result["sha256"],
                        "contentType": result["contentType"],
                        "cached": result["cached"],
                        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }
                )

                # If IR page html is downloaded, crawl direct PDF links from this page.
                if str(result.get("contentType", "")).lower().find("html") >= 0:
                    try:
                        html_text = Path(result["path"]).read_text(encoding="utf-8", errors="ignore")
                    except Exception:
                        html_text = ""
                    if html_text:
                        pdf_links = extract_pdf_links_from_html(link, html_text)[:3]
                        for pdf_idx, pdf_link in enumerate(pdf_links, start=1):
                            if pdf_link in seen_urls:
                                continue
                            seen_urls.add(pdf_link)
                            pdf_slug = hashlib.md5(pdf_link.encode("utf-8")).hexdigest()[:10]
                            pdf_name = f"{q_idx:02d}_{link_idx:02d}_{pdf_idx:02d}_{host}_{pdf_slug}"
                            pdf_result = download_document(
                                pdf_link,
                                company_dir,
                                timeout=timeout,
                                user_agent=user_agent,
                                max_file_mb=max_file_mb,
                                base_name=pdf_name,
                            )
                            if not pdf_result:
                                continue
                            records.append(
                                {
                                    "sourceType": "web_public_report_pdf",
                                    "company": company,
                                    "query": query,
                                    "url": pdf_link,
                                    "referrer": link,
                                    "path": pdf_result["path"],
                                    "size": pdf_result["size"],
                                    "sha256": pdf_result["sha256"],
                                    "contentType": pdf_result["contentType"],
                                    "cached": pdf_result["cached"],
                                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                }
                            )

    return records


def save_index(output_dir: Path, records: List[dict]) -> None:
    ensure_dir(output_dir)
    index_json = output_dir / "index.json"
    index_jsonl = output_dir / "index.jsonl"
    summary_json = output_dir / "summary.json"

    index_json.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    with index_jsonl.open("w", encoding="utf-8") as f:
        for row in records:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    summary = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalRecords": len(records),
        "secFilings": sum(1 for row in records if row.get("sourceType") == "sec_filing"),
        "secCompanyfacts": sum(1 for row in records if row.get("sourceType") == "sec_companyfacts"),
        "universeRecords": sum(1 for row in records if str(row.get("sourceType", "")).endswith("_universe")),
        "secUniverseCount": sum(
            int(row.get("companyCount") or 0) for row in records if row.get("sourceType") == "sec_universe"
        ),
        "sseUniverseCount": sum(
            int(row.get("companyCount") or 0) for row in records if row.get("sourceType") == "sse_universe"
        ),
        "szseUniverseCount": sum(
            int(row.get("companyCount") or 0) for row in records if row.get("sourceType") == "szse_universe"
        ),
        "webReports": sum(
            1
            for row in records
            if str(row.get("sourceType", "")).startswith("web_public_report")
        ),
    }
    summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def export_sec_universe(output_dir: Path, *, timeout: int, sec_user_agent: str) -> List[dict]:
    universe_dir = output_dir / "universe"
    ensure_dir(universe_dir)
    ticker_map = fetch_json(SEC_TICKER_MAP_URL, timeout=timeout, user_agent=sec_user_agent, retries=3)
    if not ticker_map:
        return []

    raw_path = universe_dir / "sec_company_tickers.json"
    raw_bytes = json.dumps(ticker_map, ensure_ascii=False, indent=2).encode("utf-8")
    write_file(raw_path, raw_bytes)

    normalized = []
    for item in ticker_map.values():
        if not isinstance(item, dict):
            continue
        ticker = str(item.get("ticker") or "").strip().upper()
        title = str(item.get("title") or "").strip()
        cik = str(item.get("cik_str") or "").strip()
        if not ticker or not cik:
            continue
        normalized.append({
            "ticker": ticker,
            "cik": cik.zfill(10),
            "companyName": title
        })

    normalized_path = universe_dir / "sec_company_tickers.normalized.jsonl"
    with normalized_path.open("w", encoding="utf-8") as f:
        for row in normalized:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return [{
        "sourceType": "sec_universe",
        "url": SEC_TICKER_MAP_URL,
        "path": str(raw_path),
        "size": len(raw_bytes),
        "sha256": file_sha256(raw_bytes),
        "contentType": "application/json",
        "companyCount": len(normalized),
        "normalizedPath": str(normalized_path),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }]


def export_hkex_universe(output_dir: Path, *, timeout: int, user_agent: str, max_file_mb: int) -> List[dict]:
    # Official HKEX list of securities (all listed securities).
    hkex_url = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"
    universe_dir = output_dir / "universe"
    ensure_dir(universe_dir)
    result = download_document(
        hkex_url,
        universe_dir,
        timeout=timeout,
        user_agent=user_agent,
        max_file_mb=max_file_mb,
        base_name="hkex_list_of_securities",
    )
    if not result:
        return []
    return [{
        "sourceType": "hkex_universe",
        "url": hkex_url,
        "path": result["path"],
        "size": result["size"],
        "sha256": result["sha256"],
        "contentType": result["contentType"],
        "cached": result["cached"],
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }]


def export_sse_universe(output_dir: Path, *, timeout: int, user_agent: str) -> List[dict]:
    universe_dir = output_dir / "universe"
    ensure_dir(universe_dir)
    page_size = 200
    page_no = 1
    all_rows: List[dict] = []
    expected_total = 0
    page_count = 0
    extra_headers = {
        "Referer": SSE_A_SHARE_REFERER,
        "Host": "query.sse.com.cn",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    while True:
        params = {
            "isPagination": "true",
            "stockCode": "",
            "csrcCode": "",
            "areaName": "",
            "stockType": "10",  # SSE all A-shares
            "pageHelp.pageSize": str(page_size),
            "pageHelp.pageNo": str(page_no),
            "pageHelp.beginPage": str(page_no),
            "pageHelp.endPage": str(page_no),
            "pageHelp.cacheSize": "1",
            "pageHelp.pageCount": "1",
        }
        url = f"{SSE_A_SHARE_LIST_URL}?{urlencode(params)}"
        payload = fetch_json(
            url,
            timeout=timeout,
            user_agent=user_agent,
            retries=2,
            extra_headers=extra_headers,
        )
        if not payload:
            break

        page_help = payload.get("pageHelp") or {}
        data_rows = page_help.get("data") or []
        if not isinstance(data_rows, list) or not data_rows:
            break
        all_rows.extend(data_rows)

        try:
            expected_total = int(page_help.get("total") or expected_total or 0)
        except Exception:
            expected_total = expected_total or 0
        try:
            page_count = int(page_help.get("pageCount") or page_count or 0)
        except Exception:
            page_count = page_count or 0

        if page_count and page_no >= page_count:
            break
        if expected_total and len(all_rows) >= expected_total:
            break
        page_no += 1
        if page_no > 1000:
            break

    if not all_rows:
        return []

    normalized = []
    seen_codes = set()
    for row in all_rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("SECURITY_CODE_A") or "").strip()
        if not re.fullmatch(r"\d{6}", code):
            continue
        if code in seen_codes:
            continue
        seen_codes.add(code)
        normalized.append(
            {
                "exchange": "SSE",
                "ticker": code,
                "companyName": str(row.get("COMPANY_ABBR") or row.get("SECURITY_ABBR_A") or "").strip(),
                "securityAbbrA": str(row.get("SECURITY_ABBR_A") or "").strip(),
                "companyCode": str(row.get("COMPANY_CODE") or "").strip(),
                "listingDate": str(row.get("LISTING_DATE") or "").strip(),
                "listingBoard": str(row.get("LISTING_BOARD") or "").strip(),
            }
        )

    raw_payload = {
        "exchange": "SSE",
        "sourceUrl": SSE_A_SHARE_LIST_URL,
        "stockType": "10",
        "recordCount": len(all_rows),
        "companyCount": len(normalized),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "records": all_rows,
    }
    raw_path = universe_dir / "sse_a_share_list.json"
    raw_bytes = json.dumps(raw_payload, ensure_ascii=False, indent=2).encode("utf-8")
    write_file(raw_path, raw_bytes)

    normalized_path = universe_dir / "sse_a_share_list.normalized.jsonl"
    with normalized_path.open("w", encoding="utf-8") as f:
        for row in normalized:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return [
        {
            "sourceType": "sse_universe",
            "url": SSE_A_SHARE_LIST_URL,
            "path": str(raw_path),
            "size": len(raw_bytes),
            "sha256": file_sha256(raw_bytes),
            "contentType": "application/json",
            "companyCount": len(normalized),
            "normalizedPath": str(normalized_path),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    ]


def export_szse_universe(output_dir: Path, *, timeout: int, user_agent: str) -> List[dict]:
    universe_dir = output_dir / "universe"
    ensure_dir(universe_dir)
    page_size = 20
    extra_headers = {
        "Referer": SZSE_STOCK_LIST_REFERER,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    boot_url = f"{SZSE_REPORT_DATA_URL}?{urlencode({'SHOWTYPE': 'JSON', 'CATALOGID': '1110'})}"
    boot = fetch_json(
        boot_url,
        timeout=timeout,
        user_agent=user_agent,
        retries=2,
        extra_headers=extra_headers,
    )
    if not isinstance(boot, list) or not boot:
        return export_szse_universe_from_cninfo(output_dir, timeout=timeout, user_agent=user_agent)

    tab_keys: List[str] = []
    for item in boot:
        if not isinstance(item, dict):
            continue
        meta = item.get("metadata") or {}
        tabkey = str(meta.get("tabkey") or "").strip()
        rows = item.get("data") or []
        if not tabkey:
            continue
        if isinstance(rows, list) and rows and isinstance(rows[0], dict) and "agdm" in rows[0]:
            tab_keys.append(tabkey)

    if not tab_keys:
        first_tab = str(((boot[0] or {}).get("metadata") or {}).get("tabkey") or "tab1").strip()
        tab_keys = [first_tab] if first_tab else ["tab1"]

    all_rows: List[dict] = []
    tab_meta: Dict[str, dict] = {}
    for tabkey in tab_keys:
        page_no = 1
        page_count = 0
        consecutive_failures = 0
        while True:
            params = {
                "SHOWTYPE": "JSON",
                "CATALOGID": "1110",
                "TABKEY": tabkey,
                "PAGENO": str(page_no),
                f"{tabkey}PAGESIZE": str(page_size),
            }
            url = f"{SZSE_REPORT_DATA_URL}?{urlencode(params)}"
            page = fetch_json(
                url,
                timeout=timeout,
                user_agent=user_agent,
                retries=4,
                extra_headers=extra_headers,
            )
            if not isinstance(page, list) or not page:
                consecutive_failures += 1
                if consecutive_failures >= 8:
                    break
                time.sleep(min(3.0, 0.4 * consecutive_failures))
                continue
            consecutive_failures = 0

            current = None
            for item in page:
                if not isinstance(item, dict):
                    continue
                if str((item.get("metadata") or {}).get("tabkey") or "").strip() == tabkey:
                    current = item
                    break
            if current is None:
                current = page[0]

            meta = current.get("metadata") or {}
            tab_meta[tabkey] = {
                "name": str(meta.get("name") or "").strip(),
                "recordCount": int(meta.get("recordcount") or 0) if str(meta.get("recordcount") or "").isdigit() else 0,
                "pageCount": int(meta.get("pagecount") or 0) if str(meta.get("pagecount") or "").isdigit() else 0,
            }
            data_rows = current.get("data") or []
            if not isinstance(data_rows, list):
                consecutive_failures += 1
                if consecutive_failures >= 8:
                    break
                time.sleep(min(3.0, 0.4 * consecutive_failures))
                continue
            if not data_rows and page_count and page_no <= page_count:
                consecutive_failures += 1
                if consecutive_failures >= 8:
                    break
                time.sleep(min(3.0, 0.4 * consecutive_failures))
                continue
            if not data_rows:
                break
            all_rows.extend(data_rows)

            current_page_count = tab_meta[tabkey]["pageCount"]
            if current_page_count:
                page_count = current_page_count
            if page_count and page_no >= page_count:
                break
            page_no += 1
            time.sleep(0.05)
            if page_no > 2000:
                break

    if not all_rows:
        return export_szse_universe_from_cninfo(output_dir, timeout=timeout, user_agent=user_agent)

    normalized = []
    seen_codes = set()
    for row in all_rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("agdm") or "").strip()
        if not re.fullmatch(r"\d{6}", code):
            continue
        if code in seen_codes:
            continue
        seen_codes.add(code)
        normalized.append(
            {
                "exchange": "SZSE",
                "ticker": code,
                "companyName": strip_html(str(row.get("agjc") or "")),
                "listingDate": str(row.get("agssrq") or "").strip(),
                "board": str(row.get("bk") or "").strip(),
                "industry": str(row.get("sshymc") or "").strip(),
            }
        )

    raw_payload = {
        "exchange": "SZSE",
        "sourceUrl": SZSE_REPORT_DATA_URL,
        "catalogId": "1110",
        "tabMeta": tab_meta,
        "recordCount": len(all_rows),
        "companyCount": len(normalized),
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "records": all_rows,
    }
    raw_path = universe_dir / "szse_a_share_list.json"
    raw_bytes = json.dumps(raw_payload, ensure_ascii=False, indent=2).encode("utf-8")
    write_file(raw_path, raw_bytes)

    normalized_path = universe_dir / "szse_a_share_list.normalized.jsonl"
    with normalized_path.open("w", encoding="utf-8") as f:
        for row in normalized:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return [
        {
            "sourceType": "szse_universe",
            "url": SZSE_REPORT_DATA_URL,
            "path": str(raw_path),
            "size": len(raw_bytes),
            "sha256": file_sha256(raw_bytes),
            "contentType": "application/json",
            "companyCount": len(normalized),
            "normalizedPath": str(normalized_path),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch public financial reports for preload dataset.")
    script_dir = Path(__file__).resolve().parent
    default_seeds = script_dir / "report_seeds.json"
    default_output = (script_dir.parent / "data" / "prepared_reports").resolve()

    parser.add_argument("--seeds", type=Path, default=default_seeds, help="Seed JSON path")
    parser.add_argument("--output", type=Path, default=default_output, help="Output directory")
    parser.add_argument("--timeout", type=int, default=25, help="HTTP timeout seconds")
    parser.add_argument("--max-file-mb", type=int, default=20, help="Max file size per download (MB)")
    parser.add_argument("--sec-limit", type=int, default=4, help="Max SEC filings per ticker")
    parser.add_argument("--web-limit", type=int, default=2, help="Max report links per web query")
    parser.add_argument("--user-agent", type=str, default=DEFAULT_USER_AGENT, help="HTTP User-Agent for web search/download")
    parser.add_argument("--sec-user-agent", type=str, default=DEFAULT_SEC_USER_AGENT, help="HTTP User-Agent for SEC APIs")
    parser.add_argument("--export-sec-universe", action="store_true", help="Export full SEC company universe")
    parser.add_argument("--export-hkex-universe", action="store_true", help="Export HKEX securities universe file")
    parser.add_argument("--export-sse-universe", action="store_true", help="Export SSE A-share universe")
    parser.add_argument("--export-szse-universe", action="store_true", help="Export SZSE A-share universe")
    parser.add_argument("--clean-output", action="store_true", help="Remove existing output directory before fetching")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    seeds = load_seeds(args.seeds)
    output_dir = args.output.resolve()
    if args.clean_output and output_dir.exists():
        shutil.rmtree(output_dir, ignore_errors=True)
    ensure_dir(output_dir)

    log(f"[START] output={output_dir}")
    records: List[dict] = []

    sec_records = fetch_sec_reports(
        seeds.get("sec_tickers", []),
        output_dir,
        timeout=args.timeout,
        user_agent=args.sec_user_agent,
        max_docs_per_ticker=max(1, args.sec_limit),
        max_file_mb=max(1, args.max_file_mb),
    )
    records.extend(sec_records)

    if args.export_sec_universe:
        records.extend(
            export_sec_universe(output_dir, timeout=args.timeout, sec_user_agent=args.sec_user_agent)
        )

    if args.export_hkex_universe:
        records.extend(
            export_hkex_universe(
                output_dir,
                timeout=args.timeout,
                user_agent=args.user_agent,
                max_file_mb=max(5, args.max_file_mb),
            )
        )

    if args.export_sse_universe:
        records.extend(
            export_sse_universe(
                output_dir,
                timeout=args.timeout,
                user_agent=args.user_agent,
            )
        )

    if args.export_szse_universe:
        records.extend(
            export_szse_universe(
                output_dir,
                timeout=args.timeout,
                user_agent=args.user_agent,
            )
        )

    web_records = fetch_web_reports(
        seeds.get("web_search", []),
        output_dir,
        timeout=args.timeout,
        user_agent=args.user_agent,
        max_links_per_query=max(1, args.web_limit),
        max_file_mb=max(1, args.max_file_mb),
    )
    records.extend(web_records)

    save_index(output_dir, records)
    web_count = sum(1 for r in records if str(r.get("sourceType", "")).startswith("web_public_report"))
    log(
        f"[DONE] total={len(records)} sec_filings={sum(1 for r in records if r.get('sourceType') == 'sec_filing')} "
        f"sec_companyfacts={sum(1 for r in records if r.get('sourceType') == 'sec_companyfacts')} "
        f"web_reports={web_count}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
