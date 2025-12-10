import { useEffect, useRef, useCallback } from 'react';

/**
 * Global notification sound manager
 * Handles audio preloading, permission, and reliable playback across all app states
 */
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUnlockedRef = useRef(false);

  // Initialize audio element with preload
  useEffect(() => {
    // Try to get existing audio element first
    let audio = document.getElementById('customNotify') as HTMLAudioElement;
    
    if (!audio) {
      // Create audio element if it doesn't exist
      audio = document.createElement('audio');
      audio.id = 'customNotify';
      audio.preload = 'auto';
      audio.src = '/sounds/notification.mp3';
      document.body.appendChild(audio);
    }
    
    audioRef.current = audio;

    // Preload the audio
    audio.load();

    // Listen for service worker messages to play sound
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
        playSound();
      }
      if (event.data?.type === 'NOTIFICATION_CLICKED' && event.data.link) {
        window.location.href = event.data.link;
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, []);

  // Unlock audio on first user interaction (required for iOS)
  const unlockAudio = useCallback(() => {
    if (isUnlockedRef.current) return;
    
    const audio = audioRef.current;
    if (audio) {
      // Play silent audio to unlock
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        isUnlockedRef.current = true;
        console.log('[NotificationSound] Audio unlocked for playback');
      }).catch((e) => {
        console.log('[NotificationSound] Audio unlock pending user interaction:', e.message);
      });
    }
  }, []);

  // Set up user interaction listeners to unlock audio
  useEffect(() => {
    const events = ['click', 'touchstart', 'keydown'];
    
    const handleInteraction = () => {
      unlockAudio();
      // Remove listeners after first interaction
      if (isUnlockedRef.current) {
        events.forEach(event => {
          document.removeEventListener(event, handleInteraction);
        });
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { once: false, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [unlockAudio]);

  // Play the notification sound
  const playSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      console.warn('[NotificationSound] Audio element not found');
      return;
    }

    try {
      // Reset and play
      audio.currentTime = 0;
      audio.volume = 1;
      
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn('[NotificationSound] Playback failed:', error.message);
          // Try to unlock and retry once
          if (error.name === 'NotAllowedError') {
            unlockAudio();
          }
        });
      }
    } catch (error) {
      console.error('[NotificationSound] Error playing sound:', error);
    }
  }, [unlockAudio]);

  // Expose globally for other components
  useEffect(() => {
    (window as any).playNotificationSound = playSound;
    (window as any).unlockNotificationSound = unlockAudio;
    
    return () => {
      delete (window as any).playNotificationSound;
      delete (window as any).unlockNotificationSound;
    };
  }, [playSound, unlockAudio]);

  return {
    playSound,
    unlockAudio,
    isUnlocked: isUnlockedRef.current
  };
}

/**
 * Standalone function to play notification sound
 * Can be called from anywhere in the app
 */
export function playNotificationSound() {
  if (typeof (window as any).playNotificationSound === 'function') {
    (window as any).playNotificationSound();
  } else {
    // Fallback: try to play directly
    const audio = document.getElementById('customNotify') as HTMLAudioElement;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch((e) => console.log('Audio play failed:', e));
    }
  }
}
