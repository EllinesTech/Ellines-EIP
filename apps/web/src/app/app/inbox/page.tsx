'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  addInboxAccount,
  deleteInboxAccount,
  fetchInboxAccounts,
  fetchInboxMessage,
  fetchInboxMessageSummary,
  fetchInboxMessages,
  getSession,
  markInboxMessageRead,
  syncAllInboxAccounts,
  syncInboxAccount,
  testInboxAccount,
  updateInboxAccount,
  type AddEmailAccountDto,
  type EmailAccountDto,
  type EmailMessageDto,
} from '@/lib/api';
import styles from '../command.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'inbox' | 'message' | 'add-account';
type Filter = 'all' | 'unread' | 'high' | 'critical';

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f59e0b',
  medium:   '#3b82f6',
  low:      '#6b7280',
};

const PROVIDER_LABELS: Record<string, string> = {
  gmail:    'Gmail',
  outlook:  'Outlook',
  exchange: 'Exchange',
  custom:   'Custom IMAP',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)   return 'just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)   return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7)   return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// ─── Add account form ─────────────────────────────────────────────────────────

function AddAccountForm({
  onSaved,
  onCancel,
}: {
  onSaved: (account: EmailAccountDto) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AddEmailAccountDto>({
    emailAddress: '',
    provider: 'gmail',
    appPassword: '',
    displayMode: 'summary',
    pollIntervalSeconds: 300,
    label: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const set = (field: keyof AddEmailAccountDto, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const imapHint = {
    gmail:    'imap.gmail.com:993 (use an App Password — myaccount.google.com → Security → App passwords)',
    outlook:  'imap-mail.outlook.com:993 (use your Microsoft account password or app password)',
    exchange: 'outlook.office365.com:993 (Microsoft 365 app password)',
    custom:   'Enter the IMAP hostname and port below',
  }[form.provider];

  async function handleSave() {
    setError('');
    if (!form.emailAddress.trim()) { setError('Email address is required'); return; }
    if (!form.appPassword.trim())  { setError('App password is required'); return; }
    setBusy(true);
    try {
      const res = await addInboxAccount(form);
      if (!res.success) throw new Error('Failed to save account');
      setSavedId(res.data.id);
      onSaved(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    if (!savedId) { setTestResult('Save the account first, then test.'); return; }
    setBusy(true);
    setTestResult(null);
    try {
      const res = await testInboxAccount(savedId);
      setTestResult(res.data.ok ? '✓ Connection successful' : `✗ ${res.data.error ?? 'Connection failed'}`);
    } catch (e) {
      setTestResult(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', color: '#f4f7fb' }}>
        Connect Email Account
      </h2>

      {/* Provider */}
      <label style={labelStyle}>Provider</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['gmail', 'outlook', 'exchange', 'custom'] as const).map(p => (
          <button key={p} onClick={() => set('provider', p)}
            style={{ ...chipStyle, background: form.provider === p ? '#6F2D8D' : '#1a2030',
              borderColor: form.provider === p ? '#9b4dca' : 'rgba(255,255,255,0.1)' }}>
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      <p style={{ fontSize: '0.78rem', color: '#8b95a8', marginBottom: '1rem', lineHeight: 1.5 }}>{imapHint}</p>

      {/* Email address */}
      <label style={labelStyle}>Email Address</label>
      <input style={inputStyle} type="email" placeholder="you@gmail.com"
        value={form.emailAddress} onChange={e => set('emailAddress', e.target.value)} />

      {/* App password */}
      <label style={labelStyle}>App Password</label>
      <input style={inputStyle} type="password" placeholder="xxxx xxxx xxxx xxxx"
        value={form.appPassword} onChange={e => set('appPassword', e.target.value)} />

      {/* Custom host/port */}
      {form.provider === 'custom' && (
        <>
          <label style={labelStyle}>IMAP Host</label>
          <input style={inputStyle} type="text" placeholder="mail.yourdomain.com"
            value={form.customHost ?? ''} onChange={e => set('customHost', e.target.value)} />
          <label style={labelStyle}>Port</label>
          <input style={{ ...inputStyle, width: 100 }} type="number" placeholder="993"
            value={form.customPort ?? 993} onChange={e => set('customPort', Number(e.target.value))} />
        </>
      )}

      {/* Label */}
      <label style={labelStyle}>Label (optional)</label>
      <input style={inputStyle} type="text" placeholder="e.g. Sales Inbox"
        value={form.label ?? ''} onChange={e => set('label', e.target.value)} />

      {/* Display mode */}
      <label style={labelStyle}>Default View</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        {(['summary', 'full'] as const).map(m => (
          <button key={m} onClick={() => set('displayMode', m)}
            style={{ ...chipStyle, background: form.displayMode === m ? '#2563EB' : '#1a2030',
              borderColor: form.displayMode === m ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
            {m === 'summary' ? '✦ Ellinea Summary' : '📧 Full Email'}
          </button>
        ))}
      </div>

      {/* Poll interval */}
      <label style={labelStyle}>Check for new emails every</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[60, 300, 600, 1800].map(s => (
          <button key={s} onClick={() => set('pollIntervalSeconds', s)}
            style={{ ...chipStyle, background: form.pollIntervalSeconds === s ? '#1e3a5f' : '#1a2030',
              borderColor: form.pollIntervalSeconds === s ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
            {s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
      {testResult && (
        <p style={{ color: testResult.startsWith('✓') ? '#10b981' : '#ef4444',
          fontSize: '0.82rem', marginBottom: '0.75rem' }}>{testResult}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={busy} style={primaryBtnStyle}>
          {busy ? 'Saving…' : savedId ? 'Saved ✓' : 'Save Account'}
        </button>
        {savedId && (
          <button onClick={handleTest} disabled={busy} style={ghostBtnStyle}>
            Test Connection
          </button>
        )}
        <button onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Message view ─────────────────────────────────────────────────────────────

function MessageView({
  message,
  onBack,
}: {
  message: EmailMessageDto;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState(message.aiSummary);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [viewMode, setViewMode] = useState<'full' | 'summary'>(
    message.aiSummary ? 'summary' : 'full',
  );

  async function loadSummary() {
    if (summary) { setViewMode('summary'); return; }
    setSummaryBusy(true);
    try {
      const res = await fetchInboxMessageSummary(message.id);
      setSummary(res.data.summary);
      setViewMode('summary');
    } finally {
      setSummaryBusy(false);
    }
  }

  const urgencyColor = URGENCY_COLORS[message.urgencyLevel] ?? '#6b7280';

  return (
    <div>
      <button onClick={onBack} style={{ ...ghostBtnStyle, marginBottom: '1.25rem' }}>
        ← Back to inbox
      </button>

      <div style={{ background: '#161b26', borderRadius: 10, padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '0.85rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f4f7fb', margin: 0, flex: 1 }}>
            {message.subject || '(no subject)'}
          </h2>
          <span style={{ background: urgencyColor + '22', color: urgencyColor, border: `1px solid ${urgencyColor}44`,
            borderRadius: 6, padding: '2px 10px', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {message.urgencyLevel.toUpperCase()}
          </span>
        </div>

        <div style={{ fontSize: '0.82rem', color: '#8b95a8', marginBottom: '1rem', lineHeight: 1.6 }}>
          <span style={{ color: '#c4cadc' }}>From:</span> {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}
          <br />
          <span style={{ color: '#c4cadc' }}>To:</span> {message.toAddresses.join(', ')}
          <br />
          <span style={{ color: '#c4cadc' }}>Received:</span> {new Date(message.receivedAt).toLocaleString()}
          <br />
          <span style={{ color: '#c4cadc' }}>Category:</span> {message.category}
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <button onClick={() => setViewMode('full')}
            style={{ ...chipStyle, background: viewMode === 'full' ? '#1e3a5f' : '#1a2030',
              borderColor: viewMode === 'full' ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
            📧 Full Email
          </button>
          <button onClick={loadSummary} disabled={summaryBusy}
            style={{ ...chipStyle, background: viewMode === 'summary' ? '#2d1a4a' : '#1a2030',
              borderColor: viewMode === 'summary' ? '#9b4dca' : 'rgba(255,255,255,0.1)' }}>
            {summaryBusy ? 'Generating…' : '✦ Ellinea Summary'}
          </button>
        </div>

        {/* Body */}
        <div style={{ background: '#0f1420', borderRadius: 8, padding: '1.25rem',
          fontSize: '0.86rem', color: '#d4dae8', lineHeight: 1.75, whiteSpace: 'pre-wrap',
          maxHeight: '60vh', overflowY: 'auto', fontFamily: 'monospace' }}>
          {viewMode === 'summary'
            ? (summary ?? 'No summary available.')
            : (message.bodyText || '(empty body)')}
        </div>
      </div>
    </div>
  );
}

// ─── Account settings row ─────────────────────────────────────────────────────

function AccountRow({
  account,
  onSync,
  onDelete,
  onToggleMode,
}: {
  account: EmailAccountDto;
  onSync: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleMode: (id: string, mode: 'full' | 'summary') => void;
}) {
  const nextMode = account.displayMode === 'summary' ? 'full' : 'summary';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, fontSize: '0.85rem', color: '#f4f7fb', minWidth: 180 }}>
        <span style={{ fontWeight: 600 }}>{account.label}</span>
        <span style={{ color: '#8b95a8', marginLeft: 6, fontSize: '0.78rem' }}>{account.emailAddress}</span>
      </span>
      <span style={{ fontSize: '0.74rem', color: '#8b95a8' }}>
        {PROVIDER_LABELS[account.provider] ?? account.provider}
      </span>
      <span style={{ fontSize: '0.74rem', color: account.lastError ? '#ef4444' : '#10b981' }}>
        {account.lastError ? `Error: ${account.lastError.slice(0, 40)}` : (account.lastSyncedAt ? `Synced ${formatDate(account.lastSyncedAt)}` : 'Never synced')}
      </span>
      <button onClick={() => onToggleMode(account.id, nextMode)} style={{ ...chipStyle, fontSize: '0.73rem' }}>
        {account.displayMode === 'summary' ? '✦ Summary' : '📧 Full'}
      </button>
      <button onClick={() => onSync(account.id)} style={{ ...chipStyle, fontSize: '0.73rem' }}>↻ Sync</button>
      <button onClick={() => onDelete(account.id)}
        style={{ ...chipStyle, fontSize: '0.73rem', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
        Remove
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const session = getSession();
  const isAdmin = isOrgAdminRole(session?.user?.role ?? '');

  const [view, setView]           = useState<View>('inbox');
  const [filter, setFilter]       = useState<Filter>('all');
  const [accounts, setAccounts]   = useState<EmailAccountDto[]>([]);
  const [messages, setMessages]   = useState<EmailMessageDto[]>([]);
  const [total, setTotal]         = useState(0);
  const [selectedMsg, setSelectedMsg] = useState<EmailMessageDto | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [offset, setOffset]       = useState(0);
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState('');
  const [showAccounts, setShowAccounts] = useState(false);

  const LIMIT = 30;

  // ── Load accounts ────────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetchInboxAccounts();
      if (res.success) setAccounts(res.data);
    } catch {
      // non-critical
    }
  }, []);

  // ── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (reset = false) => {
    setLoading(true);
    setError('');
    const currentOffset = reset ? 0 : offset;
    if (reset) setOffset(0);
    try {
      const res = await fetchInboxMessages({
        accountId: selectedAccountId || undefined,
        unreadOnly: filter === 'unread',
        limit: LIMIT,
        offset: currentOffset,
      });
      if (res.success) {
        const filtered = filter === 'high' || filter === 'critical'
          ? res.data.messages.filter(m => m.urgencyLevel === filter || (filter === 'high' && m.urgencyLevel === 'critical'))
          : res.data.messages;
        setMessages(filtered);
        setTotal(res.data.total);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, filter, offset]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (view === 'inbox') void loadMessages(true); }, [view, filter, selectedAccountId]);

  // ── Auto-refresh every 60 s ───────────────────────────────────────────────

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      if (view === 'inbox') void loadMessages();
    }, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [view, loadMessages]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    try {
      await syncAllInboxAccounts();
      await loadMessages(true);
      await loadAccounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncAccount(id: string) {
    try {
      await syncInboxAccount(id);
      await loadMessages(true);
      await loadAccounts();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm('Remove this email account and all its messages?')) return;
    try {
      await deleteInboxAccount(id);
      setAccounts(a => a.filter(x => x.id !== id));
      if (selectedAccountId === id) setSelectedAccountId('');
      await loadMessages(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleToggleMode(id: string, mode: 'full' | 'summary') {
    try {
      const res = await updateInboxAccount(id, { displayMode: mode });
      if (res.success) setAccounts(a => a.map(x => x.id === id ? res.data : x));
    } catch {}
  }

  async function handleOpenMessage(msg: EmailMessageDto) {
    setSelectedMsg(msg);
    setView('message');
    if (!msg.isRead) {
      void markInboxMessageRead(msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
    }
  }

  function handleAccountSaved(account: EmailAccountDto) {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id);
      return exists ? prev.map(a => a.id === account.id ? account : a) : [...prev, account];
    });
    setView('inbox');
  }

  const unreadCount = messages.filter(m => !m.isRead).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (view === 'add-account') {
    return (
      <div className={styles.page} style={{ padding: '1.5rem' }}>
        <AddAccountForm onSaved={handleAccountSaved} onCancel={() => setView('inbox')} />
      </div>
    );
  }

  if (view === 'message' && selectedMsg) {
    return (
      <div className={styles.page} style={{ padding: '1.5rem' }}>
        <MessageView message={selectedMsg} onBack={() => setView('inbox')} />
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f4f7fb', margin: 0 }}>
            Email Inbox
            {unreadCount > 0 && (
              <span style={{ marginLeft: 8, background: '#6F2D8D', color: '#fff', borderRadius: 12,
                padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#8b95a8', margin: '2px 0 0' }}>
            {accounts.length === 0
              ? 'No email accounts connected yet'
              : `${accounts.length} account${accounts.length === 1 ? '' : 's'} • ${total} messages`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleSync} disabled={syncing} style={primaryBtnStyle}>
            {syncing ? 'Syncing…' : '↻ Sync All'}
          </button>
          {isAdmin && (
            <button onClick={() => setView('add-account')} style={ghostBtnStyle}>
              + Add Email Account
            </button>
          )}
          {isAdmin && accounts.length > 0 && (
            <button onClick={() => setShowAccounts(s => !s)} style={ghostBtnStyle}>
              {showAccounts ? 'Hide Accounts' : 'Manage Accounts'}
            </button>
          )}
        </div>
      </div>

      {/* Account management panel */}
      {showAccounts && accounts.length > 0 && (
        <div style={{ background: '#161b26', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#8b95a8', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Connected Accounts
          </h3>
          {accounts.map(a => (
            <AccountRow key={a.id} account={a}
              onSync={handleSyncAccount}
              onDelete={handleDeleteAccount}
              onToggleMode={handleToggleMode} />
          ))}
        </div>
      )}

      {/* Account filter tabs */}
      {accounts.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedAccountId('')}
            style={{ ...chipStyle, background: selectedAccountId === '' ? '#1e3a5f' : '#1a2030',
              borderColor: selectedAccountId === '' ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
            All Accounts
          </button>
          {accounts.map(a => (
            <button key={a.id} onClick={() => setSelectedAccountId(a.id)}
              style={{ ...chipStyle, background: selectedAccountId === a.id ? '#1e3a5f' : '#1a2030',
                borderColor: selectedAccountId === a.id ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className={styles.opsRail} style={{ marginBottom: '1rem' }}>
        {(['all', 'unread', 'high', 'critical'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...chipStyle,
              background: filter === f ? '#2d1a4a' : '#1a2030',
              borderColor: filter === f ? '#9b4dca' : 'rgba(255,255,255,0.1)',
              color: filter === f ? '#d8b4fe' : '#8b95a8' }}>
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'high' ? '⚠ Important' : '🔴 Critical'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.84rem', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Empty states */}
      {accounts.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
          <h3 style={{ color: '#f4f7fb', fontWeight: 600, margin: '0 0 0.5rem' }}>No email accounts connected</h3>
          <p style={{ color: '#8b95a8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Connect a Gmail, Outlook, or custom IMAP account to see your emails here,
            with Ellinea AI summaries and urgency detection.
          </p>
          {isAdmin && (
            <button onClick={() => setView('add-account')} style={primaryBtnStyle}>
              + Connect Email Account
            </button>
          )}
        </div>
      )}

      {accounts.length > 0 && messages.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📬</div>
          <p style={{ color: '#8b95a8', fontSize: '0.85rem' }}>
            No messages found. Click <strong>↻ Sync All</strong> to fetch new emails.
          </p>
        </div>
      )}

      {/* Message list */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#8b95a8', fontSize: '0.85rem' }}>
          Loading messages…
        </div>
      )}

      {!loading && messages.length > 0 && (
        <div style={{ background: '#161b26', borderRadius: 10, overflow: 'hidden' }}>
          {messages.map((msg, i) => {
            const urgColor = URGENCY_COLORS[msg.urgencyLevel] ?? '#6b7280';
            const account = accounts.find(a => a.id === msg.accountId);
            return (
              <button key={msg.id} onClick={() => handleOpenMessage(msg)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                  border: 'none', cursor: 'pointer',
                  borderBottom: i < messages.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  padding: '0.85rem 1.1rem',
                  transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Unread dot */}
                  <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: msg.isRead ? 'transparent' : '#6F2D8D',
                    border: msg.isRead ? '1px solid rgba(255,255,255,0.12)' : 'none' }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: msg.isRead ? 400 : 600,
                        color: msg.isRead ? '#9ca3af' : '#f4f7fb', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {msg.fromName || msg.fromAddress}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {msg.urgencyLevel !== 'low' && (
                          <span style={{ background: urgColor + '22', color: urgColor,
                            border: `1px solid ${urgColor}44`, borderRadius: 4,
                            padding: '1px 6px', fontSize: '0.68rem', fontWeight: 600 }}>
                            {msg.urgencyLevel}
                          </span>
                        )}
                        <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
                          {formatDate(msg.receivedAt)}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: msg.isRead ? '#6b7280' : '#d4dae8',
                      fontWeight: msg.isRead ? 400 : 500, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {msg.subject || '(no subject)'}
                    </div>

                    <div style={{ fontSize: '0.77rem', color: '#6b7280', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.aiSummary
                        ? <><span style={{ color: '#9b4dca', marginRight: 4 }}>✦</span>{msg.aiSummary}</>
                        : msg.bodyText.slice(0, 120)}
                      {account && accounts.length > 1 && (
                        <span style={{ marginLeft: 8, color: '#4b5563', fontSize: '0.7rem' }}>
                          · {account.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: '1rem' }}>
          <button disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - LIMIT)); void loadMessages(); }}
            style={ghostBtnStyle}>← Prev</button>
          <span style={{ color: '#8b95a8', fontSize: '0.82rem', padding: '0 8px', alignSelf: 'center' }}>
            {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
          </span>
          <button disabled={offset + LIMIT >= total} onClick={() => { setOffset(offset + LIMIT); void loadMessages(); }}
            style={ghostBtnStyle}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Shared micro-styles ──────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', color: '#8b95a8',
  marginBottom: 4, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', background: '#0f1420',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
  color: '#f4f7fb', fontSize: '0.87rem', padding: '8px 12px',
  marginBottom: '1rem', outline: 'none', boxSizing: 'border-box',
};

const chipStyle: React.CSSProperties = {
  background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7, color: '#c4cadc', fontSize: '0.8rem',
  padding: '5px 12px', cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#6F2D8D', border: 'none', borderRadius: 7,
  color: '#fff', fontSize: '0.85rem', fontWeight: 600,
  padding: '8px 18px', cursor: 'pointer',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 7, color: '#c4cadc', fontSize: '0.85rem',
  padding: '7px 14px', cursor: 'pointer',
};
