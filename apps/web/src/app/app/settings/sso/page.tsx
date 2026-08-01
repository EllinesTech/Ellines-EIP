'use client';

import { useEffect, useState } from 'react';
import { SsoSetup } from './SsoSetup';
import styles from '../settings.module.css';

export default function SsoSettingsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get org ID from JWT or localStorage
    try {
      const token = localStorage.getItem('eip_access_token');
      if (token) {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        setOrgId(decoded.organizationId);
      }
    } catch (err) {
      console.error('Failed to decode token');
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!orgId) {
    return <div>Organization not found</div>;
  }

  return (
    <div className={styles.container}>
      <h2>Single Sign-On (SSO)</h2>
      <p className={styles.subtitle}>
        Configure enterprise identity providers to let users authenticate via OAuth2, OIDC, or SAML2.
      </p>

      <SsoSetup orgId={orgId} />

      <div style={{ marginTop: '3rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h4>How it works</h4>
        <ul style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
          <li>Add an OAuth2/OIDC provider (discovery URL auto-configures endpoints)</li>
          <li>Or add a SAML2 provider (IdP Entity ID, SSO URL, Certificate)</li>
          <li>Test connectivity from the provider list</li>
          <li>Users will see "Enterprise SSO" option on the login page</li>
          <li>First login auto-provisions a new user account</li>
          <li>Optionally map SAML groups to EIP roles (advanced)</li>
        </ul>
      </div>

      <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
        <strong>Supported Providers</strong>
        <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
          <strong>OAuth2/OIDC:</strong> Google, Microsoft Azure AD, Okta, Auth0, Amazon Cognito, custom
          <br />
          <strong>SAML2:</strong> Active Directory (ADFS), Azure AD, Okta, OneLogin, Ping Identity, custom
        </div>
      </div>
    </div>
  );
}
