import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/WalletButton";

const navLinks = [
  { name: "Arena", path: "/arena" },
  { name: "Leaderboard", path: "/leaderboard" },
  { name: "Agents", path: "/agents" },
];

export function Navbar() {
  const location = useLocation();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-white/10 w-full"
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center glow-purple"
          >
            <Zap className="w-4 h-4 sm:w-6 sm:h-6 text-background" />
          </motion.div>
          <span className="font-display text-base sm:text-lg md:text-xl font-bold uppercase bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
            SOLISEUM
          </span>
        </Link>

        {/* Center Navigation - Hidden on mobile */}
        <div className="hidden lg:flex items-center gap-6 xl:gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="relative py-2"
              onMouseEnter={() => setHoveredLink(link.name)}
              onMouseLeave={() => setHoveredLink(null)}
            >
              <span
                className={`text-xs xl:text-sm font-medium transition-colors whitespace-nowrap ${
                  location.pathname === link.path
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </span>
              
              {/* Animated Underline */}
              {(hoveredLink === link.name || location.pathname === link.path) && (
                <motion.div
                  layoutId="navbar-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary"
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
            </Link>
          ))}
        </div>

        {/* Connect Wallet Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="shrink-0"
        >
          <div className="relative">
            {/* Pulse glow effect */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 rounded-lg bg-primary/30 blur-xl hidden sm:block"
            />
            <div className="scale-90 sm:scale-100">
              <WalletButton />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.nav>
  );
}
