import os
import asyncio
from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools.tavily_search import TavilySearchResults
from app.models.schemas import Opportunity, OpportunityList, SearchStrategy
from app.agent.verifier import filter_raw_results
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

def get_llm():
    return ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2)

def get_search_tool():
    return TavilySearchResults(max_results=4)

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

async def process_profile(profile_dict: dict) -> OpportunityList:
    try:
        llm = get_llm()
        search_tool = get_search_tool()
    except Exception as e:
        print(f"Initialization error: {e}")
        return OpportunityList(opportunities=[])

    # Extract new fields with defaults
    mode = profile_dict.get('mode', 'Any')
    duration = profile_dict.get('duration', 'Any')
    location = profile_dict.get('location', '')
    budget = profile_dict.get('budget', 'Free only')
    categories = profile_dict.get('categories', ['Hackathon', 'Internship', 'Certification', 'Competition'])

    # Build dynamic query count: 2 queries per selected category (for depth), capped at 6
    num_queries = min(len(categories) * 2, 6)

    # Build category-specific instructions
    cat_instructions = []
    for cat in categories:
        if cat == "Internship":
            mode_str = f" {mode}" if mode != "Any" else ""
            loc_str = f" in {location}" if location else " in India"
            dur_str = f" {duration}" if duration != "Any" else ""
            cat_instructions.append(f"- INTERNSHIP: Search for{mode_str}{dur_str} internships{loc_str} matching their branch and interests.")
        elif cat == "Hackathon":
            loc_str = f" in {location}" if location else " in India"
            cat_instructions.append(f"- HACKATHON: Search for hackathons{loc_str} (online or offline) relevant to their interests.")
        elif cat == "Certification":
            budget_str = " that are FREE" if budget == "Free only" else ""
            cat_instructions.append(f"- CERTIFICATION: Search for professional certifications or courses{budget_str} on platforms like Coursera, NPTEL, Google, AWS, or Microsoft relevant to their branch.")
        elif cat == "Competition":
            cat_instructions.append(f"- COMPETITION: Search for coding competitions, case competitions, or research competitions on platforms like Unstop, HackerEarth, or Kaggle relevant to their branch.")
    
    category_block = "\n    ".join(cat_instructions)

    # STAGE 1: Strategize
    strategy_prompt = f"""
    You are an expert career strategist for Indian engineering students.
    CAREFULLY CORRECT ANY TYPOS OR MISSPELLINGS in the branch or interests before processing (e.g. "ELECTRONIC AND COMMUNICATION I" -> "Electronics and Communication Engineering", "AI ML" -> "Artificial Intelligence and Machine Learning").

    STUDENT PROFILE:
    Branch: {profile_dict.get('branch')}
    Year: {profile_dict.get('year')}
    Interests: {', '.join(profile_dict.get('interests', []))}
    Goal: {profile_dict.get('goal')}
    Preferred Mode: {mode}
    Duration: {duration}
    Location: {location if location else "Any (India)"}
    Certification Budget: {budget}

    You MUST generate exactly {num_queries} highly specific web search queries.
    You MUST cover ALL of the following selected categories — no exceptions:
    {category_block}

    Generate at least one query per category above. Distribute remaining queries to categories that benefit from deeper coverage.

    RULES:
    - Use advanced search operators (site:unstop.com, site:internshala.com, site:devpost.com, site:hackerearth.com, site:linkedin.com/jobs, site:coursera.org, site:nptel.ac.in).
    - All queries must target 2025-2026 or current — never past deadlines.
    - For 1st/2nd year students, focus on beginner-friendly opportunities.
    - For 3rd/4th year students, focus on pre-placement, advanced roles, and niche opportunities.
    - NEVER search for raw GitHub repositories or unstructured open source projects.
    """
    
    strategy_llm = llm.with_structured_output(SearchStrategy)
    try:
        strategy_res = await strategy_llm.ainvoke(strategy_prompt)
        queries = strategy_res.queries
    except Exception as e:
        print(f"Error in Strategist: {e}")
        # Fallback: one query per category
        queries = [f"{cat.lower()} {profile_dict.get('branch')} India 2026" for cat in categories]

    print(f"Strategist generated queries: {queries}")

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
    
    # Build category filter for evaluator
    allowed_types = ", ".join(categories)

    # STAGE 3: Evaluate & Format
    eval_prompt = f"""
    You are a FAANG-level AI career advisor.
    You ran these searches: {queries}
    
    Here are the VERIFIED search results (all links are live, and explicitly expired ones have been removed):
    {context}
    
    User Profile:
    Branch: {profile_dict.get('branch')}
    Year: {profile_dict.get('year')}
    Interests: {', '.join(profile_dict.get('interests', []))}
    Goal: {profile_dict.get('goal')}
    Preferred Mode: {mode}
    Duration: {duration}
    Location: {location if location else "Any (India)"}
    Current Date: May 2026
    
    ALLOWED OPPORTUNITY TYPES: {allowed_types}
    
    RUTHLESS EVALUATION INSTRUCTIONS:
    1. ONLY return opportunities of type: {allowed_types}. Reject everything else.
    2. Filter out any opportunity that a {profile_dict.get('year')} year student is NOT eligible for.
    3. Filter out any opportunity completely irrelevant to the {profile_dict.get('branch')} branch.
    4. If mode is "{mode}" and mode is not "Any", prioritize opportunities matching that mode.
    5. If location is "{location}", prioritize opportunities accessible from that city.
    6. If there are no perfect matches, find at least ONE adjacent opportunity that aligns with their interests.
    
    For EACH opportunity that passes:
    - Set `type` to exactly one of: {allowed_types}
    - Provide a `description` (2-3 sentences) explaining what the program is, what participants do, any eligibility criteria, and what they gain from it.
    - Provide a ONE-SENTENCE personalized `reason` why THIS specific student should apply, connecting their {profile_dict.get('branch')} background and {profile_dict.get('year')} year status.
    
    Return the valid opportunities formatted as a JSON list.
    """
    
    structured_llm = llm.with_structured_output(OpportunityList)
    try:
        result = await structured_llm.ainvoke(eval_prompt)
        result.queries_used = queries
        return result
    except Exception as e:
        print(f"Error in Evaluator: {e}")
        return OpportunityList(opportunities=[], queries_used=queries)
