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

    # STAGE 1: Strategize
    strategy_prompt = f"""
    You are an expert technical recruiter for FAANG.
    Analyze this student's profile:
    Branch: {profile_dict.get('branch')}
    Year: {profile_dict.get('year')}
    Interests: {', '.join(profile_dict.get('interests', []))}
    Goal: {profile_dict.get('goal')}
    
    Generate exactly 3 highly specific Google search queries to find the best current opportunities for them in India for 2026.
    Use advanced search operators if needed (like site:devpost.com, site:internshala.com, site:unstop.com).
    For a 1st/2nd year, focus on structured learning programs, beginner hackathons, and early-career fellowships.
    For a 3rd/4th year, focus on major internships, pre-placement hackathons, and niche roles in their exact branch.
    CRITICAL STRICT RULE: DO NOT search for or return raw GitHub repositories or unstructured open source projects. Only search for structured programs, formal competitions, hackathons, and internships.
    """
    
    strategy_llm = llm.with_structured_output(SearchStrategy)
    try:
        strategy_res = await strategy_llm.ainvoke(strategy_prompt)
        queries = strategy_res.queries
    except Exception as e:
        print(f"Error in Strategist: {e}")
        queries = [f"tech hackathons {profile_dict.get('branch')} India 2026", f"internships {', '.join(profile_dict.get('interests', []))}"]

    print(f"Strategist generated queries: {queries}")

    # STAGE 2: Search
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
    Current Date: May 2026
    
    RUTHLESS EVALUATION INSTRUCTIONS:
    1. Filter out any opportunity that a {profile_dict.get('year')} year student is NOT eligible for.
    2. Filter out any opportunity completely irrelevant to the {profile_dict.get('branch')} branch.
    3. If there are no perfect matches, find at least ONE adjacent opportunity from the text that aligns with their interests.
    
    For EACH opportunity that passes, provide a ONE-SENTENCE personalized reason why THIS specific student should apply, explicitly connecting their {profile_dict.get('branch')} background and {profile_dict.get('year')} year status to the role.
    
    Return the valid opportunities formatted as a JSON list.
    """
    
    structured_llm = llm.with_structured_output(OpportunityList)
    try:
        result = await structured_llm.ainvoke(eval_prompt)
        result.queries_used = queries
        
        # Ensure the verified link is used
        for opp in result.opportunities:
            # We trust the LLM to map the correct link from the context, 
            # but we could also strictly enforce it here if needed.
            pass
            
        return result
    except Exception as e:
        print(f"Error in Evaluator: {e}")
        return OpportunityList(opportunities=[], queries_used=queries)
