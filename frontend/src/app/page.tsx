"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [formData, setFormData] = useState({
    email: "",
    branch: "",
    year: "",
    interests: "",
    goal: ""
  });
  const [status, setStatus] = useState<"idle"|"searching"|"verifying"|"done">("idle");
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [actionStatuses, setActionStatuses] = useState<{[key: string]: string}>({});

  // Load saved statuses from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("radar_action_statuses");
    if (saved) {
      try {
        setActionStatuses(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("searching");
    setQueriesUsed([]); // clear previous
    
    // Simulate pipeline progression since we don't have SSE yet
    const verifyingTimer = setTimeout(() => setStatus("verifying"), 3000);
    
    try {
      const interestsArray = formData.interests.split(",").map(i => i.trim());
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, interests: interestsArray }),
      });
      
      if (response.status === 429) {
          const errData = await response.json();
          alert(errData.detail.error || "Rate limited!");
          setStatus("idle");
          return;
      }
      
      const data = await response.json();
      setOpportunities(data.opportunities || []);
      setQueriesUsed(data.queries_used || []);
    } catch (error) {
      console.error("Failed to fetch", error);
    } finally {
      clearTimeout(verifyingTimer);
      setStatus(prev => prev !== "idle" ? "done" : "idle");
    }
  };

  const updateStatus = (id: string, newStatus: string) => {
      const newActionStatuses = {...actionStatuses, [id]: newStatus};
      setActionStatuses(newActionStatuses);
      localStorage.setItem("radar_action_statuses", JSON.stringify(newActionStatuses));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans selection:bg-blue-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 text-center space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Opportunity Radar
          </h1>
          <p className="text-gray-400 text-lg">Find high-impact opportunities that match your exact profile.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Left Panel: Form */}
          <div className="md:col-span-1 bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl h-fit">
            <h2 className="text-2xl font-bold mb-6">Your Profile</h2>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  placeholder="your@college.edu"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Branch</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Automation and Robotics"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.branch}
                  onChange={(e) => setFormData({...formData, branch: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Year</label>
                <select 
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: e.target.value})}
                >
                  <option value="">Select Year</option>
                  <option value="1st">1st Year</option>
                  <option value="2nd">2nd Year</option>
                  <option value="3rd">3rd Year</option>
                  <option value="4th">4th Year</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Interests (comma separated)</label>
                <input 
                  type="text" 
                  required
                  placeholder="AI ML, AGENTIC AI, CLOUD"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.interests}
                  onChange={(e) => setFormData({...formData, interests: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Career Goal</label>
                <select 
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.goal}
                  onChange={(e) => setFormData({...formData, goal: e.target.value})}
                >
                  <option value="">Select Goal</option>
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Researcher">Researcher</option>
                  <option value="Startup Founder">Startup Founder</option>
                  <option value="Data Scientist">Data Scientist</option>
                  <option value="Core Engineering">Core Engineering</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={status === "searching" || status === "verifying"}
                className="w-full mt-6 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
              >
                {(status === "searching" || status === "verifying") ? "Agent Working..." : "Find Opportunities"}
              </button>
            </form>
          </div>

          {/* Right Panel: Results & Agent Logs */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Agent's Brain / Search Strategy UI */}
            {(status === "done" && queriesUsed.length > 0) && (
               <div className="bg-gray-900 border border-emerald-500/30 p-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                 <h3 className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                   Agent Strategy Executed
                 </h3>
                 <div className="space-y-1">
                   {queriesUsed.map((q, idx) => (
                     <div key={idx} className="text-xs text-gray-400 font-mono bg-gray-800 p-2 rounded border border-gray-700">
                       <span className="text-blue-400 mr-2">$ search</span> "{q}"
                     </div>
                   ))}
                 </div>
               </div>
            )}

            {(status === "searching" || status === "verifying") && (
              <div className="flex flex-col items-center justify-center h-64 bg-gray-800 rounded-2xl border border-gray-700">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
                <div className="text-center space-y-2">
                  <p className="text-emerald-400 font-mono text-sm animate-pulse">
                      {status === "searching" ? "Strategist is generating queries..." : "Verifier is checking live links..."}
                  </p>
                  <p className="text-gray-500 font-mono text-xs">
                      {status === "searching" ? "Generating targeted web queries for your exact profile." : "Following redirects and validating endpoints."}
                  </p>
                </div>
              </div>
            )}

            {status === "done" && opportunities.length === 0 && queriesUsed.length === 0 && (
              <div className="flex items-center justify-center h-64 bg-gray-800 rounded-2xl border border-gray-700">
                <p className="text-gray-500 font-mono">Profile empty. Waiting for input to initiate Multi-Stage reasoning pipeline.</p>
              </div>
            )}

            {status === "done" && opportunities.length === 0 && queriesUsed.length > 0 && (
               <div className="flex items-center justify-center h-64 bg-gray-800 rounded-2xl border border-red-500/30">
               <p className="text-red-400">The Evaluator Node rejected all search results for not matching your exact branch/year strict criteria. Try broadening your interests!</p>
             </div>
            )}

            {status === "done" && opportunities.map((opp, idx) => (
              <div key={idx} className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg hover:border-gray-500 transition-colors group relative overflow-hidden flex flex-col">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-emerald-500"></div>
                
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="inline-block px-3 py-1 bg-gray-900 border border-gray-700 rounded-full text-xs font-semibold text-emerald-400 mb-2 uppercase tracking-wider mr-2">
                        {opp.type}
                      </span>
                      <span className="inline-block px-3 py-1 bg-emerald-900/30 border border-emerald-700 rounded-full text-xs font-semibold text-emerald-400 mb-2 tracking-wider">
                        ✓ Link Verified
                      </span>
                      <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{opp.name}</h3>
                    </div>
                    <span className="text-sm font-medium text-gray-400 bg-gray-900 px-3 py-1 rounded-lg border border-gray-700 flex items-center gap-2">
                      ⏱ {opp.deadline}
                    </span>
                  </div>
                  
                  <div className="mb-4 space-y-3">
                    <p className="text-sm text-gray-400">Time Commitment: <span className="text-gray-300">{opp.time_commitment}</span></p>
                    {opp.description && (
                       <p className="text-sm text-gray-300 leading-relaxed">
                         {opp.description}
                       </p>
                    )}
                  </div>
                  
                  <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 mb-4">
                    <p className="text-sm text-gray-300 leading-relaxed">
                      <strong className="text-blue-400">Evaluator's Reasoning:</strong> {opp.reason}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateStatus(opp.name, "saved")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${actionStatuses[opp.name] === "saved" ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "saved" ? "Saved" : "Save"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp.name, "applied")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${actionStatuses[opp.name] === "applied" ? "bg-emerald-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "applied" ? "Applied" : "Applied"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp.name, "rejected")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${actionStatuses[opp.name] === "rejected" ? "bg-red-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "rejected" ? "Rejected" : "Not Interested"}
                    </button>
                  </div>
                  <a 
                    href={opp.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Apply Now <span>→</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
