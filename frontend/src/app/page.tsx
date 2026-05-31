"use client";

import { useState, useEffect } from "react";

const ALL_CATEGORIES = ["Hackathon", "Internship", "Certification", "Competition"];

export default function Home() {
  const [formData, setFormData] = useState({
    email: "",
    branch: "",
    year: "",
    interests: "",
    goal: "",
    mode: "Any",
    duration: "Any",
    location: "",
    budget: "Free only",
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...ALL_CATEGORIES]);
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

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(cat)) {
        // Don't allow deselecting ALL categories
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== cat);
      }
      return [...prev, cat];
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("searching");
    setOpportunities([]);
    setQueriesUsed([]);
    
    const verifyingTimer = setTimeout(() => setStatus("verifying"), 4000);
    
    try {
      const interestsArray = formData.interests.split(",").map(i => i.trim());
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          interests: interestsArray,
          categories: selectedCategories,
        }),
      });
      
      if (response.status === 429) {
          const errData = await response.json();
          alert(errData.detail.error || "Rate limited! Please wait a moment.");
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
      const updated = {...actionStatuses, [id]: newStatus};
      setActionStatuses(updated);
      localStorage.setItem("radar_action_statuses", JSON.stringify(updated));
  };

  const categoryIcons: {[key: string]: string} = {
    Hackathon: "🏆",
    Internship: "💼",
    Certification: "📜",
    Competition: "⚡",
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans selection:bg-blue-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Opportunity Radar
          </h1>
          <p className="text-gray-400 text-base md:text-lg">Find high-impact opportunities that match your exact profile.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {/* Left Panel: Form */}
          <div className="md:col-span-1 bg-gray-800 p-5 md:p-6 rounded-2xl border border-gray-700 shadow-xl h-fit">
            <h2 className="text-xl font-bold mb-5">Your Profile</h2>
            <form onSubmit={handleSearch} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <input 
                  type="email" required
                  placeholder="your@college.edu"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Branch</label>
                  <input 
                    type="text" required
                    placeholder="e.g. CSE, ECE"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.branch}
                    onChange={(e) => setFormData({...formData, branch: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Year</label>
                  <select required
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                  >
                    <option value="">Select</option>
                    <option value="1st">1st Year</option>
                    <option value="2nd">2nd Year</option>
                    <option value="3rd">3rd Year</option>
                    <option value="4th">4th Year</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Interests (comma separated)</label>
                <input 
                  type="text" required
                  placeholder="AI ML, Cloud, Web Dev"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.interests}
                  onChange={(e) => setFormData({...formData, interests: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Career Goal</label>
                <select required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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

              {/* Divider */}
              <div className="border-t border-gray-700 pt-3 mt-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preferences</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Mode</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.mode}
                    onChange={(e) => setFormData({...formData, mode: e.target.value})}
                  >
                    <option value="Any">Any</option>
                    <option value="Remote">Remote</option>
                    <option value="On-site">On-site</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Duration</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  >
                    <option value="Any">Any</option>
                    <option value="Summer (1-2 months)">Summer (1-2 mo)</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Full-time">Full-time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">City</label>
                  <input 
                    type="text"
                    placeholder="e.g. Chennai"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Budget</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.budget}
                    onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  >
                    <option value="Free only">Free only</option>
                    <option value="Paid ok">Paid ok</option>
                  </select>
                </div>
              </div>

              {/* Category Chips */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">What are you looking for?</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                        selectedCategories.includes(cat)
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                          : "bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500"
                      }`}
                    >
                      {categoryIcons[cat]} {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={status === "searching" || status === "verifying"}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
              >
                {(status === "searching" || status === "verifying") ? "Agent Working..." : "Find Opportunities"}
              </button>
            </form>
          </div>

          {/* Right Panel: Results & Agent Logs */}
          <div className="md:col-span-2 space-y-4">
            
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
                       <span className="text-blue-400 mr-2">$ search</span> &quot;{q}&quot;
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
                      {status === "searching" ? "Analyzing your profile and building targeted search queries." : "Following redirects, checking deadlines, validating endpoints."}
                  </p>
                </div>
              </div>
            )}

            {status === "idle" && (
              <div className="flex flex-col items-center justify-center h-64 bg-gray-800 rounded-2xl border border-gray-700">
                <p className="text-gray-500 text-sm">Fill in your profile and hit <span className="text-emerald-400 font-semibold">Find Opportunities</span> to start.</p>
              </div>
            )}

            {status === "done" && opportunities.length === 0 && queriesUsed.length > 0 && (
               <div className="flex flex-col items-center justify-center h-64 bg-gray-800 rounded-2xl border border-red-500/30 p-6">
                 <p className="text-red-400 text-center">No opportunities matched your exact criteria. Try broadening your interests or selecting more categories.</p>
               </div>
            )}

            {/* Results count */}
            {status === "done" && opportunities.length > 0 && (
              <p className="text-sm text-gray-400">{opportunities.length} opportunities found across {selectedCategories.join(", ")}</p>
            )}

            {status === "done" && opportunities.map((opp, idx) => (
              <div key={idx} className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-lg hover:border-gray-500 transition-colors group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-emerald-500"></div>
                
                {/* Header row */}
                <div className="flex justify-between items-start mb-3 pl-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-block px-2.5 py-0.5 bg-gray-900 border border-gray-700 rounded-full text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                        {categoryIcons[opp.type] || "📌"} {opp.type}
                      </span>
                      <span className="inline-block px-2.5 py-0.5 bg-emerald-900/30 border border-emerald-700 rounded-full text-xs font-semibold text-emerald-400 tracking-wider">
                        ✓ Link Verified
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{opp.name}</h3>
                  </div>
                  <span className="text-xs font-medium text-gray-400 bg-gray-900 px-2.5 py-1 rounded-lg border border-gray-700 whitespace-nowrap ml-3">
                    ⏱ {opp.deadline}
                  </span>
                </div>
                
                {/* Details */}
                <div className="pl-3 mb-3 space-y-2">
                  <p className="text-xs text-gray-500">Time Commitment: <span className="text-gray-400">{opp.time_commitment}</span></p>
                  {opp.description && (
                    <p className="text-sm text-gray-300 leading-relaxed">{opp.description}</p>
                  )}
                </div>
                
                {/* Evaluator reasoning */}
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-800 mb-3 ml-3">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    <strong className="text-blue-400">Why this fits you:</strong> {opp.reason}
                  </p>
                </div>
                
                {/* Action bar */}
                <div className="flex items-center justify-between pl-3 pt-3 border-t border-gray-700">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateStatus(opp.name, actionStatuses[opp.name] === "saved" ? "" : "saved")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${actionStatuses[opp.name] === "saved" ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "saved" ? "✓ Saved" : "Save"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp.name, actionStatuses[opp.name] === "applied" ? "" : "applied")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${actionStatuses[opp.name] === "applied" ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "applied" ? "✓ Applied" : "Applied"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp.name, actionStatuses[opp.name] === "rejected" ? "" : "rejected")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${actionStatuses[opp.name] === "rejected" ? "bg-red-600/80 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "rejected" ? "✗ Hidden" : "Not Interested"}
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
