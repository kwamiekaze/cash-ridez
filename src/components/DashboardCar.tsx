import { motion } from "motion/react";
import { SportsCar } from "./SportsCar";

export const DashboardCar = () => {
  return (
    <div className="relative w-full h-[90px] overflow-hidden mb-4">
      <motion.div
        animate={{
          x: ['-100%', '100%']
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-0"
        style={{ 
          filter: 'drop-shadow(0 0 12px rgba(249, 226, 125, 0.7)) drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))'
        }}
      >
        <SportsCar 
          width={180} 
          height={90}
          showDollarSign={true}
        />
      </motion.div>
    </div>
  );
};
