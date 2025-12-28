import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface UseWaiterNotificationsOptions {
  enabled?: boolean;
  onOrderReady?: (order: Order) => void;
  playSound?: boolean;
}

export function useWaiterNotifications({
  enabled = true,
  onOrderReady,
  playSound = true,
}: UseWaiterNotificationsOptions = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio - using a different sound for waiters
  useEffect(() => {
    if (playSound) {
      audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
      audioRef.current.volume = 0.6;
    }
    return () => {
      audioRef.current = null;
    };
  }, [playSound]);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    console.log("Setting up waiter realtime notifications...");

    const channel = supabase
      .channel("waiter-orders")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const newOrder = payload.new as Order;
          const oldOrder = payload.old as Order;

          // Only notify when status changes to "ready"
          if (newOrder.status === "ready" && oldOrder.status !== "ready") {
            console.log("Order is ready:", payload);

            // Play sound
            if (playSound) {
              playNotificationSound();
            }

            // Show toast notification
            toast.success(`Pedido #${newOrder.order_number} está pronto!`, {
              description: newOrder.table_number
                ? `Mesa ${newOrder.table_number} - Pronto para servir`
                : "Pronto para entrega",
              duration: 15000,
              action: {
                label: "Ver",
                onClick: () => {
                  // Could navigate to order details
                },
              },
            });

            // Call callback
            onOrderReady?.(newOrder);
          }
        }
      )
      .subscribe((status) => {
        console.log("Waiter notification subscription status:", status);
      });

    return () => {
      console.log("Cleaning up waiter notifications...");
      supabase.removeChannel(channel);
    };
  }, [enabled, onOrderReady, playSound, playNotificationSound]);

  return { playNotificationSound };
}
