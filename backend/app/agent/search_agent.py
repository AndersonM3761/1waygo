import os
import asyncio
import re
from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools.tavily_search import TavilySearchResults
from app.models.schemas import Opportunity, OpportunityList, SearchStrategy
from app.agent.verifier import filter_raw_results
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

def get_llm():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    return ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0.2, google_api_key=api_key)

def get_search_tool():
    return TavilySearchResults(max_results=5)

async def async_search(query: str, tool: TavilySearchResults) -> List[Dict[str, Any]]:
    loop = asyncio.get_event_loop()
    try:
        res = await loop.run_in_executor(None, tool.invoke, {"query": query})
        if isinstance(res, list):
            for r in res:
                r['query_used'] = query
            return res
        return []
    except Exception as e:
        print(f"Search error for '{query}': {e}")
        return []

def extract_retry_delay(error_msg: str) -> int:
    """Extract retry delay from Gemini rate limit error message."""
    match = re.search(r'retryDelay.*?(\d+)', str(error_msg))
    if match:
        return min(int(match.group(1)) + 2, 15)  # Cap at 15 seconds max
    return 15

async def invoke_with_retry(llm_chain, prompt, max_retries=1):
    """Invoke LLM with one retry on rate limit. Fails fast to avoid hanging."""
    for attempt in range(max_retries + 1):
        try:
            return await llm_chain.ainvoke(prompt)
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                if attempt < max_retries:
                    delay = extract_retry_delay(error_str)
                    print(f"Rate limited. Waiting {delay}s before retry...")
                    await asyncio.sleep(delay)
                else:
                    print(f"Rate limit exceeded. Giving up.")
                    raise e
            else:
                raise e

def build_fallback_queries(profile_dict: dict, categories: list) -> List[str]:
    """Generate targeted queries that find specific opportunity pages, not generic listing pages."""
    interests = profile_dict.get('interests', '')
    branch = profile_dict.get('branch', '')
    
    fallbacks = []
    for cat in categories:
        if cat == "Hackathon":
            fallbacks.append(f'{interests} hackathon 2025 2026 "register" OR "apply" OR "participate" India')
        elif cat == "Internship":
            fallbacks.append(f'{interests} {branch} internship 2025 2026 "apply now" OR "hiring" OR "openings" India')
        elif cat == "Certification":
            fallbacks.append(f'{interests} professional certificate OR certification course 2025 2026 "enroll" OR "free"')
        elif cat == "Competition":
            fallbacks.append(f'{interests} coding competition OR challenge 2025 2026 "register" OR "participate" India')
    return fallbacks

