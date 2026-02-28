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
from urllib.parse import quote_plus, unquote, urlparse
from urllib.request import Request, urlopen


SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_ARCHIVE_DOC_URL = "https://www.sec.gov/Archives/edgar/data/{cik_nozero}/{accession_no_dash}/{doc}"
DUCKDUCKGO_HTML_URL = "https://duckduckgo.com/html/?q={query}"

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
) -> Tuple[int, Dict[str, str], bytes]:
    req = Request(url, headers={"User-Agent": user_agent, "Accept": accept})
    with urlopen(req, timeout=timeout) as resp:
        status = int(getattr(resp, "status", 200))
        headers = {k.lower(): v for k, v in resp.headers.items()}
        body = resp.read()
        return status, headers, body


def fetch_json(url: str, *, timeout: int, user_agent: str, retries: int = 2) -> Optional[dict]:
    for attempt in range(max(0, retries) + 1):
        try:
            status, _, body = request_url(
                url, timeout=timeout, user_agent=user_agent, accept="application/json,text/plain,*/*"
            )
            if status >= 400:
                if attempt < retries:
                    time.sleep(1.0 + attempt * 0.6)
                    continue
                return None
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
