import { motion } from 'motion/react';
import { Menu, X, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SportsCar } from './SportsCar';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/button';
export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const menuItems = [{
    label: 'How It Works',
    href: '#how-it-works'
  }, {
    label: 'Community',
    href: '#community'
  }, {
    label: 'Support',
    href: '#support'
  }];
  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth'
      });
      setIsMenuOpen(false);
    }
  };
  return <>
      <motion.nav initial={{
      y: -100
    }} animate={{
      y: 0
    }} className="fixed top-0 left-0 right-0 z-50 bg-black/90 dark:bg-black/90 backdrop-blur-xl border-b border-yellow-500/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{
            scale: 1.05
          }} onClick={() => navigate('/')}>
              <span className="font-bold bg-gradient-to-r from-yellow-400 to-emerald-500 bg-clip-text text-transparent text-6xl" style={{ fontFamily: "'Playfair Display', serif" }}>cashridez</span>
            </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className="text-gray-700 dark:text-gray-300 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">
                {item.label}
              </button>)}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => navigate('/auth')} className="text-gray-900 dark:text-white hover:text-yellow-600 dark:hover:text-yellow-400 transition-all hover:scale-105">
              Sign In
            </Button>
            <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold shadow-lg shadow-yellow-500/50 transition-all hover:scale-105">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-3">
            <ThemeToggle />
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-900 dark:text-white p-2" aria-label="Toggle menu">
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

        {/* Mobile Menu */}
        {isMenuOpen && <motion.div initial={{
        opacity: 0,
        y: -20
      }} animate={{
        opacity: 1,
        y: 0
      }} exit={{
        opacity: 0,
        y: -20
      }} className="md:hidden mt-4 pb-4 border-t border-yellow-500/20 pt-4">
            <div className="flex flex-col gap-4">
              {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className="text-gray-700 dark:text-gray-300 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors text-left">
                  {item.label}
                </button>)}
              <div className="flex flex-col gap-2 mt-4">
                <Button variant="ghost" onClick={() => navigate('/auth')} className="w-full text-gray-900 dark:text-white hover:text-yellow-600 dark:hover:text-yellow-400 transition-all hover:scale-105">
                  Sign In
                </Button>
                <Button onClick={() => navigate('/auth')} className="w-full bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold transition-all hover:scale-105">
                  Get Started
                </Button>
              </div>
            </div>
          </motion.div>}
      </motion.nav>

    {/* Animated Header Section */}
    <div className="fixed top-16 left-0 right-0 h-32 z-40 pointer-events-none overflow-hidden">
      {/* Driving Car Animation */}
      <motion.div className="absolute top-8" animate={{
        x: ['-15%', '115%']
      }} transition={{
        duration: 40,
        repeat: Infinity,
        ease: "linear"
      }}>
        <SportsCar width={100} height={50} />
      </motion.div>

      {/* Destination Pin with Dollar Sign */}
      <motion.div className="absolute top-8 right-20 relative" animate={{
        y: [0, -10, 0]
      }} transition={{
        duration: 2,
        repeat: Infinity
      }}>
        <MapPin className="w-10 h-10 text-gold drop-shadow-lg" fill="currentColor" />
        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" initial={{
          scale: 0
        }} animate={{
          scale: 1
        }} transition={{
          delay: 0.5
        }}>
          <span className="text-black font-bold text-xs">$</span>
        </motion.div>
      </motion.div>
    </div>
    </>;
}