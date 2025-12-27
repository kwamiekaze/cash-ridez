import { useState } from "react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, UserCheck, UserX, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminRoute from "@/components/AdminRoute";
import AppHeader from "@/components/AppHeader";
import { MapBackground } from "@/components/MapBackground";

type ExportType = 
  | 'all_names' 
  | 'all_names_emails' 
  | 'all_names_phones' 
  | 'verified_names' 
  | 'unverified_names' 
  | 'unverified_names_emails';

interface ExportCard {
  id: ExportType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const exportCards: ExportCard[] = [
  {
    id: 'all_names',
    title: 'All Users — Full Names',
    description: 'Export all users with their full names only',
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: 'all_names_emails',
    title: 'All Users — Full Names + Emails',
    description: 'Export all users with names and email addresses',
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: 'all_names_phones',
    title: 'All Users — Full Names + Phone Numbers',
    description: 'Export all users with names and phone numbers (E.164 format)',
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: 'verified_names',
    title: 'Verified Users — Full Names',
    description: 'Export only verified/approved users with their full names',
    icon: <UserCheck className="h-5 w-5" />,
  },
  {
    id: 'unverified_names',
    title: 'Unverified Users — Full Names',
    description: 'Export only unverified users with their full names',
    icon: <UserX className="h-5 w-5" />,
  },
  {
    id: 'unverified_names_emails',
    title: 'Unverified Users — Full Names + Emails',
    description: 'Export unverified users with names and email addresses',
    icon: <UserX className="h-5 w-5" />,
  },
];

const AdminDownloads = () => {
  const navigate = useNavigate();
  const [loadingExport, setLoadingExport] = useState<ExportType | null>(null);

  const handleExport = async (exportType: ExportType) => {
    setLoadingExport(exportType);

    try {
      const { data, error } = await supabase.functions.invoke('admin-export-users', {
        body: { export_type: exportType },
      });

      if (error) {
        console.error('Export error:', error);
        toast.error('Export failed: ' + (error.message || 'Unknown error'));
        return;
      }

      if (!data) {
        toast.error('No data returned from export');
        return;
      }

      const { content, filename, record_count } = data;

      // Create a blob and trigger download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded (${record_count} users)`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingExport(null);
    }
  };

  return (
    <AdminRoute>
      <div className="min-h-screen bg-background relative">
        <MapBackground />
        <AppHeader showStatus={false} />

        <div className="container mx-auto px-4 py-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Button
              variant="ghost"
              onClick={() => navigate('/admin')}
              className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Admin Dashboard
            </Button>

            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Downloads
            </h1>
            <p className="text-muted-foreground">
              Export user lists as .txt files for offline use
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exportCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="p-5 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors h-full flex flex-col">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {card.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm leading-tight">
                        {card.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-muted-foreground text-xs mb-4 flex-1">
                    {card.description}
                  </p>

                  <div className="space-y-2">
                    <Button
                      onClick={() => handleExport(card.id)}
                      disabled={loadingExport !== null}
                      className="w-full gap-2 h-10"
                      size="sm"
                    >
                      {loadingExport === card.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Download .txt
                        </>
                      )}
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      One user per line
                    </p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </AdminRoute>
  );
};

export default AdminDownloads;
