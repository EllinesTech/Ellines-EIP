'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ConnectorPackDto,
  createPlatformConnectorPack,
  FeatureFlag,
  fetchPlatformOrgDateTimeSettings,
  getSession,
  listInstallations,
  listPlatformConnectorPacks,
  listPlatformFlags,
  listPlatformOrgs,
  PlatformOrg,
  updatePlatformOrgDateTimeSettings,
  updatePlatformOrgStatus,
  type ConnectorInstallationDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import { formatOrgDateTime } from '@ellines-eip/shared';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [packs, setPacks] = useState<ConnectorPackDto[]>([]);
  const [installations, setInstallations] = useState<ConnectorInstallationDto[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [catalogId, setCatalogId] = useState('openapi');
  const [fromInstallationId, setFromInstallationId] = useState('');

  const [settingsOrgId, setSettingsOrgId] = useState('');
  const [timeFormat, setTimeFormat] = useState<OrgDateTimeSettingsDto['timeFormat']>('12h');
  const [dateStyle, setDateStyle] = useState<OrgDateTimeSettingsDto['dateStyle']>('short');
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!s.isPlatformAdmin) {
      router.replace('/app');
      return;
    }
    setAllowed(true);
  }, [router]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [o, f, p, inst] = await Promise.all([
        listPlatformOrgs(),
        listPlatformFlags(),
        listPlatformConnectorPacks(),
        listInstallations().catch(() => [] as ConnectorInstallationDto[]),
      ]);
      setOrgs(o);
      setFlags(f);
      setPacks(p);
      setInstallations(inst);
      if (!settingsOrgId && o[0]) {
        setSettingsOrgId(o[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !settingsOrgId) return;
    let cancelled = false;
    setSettingsBusy(true);
    fetchPlatformOrgDateTimeSettings(settingsOrgId)
      .then((prefs) => {
        if (cancelled) return;
        setTimeFormat(prefs.timeFormat);
        setDateStyle(prefs.dateStyle);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load org date settings');
      })
      .finally(() => {
        if (!cancelled) setSettingsBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, settingsOrgId]);

  async function onSaveOrgDateTime() {
    if (!settingsOrgId) return;
    setSettingsBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await updatePlatformOrgDateTimeSettings(settingsOrgId, {
        timeFormat,
        dateStyle,
      });
      setTimeFormat(saved.timeFormat);
      setDateStyle(saved.dateStyle);
      setNotice('Tenant date & time saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save org date settings');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function onToggleOrgStatus(org: PlatformOrg) {
    const next = org.status === 'suspended' ? 'active' : 'suspended';
    const label = next === 'suspended' ? 'Suspend' : 'Resume';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`${label} organization “${org.name}”? ${
        next === 'suspended'
          ? 'Users will not be able to sign in; connector sync is blocked.'
          : 'Users can sign in again.'
      }`)
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await updatePlatformOrgStatus(org.id, next);
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setNotice(
        next === 'suspended'
          ? `Suspended ${updated.name}.`
          : `Resumed ${updated.name}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization status');
    } finally {
      setBusy(false);
    }
  }

  async function onSavePack() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const pack = await createPlatformConnectorPack({
        slug,
        name,
        description,
        catalogId: fromInstallationId
          ? installations.find((i) => i.id === fromInstallationId)?.catalogId || catalogId
          : catalogId,
        fromInstallationId: fromInstallationId || undefined,
      });
      setNotice(
        `Published pack “${pack.name}” (${pack.slug}). Org IT can install with credentials only.`,
      );
      setSlug('');
      setName('');
      setDescription('');
      setFromInstallationId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pack');
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking platform access…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Platform Super Admin</p>
          <h1>Ellines operators</h1>
          <p className={styles.lede}>
            Tenants, feature flags, and connector packs — freeze a working install so the next customer
            only enters credentials. Grant via <code>PLATFORM_ADMIN_EMAILS</code>.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenant date &amp; time</div>
        <p className={styles.lede}>
          Set 12/24-hour and short/log date style for any organization. Org Owner/IT Admin can also
          change this under Settings for their own tenant.
        </p>
        <div className={adminStyles.form}>
          <label>
            Organization
            <select
              value={settingsOrgId}
              disabled={settingsBusy || orgs.length === 0}
              onChange={(e) => setSettingsOrgId(e.target.value)}
            >
              {orgs.length === 0 ? <option value="">No tenants</option> : null}
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time format
            <select
              value={timeFormat}
              disabled={settingsBusy || !settingsOrgId}
              onChange={(e) =>
                setTimeFormat(e.target.value as OrgDateTimeSettingsDto['timeFormat'])
              }
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </label>
          <label>
            Date style
            <select
              value={dateStyle}
              disabled={settingsBusy || !settingsOrgId}
              onChange={(e) =>
                setDateStyle(e.target.value as OrgDateTimeSettingsDto['dateStyle'])
              }
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="log">Log (YYYY-MM-DD)</option>
            </select>
          </label>
          <label>
            Preview
            <input
              readOnly
              value={(() => {
                const p = formatOrgDateTime(new Date(), { timeFormat, dateStyle });
                return `${p.day} · ${p.time}`;
              })()}
            />
          </label>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={settingsBusy || !settingsOrgId}
            onClick={() => void onSaveOrgDateTime()}
          >
            {settingsBusy ? 'Saving…' : 'Save for tenant'}
          </button>
        </div>
      </section>

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Tenants</span>
          <strong>{loading ? '—' : String(orgs.length)}</strong>
          <em>Organizations</em>
        </article>
        <article className={styles.kpi}>
          <span>Connector packs</span>
          <strong>{loading ? '—' : String(packs.length)}</strong>
          <em>Published templates</em>
        </article>
        <article className={styles.kpi}>
          <span>Feature flags</span>
          <strong>{loading ? '—' : String(flags.length)}</strong>
          <em>Scaffold only</em>
        </article>
        <article className={styles.kpi}>
          <span>Pages</span>
          <strong className={styles.ready}>Live</strong>
          <em className={styles.pos}>eip.ellines.co.ke</em>
        </article>
      </div>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Save as connector pack</div>
        <p className={styles.lede}>
          Publish a pack from a working installation in your operator org, or define a blank template.
          Secrets are stripped — Org IT supplies credentials at install time.
        </p>
        <div className={adminStyles.form}>
          <label>
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="hospidia-read"
            />
          </label>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hospidia — Patients / Billing (read)"
            />
          </label>
          <label>
            Catalog
            <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              <option value="openapi">openapi</option>
              <option value="rest-api">rest-api</option>
              <option value="postgres">postgres</option>
              <option value="sqlserver">sqlserver</option>
              <option value="mysql">mysql</option>
              <option value="csv-file">csv-file</option>
              <option value="email-imap">email-imap</option>
              <option value="sftp">sftp</option>
            </select>
          </label>
          <label>
            From installation (optional)
            <select
              value={fromInstallationId}
              onChange={(e) => setFromInstallationId(e.target.value)}
            >
              <option value="">— blank template —</option>
              {installations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.displayName} ({i.catalogId})
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Read-only sync for Hospidia reporting"
            />
          </label>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={busy || !slug.trim() || !name.trim()}
            onClick={() => void onSavePack()}
          >
            {busy ? 'Saving…' : 'Publish pack'}
          </button>
        </div>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Connector packs</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : packs.length === 0 ? (
          <p className={styles.lede}>No packs yet — publish one above after a working install.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Catalog</th>
                <th>Published</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>{p.name}</div>
                    {p.description ? (
                      <div style={{ fontSize: '0.78rem', color: '#8b95a8' }}>{p.description}</div>
                    ) : null}
                  </td>
                  <td>{p.slug}</td>
                  <td>{p.catalogId}</td>
                  <td>{p.published ? 'Yes' : 'No'}</td>
                  <td>{p.createdByEmail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenants</div>
        <p className={styles.lede}>
          Suspend blocks tenant login and connector sync. Platform operators on the allowlist can
          still sign in to manage the org.
        </p>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.slug}</td>
                  <td>{o.userCount}</td>
                  <td>{o.status === 'suspended' ? 'Suspended' : 'Active'}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => void onToggleOrgStatus(o)}
                    >
                      {o.status === 'suspended' ? 'Resume' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Feature flags (placeholder)</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Flag</th>
                <th>State</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{f.enabled ? 'On' : 'Off'}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
