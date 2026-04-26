import { LogIn, LogOut, Menu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthStatus, getRuntimeConfig, logout, type AuthMode, type AuthStatus } from "../api/client";

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
  const publicMode = isActive(path, "/view");
  const hostMode = path.startsWith("/host");
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
    if (!open || !hostMode) return;
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
  }, [open, hostMode, viewEntryUrl]);

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

  return (
    <nav className="top-nav" aria-label="Application routes" ref={navRef}>
      <button
        type="button"
        className={`top-nav-trigger ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={publicMode && !isAuthenticated ? "Login menu" : "Route menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {publicMode && !isAuthenticated ? <LogIn size={15} /> : <Menu size={15} />}
        <span>{publicMode && !isAuthenticated ? "Login" : "Menu"}</span>
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
          {hostMode ? (
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
        </div>
      ) : null}
    </nav>
  );
}
