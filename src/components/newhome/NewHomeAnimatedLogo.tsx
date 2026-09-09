import { motion } from 'motion/react';
import { SportsCar } from '@/components/SportsCar';

interface NewHomeAnimatedLogoProps {
  onClick: () => void;
}

export function NewHomeAnimatedLogo({ onClick }: NewHomeAnimatedLogoProps) {
  return (
    <div className="relative h-12 w-[150px] shrink-0 cursor-pointer overflow-visible sm:w-[180px]" onClick={onClick}>
      <div className="absolute left-0 top-0 flex origin-top-left scale-[0.64] flex-col items-start sm:scale-[0.7]">
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            filter: 'drop-shadow(0 0 15px rgba(250,204,21,0.8)) drop-shadow(0 0 30px rgba(250,204,21,0.5))',
          }}
          className="text-3xl font-bold leading-tight bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto] sm:text-4xl"
        >
          CashRidez
        </span>
        <div className="relative mt-1 h-[35px] w-[200px] overflow-visible sm:mt-2 sm:h-[40px] sm:w-[280px]">
          <motion.div
            animate={{ x: ['0%', '100%'] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            className="absolute top-0"
            style={{ filter: 'drop-shadow(0 0 12px rgba(249, 226, 125, 0.7)) drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))' }}
          >
            <SportsCar width={80} height={40} showDollarSign />
          </motion.div>
        </div>
      </div>
    </div>
  );
}