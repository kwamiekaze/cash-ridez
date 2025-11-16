import { motion } from "motion/react";

export const CarIcon = () => {
  return (
    <motion.div
      className="fixed top-20 left-4 z-40"
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <motion.svg
        width="48"
        height="48"
        viewBox="0 0 64 64"
        className="text-primary drop-shadow-glow-strong"
        animate={{ 
          y: [0, -4, 0],
          filter: [
            'drop-shadow(0 0 16px hsl(51 100% 50% / 0.8)) drop-shadow(0 0 32px hsl(51 100% 50% / 0.6))',
            'drop-shadow(0 0 24px hsl(51 100% 50% / 1)) drop-shadow(0 0 48px hsl(51 100% 50% / 0.8))',
            'drop-shadow(0 0 16px hsl(51 100% 50% / 0.8)) drop-shadow(0 0 32px hsl(51 100% 50% / 0.6))'
          ]
        }}
        transition={{ 
          y: { duration: 2, repeat: Infinity, ease: "easeInOut" },
          filter: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        <g fill="currentColor">
          {/* Car body */}
          <path d="M8 32h48v12H8z" />
          <path d="M12 28h40l-4-8H16z" />
          {/* Wheels */}
          <circle cx="18" cy="44" r="5" />
          <circle cx="46" cy="44" r="5" />
          {/* Windows */}
          <path d="M20 24h10v4H20z" fill="hsl(220 26% 8%)" />
          <path d="M34 24h10v4H34z" fill="hsl(220 26% 8%)" />
          {/* Dollar sign */}
          <text x="28" y="38" fontSize="14" fontWeight="bold" fill="hsl(220 26% 8%)">$</text>
        </g>
      </motion.svg>
    </motion.div>
  );
};
