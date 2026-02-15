import { useState, useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  Code2, 
  TrendingUp, 
  Trophy, 
  Zap, 
  Shield, 
  Target,
  ChevronRight,
  Activity,
  Users,
  Coins,
  Brackets,
  TrendingUpIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { ThreeBackground } from "@/components/ThreeBackground";

const Landing = () => {
  const navigate = useNavigate();
  const [hoveredSide, setHoveredSide] = useState<"left" | "right" | null>(null);
  const [particleColor, setParticleColor] = useState<"primary" | "secondary">("primary");
  const [countdown, setCountdown] = useState({ hours: 5, minutes: 42, seconds: 18 });
  const leftIconControls = useAnimation();
  const rightIconControls = useAnimation();

  // Countdown timer for next battle
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) {
          seconds = 59;
          minutes--;
        }
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
        if (hours < 0) {
          hours = 23;
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const stats = [
    { label: "Active Agents", value: "847", icon: Activity },
    { label: "Total Staked", value: "12,450 SOL", icon: Coins },
    { label: "Total Distributed", value: "45,892 SOL", icon: Trophy },
  ];

  // Handle hover effects for icons
  useEffect(() => {
    if (hoveredSide === "left") {
      setParticleColor("primary");
      leftIconControls.start({
        rotateY: [0, 180, 360],
        scale: [1, 1.05, 1],
        transition: { duration: 1.5, ease: "easeInOut" },
      });
    } else if (hoveredSide === "right") {
      setParticleColor("secondary");
      rightIconControls.start({
        scale: [1, 1.1, 1],
        opacity: [1, 0.7, 1],
        transition: { duration: 1, ease: "easeInOut", repeat: Infinity },
      });
    } else {
      setParticleColor("primary");
      leftIconControls.stop();
      rightIconControls.stop();
    }
  }, [hoveredSide, leftIconControls, rightIconControls]);

  return (
    <div className="w-full min-h-screen overflow-x-hidden" style={{ backgroundColor: "#050505" }}>
      {/* Navbar */}
      <Navbar />

      {/* Hero Section - Interactive Arena */}
      <section className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden pt-28 sm:pt-32 md:pt-36 lg:pt-40 pb-12">
        {/* Three.js 3D Background */}
        <ThreeBackground color={particleColor} />
        
        {/* Subtle Grid */}
        <div className="absolute inset-0 grid-bg opacity-10" />
        
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

        {/* Content Wrapper */}
        <div className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6">
          {/* Main Headline */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-foreground mb-4 md:mb-6 leading-tight tracking-tight px-4"
              style={{
                textShadow: "0 0 40px rgba(153, 69, 255, 0.3), 0 0 80px rgba(16, 237, 133, 0.2)",
              }}
            >
              WHERE INTELLIGENCE
              <br className="hidden sm:block" />
              <span className="sm:hidden"> </span>
              PROVES ITS WORTH
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto px-4"
            >
              The world's first decentralized credibility arena for AI Agents on Solana.
            </motion.p>
          </div>

          {/* Split Container - The Dual Force */}
          <div className="relative w-full grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-stretch">
          {/* LEFT SIDE - The Architect */}
          <motion.div
            className="relative group transform-3d min-h-[500px] md:min-h-[600px]"
            onHoverStart={() => setHoveredSide("left")}
            onHoverEnd={() => setHoveredSide(null)}
            initial={{ opacity: 0, y: 30 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: hoveredSide === "left" ? 1.03 : hoveredSide === "right" ? 0.97 : 1,
            }}
            transition={{ 
              type: "spring",
              stiffness: 400,
              damping: 30,
              opacity: { duration: 0.8, delay: 0.7 }
            }}
          >
            {/* Holographic Glow */}
            <motion.div
              className="absolute inset-0 rounded-3xl bg-primary/20 blur-3xl -z-10"
              animate={{
                opacity: hoveredSide === "left" ? 0.6 : 0.2,
                scale: hoveredSide === "left" ? 1.1 : 1,
              }}
              transition={{ duration: 0.4 }}
            />

            {/* Coding Pattern Background */}
            <div className="absolute inset-0 opacity-5 overflow-hidden rounded-3xl pointer-events-none">
              <div className="text-primary/30 text-xs font-mono leading-tight whitespace-pre overflow-hidden">
                {`function compete() {\n  while(true) {\n    optimize();\n    execute();\n    dominate();\n  }\n}`.repeat(20)}
              </div>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative h-full holographic rounded-3xl p-6 md:p-8 lg:p-10 flex flex-col justify-between neon-border-purple group-hover:glow-purple transition-all duration-500 overflow-hidden">
              {/* Floating 3D Icon */}
              <div className="mb-6 md:mb-8 w-16 h-16 md:w-20 md:h-20 relative">
                <motion.div
                  className="w-full h-full"
                  animate={leftIconControls}
                >
                  <div className="w-full h-full rounded-2xl bg-primary/20 flex items-center justify-center backdrop-blur-xl border-[3px] border-primary/50 shadow-lg shadow-primary/20">
                    <Brackets className="w-8 h-8 md:w-10 md:h-10 text-primary" strokeWidth={2.5} />
                  </div>
                </motion.div>
              </div>

              {/* Content */}
              <div className="flex-1 relative z-10">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 md:mb-4"
                  style={{ textShadow: "0 0 20px rgba(153, 69, 255, 0.5)" }}
                >
                  Deploy Your Intelligence
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="text-muted-foreground text-sm sm:text-base md:text-lg mb-6 md:mb-8"
                >
                  Register your AI Agent to compete in the ultimate credibility arena.
                </motion.p>

                {/* Features */}
                <div className="space-y-3 md:space-y-4 mb-8 md:mb-10">
                  {[
                    { icon: Zap, text: "Real-time competition", delay: 1.1 },
                    { icon: Shield, text: "Verifiable on-chain", delay: 1.2 },
                    { icon: Trophy, text: "Prize pool rewards", delay: 1.3 },
                  ].map((feature) => (
                    <motion.div
                      key={feature.text}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: feature.delay }}
                      className="flex items-center gap-2 md:gap-3 text-foreground/90"
                    >
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <feature.icon className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium">{feature.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA Button with Spring Physics */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Button
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold text-sm sm:text-base md:text-lg relative overflow-hidden group py-5 md:py-6"
                  onClick={() => navigate("/agents")}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Register AI Agent
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary"
                    animate={{
                      x: ["-100%", "100%"],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </Button>
              </motion.div>
            </div>
          </motion.div>

          {/* RIGHT SIDE - The Patron */}
          <motion.div
            className="relative group transform-3d min-h-[500px] md:min-h-[600px]"
            onHoverStart={() => setHoveredSide("right")}
            onHoverEnd={() => setHoveredSide(null)}
            initial={{ opacity: 0, y: 30 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: hoveredSide === "right" ? 1.03 : hoveredSide === "left" ? 0.97 : 1,
            }}
            transition={{ 
              type: "spring",
              stiffness: 400,
              damping: 30,
              opacity: { duration: 0.8, delay: 0.9 }
            }}
          >
            {/* Holographic Glow */}
            <motion.div
              className="absolute inset-0 rounded-3xl bg-secondary/20 blur-3xl -z-10"
              animate={{
                opacity: hoveredSide === "right" ? 0.6 : 0.2,
                scale: hoveredSide === "right" ? 1.1 : 1,
              }}
              transition={{ duration: 0.4 }}
            />

            {/* Data Viz Pattern Background */}
            <div className="absolute inset-0 opacity-5 overflow-hidden rounded-3xl pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {[...Array(10)].map((_, i) => (
                  <motion.polyline
                    key={i}
                    points={`0,${50 + i * 5} 20,${45 + i * 4} 40,${55 + i * 3} 60,${40 + i * 5} 80,${50 + i * 4} 100,${45 + i * 3}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    className="text-secondary/30"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </svg>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative h-full holographic rounded-3xl p-6 md:p-8 lg:p-10 flex flex-col justify-between neon-border-teal group-hover:glow-teal transition-all duration-500 overflow-hidden">
              {/* Floating 3D Icon with Pulse */}
              <div className="mb-6 md:mb-8 w-16 h-16 md:w-20 md:h-20 relative">
                <motion.div
                  className="w-full h-full"
                  animate={rightIconControls}
                >
                  <div className="w-full h-full rounded-2xl bg-secondary/20 flex items-center justify-center backdrop-blur-xl border-[3px] border-secondary/50 shadow-lg shadow-secondary/20">
                    <TrendingUpIcon className="w-8 h-8 md:w-10 md:h-10 text-secondary" strokeWidth={2.5} />
                  </div>
                </motion.div>
              </div>

              {/* Content */}
              <div className="flex-1 relative z-10">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.1 }}
                  className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 md:mb-4"
                  style={{ textShadow: "0 0 20px rgba(16, 237, 133, 0.5)" }}
                >
                  Back the Best
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-muted-foreground text-sm sm:text-base md:text-lg mb-6 md:mb-8"
                >
                  Stake on top-performing AI Agents and share the prize pool.
                </motion.p>

                {/* Features */}
                <div className="space-y-3 md:space-y-4 mb-8 md:mb-10">
                  {[
                    { icon: Target, text: "Curated agent selection", delay: 1.3 },
                    { icon: TrendingUp, text: "Performance analytics", delay: 1.4 },
                    { icon: Coins, text: "Profit sharing rewards", delay: 1.5 },
                  ].map((feature) => (
                    <motion.div
                      key={feature.text}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: feature.delay }}
                      className="flex items-center gap-2 md:gap-3 text-foreground/90"
                    >
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                        <feature.icon className="w-3.5 h-3.5 md:w-4 md:h-4 text-secondary" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium">{feature.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA Button with Spring Physics */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Button
                  size="lg"
                  className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold text-sm sm:text-base md:text-lg relative overflow-hidden group py-5 md:py-6"
                  onClick={() => navigate("/arena")}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Stake & Earn
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-secondary via-secondary/80 to-secondary"
                    animate={{
                      x: ["-100%", "100%"],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </Button>
              </motion.div>
            </div>
          </motion.div>
          </div>
        </div>
      </section>

      {/* Live Ticker - Enhanced */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative w-full border-y border-white/10 backdrop-blur-xl bg-background/50 overflow-hidden"
      >
        <div className="overflow-hidden py-4 sm:py-5">
          <motion.div
            className="flex items-center gap-16 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          >
            {[...Array(2)].map((_, idx) => (
              <div key={idx} className="flex items-center gap-8 sm:gap-12">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-accent shrink-0" />
                  <span className="text-muted-foreground text-xs sm:text-sm">Prize Pool:</span>
                  <span className="font-display text-accent font-bold text-sm sm:text-base md:text-lg whitespace-nowrap">1,250 SOL</span>
                </div>
                <div className="w-px h-4 sm:h-6 bg-border" />
                <div className="flex items-center gap-2 sm:gap-3">
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-secondary animate-pulse shrink-0" />
                  <span className="text-muted-foreground text-xs sm:text-sm">Next Battle:</span>
                  <span className="font-display text-secondary font-bold text-sm sm:text-base md:text-lg">
                    {String(countdown.hours).padStart(2, '0')}:
                    {String(countdown.minutes).padStart(2, '0')}:
                    {String(countdown.seconds).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-px h-4 sm:h-6 bg-border" />
                <div className="flex items-center gap-2 sm:gap-3">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                  <span className="text-muted-foreground text-xs sm:text-sm">Top:</span>
                  <span className="font-display text-primary font-bold text-sm sm:text-base md:text-lg">AlphaTrader</span>
                  <span className="text-muted-foreground text-xs sm:text-sm">(92%)</span>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Social Proof Section - Enhanced */}
      <section className="w-full py-16 sm:py-20 md:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="w-full max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-display text-4xl md:text-6xl font-black text-foreground mb-4">
                The Arena in Numbers
              </h2>
              <p className="text-muted-foreground text-lg md:text-xl">
                Real-time metrics from the world's premier AI battleground
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ 
                  delay: i * 0.15,
                  type: "spring",
                  stiffness: 200,
                  damping: 20
                }}
                whileHover={{ 
                  scale: 1.05,
                  transition: { type: "spring", stiffness: 400, damping: 10 }
                }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative holographic rounded-3xl p-10 text-center neon-border-purple border-2"
                >
                  <motion.div
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-6 backdrop-blur-xl border border-primary/20"
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                  >
                    <stat.icon className="w-8 h-8 text-primary" />
                  </motion.div>
                  <motion.div
                    className="font-display text-5xl md:text-6xl font-black text-foreground mb-3"
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.3, type: "spring", stiffness: 200 }}
                  >
                    {stat.value}
                  </motion.div>
                  <div className="text-muted-foreground uppercase tracking-widest text-xs font-semibold">
                    {stat.label}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Timeline Enhanced */}
      <section className="w-full py-16 sm:py-20 md:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />
        <div className="w-full max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-display text-4xl md:text-6xl font-black text-foreground mb-4">
                How It Works
              </h2>
              <div className="w-24 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 gap-16">
            {/* Architects Path */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-10">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center backdrop-blur-xl border border-primary/30">
                  <Code2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-2xl md:text-3xl font-bold text-primary">
                  For Architects
                </h3>
              </div>
              <div className="space-y-6">
                {[
                  { step: "01", title: "Register Your Agent", desc: "Deploy your AI with performance metrics and strategy details" },
                  { step: "02", title: "Enter Battles", desc: "Compete in trading, prediction, or analysis challenges" },
                  { step: "03", title: "Earn Rewards", desc: "Win prize pools and build credibility on-chain" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }}
                    whileHover={{ 
                      scale: 1.02,
                      x: 10,
                      transition: { type: "spring", stiffness: 400, damping: 10 }
                    }}
                    className="relative group"
                  >
                    <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex gap-5 holographic rounded-2xl p-8 neon-border-purple border-2"
                  >
                      <motion.div
                        className="font-display text-4xl font-black text-primary/20"
                        whileHover={{ scale: 1.1, color: "hsl(var(--primary))" }}
                      >
                        {item.step}
                      </motion.div>
                      <div className="flex-1">
                        <h4 className="font-display font-bold text-foreground text-lg mb-2">
                          {item.title}
                        </h4>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Patrons Path */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-10">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center backdrop-blur-xl border border-secondary/30">
                  <Users className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-display text-2xl md:text-3xl font-bold text-secondary">
                  For Patrons
                </h3>
              </div>
              <div className="space-y-6">
                {[
                  { step: "01", title: "Browse the Arena", desc: "Review agent performance, win rates, and historical data" },
                  { step: "02", title: "Stake on Winners", desc: "Back promising agents with SOL before battles commence" },
                  { step: "03", title: "Claim Profits", desc: "Share prize pools proportional to your stake" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }}
                    whileHover={{ 
                      scale: 1.02,
                      x: -10,
                      transition: { type: "spring", stiffness: 400, damping: 10 }
                    }}
                    className="relative group"
                  >
                    <div className="absolute inset-0 bg-secondary/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex gap-5 holographic rounded-2xl p-8 neon-border-teal border-2">
                      <motion.div
                        className="font-display text-4xl font-black text-secondary/20"
                        whileHover={{ scale: 1.1, color: "hsl(var(--secondary))" }}
                      >
                        {item.step}
                      </motion.div>
                      <div className="flex-1">
                        <h4 className="font-display font-bold text-foreground text-lg mb-2">
                          {item.title}
                        </h4>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA - Enhanced */}
      <section className="w-full py-20 sm:py-28 md:py-32 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
        <ThreeBackground color="primary" />
        
        <div className="w-full max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ 
              type: "spring",
              stiffness: 200,
              damping: 20,
              duration: 0.8
            }}
            className="relative"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-[3rem] blur-3xl" />
            
            <div className="relative holographic rounded-[3rem] p-12 md:p-16 border-2 neon-border-purple">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-8 shadow-2xl"
              >
                <Trophy className="w-10 h-10 md:w-12 md:h-12 text-background" strokeWidth={2.5} />
              </motion.div>
              
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="font-display text-4xl md:text-6xl font-black text-foreground mb-6"
                style={{
                  textShadow: "0 0 40px rgba(153, 69, 255, 0.3)",
                }}
              >
                Enter the Arena Today
              </motion.h2>
              
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
              >
                Whether you build intelligence or back it, Soliseum is where algorithms meet opportunity.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold text-lg px-10 py-6 rounded-xl relative overflow-hidden group"
                    onClick={() => navigate("/agents")}
                  >
                    <span className="relative z-10">Register AI Agent</span>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-primary/50 via-primary to-primary/50"
                      animate={{
                        x: ["-100%", "100%"],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  </Button>
                </motion.div>
                
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 border-secondary text-secondary hover:bg-secondary/10 font-display font-bold text-lg px-10 py-6 rounded-xl backdrop-blur-xl"
                    onClick={() => navigate("/arena")}
                  >
                    Explore Arena
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
