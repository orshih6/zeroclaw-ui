import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { inTelegram, onTelegramBack, showTelegramBack } from "./telegram";

/**
 * Inside Telegram, its Back button (top left) is shown on every screen but the first, and
 * goes back one screen. Outside Telegram this does nothing.
 */
export function useTelegramBack() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const home = pathname === "/";

  useEffect(() => {
    if (!inTelegram()) return;
    showTelegramBack(!home);
    if (home) return;
    return onTelegramBack(() => {
      // react-router numbers its entries; 0 is the screen the app was opened on.
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate("/", { replace: true });
    });
  }, [home, navigate]);
}
