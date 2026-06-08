"use client";

import { useState, useEffect, useRef } from "react";
import { BRANCHES } from "../data/branches";
import { SKILLS_BY_CATEGORY } from "../data/skills";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const GOALS = [
  "Software Engineer",
  "Data Scientist / ML Engineer",
  "Core / Hardware Engineer",
  "DevOps / Cloud Engineer",
  "Cybersecurity Analyst",
  "Research / Higher Studies",
  "Entrepreneur / Startup",
];
const CATEGORIES = [
  { id: "Hackathon", label: "🏆 Hackathon" },
  { id: "Internship", label: "💼 Internship" },
  { id: "Certification", label: "📜 Certification" },
  { id: "Competition", label: "⚡ Competition" },
];

export default function Home() {
  const [branch, setBranch] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  
  const [year, setYear] = useState("");
  
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  
  const [goal, setGoal] = useState("");
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Hackathon", "Internship", "Certification", "Competition"]);
  
  const [mode, setMode] = useState("Any");
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("Free only");

  const [status, setStatus] = useState<"idle"|"searching"|"verifying"|"done">("idle");
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [actionStatuses, setActionStatuses] = useState<{[key: string]: string}>({});
  const [emailToSave, setEmailToSave] = useState("");
  const [savedEmailSuccess, setSavedEmailSuccess] = useState(false);
  const [savedOpportunities, setSavedOpportunities] = useState<any[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node))
        setShowBranchDropdown(false);
      if (skillRef.current && !skillRef.current.contains(e.target as Node))
        setShowSkillDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const savedStatus = localStorage.getItem("radar_action_statuses");
    if (savedStatus) {
      try {
        setActionStatuses(JSON.parse(savedStatus));
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
    
    const savedOpps = localStorage.getItem("savedOpportunities");
    if (savedOpps) {
      try {
        setSavedOpportunities(JSON.parse(savedOpps));
      } catch (e) {
        console.error("Failed to parse saved opportunities", e);
      }
    }
  }, []);

  const filteredBranches = BRANCHES.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase())
  );

  const filteredSkills = Object.entries(SKILLS_BY_CATEGORY)
    .map(([category, skills]) => ({
      category,
      skills: skills.filter(
        (s) =>
          s.toLowerCase().includes(skillSearch.toLowerCase()) &&
          !selectedSkills.includes(s)
      ),
    }))
    .filter((g) => g.skills.length > 0);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });
  };

  const removeSkill = (skill: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch || !year || selectedSkills.length === 0 || !goal) return;

    setStatus("searching");
    setOpportunities([]);
    setQueriesUsed([]);
    setSavedEmailSuccess(false);
    
    const verifyingTimer = setTimeout(() => setStatus("verifying"), 4000);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          year,
          interests: selectedSkills.join(", "),
          goal,
          categories: selectedCategories,
          mode: selectedCategories.includes("Internship") ? mode : "Any",
          city: selectedCategories.includes("Internship") ? city : "",
          budget: selectedCategories.includes("Certification") ? budget : "Any",
        }),
      });
      
      if (response.status === 429) {
          const errData = await response.json();
          alert(errData.detail?.error || "Rate limited! Please wait a moment.");
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

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const fetchSavedOpportunities = async (email: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/v1/saved-opportunities?email=${email}`);
      if (response.ok) {
        const opps = await response.json();
        setSavedOpportunities(opps.filter((o: any) => o.status === "saved"));
        
        const statuses: {[key: string]: string} = {};
        opps.forEach((o: any) => {
          statuses[o.name] = o.status;
        });
        setActionStatuses(prev => ({...prev, ...statuses}));
      }
    } catch (e) {
      console.error("Failed to fetch saved opportunities", e);
    }
  };

  const updateStatus = async (opp: any, newStatus: string) => {
      // "rejected" is purely local
      const isLocalOnly = newStatus === "rejected" || (!newStatus && actionStatuses[opp.name] === "rejected");
      
      // Optimistic update
      const updated = {...actionStatuses, [opp.name]: newStatus};
      setActionStatuses(updated);
      localStorage.setItem("radar_action_statuses", JSON.stringify(updated));

      // API call if we have an email and it's not a purely local action
      if (emailToSave && isValidEmail(emailToSave) && !isLocalOnly) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          await fetch(`${apiUrl}/api/v1/save-opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailToSave, url: opp.link, status: newStatus || "new" })
          });
        } catch (error) {
          // Rollback on failure
          const rollback = {...actionStatuses};
          setActionStatuses(rollback);
          console.error('Save failed:', error);
        }
      }
  };

  const handleSaveOpp = async (opp: any) => {
    const isCurrentlySaved = actionStatuses[opp.name] === "saved";
    const newStatus = isCurrentlySaved ? "" : "saved";
    
    // Call the unified updateStatus (which handles API)
    await updateStatus(opp, newStatus);

    // Update the local saved list for immediate UI feedback
    let updatedSaved = [...savedOpportunities];
    if (newStatus === "saved") {
      if (!updatedSaved.some(o => o.name === opp.name)) {
        updatedSaved.push(opp);
      }
    } else {
      updatedSaved = updatedSaved.filter(o => o.name !== opp.name);
    }
    setSavedOpportunities(updatedSaved);
    localStorage.setItem("savedOpportunities", JSON.stringify(updatedSaved));
  };

  const handleSaveEmail = () => {
    if (emailToSave && isValidEmail(emailToSave)) {
      setSavedEmailSuccess(true);
      fetchSavedOpportunities(emailToSave);
      localStorage.setItem("radar_email", emailToSave);
      
      // Attempt to send email immediately when registering email (if they have saved opps)
      if (savedOpportunities.length > 0) {
        handleTriggerEmail(emailToSave);
      }
    } else {
      alert("Please enter a valid email address.");
    }
  };

  const handleTriggerEmail = async (emailAddr: string) => {
    if (!emailAddr || !isValidEmail(emailAddr)) return;
    setIsSendingEmail(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/send-saved-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr })
      });
      if (res.ok) {
        alert("Success! Your saved opportunities have been sent to your email.");
      } else {
        const errorData = await res.json();
        alert(`Failed to send email: ${errorData.detail || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to trigger email", e);
      alert("Failed to send email. Check your connection.");
    } finally {
      setIsSendingEmail(false);
    }
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
            1waygo
          </h1>
          <p className="text-gray-400 text-base md:text-lg">Find high-impact opportunities that match your exact profile.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {/* Left Panel: Form */}
          <div className="md:col-span-1 bg-gray-800 p-5 md:p-6 rounded-2xl border border-gray-700 shadow-xl h-fit">
            <h2 className="text-xl font-bold mb-5">Your Profile</h2>
            <div className="space-y-4">
              
              {/* BRANCH */}
              <div ref={branchRef} className="relative">
                <label className="block text-xs font-medium text-gray-400 mb-1">Branch</label>
                <input
                  type="text"
                  placeholder="Search your branch..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={branch || branchSearch}
                  onChange={(e) => {
                    setBranchSearch(e.target.value);
                    setBranch("");
                    setShowBranchDropdown(true);
                  }}
                  onFocus={() => setShowBranchDropdown(true)}
                />
                {showBranchDropdown && filteredBranches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
                    {filteredBranches.map((b) => (
                      <div
                        key={b}
                        className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer"
                        onClick={() => {
                          setBranch(b);
                          setBranchSearch(b);
                          setShowBranchDropdown(false);
                        }}
                      >
                        {b}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* YEAR */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Year</label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option value="">Select Year</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* SKILLS */}
              <div ref={skillRef} className="relative">
                <label className="block text-xs font-medium text-gray-400 mb-1">Skills & Interests</label>
                
                {selectedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedSkills.map((s) => (
                      <span key={s} className="inline-flex items-center px-2 py-1 rounded bg-blue-900/30 text-blue-300 text-xs font-medium border border-blue-800/50">
                        {s}
                        <button onClick={() => removeSkill(s)} className="ml-1 text-blue-400 hover:text-blue-200">×</button>
                      </span>
                    ))}
                  </div>
                )}
                
                <input
                  type="text"
                  placeholder="Search skills (e.g. Machine Learning, IoT)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={skillSearch}
                  onChange={(e) => {
                    setSkillSearch(e.target.value);
                    setShowSkillDropdown(true);
                  }}
                  onFocus={() => setShowSkillDropdown(true)}
                />
                
                {showSkillDropdown && (skillSearch || Object.keys(SKILLS_BY_CATEGORY).length > 0) && (
                  <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
                    {filteredSkills.map(({ category, skills }) => (
                      <div key={category}>
                        <div className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-900/50 uppercase tracking-wider sticky top-0">
                          {category}
                        </div>
                        {skills.map((s) => (
                          <div
                            key={s}
                            className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer"
                            onClick={() => {
                              setSelectedSkills((prev) => [...prev, s]);
                              setSkillSearch("");
                              setShowSkillDropdown(false);
                            }}
                          >
                            {s}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CAREER GOAL */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Career Goal</label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                >
                  <option value="">Select Goal</option>
                  {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="border-t border-gray-700 pt-3 mt-1"></div>

              {/* CATEGORY TOGGLES */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">What are you looking for?</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCategory(id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                        selectedCategories.includes(id)
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                          : "bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CONDITIONAL PREFERENCES */}
              {(selectedCategories.includes("Internship") || selectedCategories.includes("Certification")) && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preferences <span className="text-gray-600 normal-case font-normal">(optional)</span></p>
                  
                  {selectedCategories.includes("Internship") && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Mode (Internship)</label>
                        <select
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          value={mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <option>Any</option>
                          <option>Remote</option>
                          <option>On-site</option>
                          <option>Hybrid</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">City (optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Chennai"
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {selectedCategories.includes("Certification") && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Budget (Certification)</label>
                      <select
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                      >
                        <option>Free only</option>
                        <option>Paid ok</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <button 
                onClick={handleSearch}
                disabled={status === "searching" || status === "verifying" || !branch || !year || selectedSkills.length === 0 || !goal}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
              >
                {(status === "searching" || status === "verifying") ? "Agent Working..." : "Find Opportunities"}
              </button>
            </div>
          </div>

          {/* Right Panel: Results & Agent Logs */}
          <div className="md:col-span-2 space-y-4">
            
            {/* View Saved Toggle */}
            {savedOpportunities.length > 0 && (
              <div className="flex justify-end mb-2">
                <button 
                  onClick={() => setShowSaved(!showSaved)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg border border-gray-700 transition-colors flex items-center gap-2"
                >
                  🔖 {showSaved ? "Hide Saved" : `View Saved (${savedOpportunities.length})`}
                </button>
              </div>
            )}
            
            {showSaved && (
              <div className="space-y-4 mb-8">
                <h3 className="text-xl font-bold text-emerald-400 border-b border-gray-700 pb-2 mb-4">Saved Opportunities</h3>
                {savedOpportunities.map((opp, idx) => (
                  <div key={`saved-${idx}`} className="bg-gray-800 p-5 rounded-2xl border border-emerald-500/50 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <div className="flex justify-between items-start mb-3 pl-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block px-2.5 py-0.5 bg-gray-900 border border-gray-700 rounded-full text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                            {categoryIcons[opp.type] || "📌"} {opp.type}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white">{opp.name}</h3>
                      </div>
                      <span className="text-xs font-medium text-gray-400 bg-gray-900 px-2.5 py-1 rounded-lg border border-gray-700 whitespace-nowrap ml-3">
                        ⏱ {opp.deadline}
                      </span>
                    </div>
                    
                    <div className="pl-3 mb-3 space-y-2">
                      <p className="text-xs text-gray-500">Time Commitment: <span className="text-gray-400">{opp.time_commitment}</span></p>
                      {opp.description && (
                        <p className="text-sm text-gray-300 leading-relaxed">{opp.description}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pl-3 pt-3 border-t border-gray-700">
                      <button 
                        onClick={() => handleSaveOpp(opp)}
                        className="text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 bg-red-900/30 text-red-400 hover:bg-red-900/50"
                      >
                        Remove from Saved
                      </button>
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
                
                {/* Email Trigger Section */}
                <div className="mt-8 pt-6 border-t border-gray-700 text-center">
                  <p className="text-sm text-gray-400 mb-4">Want these in your inbox so you don't lose them?</p>
                  <button 
                    onClick={() => handleTriggerEmail(emailToSave)}
                    disabled={!emailToSave || isSendingEmail || savedOpportunities.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto"
                  >
                    {isSendingEmail ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        Email Me My List
                      </>
                    )}
                  </button>
                  {!emailToSave && (
                    <p className="text-xs text-red-400 mt-2">Please register your email in the left panel first.</p>
                  )}
                </div>

                <div className="border-t-2 border-dashed border-gray-700 my-8"></div>
              </div>
            )}
            
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
               <div className="flex flex-col items-center justify-center h-64 bg-gray-800 rounded-2xl border border-red-500/30 p-6 text-center">
                 <p className="text-red-400 font-semibold mb-2">No exact matches found.</p>
                 <p className="text-gray-400 text-sm">We ran a fallback lenient search but still couldn't find active live links matching your niche profile today. Try adjusting your skills.</p>
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
                    {opp.organization && (
                      <p className="text-sm text-gray-400">by <span className="text-blue-400 font-medium">{opp.organization}</span></p>
                    )}
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
                      onClick={() => handleSaveOpp(opp)}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${actionStatuses[opp.name] === "saved" ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "saved" ? "✓ Saved" : "Save"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp, actionStatuses[opp.name] === "applied" ? "" : "applied")}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${actionStatuses[opp.name] === "applied" ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                    >
                      {actionStatuses[opp.name] === "applied" ? "✓ Applied" : "Applied"}
                    </button>
                    <button 
                      onClick={() => updateStatus(opp, actionStatuses[opp.name] === "rejected" ? "" : "rejected")}
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
            
            {/* POST-SEARCH EMAIL CAPTURE */}
            {status === "done" && opportunities.length > 0 && (
              <div className="mt-8 bg-gray-800 border border-blue-500/30 p-6 rounded-2xl shadow-lg flex flex-col items-center text-center">
                <h3 className="text-xl font-bold mb-2">💾 Want to save these results?</h3>
                <p className="text-gray-400 text-sm mb-4">Enter your email and we'll remember your saved opportunities for next time.</p>
                {savedEmailSuccess ? (
                  <div className="text-emerald-400 font-semibold bg-emerald-900/20 px-4 py-2 rounded-lg border border-emerald-800/50">
                    ✓ Email saved! Your preferences are locked in.
                  </div>
                ) : (
                  <div className="flex w-full max-w-md gap-2">
                    <input 
                      type="email" 
                      placeholder="your@email.com"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={emailToSave}
                      onChange={(e) => setEmailToSave(e.target.value)}
                    />
                    <button 
                      onClick={handleSaveEmail}
                      disabled={!emailToSave}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* FOOTER - Credibility & Ownership */}
        <footer className="mt-16 pb-8 text-center text-gray-500 text-sm border-t border-gray-800 pt-8">
          <p>
            Built by <span className="font-semibold text-gray-400">Anderson</span>. 
            Powered by Google Gemini & Next.js.
          </p>
          <p className="mt-1 text-xs opacity-60">© 2026 1waygo. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
