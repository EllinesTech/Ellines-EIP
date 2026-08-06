'use client';

import { useEffect, useState } from 'react';
import {
  listDatabaseConfigurations,
  createDatabaseConfiguration,
  testDatabaseConnection,
  switchPrimaryDatabase,
  type DatabaseConfigurationDto,
  type TestConnectionResponse,
} from '@/lib/api';
import styles from '../admin/admin.module.css';

type TabType = 'list' | 'add';
type DbType = 'local' | 'supabase' | 'custom_postgres';

export default function DatabaseConfigPage() {
  const [configs, setConfigs] = useState<DatabaseConfigurationDto[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [dbType, setDbType] = useState<DbType>('local');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [databaseName, setDatabaseName] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  const [testing, setTesting] = useState(false);

  // Load configs on mount
  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      setLoading(true);
      const result = await listDatabaseConfigurations();
      setConfigs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }

  async function handleTestConnection() {
    setTestResult(null);
    setTesting(true);

    try {
      const result = await testDatabaseConnection({
        type: dbType,
        host: dbType === 'local' ? 'localhost' : host,
        port: parseInt(port),
        username,
        password,
        databaseName,
        supabaseUrl,
        supabaseKey,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleCreateConfig() {
    if (!name) {
      setError('Configuration name is required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const newConfig = await createDatabaseConfiguration({
        name,
        type: dbType,
        host: dbType === 'local' ? 'localhost' : host,
        port: parseInt(port),
        username: username || undefined,
        password,
        databaseName: databaseName || undefined,
        supabaseUrl: supabaseUrl || undefined,
        supabaseKey,
        isPrimary: false,
        isActive: true,
        testStatus: 'untested',
        enableAutoSync: false,
        syncDirection: 'bidirectional',
        sslMode: 'require',
      } as any);

      setConfigs([...configs, newConfig]);
      setNotice(`✅ Configuration "${name}" created successfully`);

      // Reset form
      setName('');
      setHost('localhost');
      setPort('5432');
      setUsername('');
      setPassword('');
      setDatabaseName('');
      setSupabaseUrl('');
      setSupabaseKey('');
      setTestResult(null);
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchPrimary(configId: string, configName: string) {
    if (!window.confirm(`Switch to "${configName}"? All connections will use this database.`)) {
      return;
    }

    try {
      setLoading(true);
      await switchPrimaryDatabase(configId, 'User switch from admin panel');
      setNotice(`✅ Switched to "${configName}"`);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch database');
    } finally {
      setLoading(false);
    }
  }

  const primaryConfig = configs.find((c) => c.isPrimary);

  return (
    <div className={styles.section}>
      <h2>📦 Database Configuration</h2>

      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {notice && <div style={{ color: '#10b981', marginBottom: '1rem' }}>{notice}</div>}

      {/* Current Primary Database */}
      {primaryConfig && (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '2rem',
          }}
        >
          <h3 style={{ marginTop: 0 }}>✅ Active Database</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Name</div>
              <div style={{ fontWeight: 500 }}>{primaryConfig.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Type</div>
              <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                {primaryConfig.type === 'local' ? '🖥️ Local' : primaryConfig.type === 'supabase' ? '☁️ Supabase' : '🔧 Custom'}
              </div>
            </div>
            {primaryConfig.host && (
              <div>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Host</div>
                <div style={{ fontWeight: 500 }}>{primaryConfig.host}</div>
              </div>
            )}
            {primaryConfig.testStatus && (
              <div>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Status</div>
                <div style={{ fontWeight: 500, color: primaryConfig.testStatus === 'success' ? '#10b981' : '#ef4444' }}>
                  {primaryConfig.testStatus}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('list')}
          style={{
            background: activeTab === 'list' ? '#3b82f6' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          Configured Databases ({configs.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            background: activeTab === 'add' ? '#3b82f6' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          + Add Configuration
        </button>
      </div>

      {/* List View */}
      {activeTab === 'list' && (
        <div>
          {loading && <p>Loading...</p>}
          {configs.length === 0 && !loading && <p style={{ color: '#94a3b8' }}>No database configurations yet. Add one to get started.</p>}
          {configs.map((config) => (
            <div
              key={config.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>{config.name}</h4>
                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                    <span style={{ textTransform: 'capitalize' }}>{config.type}</span>
                    {config.host && <span> · {config.host}:{config.port}</span>}
                    {config.isPrimary && <span style={{ color: '#10b981' }}> · PRIMARY</span>}
                  </div>
                </div>
                {!config.isPrimary && (
                  <button
                    onClick={() => handleSwitchPrimary(config.id, config.name)}
                    disabled={loading}
                    style={{
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: loading ? 'wait' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    Set as Primary
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                Test Status: <span style={{ color: config.testStatus === 'success' ? '#10b981' : config.testStatus === 'failed' ? '#ef4444' : '#f59e0b' }}>{config.testStatus}</span>
                {config.lastTestedAt && <span> · {new Date(config.lastTestedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add View */}
      {activeTab === 'add' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Configuration Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Local Ubuntu Server, Supabase Production"
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Database Type</label>
            <select
              value={dbType}
              onChange={(e) => setDbType(e.target.value as DbType)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#fff',
                borderRadius: '4px',
              }}
            >
              <option value="local">🖥️ Local PostgreSQL (on-premise)</option>
              <option value="supabase">☁️ Supabase (cloud)</option>
              <option value="custom_postgres">🔧 Custom PostgreSQL Server</option>
            </select>
          </div>

          {/* Local Config */}
          {dbType === 'local' && (
            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Local configuration uses default PostgreSQL on localhost:5432</p>
            </div>
          )}

          {/* Custom PostgreSQL Config */}
          {dbType === 'custom_postgres' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="e.g., 192.168.1.50"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="5432"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., eip"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Database password"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Database Name</label>
                <input
                  type="text"
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  placeholder="e.g., ellines_eip"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </>
          )}

          {/* Supabase Config */}
          {dbType === 'supabase' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Supabase Project URL</label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://YOUR-PROJECT.supabase.co"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Supabase API Key</label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="Your Supabase anon key or service role key"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </>
          )}

          {/* Test Connection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={handleTestConnection}
              disabled={testing || !name}
              style={{
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: testing || !name ? 'not-allowed' : 'pointer',
                opacity: testing || !name ? 0.6 : 1,
              }}
            >
              {testing ? 'Testing...' : '🔗 Test Connection'}
            </button>
          </div>

          {testResult && (
            <div
              style={{
                background: testResult.success ? '#0f452e' : '#431407',
                border: `1px solid ${testResult.success ? '#10b981' : '#ef4444'}`,
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                color: testResult.success ? '#10b981' : '#ef4444',
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>{testResult.message}</div>
              {testResult.advice && <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>{testResult.advice}</div>}
              {testResult.suggestion && (
                <div style={{ fontSize: '0.875rem', opacity: 0.8, whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
                  {testResult.suggestion}
                </div>
              )}
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreateConfig}
            disabled={loading || !name}
            style={{
              background: '#10b981',
              color: '#000',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              fontWeight: 500,
              cursor: loading || !name ? 'not-allowed' : 'pointer',
              opacity: loading || !name ? 0.6 : 1,
            }}
          >
            {loading ? '⏳ Creating...' : '✅ Create Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}
