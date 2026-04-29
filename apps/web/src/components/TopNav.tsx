import type {
  ModePreviewResult,
  OrderingMode,
  OrderingStatePayload
} from "@photo-grade/shared";
import { LogIn, LogOut, Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAuthStatus,
  getMode,
  getModePreview,
  getOrdering,
  getPresentationState,
  getRuntimeConfig,
  logout,
  setActiveOrdering,
  setDefaultOrdering,
  setFinalCutoff,
  setMode as setModeApi,
  setSecondaryThreshold,
  type AuthMode,
  type AuthStatus
} from "../api/client";
import { emitMode, onOrderingChanged, onSyncState } from "../api/socket";
import { modeLabel } from "../state/gallery";
import type { Mode } from "../types";
import { ModeSwitchDialog } from "./ModeSwitchDialog";

type RouteItem = {
  href: "/admin" | "/host" | "/score" | "/view";
  label: "Admin" | "Host" | "Score" | "View";
};

const PROTECTED_ROUTES: RouteItem[] = [
  { href: "/admin", label: "Admin" },
  { href: "/host", label: "Host" },
  { href: "/score", label: "Score" }
];

const ALL_ROUTES: RouteItem[] = [{ href: "/view", label: "View" }, ...PROTECTED_ROUTES];

const HOST_MODES: Mode[] = ["initial", "secondary", "final"];

function isActive(path: string, href: RouteItem["href"]) {
  if (href === "/view") return path === "/" || path.startsWith("/view");
  return path.startsWith(href);
}

function loginHref(): string {
  const returnTo = window.location.pathname || "/host";
  return `/auth/login?returnTo=${encodeURIComponent(returnTo === "/" ? "/host" : returnTo)}`;
}

