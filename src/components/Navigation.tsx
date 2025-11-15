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
    }} className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{
            scale: 1.05
          }} onClick={() => navigate('/')}>
              <span className="font-bold bg-gradient-to-r from-gold to-emerald bg-clip-text text-yellow-300 font-serif text-6xl">​cashridez</span>
            </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className="text-gray-300 hover:text-gold transition-colors">
                {item.label}
              </button>)}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => navigate('/auth')} className="text-white hover:text-gold">
              Sign In
            </Button>
            <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-gold to-emerald text-black font-semibold hover:shadow-lg hover:shadow-gold/50">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-3">
            <ThemeToggle />
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-white p-2" aria-label="Toggle menu">
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
      }} className="md:hidden mt-4 pb-4 border-t border-white/10 pt-4">
            <div className="flex flex-col gap-4">
              {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className="text-gray-300 hover:text-gold transition-colors text-left">
                  {item.label}
                </button>)}
              <div className="flex flex-col gap-2 mt-4">
                <Button variant="ghost" onClick={() => navigate('/auth')} className="w-full text-white hover:text-gold">
                  Sign In
                </Button>
                <Button onClick={() => navigate('/auth')} className="w-full bg-gradient-to-r from-gold to-emerald text-black font-semibold">
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