async def process_profile(profile_dict: dict) -> OpportunityList:
    try:
        llm = get_llm()
        search_tool = get_search_tool()
    except Exception as e:
        print(f"Initialization error: {e}")
        return OpportunityList(opportunities=[])

    # Extract fields with defaults
    mode = profile_dict.get('mode', 'Any')
    duration = profile_dict.get('duration', 'Any')
    location = profile_dict.get('location', '')
    budget = profile_dict.get('budget', 'Free only')
    categories = profile_dict.get('categories', ['Hackathon', 'Internship', 'Certification', 'Competition'])
    interests = profile_dict.get('interests', '')
    branch = profile_dict.get('branch', '')
    year = profile_dict.get('year', '')
    goal = profile_dict.get('goal', '')

    # Build soft preference context (only for non-default values)
    pref_lines = []
    if mode != "Any":
        pref_lines.append(f"The student prefers {mode} opportunities when possible, but don't exclude results just because mode doesn't match.")
    if duration != "Any":
        pref_lines.append(f"The student prefers {duration} duration, but include other durations too.")
    if location:
        pref_lines.append(f"The student is based in {location}. For internships, prefer opportunities accessible from {location}, but also include remote and pan-India opportunities.")
    if budget == "Free only":
        pref_lines.append("For certifications, prioritize free courses but include paid ones that are highly valuable.")
    
    pref_context = "\n    ".join(pref_lines) if pref_lines else "No specific preferences — show the best opportunities available across India."

    # STAGE 1: Build search queries (template-based to save API quota for the Evaluator)
    queries = build_fallback_queries(profile_dict, categories)
    print(f"Search queries: {queries}")

    # STAGE 2: Search (parallel)
    search_tasks = [async_search(q, search_tool) for q in queries]
    nested_raw_results = await asyncio.gather(*search_tasks)
    flat_raw_results = [item for sublist in nested_raw_results for item in sublist]
    
    # STAGE 2.5: Verify
    verified_results = await filter_raw_results(flat_raw_results)
    print(f"Verification: {len(flat_raw_results)} raw -> {len(verified_results)} verified")
    
    if not verified_results:
        print("All search results failed verification (dead links or expired).")
        return OpportunityList(opportunities=[], queries_used=queries)
        
    context_parts = []
    for r in verified_results:
        # TRUNCATE to 1500 chars to avoid hitting Gemini 1M TPM rate limit on free tier!
        content_snippet = r.get('content', '')[:1500] 
        context_parts.append(f"Query: {r.get('query_used', '')}\nURL: {r.get('url')}\nContent: {content_snippet}\nDeadline Status: {r.get('deadline_status')}")
    context = "\n---\n".join(context_parts)
    
    allowed_types = ", ".join(categories)

    # STAGE 3: Evaluate & Format
    eval_prompt = f"""You are a career advisor for Indian engineering students.

VERIFIED SEARCH RESULTS (all links are live):
{context}

STUDENT PROFILE:
- Branch: {branch}
- Year: {year}
- Interests: {interests}
- Career Goal: {goal}
- Current Date: June 2026

SOFT PREFERENCES (treat as nice-to-have, NOT deal-breakers):
{pref_context}

SELECTED CATEGORIES: {allowed_types}

MANDATORY RULES:
1. ONLY return opportunities of type: {allowed_types}. Set `type` to exactly one of these.
2. You MUST return at least 1 result for EACH selected category: {allowed_types}. This is NOT optional. If a category has weak matches, pick the best available one and note it in the `reason` field.
3. Filter out opportunities that a {year} year student is NOT eligible for.
4. Preferences are SOFT — an amazing remote internship should NOT be rejected just because the student said "On-site".

FIELD FORMATTING RULES:
- `name`: The specific name of the opportunity (e.g. "Google Summer of Code 2026", not just "Internship").
- `organization`: The company, university, or platform hosting this opportunity (e.g. "Google", "IIT Bombay", "Unstop"). NEVER leave this empty.
- `link`: Use the EXACT URL from the search results. NEVER use a generic search page or listing page URL. The link must point to the specific opportunity.
- `description`: 2-3 sentences explaining what the program is, what participants do, eligibility, and what they gain.
- `reason`: ONE sentence explaining why this specific opportunity matches this student's {branch} background, {interests}, and {goal}.
- `deadline`: Extract from the content if available. Use "Ongoing" or "Rolling" if not specified.
- `time_commitment`: Extract duration if available (e.g. "2 months", "6 weeks", "Self-paced").

QUALITY CRITERIA:
1. Hackathons & Competitions: Prefer well-known hosts with a track record. Drop anything that looks spammy or low-effort.
2. Internships: Prefer trustworthy companies. For startups, only include if the description shows real mentorship and skill-building, not cheap labor.
3. Certifications: Only keep certifications with actual industry recognition (e.g. from Google, AWS, Microsoft, Coursera specializations, NPTEL).

Always return a minimum of 3 results total. Never return zero results.

Return the valid opportunities formatted as a JSON list."""

    structured_llm = llm.with_structured_output(OpportunityList)
    try:
        from datetime import datetime
        
        def is_deadline_future(deadline_str: str) -> bool:
            if not deadline_str or deadline_str.lower() in ["ongoing", "tbd", "rolling", "unclear"]:
                return True
            try:
                from dateutil import parser as dateutil_parser
                parsed = dateutil_parser.parse(deadline_str, fuzzy=True)
                if parsed is None:
                    return True
                # Make timezone naive before comparison
                parsed = parsed.replace(tzinfo=None)
                return parsed > datetime.now()
            except:
                return True
                
        result = await invoke_with_retry(structured_llm, eval_prompt)
        
        # Post-filter stale deadlines
        valid_opps = [opp for opp in result.opportunities if is_deadline_future(opp.deadline)]
        if len(valid_opps) > 0:
            result.opportunities = valid_opps
            
        result.queries_used = queries
        return result
    except Exception as e:
        print(f"Error in Evaluator after retries: {e}")
        if "429" in str(e) or "exhausted" in str(e).lower():
            raise ValueError("RATE_LIMIT_EXCEEDED")
        return OpportunityList(opportunities=[], queries_used=queries)