export function TopNav() {
  const path = window.location.pathname;
  const navRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [entryBaseUrl, setEntryBaseUrl] = useState(window.location.origin);
  const [authMode, setAuthMode] = useState<AuthMode>("basic");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [viewQrCode, setViewQrCode] = useState("");
  const [hostMode, setHostMode] = useState<Mode>("initial");
  const [finalCutoff, setFinalCutoffState] = useState<number | null>(null);
  const [secondaryThreshold, setSecondaryThresholdState] = useState<number | null>(null);
  const [ordering, setOrdering] = useState<OrderingStatePayload | null>(null);
  const [orderingBusy, setOrderingBusy] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [previewResult, setPreviewResult] = useState<ModePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dialogTopN, setDialogTopN] = useState<number | null>(null);
  const [dialogThreshold, setDialogThreshold] = useState<number | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const previewReqId = useRef(0);
  const publicMode = isActive(path, "/view");
  const isHostPage = path.startsWith("/host");
  const isAuthenticated = authStatus?.authenticated ?? false;
  const showLogout = authMode === "oidc" && isAuthenticated;
  const menuItems = publicMode ? PROTECTED_ROUTES : ALL_ROUTES;
  const viewEntryUrl = useMemo(() => `${entryBaseUrl.replace(/\/+$/, "")}/view`, [entryBaseUrl]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (navRef.current && path.includes(navRef.current)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    let live = true;
    Promise.all([getRuntimeConfig(), getAuthStatus().catch(() => null)])
      .then(([config, status]) => {
        if (!live) return;
        setEntryBaseUrl(config.entryBaseUrl);
        setAuthMode(config.authMode);
        if (status) setAuthStatus(status);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !isHostPage) return;
    let live = true;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(viewEntryUrl, {
          width: 176,
          margin: 1,
          color: { dark: "#121212", light: "#ffffff" }
        })
      )
      .then((url) => {
        if (live) setViewQrCode(url);
      })
      .catch(() => {
        if (live) setViewQrCode("");
      });
    return () => {
      live = false;
    };
  }, [open, isHostPage, viewEntryUrl]);

  useEffect(() => {
    if (!isHostPage) return;
    let live = true;
    getMode()
      .then((mode) => {
        if (live) setHostMode(mode);
      })
      .catch(() => undefined);
    getPresentationState()
      .then((state) => {
        if (!live) return;
        if (typeof state.finalCutoff === "number") setFinalCutoffState(state.finalCutoff);
        setSecondaryThresholdState(
          typeof state.secondaryThreshold === "number" ? state.secondaryThreshold : null
        );
      })
      .catch(() => undefined);
    const off = onSyncState((state) => {
      if (!live) return;
      if (state.mode) setHostMode(state.mode);
      const cutoff = (state as { finalCutoff?: unknown }).finalCutoff;
      if (typeof cutoff === "number") setFinalCutoffState(cutoff);
      const threshold = (state as { secondaryThreshold?: unknown }).secondaryThreshold;
      if (typeof threshold === "number") setSecondaryThresholdState(threshold);
      else if (threshold === null) setSecondaryThresholdState(null);
    });
    return () => {
      live = false;
      off();
    };
  }, [isHostPage]);

  useEffect(() => {
    if (!isHostPage) return;
    let live = true;
    getOrdering()
      .then((state) => {
        if (live) setOrdering(state);
      })
      .catch(() => undefined);
    const off = onOrderingChanged((state) => {
      if (live) setOrdering(state);
    });
    return () => {
      live = false;
      off();
    };
  }, [isHostPage]);

  const handleLoginLink = (href: RouteItem["href"]) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    if (publicMode && authMode === "oidc" && !isAuthenticated) {
      event.preventDefault();
      window.location.href = `/auth/login?returnTo=${encodeURIComponent(href)}`;
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      const result = await logout();
      window.location.href = result.redirect ?? "/view";
    } catch {
      window.location.href = "/view";
    }
  };

  const fetchPreview = useCallback(
    async (mode: Mode, topN: number | null, threshold: number | null) => {
      const reqId = ++previewReqId.current;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const options: { topN?: number; threshold?: number } = {};
        if (topN !== null) options.topN = topN;
        if (threshold !== null) options.threshold = threshold;
        const result = await getModePreview(mode, options);
        if (previewReqId.current !== reqId) return;
        setPreviewResult(result);
        if (mode === "final") {
          setDialogTopN((current) => current ?? result.currentTopN);
        }
        if (mode === "secondary" && typeof result.currentThreshold === "number") {
          setDialogThreshold((current) => current ?? result.currentThreshold!);
        }
      } catch (error) {
        if (previewReqId.current !== reqId) return;
        setPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        if (previewReqId.current === reqId) setPreviewLoading(false);
      }
    },
    []
  );

  const closeDialog = useCallback(() => {
    setPendingMode(null);
    setPreviewResult(null);
    setPreviewError(null);
    setDialogTopN(null);
    setDialogThreshold(null);
    setConfirmBusy(false);
    setPreviewLoading(false);
    previewReqId.current += 1;
  }, []);

  const handleSelectMode = (mode: Mode) => {
    if (mode === hostMode) return;
    if (pendingMode) return;
    setOpen(false);
    setPendingMode(mode);
    setPreviewResult(null);
    setPreviewError(null);
    setConfirmBusy(false);
    const initialTopN = mode === "final" ? finalCutoff : null;
    const initialThreshold = mode === "secondary" ? secondaryThreshold : null;
    setDialogTopN(initialTopN);
    setDialogThreshold(initialThreshold);
    void fetchPreview(mode, initialTopN, initialThreshold);
  };

  const handleDialogTopNChange = useCallback((next: number | null) => {
    setDialogTopN(next);
  }, []);

  const handleDialogThresholdChange = useCallback((next: number | null) => {
    setDialogThreshold(next);
  }, []);

  const handleDialogRefresh = useCallback(() => {
    if (!pendingMode) return;
    const topN = pendingMode === "final" ? dialogTopN : null;
    const threshold = pendingMode === "secondary" ? dialogThreshold : null;
    void fetchPreview(pendingMode, topN, threshold);
  }, [pendingMode, dialogTopN, dialogThreshold, fetchPreview]);

  const handleDialogConfirm = useCallback(async () => {
    if (!pendingMode) return;
    setConfirmBusy(true);
    try {
      if (pendingMode === "final" && dialogTopN !== null && dialogTopN !== finalCutoff) {
        await setFinalCutoff(dialogTopN);
        setFinalCutoffState(dialogTopN);
      }
      if (
        pendingMode === "secondary" &&
        dialogThreshold !== null &&
        dialogThreshold !== secondaryThreshold
      ) {
        await setSecondaryThreshold(dialogThreshold);
        setSecondaryThresholdState(dialogThreshold);
      }
      await setModeApi(pendingMode);
      setHostMode(pendingMode);
      emitMode(pendingMode);
      closeDialog();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
      setConfirmBusy(false);
    }
  }, [pendingMode, dialogTopN, dialogThreshold, finalCutoff, secondaryThreshold, closeDialog]);

  const handleSelectOrdering = (next: OrderingMode) => {
    if (orderingBusy) return;
    if (!ordering) return;
    if (next === ordering.activeMode) return;
    setOrderingBusy(true);
    const previous = ordering;
    setOrdering({ ...ordering, activeMode: next });
    const request = next === "shuffle" && !ordering.hasShuffle
      ? setActiveOrdering(next).then((state) => {
          if (state.hasShuffle) return state;
          return setDefaultOrdering({ defaultMode: "shuffle" });
        })
      : setActiveOrdering(next);
    request
      .then((state) => setOrdering(state))
      .catch(() => setOrdering(previous))
      .finally(() => setOrderingBusy(false));
  };

  const triggerLabel = publicMode && !isAuthenticated ? "Login menu" : "Route menu";

  return (
    <nav className="top-nav" aria-label="Application routes" ref={navRef}>
      <button
        type="button"
        className={`top-nav-trigger top-nav-trigger--icon ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {publicMode && !isAuthenticated ? <LogIn size={16} /> : <Menu size={16} />}
      </button>
      {open ? (
        <div className="top-nav-menu" role="menu" aria-label={publicMode ? "Login links" : "Application links"}>
          {publicMode && !isAuthenticated ? <p className="top-nav-caption">登入模式</p> : null}
          {publicMode && authMode === "oidc" && !isAuthenticated ? (
            <a
              role="menuitem"
              href={loginHref()}
              onClick={() => setOpen(false)}
            >
              使用 OIDC 登入
            </a>
          ) : (
            menuItems.map((item) => (
              <a
                key={item.href}
                role="menuitem"
                className={isActive(path, item.href) ? "active" : ""}
                href={item.href}
                onClick={handleLoginLink(item.href)}
              >
                {item.label}
              </a>
            ))
          )}
          {showLogout ? (
            <button
              type="button"
              role="menuitem"
              className="top-nav-logout"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          ) : null}
          {isHostPage ? (
            <section className="top-nav-qr">
              <p>Scan to open View mode</p>
              {viewQrCode ? (
                <img src={viewQrCode} alt={`QR code for ${viewEntryUrl}`} />
              ) : (
                <div className="top-nav-qr-loading">Generating QR code...</div>
              )}
              <a href={viewEntryUrl} target="_blank" rel="noreferrer">
                {viewEntryUrl}
              </a>
            </section>
          ) : null}
          {isHostPage ? (
            <section className="top-nav-mode" aria-label="順序模式">
              <p>順序模式</p>
              <div className="top-nav-mode-buttons">
                <button
                  type="button"
                  className={`top-nav-mode-btn${ordering?.activeMode === "sequential" ? " active" : ""}`}
                  onClick={() => handleSelectOrdering("sequential")}
                  disabled={orderingBusy || !ordering}
                  aria-pressed={ordering?.activeMode === "sequential"}
                >
                  順序
                </button>
                <button
                  type="button"
                  className={`top-nav-mode-btn${ordering?.activeMode === "shuffle" ? " active" : ""}`}
                  onClick={() => handleSelectOrdering("shuffle")}
                  disabled={orderingBusy || !ordering}
                  aria-pressed={ordering?.activeMode === "shuffle"}
                  title={ordering && !ordering.hasShuffle ? "首次切換會自動建立亂序排序" : undefined}
                >
                  亂序
                </button>
              </div>
              {ordering && !ordering.hasShuffle ? (
                <p className="top-nav-caption">尚未建立亂序排序，切換到亂序時會自動建立。</p>
              ) : null}
            </section>
          ) : null}
          {isHostPage ? (
            <section className="top-nav-mode" aria-label="評審模式">
              <p>評審模式</p>
              <div className="top-nav-mode-buttons">
                {HOST_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`top-nav-mode-btn${mode === hostMode ? " active" : ""}`}
                    onClick={() => handleSelectMode(mode)}
                  >
                    {modeLabel(mode)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {pendingMode ? (
        <ModeSwitchDialog
          fromMode={hostMode}
          toMode={pendingMode}
          preview={previewResult}
          loading={previewLoading || confirmBusy}
          error={previewError}
          topN={dialogTopN}
          threshold={dialogThreshold}
          onTopNChange={handleDialogTopNChange}
          onThresholdChange={handleDialogThresholdChange}
          onRefresh={handleDialogRefresh}
          onConfirm={handleDialogConfirm}
          onCancel={closeDialog}
        />
      ) : null}
    </nav>
  );
}
