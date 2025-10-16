interface BrandCarProps {
  className?: string;
}

export const BrandCar = ({ className = "w-6 h-6" }: BrandCarProps) => {
  return (
    <svg
      viewBox="0 0 200 100"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M170 45 L185 50 L192 55 L195 60 L195 75 L190 80 L185 80 L185 75 Q185 70 180 70 Q175 70 175 75 L175 80 L75 80 L75 75 Q75 70 70 70 Q65 70 65 75 L65 80 L60 80 L55 75 L55 60 Q55 55 58 52 L65 45 L75 42 L85 40 L160 40 Z M70 35 L75 30 L125 30 L130 35 L130 40 L70 40 Z M180 58 Q177 58 177 61 Q177 64 180 64 Q183 64 183 61 Q183 58 180 58 Z M170 58 Q167 58 167 61 Q167 64 170 64 Q173 64 173 61 Q173 58 170 58 Z M85 45 L90 50 L110 50 L115 45 Z" />
    </svg>
  );
};
