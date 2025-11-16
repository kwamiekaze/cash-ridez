import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useReadReceipts = (messageType: string, currentUserId: string | null, enabled: boolean = true) => {
  const [readReceipts, setReadReceipts] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!currentUserId || !enabled) return;

    // Subscribe to read receipts
    const channel = supabase
      .channel(`read-receipts-${messageType}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_read_receipts',
          filter: `message_type=eq.${messageType}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const receipt = payload.new as any;
            setReadReceipts(prev => {
              const next = new Map(prev);
              const readers = next.get(receipt.message_id) || [];
              if (!readers.includes(receipt.user_id)) {
                next.set(receipt.message_id, [...readers, receipt.user_id]);
              }
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageType, currentUserId, enabled]);

  const markAsRead = async (messageId: string) => {
    if (!currentUserId || !enabled) return;

    try {
      await supabase
        .from('message_read_receipts')
        .upsert({
          message_id: messageId,
          message_type: messageType,
          user_id: currentUserId,
          read_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const getReadBy = (messageId: string): string[] => {
    return readReceipts.get(messageId) || [];
  };

  return { markAsRead, getReadBy };
};
