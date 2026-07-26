import os
import json
import requests
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from newspaper import Article
from pydantic import BaseModel, HttpUrl
import validators

load_dotenv()

# ------------------------------
# Configuration
# ------------------------------
try:
    client = genai.Client()
except Exception:
    client = None

FACTCHECK_API_KEY = os.getenv("FACTCHECK_API_KEY")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------
# Models
# ------------------------------
class AnalysisRequest(BaseModel):
    content: Optional[str] = None
    url: Optional[HttpUrl] = None


class FactorWeights:
    """Weights for the 12 factors (sum = 1)"""

    weights = {
        "source_credibility": 0.15,
        "cross_referencing": 0.20,
        "evidence_corroboration": 0.20,
        "logical_consistency": 0.10,
        "date_timeliness": 0.05,
        "language_manipulation": 0.05,
        "image_authenticity": 0.05,
        "satire": 0.05,
        "quotes_attribution": 0.05,
        "domain_analysis": 0.05,
        "bias_framing": 0.025,
        "context_omission": 0.025,
    }


# ------------------------------
# Helper: Extract article text
# ------------------------------
def extract_article(url: str) -> dict:
    if not validators.url(url):
        raise ValueError("Invalid URL")
    article = Article(url)
    article.download()
    article.parse()
    return {
        "title": article.title,
        "text": article.text,
        "authors": article.authors,
        "publish_date": str(article.publish_date) if article.publish_date else None,
    }


