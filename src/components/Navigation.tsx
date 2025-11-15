import { motion } from 'motion/react';
import { Menu, X, User, CreditCard, HelpCircle, Moon, Sun, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SportsCar } from './SportsCar';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const menuItems = [{
    label: 'How It Works',
    href: '#how-it-works',
    color: 'text-white'
  }, {
    label: 'Community',
    href: '#community',
    color: 'text-emerald-400'
  }, {
    label: 'Support',
    href: '#support',
    color: 'text-yellow-400'
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
    }} className="fixed top-0 left-0 right-0 z-[100] bg-black/90 dark:bg-black/90 backdrop-blur-xl border-b border-yellow-500/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{
            scale: 1.05
          }} onClick={() => navigate('/')}>
              <span 
                className="font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent text-6xl animate-shimmer bg-[length:200%_auto]" 
                style={{ 
                  fontFamily: "'Playfair Display', serif",
                  filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6)) drop-shadow(0 0 60px rgba(250,204,21,0.4))'
                }}
              >
                cashridez
              </span>
            </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className={`${item.color} hover:scale-110 transition-all duration-300 hover:drop-shadow-lg font-medium`}>
                {item.label}
              </button>)}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            {user && <NotificationBell />}
            <ThemeToggle />
            {user ? (
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/auth')} className="text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                  Sign In
                </Button>
                <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold shadow-lg shadow-yellow-500/50 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-yellow-500/70">
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-3">
            {user && <NotificationBell />}
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
              {menuItems.map(item => <button key={item.label} onClick={() => scrollToSection(item.href)} className={`${item.color} hover:scale-105 transition-all duration-300 text-left font-medium`}>
                  {item.label}
                </button>)}
              <div className="flex flex-col gap-2 mt-4 border-t border-yellow-500/20 pt-4">
                {user ? (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => { navigate('/dashboard'); setIsMenuOpen(false); }} 
                      className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Dashboard
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => { navigate('/profile'); setIsMenuOpen(false); }} 
                      className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => { navigate('/subscription'); setIsMenuOpen(false); }} 
                      className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105"
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Subscription
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => { /* Open support dialog */ setIsMenuOpen(false); }} 
                      className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105"
                    >
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Support
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                      className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105"
                    >
                      {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => { signOut(); setIsMenuOpen(false); }} 
                      className="w-full justify-start text-red-400 hover:text-red-300 transition-all duration-300 hover:scale-105"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => { navigate('/auth'); setIsMenuOpen(false); }} className="w-full text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                      Sign In
                    </Button>
                    <Button onClick={() => { navigate('/auth'); setIsMenuOpen(false); }} className="w-full bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold transition-all duration-300 hover:scale-105 shadow-lg shadow-yellow-500/50">
                      Get Started
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>}
      </motion.nav>

    {/* Animated Header Section - Sticky */}
    <div className="fixed top-16 left-0 right-0 h-32 z-[60] pointer-events-none overflow-hidden">
      {/* Driving Car Animation */}
      <motion.div className="absolute top-8 z-[60]" animate={{
        x: ['-15%', '115%']
      }} transition={{
        duration: 40,
        repeat: Infinity,
        ease: "linear"
      }}>
        <SportsCar width={100} height={50} />
      </motion.div>
    </div>
    </>;
}