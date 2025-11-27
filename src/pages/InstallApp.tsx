import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Share2, CheckCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { toast } from "sonner";

export default function InstallApp() {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect Android device
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(userAgent.includes('android'));

    // SEO
    document.title = "Get the App | Cash Ridez";
    const desc = "Add Cash Ridez to your home screen for a faster, app-like experience";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) {
      toast.success("Cash Ridez is already installed on your device");
      return;
    }

    if (!isInstallable) {
      toast.info(
        "If you don't see a popup, open your browser menu (⋮) and choose 'Install app' or 'Add to Home Screen'",
        { duration: 5000 }
      );
      return;
    }

    const installed = await promptInstall();
    if (installed) {
      toast.success("Cash Ridez has been installed!");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showStatus={false} showCar={false} />
      
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/icon.png" alt="Cash Ridez App Icon" className="w-20 h-20 rounded-2xl shadow-lg" />
          </div>
          <h1 className="text-4xl font-bold mb-3 gold-shimmer">Get the Cash Ridez App</h1>
          <p className="text-lg text-muted-foreground">
            Add Cash Ridez to your home screen for a faster, app-like experience
          </p>
        </div>

        <Tabs defaultValue={isAndroid ? "android" : "ios"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="ios">iOS</TabsTrigger>
            <TabsTrigger value="android">Android</TabsTrigger>
          </TabsList>

          {/* iOS Instructions */}
          <TabsContent value="ios" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-primary" />
                  Install on iPhone or iPad
                </CardTitle>
                <CardDescription>
                  Follow these steps to add Cash Ridez to your home screen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-primary font-bold">1</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">Tap the Share button</p>
                      <p className="text-sm text-muted-foreground">
                        Look for the <Share2 className="w-4 h-4 inline mx-1" /> share icon in your Safari browser (usually at the bottom or top of the screen)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-primary font-bold">2</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">Scroll down and tap "Add to Home Screen"</p>
                      <p className="text-sm text-muted-foreground">
                        You may need to scroll down in the share menu to find this option
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-primary font-bold">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1">Tap "Add" to install</p>
                      <p className="text-sm text-muted-foreground">
                        Cash Ridez will appear on your home screen like a native app
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>Works offline and loads faster than the website</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Android Instructions */}
          <TabsContent value="android" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-primary" />
                  Install on Android
                </CardTitle>
                <CardDescription>
                  One tap to add Cash Ridez to your home screen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isInstalled ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-lg font-medium mb-2">App Already Installed</p>
                    <p className="text-sm text-muted-foreground">
                      Cash Ridez is already installed on your device
                    </p>
                  </div>
                ) : (
                  <>
                    <Button 
                      onClick={handleInstallClick}
                      className="w-full h-12 text-lg bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-semibold"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Install App
                    </Button>

                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground text-center">
                        Tip: You can also install from your browser menu
                      </p>
                      
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-medium">Alternative method:</p>
                        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                          <li>Open your browser menu (⋮)</li>
                          <li>Select "Install app" or "Add to Home Screen"</li>
                          <li>Confirm to add Cash Ridez to your home screen</li>
                        </ol>
                      </div>
                    </div>

                    <div className="pt-4 border-t space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>Instant access from your home screen</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>Works offline and loads faster</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>Get push notifications for your trips</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center mt-8">
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="min-w-32"
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
