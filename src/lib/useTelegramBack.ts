import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { inTelegram, onTelegramBack, showTelegramBack } from "./telegram";

/**
 * Inside Telegram, its Back button (top left) is shown on every screen but the one the app
 * was opened on, and goes back one screen. Outside Telegram this does nothing.
 */
export function useTelegramBack() {
  const { key } = useLocation();
  const navigate = useNavigate();

  // biome-ignore lint/correctness/useExhaustiveDependencies: look again after every navigation
  useEffect(() => {
    if (!inTelegram()) return;
    // react-router numbers its entries; 0 is the screen the app was opened on, whichever
    // page that was.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    showTelegramBack(idx > 0);
    if (idx === 0) return;
    return onTelegramBack(() => navigate(-1));
  }, [key, navigate]);
}
