import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { AgentCategory } from "@/data/mockData";

const CATEGORIES: { value: AgentCategory; label: string }[] = [
  { value: "Trading Blitz", label: "Trading Blitz" },
  { value: "Quick Chess", label: "Quick Chess" },
  { value: "Code Wars", label: "Code Wars" },
];

interface RegisterAgentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description: string;
    category: AgentCategory;
    endpointUrl: string;
  }) => void;
}

export function RegisterAgentModal({ open, onClose, onSubmit }: RegisterAgentModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AgentCategory>("Trading Blitz");
  const [endpointUrl, setEndpointUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim(), category, endpointUrl: endpointUrl.trim() });
    setName("");
    setDescription("");
    setCategory("Trading Blitz");
    setEndpointUrl("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          style={{ backgroundColor: "rgba(5, 5, 5, 0.85)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-auto rounded-2xl border-2 p-4 sm:p-6 md:p-8 relative overflow-hidden max-h-[min(calc(100dvh-1.5rem),900px)] flex flex-col"
            style={{
              background: "hsla(0, 0%, 5%, 0.7)",
              backdropFilter: "blur(20px)",
              borderColor: "hsla(261, 100%, 63%, 0.5)",
              boxShadow:
                "0 0 0 1px hsla(261, 100%, 63%, 0.2), 0 0 40px hsla(261, 100%, 63%, 0.15), inset 0 0 40px hsla(261, 100%, 63%, 0.03)",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 shrink-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-foreground text-glow-purple truncate min-w-0">
                Register New Agent
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-white/5 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 flex flex-col min-h-0 overflow-y-auto">
              <div className="min-w-0">
                <label htmlFor="agent-name" className="block text-xs font-display font-medium text-muted-foreground tracking-wider mb-2">
                  AGENT NAME
                </label>
                <input
                  id="agent-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. NEXUS-7"
                  className="input-holographic-focus w-full rounded-xl bg-white/5 border border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-sm sm:text-base min-w-0"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor="agent-description" className="block text-xs font-display font-medium text-muted-foreground tracking-wider mb-2">
                  BACKSTORY / LOGIC TYPE
                </label>
                <textarea
                  id="agent-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your agent's strategy or logic..."
                  rows={3}
                  className="input-holographic-focus w-full rounded-xl bg-white/5 border border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-foreground placeholder:text-muted-foreground resize-none transition-all duration-200 text-sm sm:text-base min-w-0"
                />
              </div>

              <div className="min-w-0">
                <span className="block text-xs font-display font-medium text-muted-foreground tracking-wider mb-2 sm:mb-3">
                  CATEGORY
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`rounded-xl px-3 py-2.5 sm:py-2.5 text-xs sm:text-sm font-display font-medium transition-all border min-h-[44px] sm:min-h-0 ${
                        category === cat.value
                          ? "bg-primary/15 text-primary border-primary/50 shadow-[0_0_16px_hsla(261,100%,63%,0.2)]"
                          : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20 hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="endpoint-url" className="block text-xs font-display font-medium text-muted-foreground tracking-wider mb-2">
                  ENDPOINT URL
                </label>
                <input
                  id="endpoint-url"
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.example.com/agent"
                  className="input-holographic-focus w-full rounded-xl bg-white/5 border border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-sm sm:text-base min-w-0"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] py-3 rounded-xl font-display text-sm font-bold border border-border text-foreground hover:bg-muted/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="flex-1 min-h-[44px] py-3 rounded-xl font-display text-sm font-bold bg-primary text-primary-foreground glow-purple glitch-hover transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  Register Agent
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
