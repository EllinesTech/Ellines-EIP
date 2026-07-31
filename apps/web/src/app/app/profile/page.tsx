'use client';

import Link from 'next/link';
import { roleLabel } from '@ellines-eip/shared';
import {
  applyProfileToSession,
  getSession,
  updateMyProfile,
} from '@/lib/api';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import profileStyles from './profile.module.css';


function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/** Resize/compress a photo for avatar storage (data URL). */
function compressImageFile(file: File, maxPx = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

export default function ProfileSettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('—');
  const [org, setOrg] = useState('—');
  const [role, setRole] = useState('—');
  const [platformAdmin, setPlatformAdmin] = useState(false);

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setEmail(s.user.email);
    setOrg(s.organization.name);
    setRole(s.user.role);
    setPlatformAdmin(Boolean(s.isPlatformAdmin));
    setFullName(s.user.fullName || '');
    setTitle(s.user.title || '');
    setBio(s.user.bio || '');
    setAvatarUrl(s.user.avatarUrl || null);
  }, []);

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, or WebP).');
      return;
    }
    setError('');
    try {
      const dataUrl = await compressImageFile(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process photo');
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await updateMyProfile({
        fullName,
        title,
        bio,
        avatarUrl: avatarUrl || '',
      });
      applyProfileToSession(result.user, result.isPlatformAdmin);
      setFullName(result.user.fullName);
      setTitle(result.user.title || '');
      setBio(result.user.bio || '');
      setAvatarUrl(result.user.avatarUrl || null);
      setNotice('Profile saved — your photo and details are yours across this workspace.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your account</p>
          <h1>Profile</h1>
          <p className={styles.lede}>
            Your photo, name, and how you appear across the Work Console. Theme, clock, and display
            preferences live under System Settings.
          </p>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      <section className={profileStyles.card}>
        <form className={profileStyles.form} onSubmit={(e) => void onSave(e)}>
          <div className={profileStyles.photoBlock}>
            <button
              type="button"
              className={profileStyles.photoBtn}
              onClick={() => fileRef.current?.click()}
              aria-label="Change profile photo"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className={profileStyles.photoImg} />
              ) : (
                <span className={profileStyles.photoInitials}>{initials(fullName || 'E')}</span>
              )}
              <span className={profileStyles.photoOverlay}>Change photo</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={profileStyles.fileInput}
              onChange={(e) => void onPickPhoto(e)}
            />
            <div className={profileStyles.photoMeta}>
              <strong>{fullName || 'Your name'}</strong>
              <span>
                {title || roleLabel(role)} · {org}
              </span>
              <div className={profileStyles.photoActions}>
                <button
                  type="button"
                  className={adminStyles.ghost}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload picture
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    className={adminStyles.ghost}
                    onClick={() => setAvatarUrl(null)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className={adminStyles.form}>
            <label>
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                placeholder="Your name"
              />
            </label>
            <label>
              Job title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. Chief Executive Officer"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              About you
              <textarea
                className={profileStyles.bio}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Short note — how you want colleagues to know you in EIP"
              />
            </label>
            <label>
              Work email
              <input value={email} readOnly disabled />
            </label>
            <label>
              Role
              <input value={`${roleLabel(role)}${platformAdmin ? ' · platform' : ''}`} readOnly disabled />
            </label>
            <label>
              Organization
              <input value={org} readOnly disabled />
            </label>
          </div>

          <div className={profileStyles.saveRow}>
            <button type="submit" className={adminStyles.primary} disabled={busy || fullName.trim().length < 2}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.brief}>
        <div className={styles.panelLabel}>Related</div>
        <p className={styles.lede}>
          Prefer theme, accent color, or clock format? Those are system display preferences.
        </p>
        <p>
          <Link href="/app/settings" className={styles.primaryLink}>
            Open System Settings →
          </Link>
        </p>
      </section>
    </div>
  );
}
