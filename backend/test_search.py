import asyncio
import os
import json
from app.agent.search_agent import process_profile

async def main():
    profile = {
        "branch": "Computer Science Engineering",
        "year": "2nd Year",
        "interests": "Machine Learning, Computer Vision",
        "goal": "Software Engineer",
        "mode": "Any",
        "duration": "Any",
        "location": "",
        "budget": "Free only",
        "categories": ["Hackathon", "Internship", "Certification"]
    }
    print("Running process_profile...")
    try:
        result = await process_profile(profile)
        print(f"Generated {len(result.opportunities)} opportunities")
        for o in result.opportunities:
            print(f"- [{o.type}] {o.name} | Org: {o.organization} | Deadline: {o.deadline} | Link: {o.link[:80]}")
    except Exception as e:
        print(f"FAILED WITH EXCEPTION: {e}")

if __name__ == "__main__":
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    asyncio.run(main())
