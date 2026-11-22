import { Check, Copy, ExternalLink, Laptop, LogOut, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Confirm, Loading, Note, Page, Section, Segmented } from "../components/ui";
import { api, pairedAs } from "../lib/api";
import { shortDate } from "../lib/format";
import { type ThemeChoice, getThemeChoice, setThemeChoice } from "../lib/store";
import type { Device } from "../lib/types";

/** ZeroClaw's own dashboard, when the build was told where it is. */
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || null;

/** The device this browser became when it paired: same name, paired at that moment. */
function findSelf(devices: Device[]): string | null {
  const me = pairedAs();
  if (!me) return null;
  const match = devices
    .filter((d) => d.name === me.name)
    .map((d) => ({ id: d.id, gap: Math.abs(new Date(d.paired_at).getTime() - me.at) }))
    .sort((a, b) => a.gap - b.gap)[0];
  return match && match.gap < 60000 ? match.id : null;
}

function PairingCode() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      setCode(await api.pairingCode());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="font-medium">Add a browser or phone</p>
      <p className="mt-0.5 text-sm text-ink-2">
        Make a one-time code, open this site on the other device, and type the code there.
      </p>
      {code ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-code px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[15px]">{code}</code>
            <Button
              small
              onClick={() => {
                navigator.clipboard?.writeText(code).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            It works once and expires after a few minutes. Anyone with it gets full access to your agent.
          </p>
        </div>
      ) : (
        <Button variant="primary" className="mt-3" onClick={make} busy={busy}>
          Make a pairing code
        </Button>
      )}
      {error && <Note className="mt-3">Could not make a code: {error}</Note>}
    </div>
  );
}

export function Settings({ onSignOut }: { onSignOut: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);

  const load = useCallback(() => {
    api
      .devices()
      .then((d) => {
        setDevices(d.sort((a, b) => b.paired_at.localeCompare(a.paired_at)));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const self = devices ? findSelf(devices) : null;

  function revoke(d: Device) {
    setConfirm(null);
    api
      .revokeDevice(d.id)
      .then(() => (d.id === self ? onSignOut() : load()))
      .catch((e) => setError(`Could not remove it: ${e instanceof Error ? e.message : String(e)}`));
  }

  return (
    <Page title="Settings">
      <Section
        title="Paired devices"
        hint="Every browser that can use your agent. Remove the ones you no longer use."
      >
        <PairingCode />
        {error && <Note className="mt-3">{error}</Note>}
        {!devices && !error && <Loading what="devices" shape="rows" rows={4} />}
        {devices && (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {devices.map((d) => {
              const phone = /iOS|Android/i.test(d.name);
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {phone ? (
                      <Smartphone size={18} className="shrink-0 text-ink-3" />
                    ) : (
                      <Laptop size={18} className="shrink-0 text-ink-3" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {d.name}
                        {d.id === self && (
                          <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-normal">
                            This browser
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-3">
                        Paired {shortDate(d.paired_at)}
                        {d.ip_address ? ` · from ${d.ip_address}` : ""}
                      </p>
                    </div>
                    {confirm !== d.id && (
                      <Button small variant="danger-quiet" onClick={() => setConfirm(d.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {confirm === d.id && (
                    <div className="mt-3 border-t border-line pt-3">
                      <Confirm
                        question={
                          d.id === self
                            ? "This signs you out here. Remove it?"
                            : "It will have to pair again. Remove it?"
                        }
                        yes="Remove"
                        no="Keep"
                        onYes={() => revoke(d)}
                        onNo={() => setConfirm(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Appearance">
        <Segmented
          label="Theme"
          value={theme}
          onChange={(t) => {
            setThemeChoice(t);
            setTheme(t);
          }}
          options={[
            { value: "system", label: "Match system" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Section>

      <Section title="More">
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_URL && (
            <a
              href={DASHBOARD_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-panel"
            >
              <ExternalLink size={14} /> ZeroClaw's own dashboard
            </a>
          )}
          <Button onClick={onSignOut}>
            <LogOut size={14} /> Sign out of this browser
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          ZeroClaw's own dashboard has the settings this page does not: agent configuration, plugins and SOPs.
          Signing out keeps this browser in the list above until you remove it.
        </p>
      </Section>
    </Page>
  );
}
