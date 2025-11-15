import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, User, History, HeadphonesIcon, Crown, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import SupportDialog from "@/components/SupportDialog";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { motion } from "motion/react";
import { CashCarIcon } from "./CashCarIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusBadge from "@/components/StatusBadge";
interface AppHeaderProps {
  showStatus?: boolean;
}
const AppHeader = ({
  showStatus = true
}: AppHeaderProps) => {
  const {
    user,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const {
        data
      } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      // Check admin role via security-definer RPC to avoid RLS issues
      const {
        data: hasAdmin
      } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin'
      });
      setIsAdmin(Boolean(hasAdmin));
    };
    fetchProfile();
  }, [user]);
  // Determine the letter for the car based on role
  const carLetter = profile?.active_role === 'rider' ? 'R' : 
                    profile?.active_role === 'driver' ? 'D' : 
                    isAdmin ? 'A' : '$';

  return <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50 relative overflow-hidden">
      <div className="container mx-auto px-4 py-3 md:py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-start cursor-pointer relative" onClick={() => {
          // Route based on user role
          if (profile?.active_role === 'rider') {
            navigate('/rider');
          } else if (profile?.active_role === 'driver') {
            navigate('/driver');
          } else {
            navigate('/dashboard');
          }
        }}>
            <span style={{
            fontFamily: "'Playfair Display', serif",
            filter: 'drop-shadow(0 0 15px rgba(250,204,21,0.8)) drop-shadow(0 0 30px rgba(250,204,21,0.5))'
          }} className="text-3xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto] md:text-4xl lg:text-5xl leading-tight">
              CashRidez
            </span>
            {/* Animated Car with Role Letter - Full Width Animation */}
            <div className="w-[300px] md:w-[500px] overflow-visible relative mt-1 md:mt-2">
              <motion.div 
                className="absolute left-0"
                animate={{
                  x: [-100, 300, -100]
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "linear"
                }}
              >
                <CashCarIcon 
                  width={70} 
                  height={35} 
                  glowIntensity="medium" 
                  letter={carLetter}
                  className="md:w-[90px] md:h-[45px]" 
                />
              </motion.div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {showStatus && profile && <div className="hidden sm:flex items-center gap-2">
                <StatusBadge status={profile.verification_status} />
                {profile.active_role && <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                    {profile.active_role}
                  </div>}
              </div>}
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={profile?.photo_url} alt={profile?.display_name || user?.email} />
                    <AvatarFallback>
                      {profile?.display_name?.[0] || user?.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border z-50">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {profile?.display_name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/history")} className="cursor-pointer">
                  <History className="mr-2 h-4 w-4" />
                  History
                </DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer">
                    <Shield className="mr-2 h-4 w-4" />
                    Admin
                  </DropdownMenuItem>}
                {!profile?.is_member && <DropdownMenuItem onClick={() => navigate("/subscription")} className="cursor-pointer">
                    <Crown className="mr-2 h-4 w-4" />
                    Subscription
                  </DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSupportDialogOpen(true)} className="cursor-pointer">
                  <HeadphonesIcon className="mr-2 h-4 w-4" />
                  Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <SupportDialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen} />
    </header>;
};
export default AppHeader;