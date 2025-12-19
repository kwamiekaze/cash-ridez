import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Menu, 
  Inbox, 
  Send, 
  History, 
  Activity, 
  Upload,
  MessageSquare,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface SmsCenterMobileNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount: number;
}

const tabs = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "compose", label: "Compose", icon: Send },
  { id: "history", label: "History", icon: History },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "autotext", label: "Auto Text", icon: Upload },
];

export function SmsCenterMobileNav({ activeTab, onTabChange, unreadCount }: SmsCenterMobileNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleTabSelect = (tabId: string) => {
    onTabChange(tabId);
    setOpen(false);
  };

  const activeTabData = tabs.find(t => t.id === activeTab);

  return (
    <div className="md:hidden sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-background border-border">
              <SheetHeader className="text-left mb-6">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  SMS Center
                </SheetTitle>
              </SheetHeader>
              
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabSelect(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                      activeTab === tab.id 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <tab.icon className="h-5 w-5" />
                    <span className="font-medium">{tab.label}</span>
                    {tab.id === "inbox" && unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 px-1.5">
                        {unreadCount}
                      </Badge>
                    )}
                  </button>
                ))}
              </nav>
              
              <div className="absolute bottom-6 left-4 right-4">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setOpen(false);
                    navigate('/admin');
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Admin
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-2">
            {activeTabData && <activeTabData.icon className="h-5 w-5 text-primary" />}
            <h1 className="text-lg font-semibold">
              {activeTabData?.label || "SMS Center"}
            </h1>
            {activeTab === "inbox" && unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
