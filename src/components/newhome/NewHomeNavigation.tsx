/**
 * NewHomeNavigation — /newhome-only variant of src/components/Navigation.tsx.
 * Identical links, handlers and items; only the logo lockup and header chrome differ.
 * The shared Navigation component is intentionally left untouched so `/` is unaffected.
 */
import { motion } from 'motion/react';
import { Menu, X, User, CreditCard, HelpCircle, LogOut, Download, MapPin, History } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SportsCar } from '@/components/SportsCar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import SupportDialog from '@/components/SupportDialog';
import { HEADER_LOGO_URL } from '@/lib/newHomeConfig';

export function NewHomeNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const menuItems = [{
    label: 'How It Works',
    href: '/how-it-works',
    color: 'text-white'
  }, {
    label: 'Map',
    href: '/map',
    color: 'text-emerald-400'
  }, {
    label: 'Support',
    href: '#support-dialog',
    color: 'text-yellow-400'
  }];
  const handleMenuClick = (href: string) => {
    if (href === '#support-dialog') {
      setSupportOpen(true);
      setIsMenuOpen(false);
    } else if (href.startsWith('/')) {
      navigate(href);
      setIsMenuOpen(false);
    } else {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        setIsMenuOpen(false);
      }
    }
  };

  return <>
      <motion.nav initial={{ y: -100 }} animate={{ y: 0 }} className="fixed top-0 left-0 right-0 z-[100] bg-black/80 dark:bg-black/80 backdrop-blur-2xl border-b border-yellow-500/25 shadow-[0_1px_0_0_rgba(250,204,21,0.12),0_12px_40px_-20px_rgba(0,0,0,0.9)]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{ scale: 1.03 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }} onClick={() => navigate('/')}>
              {logoFailed ? (
                <span
                  className="font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent text-6xl animate-shimmer bg-[length:200%_auto]"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6)) drop-shadow(0 0 60px rgba(250,204,21,0.4))'
                  }}
                >
                  cashridez
                </span>
              ) : (
                <img
                  src={HEADER_LOGO_URL}
                  alt="CashRidez"
                  onError={() => setLogoFailed(true)}
                  className="h-9 md:h-10 w-auto transition-[filter] duration-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.35)] hover:drop-shadow-[0_0_22px_rgba(250,204,21,0.75)]"
                />
              )}
            </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {menuItems.map(item => <button key={item.label} onClick={() => handleMenuClick(item.href)} className={`${item.color} hover:scale-110 transition-all duration-500 ease-out hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.5)] font-medium`}>
                {item.label}
              </button>)}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            {user && <NotificationBell />}
            <ThemeToggle />
            {user ? (
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-yellow-400 hover:text-yellow-300 transition-all duration-500 hover:scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/install-app')} className="text-yellow-400 hover:text-yellow-300 transition-all duration-500 hover:scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                  <Download className="mr-2 h-4 w-4" />
                  Download App
                </Button>
                <Button variant="ghost" onClick={() => navigate('/auth')} className="text-yellow-400 hover:text-yellow-300 transition-all duration-500 hover:scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] hover:drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">
                  Sign In
                </Button>
                <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-semibold shadow-lg shadow-yellow-500/50 transition-all duration-500 hover:scale-110 hover:shadow-xl hover:shadow-yellow-500/70">
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-3">
            {user && <NotificationBell />}
            <ThemeToggle />
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2" aria-label="Toggle menu">
              {isMenuOpen ? (
                <X size={24} className="text-yellow-400 animate-shimmer" style={{ filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6))' }} />
              ) : (
                <Menu size={24} className="text-yellow-400 animate-shimmer" style={{ filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.9)) drop-shadow(0 0 40px rgba(250,204,21,0.6))' }} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="md:hidden mt-4 pb-4 border-t border-yellow-500/20 pt-4">
            <div className="flex flex-col gap-4 items-center text-center">
              {menuItems.map(item => <button key={item.label} onClick={() => handleMenuClick(item.href)} className={`${item.color} hover:scale-105 transition-all duration-500 font-medium w-full text-center`}>
                  {item.label}
                </button>)}
              <div className="flex flex-col gap-2 mt-4 border-t border-yellow-500/20 pt-4">
                {user ? (
                  <>
                    <Button variant="ghost" onClick={() => { navigate('/dashboard'); setIsMenuOpen(false); }} className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105">
                      <User className="mr-2 h-4 w-4" />
                      Dashboard
                    </Button>
                    <Button variant="ghost" onClick={() => { navigate('/profile'); setIsMenuOpen(false); }} className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Button>
                    <Button variant="ghost" onClick={() => { navigate('/map'); setIsMenuOpen(false); }} className="w-full justify-start text-emerald-400 hover:text-emerald-300 transition-all duration-300 hover:scale-105">
                      <MapPin className="mr-2 h-4 w-4" />
                      Map
                    </Button>
                    <Button variant="ghost" onClick={() => { navigate('/history'); setIsMenuOpen(false); }} className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105">
                      <History className="mr-2 h-4 w-4" />
                      History
                    </Button>
                    <Button variant="ghost" onClick={() => { navigate('/subscription'); setIsMenuOpen(false); }} className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Subscription
                    </Button>
                    <Button variant="ghost" onClick={() => { setSupportOpen(true); setIsMenuOpen(false); }} className="w-full justify-start text-yellow-400 hover:text-yellow-300 transition-all duration-300 hover:scale-105">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Support
                    </Button>
                    <Button variant="ghost" onClick={() => { signOut(); setIsMenuOpen(false); }} className="w-full justify-start text-red-400 hover:text-red-300 transition-all duration-300 hover:scale-105">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => { navigate('/install-app'); setIsMenuOpen(false); }} className="w-full justify-center text-emerald-400 hover:text-emerald-300 transition-all duration-300 hover:scale-105">
                      <Download className="mr-2 h-4 w-4" />
                      Download App
                    </Button>
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
        </div>
      </motion.nav>

    {/* Animated Header Section - Sticky */}
    <div className="fixed top-16 left-0 right-0 h-32 z-[60] pointer-events-none overflow-hidden">
      <motion.div className="absolute top-8 z-[60]" animate={{ x: ['-15%', '115%'] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        <SportsCar width={100} height={50} />
      </motion.div>
    </div>
    <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </>;
}
