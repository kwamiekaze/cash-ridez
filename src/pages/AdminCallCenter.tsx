import { useState } from "react";
import { Helmet } from "react-helmet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Users, History, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ComposeCallTab from "@/components/admin/call-center/ComposeCallTab";
import AutoCallTab from "@/components/admin/call-center/AutoCallTab";
import CallHistoryTab from "@/components/admin/call-center/CallHistoryTab";

const AdminCallCenter = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("compose");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Simple redirect - AdminRoute wrapper handles auth
  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const tabs = [
    { value: "compose", label: "Compose Call", icon: Phone },
    { value: "auto", label: "Auto Call", icon: Users },
    { value: "history", label: "History", icon: History },
  ];

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <Helmet>
        <title>Call Center | CashRidez Admin</title>
      </Helmet>
      
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">Call Center</h1>
            </div>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col gap-2 mt-6">
                  {tabs.map((tab) => (
                    <Button
                      key={tab.value}
                      variant={activeTab === tab.value ? "default" : "ghost"}
                      className="justify-start gap-2"
                      onClick={() => handleTabChange(tab.value)}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <Phone className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">Call Center</h1>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 lg:p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            {/* Desktop Tabs */}
            <div className="hidden lg:block mb-6">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Mobile Tab Pills */}
            <div className="lg:hidden mb-4 overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {tabs.map((tab) => (
                  <Button
                    key={tab.value}
                    variant={activeTab === tab.value ? "default" : "outline"}
                    size="sm"
                    className="flex-shrink-0 gap-1.5"
                    onClick={() => handleTabChange(tab.value)}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </Button>
                ))}
              </div>
            </div>

            <TabsContent value="compose" className="mt-0">
              <ComposeCallTab />
            </TabsContent>

            <TabsContent value="auto" className="mt-0">
              <AutoCallTab />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <CallHistoryTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default AdminCallCenter;
