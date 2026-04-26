import { LogIn, Menu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRuntimeConfig } from "../api/client";

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

export function TopNav() {
  const path = window.location.pathname;
  const navRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [entryBaseUrl, setEntryBaseUrl] = useState(window.location.origin);
  const [viewQrCode, setViewQrCode] = useState("");
  const publicMode = isActive(path, "/view");
  const hostMode = path.startsWith("/host");
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
    getRuntimeConfig()
      .then((config) => {
        if (live) setEntryBaseUrl(config.entryBaseUrl);
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

  return (
    <nav className="top-nav" aria-label="Application routes" ref={navRef}>
      <button
        type="button"
        className={`top-nav-trigger ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={publicMode ? "Login menu" : "Route menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {publicMode ? <LogIn size={15} /> : <Menu size={15} />}
        <span>{publicMode ? "Login" : "Menu"}</span>
      </button>
      {open ? (
        <div className="top-nav-menu" role="menu" aria-label={publicMode ? "Login links" : "Application links"}>
          {publicMode ? <p className="top-nav-caption">登入模式</p> : null}
          {menuItems.map((item) => (
            <a
              key={item.href}
              role="menuitem"
              className={isActive(path, item.href) ? "active" : ""}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
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
