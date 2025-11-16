import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useTypingIndicator = (roomId: string, roomType: string, currentUserId: string | null) => {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId || !roomId) return;

    // Subscribe to typing indicators
    const channel = supabase
      .channel(`typing-${roomType}-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_typing_indicators',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const userId = (payload.new as any).user_id;
            if (userId !== currentUserId) {
              setTypingUsers(prev => new Set(prev).add(userId));
            }
          } else if (payload.eventType === 'DELETE') {
            const userId = (payload.old as any).user_id;
            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(userId);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, roomType, currentUserId]);

  const setTyping = async (isTyping: boolean) => {
    if (!currentUserId || !roomId) return;

    try {
      if (isTyping) {
        await supabase
          .from('chat_typing_indicators')
          .upsert({
            user_id: currentUserId,
            room_id: roomId,
            room_type: roomType,
            updated_at: new Date().toISOString()
          });
      } else {
        await supabase
          .from('chat_typing_indicators')
          .delete()
          .eq('user_id', currentUserId)
          .eq('room_id', roomId)
          .eq('room_type', roomType);
      }
    } catch (error) {
      console.error('Error updating typing indicator:', error);
    }
  };

  return { typingUsers: Array.from(typingUsers), setTyping };
};