# ------------------------------
# Fact-check lookup (Google Fact Check Tools)
# ------------------------------
def fetch_fact_checks(query: str) -> str:
    """Return a formatted string of fact-check results for the query."""
    if not FACTCHECK_API_KEY:
        return "No fact-check API key configured."
    try:
        url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
        params = {
            "query": query,
            "key": FACTCHECK_API_KEY,
            "languageCode": "en",
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        claims = data.get("claims", [])
        if not claims:
            return "No existing fact-checks found."
        formatted = []
        for claim in claims[:5]:
            review = claim.get("claimReview", [{}])[0]
            formatted.append(
                f"- Claimant: {claim.get('text', 'N/A')}\n"
                f"  Publisher: {review.get('publisher', {}).get('name', 'N/A')}\n"
                f"  Verdict: {review.get('textualRating', 'N/A')}\n"
                f"  URL: {review.get('url', 'N/A')}"
            )
        return "\n".join(formatted)
    except Exception as e:
        return f"Fact-check lookup failed: {str(e)}"


# ------------------------------
# AI System Prompt
# ------------------------------
SYSTEM_PROMPT = """You are an expert fact-checker AI. Analyze the following news article and return a STRICTLY valid JSON object with the structure below.

Use the provided "External Fact-Checks" to assist your analysis. Fill every field based on your assessment.

{{
  "verdict": "Likely True|Mostly True|Half True|Mostly False|False|Misleading|Satire|Unverified",
  "confidence": 0.85,
  "summary": "Short explanation",
  "factors": {{
    "source_credibility": {{
      "rating": "High|Medium|Low",
      "explanation": "..."
    }},
    "cross_referencing": {{
      "matches": [
        {{"site": "Snopes", "verdict": "False", "link": "https://..."}}
      ],
      "explanation": "..."
    }},
    "evidence_corroboration": {{
      "status": "Confirmed|Contradicted|Unverified",
      "explanation": "..."
    }},
    "logical_consistency": {{
      "rating": "High|Medium|Low",
      "issues": ["List any logical fallacies"]
    }},
    "date_timeliness": {{
      "outdated": false,
      "original_date": "2026-06-15",
      "explanation": "..."
    }},
    "language_manipulation": {{
      "sensationalism": "High|Medium|Low",
      "clickbait_title": false,
      "explanation": "..."
    }},
    "image_authenticity": {{
      "status": "Authentic|Manipulated/Misleading|Unclear",
      "explanation": "..."
    }},
    "satire": {{
      "is_satire": false,
      "explanation": "..."
    }},
    "quotes_attribution": {{
      "quality": "Well-attributed|Partly attributed|Poor/unattributed",
      "explanation": "..."
    }},
    "domain_analysis": {{
      "suspicious": false,
      "reason": "..."
    }},
    "bias_framing": {{
      "level": "High|Medium|Low",
      "explanation": "..."
    }},
    "context_omission": {{
      "level": "High|Medium|Low",
      "explanation": "..."
    }}
  }}
}}

External Fact-Checks:
{fact_checks}

Article:
{article}
"""


# ------------------------------
# Score Calculation
# ------------------------------
def compute_fakeness(factors: dict) -> float:
    w = FactorWeights.weights

    src_rating = factors.get("source_credibility", {}).get("rating", "Medium")
    src_score = {"High": 0, "Medium": 0.5, "Low": 1}.get(src_rating, 0.5)

    cross_matches = factors.get("cross_referencing", {}).get("matches", [])
    if cross_matches:
        debunk_count = sum(
            1 for m in cross_matches
            if m.get("verdict", "").lower() in ["false", "misleading", "mostly false"]
        )
        cross_score = debunk_count / len(cross_matches)
    else:
        cross_score = 0.5

    evidence_status = factors.get("evidence_corroboration", {}).get("status", "Unverified")
    evidence_score = {"Confirmed": 0, "Unverified": 0.5, "Contradicted": 1}.get(evidence_status, 0.5)

    logic_rating = factors.get("logical_consistency", {}).get("rating", "Medium")
    logic_score = {"High": 0, "Medium": 0.5, "Low": 1}.get(logic_rating, 0.5)

    outdated = factors.get("date_timeliness", {}).get("outdated", False)
    date_score = 1 if outdated else 0

    lang = factors.get("language_manipulation", {})
    sens = lang.get("sensationalism", "Low")
    clickbait = lang.get("clickbait_title", False)
    sens_score = {"High": 1, "Medium": 0.5, "Low": 0}.get(sens, 0)
    lang_score = min(sens_score + (0.5 if clickbait else 0), 1.0)

    img_status = factors.get("image_authenticity", {}).get("status", "Unclear")
    img_score = {"Authentic": 0, "Manipulated/Misleading": 1, "Unclear": 0.5}.get(img_status, 0.5)

    is_satire = factors.get("satire", {}).get("is_satire", False)
    satire_score = 0 if is_satire else 0

    quote_quality = factors.get("quotes_attribution", {}).get("quality", "Partly attributed")
    quote_score = {
        "Well-attributed": 0,
        "Partly attributed": 0.5,
        "Poor/unattributed": 1,
    }.get(quote_quality, 0.5)

    suspicious = factors.get("domain_analysis", {}).get("suspicious", False)
    domain_score = 1 if suspicious else 0

    bias_level = factors.get("bias_framing", {}).get("level", "Low")
    bias_score = {"High": 0.4, "Medium": 0.2, "Low": 0}.get(bias_level, 0)

    context_level = factors.get("context_omission", {}).get("level", "Low")
    context_score = {"High": 1, "Medium": 0.5, "Low": 0}.get(context_level, 0)

    scores = {
        "source_credibility": src_score,
        "cross_referencing": cross_score,
        "evidence_corroboration": evidence_score,
        "logical_consistency": logic_score,
        "date_timeliness": date_score,
        "language_manipulation": lang_score,
        "image_authenticity": img_score,
        "satire": satire_score,
        "quotes_attribution": quote_score,
        "domain_analysis": domain_score,
        "bias_framing": bias_score,
        "context_omission": context_score,
    }

    total = sum(w[key] * scores[key] for key in w)
    return round(total * 100, 1)


def _extract_text_from_response(response) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text:
        return text

    candidates = getattr(response, "candidates", None)
    if candidates:
        collected = []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            if content:
                parts = getattr(content, "parts", None)
                if parts:
                    for part in parts:
                        part_text = getattr(part, "text", None)
                        if part_text:
                            collected.append(part_text)
        if collected:
            return "".join(collected)

    return str(response)


# ------------------------------
# Main API endpoint
# ------------------------------
@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    if req.url:
        try:
            article = extract_article(str(req.url))
            article_text = f"Title: {article['title']}\n\n{article['text']}"
        except Exception as e:
            raise HTTPException(400, f"Failed to extract article: {str(e)}")
    elif req.content:
        article_text = req.content
    else:
        raise HTTPException(400, "Provide either 'content' or 'url'.")

    query = article.get("title", article_text[:200]) if req.url else article_text[:200]
    fact_checks_str = fetch_fact_checks(query)
    prompt = SYSTEM_PROMPT.format(fact_checks=fact_checks_str, article=article_text)

    if client is None:
        raise HTTPException(500, "Gemini client is not configured. Set GOOGLE_API_KEY or GEMINI_API_KEY.")

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You return only valid JSON.",
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        result_text = _extract_text_from_response(response)
        result_json = json.loads(result_text)
    except Exception as e:
        raise HTTPException(500, f"AI analysis failed: {str(e)}")

    factors = result_json.get("factors", {})
    if not factors:
        factors = result_json

    fakeness_pct = compute_fakeness(factors)

    return {
        "ai_analysis": result_json,
        "fakeness_percentage": fakeness_pct,
        "weights_used": FactorWeights.weights,
        "summary": result_json.get("summary", ""),
        "verdict": result_json.get("verdict", "Unverified"),
    }