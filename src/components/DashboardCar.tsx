import { motion } from "motion/react";
import { CashCarIcon } from "./CashCarIcon";

export const DashboardCar = () => {
  return (
    <div className="relative w-full h-[60px] overflow-hidden mb-4">
      <motion.div
        animate={{
          x: ['-100%', '100%']
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-0"
        style={{ 
          filter: 'drop-shadow(0 0 12px rgba(249, 226, 125, 0.7)) drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))'
        }}
      >
        <CashCarIcon 
          width={100} 
          height={50} 
          glowIntensity="none"
          letter="$"
        />
      </motion.div>
    </div>
  );
};
