'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';

type DocumentRecord = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  branch?: string;
  department?: string;
  summary?: string;
  uploadedBy: string;
  uploadedAt: string;
  content?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('eip_auth') || 'null')?.accessToken
    : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || `HTTP ${res.status}`);
  return data as T;
}

function listDocuments() {
  return apiFetch<DocumentRecord[]>('/api/v1/orgs/me/documents');
}
function uploadDocument(body: {
  name: string; mimeType: string; content: string;
  tags?: string[]; branch?: string; department?: string; summary?: string;
}) {
  return apiFetch<DocumentRecord>('/api/v1/orgs/me/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function deleteDocument(id: string) {
  return apiFetch<{ ok: boolean }>('/api/v1/orgs/me/documents', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}
function downloadDocument(id: string) {
  return apiFetch<DocumentRecord>(`/api/v1/orgs/me/documents?id=${id}`);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(mime: string): string {
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📋';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('text')) return '📃';
  if (mime.includes('json') || mime.includes('xml')) return '📦';
  return '📁';
}

export default function DocumentHubPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadBranch, setUploadBranch] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    load();
  }, [router]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await listDocuments();
      setDocs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  function onFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !uploadName) setUploadName(file.name);
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setUploadError('Select a file first'); return; }
    setBusy(true);
    setUploadError('');
    try {
      const content = await fileToBase64(selectedFile);
      await uploadDocument({
        name: uploadName || selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        content,
        tags: uploadTags ? uploadTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        branch: uploadBranch || undefined,
        summary: uploadSummary || undefined,
      });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadName('');
      setUploadTags('');
      setUploadBranch('');
      setUploadSummary('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(doc: DocumentRecord) {
    setDownloadBusy(doc.id);
    try {
      const full = await downloadDocument(doc.id);
      if (!full.content) return;
      const byteChars = atob(full.content);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: doc.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadBusy(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const tagNeedle = tagFilter.trim().toLowerCase();
  const filtered = docs.filter((d) => {
    const blob = `${d.name} ${d.uploadedBy} ${d.branch || ''} ${d.tags.join(' ')} ${d.summary || ''}`.toLowerCase();
    const matchQ = !needle || blob.includes(needle);
    const matchTag = !tagNeedle || d.tags.some((t) => t.toLowerCase().includes(tagNeedle));
    return matchQ && matchTag;
  });

  const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Organization Intelligence</p>
          <h1>Document Hub</h1>
          <p className={styles.lede}>
            Upload, organize, and reference enterprise documents. Ellinea AI can answer questions
            about documents added to Enterprise Memory.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.aiBtn}
            onClick={() => setShowUpload((v) => !v)}
          >
            {showUpload ? 'Cancel' : '+ Upload document'}
          </button>
          <Link href="/app/ellinea" className={styles.ghostBtn}>
            Ask Ellinea
          </Link>
        </div>
      </header>

      {error ? (
        <div className={styles.emptyCallout} role="alert">
          <div><strong>Error</strong><p>{error}</p></div>
        </div>
      ) : null}

      {/* Upload form */}
      {showUpload ? (
        <section className={styles.card} style={{ marginBottom: '1rem' }}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Upload document</h2>
          </div>
          <form className={adminStyles.form} onSubmit={onUpload}>
            <label>
              File (max 500 KB)
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.pptx,.ppt,.json,.xml,.png,.jpg,.jpeg"
                onChange={onFileSelect}
                required
              />
            </label>
            <label>
              Display name
              <input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Q3 Finance Report"
              />
            </label>
            <label>
              Tags (comma-separated)
              <input
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="e.g. finance, Q3, Nairobi"
              />
            </label>
            <label>
              Branch / site
              <input
                value={uploadBranch}
                onChange={(e) => setUploadBranch(e.target.value)}
                placeholder="e.g. Nairobi HQ"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Summary (for Ellinea Memory)
              <textarea
                value={uploadSummary}
                onChange={(e) => setUploadSummary(e.target.value)}
                placeholder="Brief description — Ellinea will use this when answering questions..."
                rows={3}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.5rem', resize: 'vertical' }}
              />
            </label>
            {uploadError ? <p className={adminStyles.error} style={{ gridColumn: '1 / -1' }}>{uploadError}</p> : null}
            <button type="submit" className={adminStyles.primary} disabled={busy || !selectedFile}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {selectedFile ? (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', gridColumn: '1 / -1' }}>
                Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
                {selectedFile.size > 500 * 1024 ? ' — ⚠️ Exceeds 500 KB limit' : ''}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents…"
          className={adminStyles.form}
          style={{ flex: '1 1 200px', minWidth: 120, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}
          aria-label="Search documents"
        />
        {allTags.length > 0 ? (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}
            aria-label="Filter by tag"
          >
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : null}
        <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Document list */}
      {loading ? (
        <p className={styles.lede}>Loading documents…</p>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyCallout}>
          <div>
            <strong>No documents yet</strong>
            <p>
              {docs.length === 0
                ? 'Upload the first document using the button above. Add a summary so Ellinea can reference it.'
                : `No documents match "${query}".`}
            </p>
          </div>
          <button type="button" className={styles.aiBtn} onClick={() => setShowUpload(true)}>
            Upload document
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((doc) => (
            <article key={doc.id} className={styles.card} style={{ padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden>{mimeIcon(doc.mimeType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{doc.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                    <span>·</span>
                    <span>{doc.mimeType.split('/').pop()?.toUpperCase()}</span>
                    {doc.branch ? <><span>·</span><span>{doc.branch}</span></> : null}
                    <span>·</span>
                    <span>by {doc.uploadedBy}</span>
                    <span>·</span>
                    <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                  </div>
                  {doc.summary ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', margin: '0.2rem 0' }}>{doc.summary}</p>
                  ) : null}
                  {doc.tags.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                      {doc.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            padding: '0.1rem 0.45rem',
                            borderRadius: 99,
                            background: 'rgba(124,58,237,0.18)',
                            border: '1px solid rgba(124,58,237,0.35)',
                            fontSize: '0.7rem',
                            color: '#c4b5fd',
                            cursor: 'pointer',
                          }}
                          onClick={() => setTagFilter(tag)}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => onDownload(doc)}
                    disabled={downloadBusy === doc.id}
                    aria-label={`Download ${doc.name}`}
                  >
                    {downloadBusy === doc.id ? '…' : '↓ Download'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(doc.id, doc.name)}
                    disabled={busy}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.35)',
                      borderRadius: 6,
                      color: '#f87171',
                      padding: '0.3rem 0.6rem',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                    }}
                    aria-label={`Delete ${doc.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className={styles.emptyCallout} style={{ marginTop: '1rem', background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)' }}>
        <div>
          <strong>Tip: Connect documents to Ellinea</strong>
          <p>
            Add a summary when uploading — then open Ask Ellinea and reference the document by name.
            For richer answers, save document summaries as Enterprise Memory notes in Settings → Ellinea AI.
          </p>
        </div>
        <Link href="/app/ellinea" className={styles.ghostBtn}>Ask Ellinea</Link>
      </div>
    </div>
  );
}
