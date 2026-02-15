import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Background Grid */}
      <div className="absolute inset-0 grid-bg opacity-20" />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />

      {/* Central Trophy Animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="relative z-10"
      >
        <motion.div
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0, -5, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative"
        >
          {/* Glow effect */}
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-secondary blur-3xl"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          {/* Trophy Container */}
          <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-2xl border-4 border-white/20 backdrop-blur-sm">
            <Trophy className="w-20 h-20 text-background drop-shadow-2xl" strokeWidth={2.5} />
          </div>

          {/* Orbiting particles */}
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full bg-gradient-to-br from-primary to-secondary shadow-lg"
              animate={{
                rotate: [i * 90, i * 90 + 360],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.25,
              }}
              style={{
                top: "50%",
                left: "50%",
                transformOrigin: "-90px 0",
              }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Loading Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-32 text-center"
      >
        <motion.h2
          className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          SOLISEUM
        </motion.h2>
        <motion.div className="flex gap-2 justify-center">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
