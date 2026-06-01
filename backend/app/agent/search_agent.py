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
    return ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2, google_api_key=api_key)

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
    """Generate smart fallback queries when LLM strategist fails."""
    interests = profile_dict.get('interests', '')
    branch = profile_dict.get('branch', '')
    
    fallbacks = []
    for cat in categories:
        if cat == "Hackathon":
            fallbacks.append(f"{interests} hackathon India 2025 2026 site:unstop.com OR site:devpost.com")
        elif cat == "Internship":
            fallbacks.append(f"{branch} {interests} internship India 2025 site:internshala.com OR site:linkedin.com/jobs")
        elif cat == "Certification":
            fallbacks.append(f"{interests} free certification course 2025 site:coursera.org OR site:nptel.ac.in")
        elif cat == "Competition":
            fallbacks.append(f"{interests} coding competition India 2025 2026 site:unstop.com OR site:hackerearth.com")
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

    # STAGE 1: Strategize
    strategy_prompt = f"""You are an expert career and opportunity researcher for Indian university students.
CAREFULLY CORRECT ANY TYPOS OR MISSPELLINGS in the branch or interests before processing (e.g. "CSE DATA SCIENCE" -> "Computer Science with Data Science", "AI ML" -> "Artificial Intelligence and Machine Learning", "ELECTRONIC AND COMMUNICATION I" -> "Electronics and Communication Engineering").

STUDENT PROFILE:
- Branch: {branch}
- Year: {year}
- Interests: {interests}
- Career Goal: {goal}

SOFT PREFERENCES (use as guidance, NOT hard filters):
{pref_context}

SELECTED CATEGORIES: {', '.join(categories)}

Your job is to generate EXACTLY {len(categories)} highly specific Google Dork search queries, EXACTLY ONE for each category they selected.
Do NOT skip any selected category. If they selected Internship or Competition, you MUST generate a query for it.

IMPORTANT: Each query must include the student's specific interests (like "{interests}") — do NOT generate generic queries like "hackathon India 2026". Make them specific to this student's profile.

Target Indian sites where possible (e.g., site:internshala.com, site:unstop.com, site:devpost.com, site:hackerearth.com).

Return your answer strictly matching the required JSON schema."""
    
    strategy_llm = llm.with_structured_output(SearchStrategy)
    try:
        strategy_res = await invoke_with_retry(strategy_llm, strategy_prompt)
        queries = strategy_res.queries
        print(f"Strategist generated queries (LLM): {queries}")
    except Exception as e:
        print(f"Error in Strategist after retries: {e}")
        queries = build_fallback_queries(profile_dict, categories)
        print(f"Using fallback queries: {queries}")

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
        context_parts.append(f"Query: {r.get('query_used', '')}\nURL: {r.get('url')}\nContent: {r.get('content')}\nDeadline Status: {r.get('deadline_status')}")
    context = "\n---\n".join(context_parts)
    
    allowed_types = ", ".join(categories)

    # STAGE 3: Evaluate & Format
    eval_prompt = f"""You are a career advisor for Indian engineering students.
You searched for: {queries}

VERIFIED SEARCH RESULTS (all links are live):
{context}

STUDENT PROFILE:
- Branch: {branch}
- Year: {year}
- Interests: {interests}
- Career Goal: {goal}
- Current Date: May 2026

SOFT PREFERENCES (treat as nice-to-have, NOT deal-breakers):
{pref_context}

ALLOWED OPPORTUNITY TYPES: {allowed_types}

INSTRUCTIONS:
1. ONLY return opportunities of type: {allowed_types}. Set `type` to exactly one of these.
2. Filter out opportunities that a {year} year student is NOT eligible for.
3. Filter out opportunities completely irrelevant to the student's branch and interests.
4. Preferences are SOFT — an amazing remote internship should NOT be rejected just because the student said "On-site". Include it and mention it's remote.
5. For certifications: these are almost always available online. Include any valuable certification relevant to their career goal.
6. Try to return at least 1 result per selected category if the search results contain it.

EVALUATOR FALLBACK MODE:
If fewer than 3 opportunities pass your strict filter above, 
switch to LENIENT mode: include any opportunity that is 
at least 50% relevant to the student's branch and interests. 
Always return a minimum of 3 results. If truly nothing exists,
return the 3 closest matches with a note explaining the partial match in the `reason` field.
Never return zero results.

For EACH opportunity:
- `description`: 2-3 sentences explaining what the program is, what participants do, eligibility, and what they gain.
- `reason`: ONE sentence connecting this to their specific {branch} background, {year} year status, and career goal. (Or explaining why it was included as a fallback match).

Return the valid opportunities formatted as a JSON list."""
    
    structured_llm = llm.with_structured_output(OpportunityList)
    try:
        import dateparser
        from datetime import datetime
        
        def is_deadline_future(deadline_str: str) -> bool:
            if not deadline_str or deadline_str.lower() in ["ongoing", "tbd", "rolling", "unclear"]:
                return True
            try:
                parsed = dateparser.parse(deadline_str)
                if parsed is None:
                    return True
                return parsed > datetime.now()
            except:
                return True
                
        result = await invoke_with_retry(structured_llm, eval_prompt)
        
        # Post-filter stale deadlines
        valid_opps = [opp for opp in result.opportunities if is_deadline_future(opp.deadline)]
        result.opportunities = valid_opps
        result.queries_used = queries
        return result
    except Exception as e:
        print(f"Error in Evaluator after retries: {e}")
        return OpportunityList(opportunities=[], queries_used=queries)
