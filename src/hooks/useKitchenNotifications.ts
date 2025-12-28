import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface UseKitchenNotificationsOptions {
  enabled?: boolean;
  onNewOrder?: (order: Order) => void;
  playSound?: boolean;
}

export function useKitchenNotifications({
  enabled = true,
  onNewOrder,
  playSound = true,
}: UseKitchenNotificationsOptions = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    if (playSound) {
      audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audioRef.current.volume = 0.5;
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

    console.log("Setting up kitchen realtime notifications...");

    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("New order received:", payload);
          const newOrder = payload.new as Order;

          // Play sound
          if (playSound) {
            playNotificationSound();
          }

          // Show toast notification
          toast.success(`Novo Pedido #${newOrder.order_number}`, {
            description: newOrder.table_number
              ? `Mesa ${newOrder.table_number}`
              : newOrder.customer_name || "Cliente",
            duration: 10000,
          });

          // Call callback
          onNewOrder?.(newOrder);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: "status=eq.confirmed",
        },
        (payload) => {
          console.log("Order confirmed:", payload);
          const order = payload.new as Order;

          if (playSound) {
            playNotificationSound();
          }

          toast.info(`Pedido #${order.order_number} confirmado`, {
            description: "Pronto para preparar",
            duration: 5000,
          });

          onNewOrder?.(order);
        }
      )
      .subscribe((status) => {
        console.log("Kitchen notification subscription status:", status);
      });

    return () => {
      console.log("Cleaning up kitchen notifications...");
      supabase.removeChannel(channel);
    };
  }, [enabled, onNewOrder, playSound, playNotificationSound]);

  return { playNotificationSound };
}
