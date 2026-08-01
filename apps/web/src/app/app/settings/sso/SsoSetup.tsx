'use client';

import { useState } from 'react';
import styles from '../settings.module.css';

interface SsoProvider {
  id: string;
  type: 'oauth2' | 'saml2';
  name: string;
  is_active: boolean;
  enforced?: boolean;
  created_at?: string;
}

interface SsoSetupProps {
  orgId: string;
  onRefresh?: () => void;
}

export function SsoSetup({ orgId, onRefresh }: SsoSetupProps) {
  const [step, setStep] = useState<'choose' | 'oauth2-config' | 'saml2-config' | 'list'>('list');
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // OAuth2 form state
  const [oauth2Form, setOauth2Form] = useState({
    name: 'Azure AD',
    clientId: '',
    clientSecret: '',
    discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    autoProvision: true,
    defaultRole: 'member',
  });

  // SAML2 form state
  const [saml2Form, setSaml2Form] = useState({
    name: 'Active Directory',
    idpEntityId: '',
    idpSsoUrl: '',
    idpCertificate: '',
    autoProvision: true,
    defaultRole: 'member',
  });

  async function loadProviders() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/orgs/me/sso-providers`, {
        headers: { authorization: `Bearer ${localStorage.getItem('eip_access_token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data.data || []);
      }
    } catch (err) {
      setError('Failed to load providers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createOAuth2Provider() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/orgs/me/sso-providers`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${localStorage.getItem('eip_access_token')}`,
        },
        body: JSON.stringify({ type: 'oauth2', ...oauth2Form }),
      });
      if (response.ok) {
        setSuccess('OAuth2 provider created');
        loadProviders();
        setStep('list');
      } else {
        const err = await response.json();
        setError(err.message || 'Failed to create provider');
      }
    } catch (err) {
      setError('Failed to create provider');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createSaml2Provider() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/orgs/me/sso-providers`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${localStorage.getItem('eip_access_token')}`,
        },
        body: JSON.stringify({ type: 'saml2', ...saml2Form }),
      });
      if (response.ok) {
        setSuccess('SAML2 provider created');
        loadProviders();
        setStep('list');
      } else {
        const err = await response.json();
        setError(err.message || 'Failed to create provider');
      }
    } catch (err) {
      setError('Failed to create provider');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function testProvider(providerId: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/orgs/me/sso-providers/${providerId}/test`, {
        method: 'POST',
        headers: { authorization: `Bearer ${localStorage.getItem('eip_access_token')}` },
      });
      const data = await response.json();
      if (data.ok) {
        setSuccess(`Test successful: ${data.message}`);
      } else {
        setError(`Test failed: ${data.message}`);
      }
    } catch (err) {
      setError('Test failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProvider(providerId: string) {
    if (!window.confirm('Delete this SSO provider? Users linked to it will remain in the system.')) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/orgs/me/sso-providers/${providerId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${localStorage.getItem('eip_access_token')}` },
      });
      if (response.ok) {
        setSuccess('Provider deleted');
        loadProviders();
      } else {
        setError('Failed to delete provider');
      }
    } catch (err) {
      setError('Failed to delete provider');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'list') {
    return (
      <div className={styles.section}>
        <h3>Enterprise SSO Providers</h3>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          Configure OAuth2/OIDC or SAML2 identity providers for enterprise single sign-on.
          Users will see these providers on the login page.
        </p>

        {error && <div style={{ color: '#d32f2f', marginBottom: '1rem' }}>{error}</div>}
        {success && <div style={{ color: '#388e3c', marginBottom: '1rem' }}>{success}</div>}

        {providers.length === 0 ? (
          <p style={{ color: '#999' }}>No SSO providers configured yet</p>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            {providers.map((provider) => (
              <div
                key={provider.id}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{provider.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      {provider.type === 'oauth2' ? 'OAuth2 / OIDC' : 'SAML2'} · Status: {provider.is_active ? '✓ Active' : '✗ Inactive'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => testProvider(provider.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        border: '1px solid #2196F3',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#2196F3',
                        cursor: 'pointer',
                      }}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        border: '1px solid #d32f2f',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#d32f2f',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setStep('choose')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Add SSO Provider
        </button>
      </div>
    );
  }

  if (step === 'choose') {
    return (
      <div className={styles.section}>
        <h3>Add SSO Provider</h3>
        <p>Choose an authentication provider type:</p>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            onClick={() => setStep('oauth2-config')}
            style={{
              flex: 1,
              padding: '1.5rem',
              border: '2px solid #2196F3',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <strong>OAuth2 / OIDC</strong>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              Google · Microsoft · Okta · Auth0 · Custom
            </div>
          </button>

          <button
            onClick={() => setStep('saml2-config')}
            style={{
              flex: 1,
              padding: '1.5rem',
              border: '2px solid #FF9800',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <strong>SAML2</strong>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              Active Directory · Azure AD · Okta · OneLogin
            </div>
          </button>
        </div>

        <button
          onClick={() => setStep('list')}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#f5f5f5',
            color: '#666',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    );
  }

  if (step === 'oauth2-config') {
    return (
      <div className={styles.section}>
        <h3>Configure OAuth2 Provider</h3>

        {error && <div style={{ color: '#d32f2f', marginBottom: '1rem' }}>{error}</div>}

        <div className={styles.field}>
          <label>Provider Name</label>
          <input
            type="text"
            value={oauth2Form.name}
            onChange={(e) => setOauth2Form({ ...oauth2Form, name: e.target.value })}
            placeholder="e.g., Azure AD, Okta, Google"
          />
        </div>

        <div className={styles.field}>
          <label>Client ID</label>
          <input
            type="text"
            value={oauth2Form.clientId}
            onChange={(e) => setOauth2Form({ ...oauth2Form, clientId: e.target.value })}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Client Secret</label>
          <input
            type="password"
            value={oauth2Form.clientSecret}
            onChange={(e) => setOauth2Form({ ...oauth2Form, clientSecret: e.target.value })}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Discovery URL (OIDC)</label>
          <input
            type="url"
            value={oauth2Form.discoveryUrl}
            onChange={(e) => setOauth2Form({ ...oauth2Form, discoveryUrl: e.target.value })}
            placeholder="https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={createOAuth2Provider}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Creating...' : 'Create Provider'}
          </button>
          <button
            onClick={() => setStep('list')}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#666',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'saml2-config') {
    return (
      <div className={styles.section}>
        <h3>Configure SAML2 Provider</h3>

        {error && <div style={{ color: '#d32f2f', marginBottom: '1rem' }}>{error}</div>}

        <div className={styles.field}>
          <label>Provider Name</label>
          <input
            type="text"
            value={saml2Form.name}
            onChange={(e) => setSaml2Form({ ...saml2Form, name: e.target.value })}
            placeholder="e.g., Active Directory, Okta, Azure AD"
          />
        </div>

        <div className={styles.field}>
          <label>IdP Entity ID</label>
          <input
            type="text"
            value={saml2Form.idpEntityId}
            onChange={(e) => setSaml2Form({ ...saml2Form, idpEntityId: e.target.value })}
            placeholder="urn:federation:MicrosoftOnline"
            required
          />
        </div>

        <div className={styles.field}>
          <label>IdP SSO URL</label>
          <input
            type="url"
            value={saml2Form.idpSsoUrl}
            onChange={(e) => setSaml2Form({ ...saml2Form, idpSsoUrl: e.target.value })}
            required
          />
        </div>

        <div className={styles.field}>
          <label>IdP Certificate (Base64)</label>
          <textarea
            value={saml2Form.idpCertificate}
            onChange={(e) => setSaml2Form({ ...saml2Form, idpCertificate: e.target.value })}
            placeholder="Paste the base64-encoded IdP signing certificate"
            rows={4}
            required
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={createSaml2Provider}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#FF9800',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Creating...' : 'Create Provider'}
          </button>
          <button
            onClick={() => setStep('list')}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#666',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
